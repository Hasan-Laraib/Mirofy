// Rows 2.8, 2.9, 2.10. The three v1 scanner adapters.
//
// The scanner rule, verbatim from 31-V1-ARCHITECTURE.md: "NEVER guess. An
// unanalysable file is a Gap, not an omission." Every adapter test therefore
// has two halves: the facts it must find, and the Gap it must record where
// analysis honestly stops. An adapter that only ever emits facts has not
// been shown to obey the rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REVISION = 'b'.repeat(40);
const NEWLINE = String.fromCharCode(10);

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-scan-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Row 2.9 — workspace topology
// ---------------------------------------------------------------------------

test('[2.9] workspace scanner reports packages and their dependencies as config-derived facts', async () => {
  const { workspaceAdapter } = await import('../../scanner/src/adapters/workspace.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    'packages/a/package.json': JSON.stringify({ name: '@acme/a', dependencies: { '@acme/b': '*' } }),
    'packages/b/package.json': JSON.stringify({ name: '@acme/b' }),
  });
  const { facts, gaps, inventory } = await runAdapter(workspaceAdapter, { repoRoot, revision: REVISION });

  assert.deepEqual(gaps, []);
  const depends = facts.find((f) => f.subject === '@acme/a' && f.predicate === 'depends-on' && f.object === '@acme/b');
  assert.ok(depends, `no depends-on fact between the workspace packages (got ${JSON.stringify(facts.map((f) => [f.subject, f.predicate, f.object]))})`);
  assert.equal(depends.provenance, 'config-derived');
  assert.equal(depends.location.path, 'packages/a/package.json');
  assert.equal(depends.revision, REVISION);
  assert.equal(depends.adapter, 'workspace');

  const contains = facts.filter((f) => f.predicate === 'contains-package');
  assert.equal(contains.length, 2, 'both workspace packages should be reported');
  // The inventory carries every file the adapter looked at -- the coverage
  // denominator -- not only the ones that produced facts.
  assert.ok(inventory.includes('package.json'));
  assert.ok(inventory.includes('packages/b/package.json'), 'a package producing no depends-on facts must still be in the inventory');
});

test('[2.9] a malformed package.json is a Gap naming the parse error, not a throw and not an omission', async () => {
  const { workspaceAdapter } = await import('../../scanner/src/adapters/workspace.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    'packages/a/package.json': '{ this is not json',
    'packages/b/package.json': JSON.stringify({ name: '@acme/b' }),
  });
  const { facts, gaps, inventory } = await runAdapter(workspaceAdapter, { repoRoot, revision: REVISION });

  const gap = gaps.find((g) => g.path === 'packages/a/package.json');
  assert.ok(gap, 'the malformed manifest did not become a Gap');
  assert.match(gap.reason, /JSON|parse/i, 'the Gap does not say why analysis stopped');
  // The healthy package is still analysed -- one bad file never aborts a scan.
  assert.ok(facts.some((f) => f.object === '@acme/b' && f.predicate === 'contains-package'));
  assert.ok(inventory.includes('packages/a/package.json'), 'the unanalysable file must still be inventoried');
});

// ---------------------------------------------------------------------------
// Row 2.8 — TS/JS imports
// ---------------------------------------------------------------------------

test('[2.8] import scanner reports static, re-export, require and literal dynamic imports with exact lines', async () => {
  const { importsAdapter } = await import('../../scanner/src/adapters/imports.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'src/a.js': [
      "import { b } from './b.js';",
      "export { c } from './c.js';",
      "const d = require('./d.js');",
      "const e = await import('./e.js');",
      "import fs from 'node:fs';",
      "import express from 'express';",
    ].join('\n') + '\n',
    'src/b.js': 'export const b = 1;\n',
    'src/c.js': 'export const c = 1;\n',
    'src/d.js': 'module.exports = 1;\n',
    'src/e.js': 'export default 1;\n',
  });
  const { facts, gaps } = await runAdapter(importsAdapter, { repoRoot, revision: REVISION });

  assert.deepEqual(gaps, []);
  const edges = facts.filter((f) => f.subject === 'src/a.js' && f.predicate === 'depends-on');
  const objects = edges.map((f) => f.object).sort();
  assert.deepEqual(objects, ['package:express', 'package:node:fs', 'src/b.js', 'src/c.js', 'src/d.js', 'src/e.js']);
  for (const f of edges) assert.equal(f.provenance, 'statically-derived');

  // Exact lines: the import of ./b.js is on line 1, the dynamic import on 4.
  assert.deepEqual(edges.find((f) => f.object === 'src/b.js').location.lines, [1, 1]);
  assert.deepEqual(edges.find((f) => f.object === 'src/e.js').location.lines, [4, 4]);
});

test('[2.8] a file git ignores is generated output, not source somebody wrote', async () => {
  const { importsAdapter } = await import('../../scanner/src/adapters/imports.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const { execFileSync } = await import('node:child_process');
  const repoRoot = makeRepo({
    '.gitignore': 'generated/' + NEWLINE,
    'src/a.js': "import { b } from '../generated/b.js';" + NEWLINE,
    'generated/b.js': "import { c } from './c.js';" + NEWLINE + 'export const b = c;' + NEWLINE,
    'generated/c.js': 'export const c = 1;' + NEWLINE,
  });
  execFileSync('git', ['init', '-q'], { cwd: repoRoot, stdio: 'ignore' });

  const { facts } = await runAdapter(importsAdapter, { repoRoot, revision: REVISION });
  const subjects = [...new Set(facts.map((fact) => fact.subject))].sort();

  // The generated tree is not read: a build artefact is not architecture, and
  // scanning it made this repository derive a component and an edge that
  // existed only on machines that had run the build.
  assert.ok(!subjects.some((subject) => subject.startsWith('generated/')),
    `generated/ was scanned as source: ${subjects.join(', ')}`);
  // But the hand-written file that POINTS at it is still read in full. Ignoring
  // a target must not silently drop the edge that names it.
  assert.deepEqual(subjects, ['src/a.js']);
  assert.ok(facts.some((fact) => fact.object === 'generated/b.js'),
    'the import into generated/ is still a recorded fact, citing where it came from');
});

test('[2.8] with no git repository at all, nothing is treated as ignored', async () => {
  const { importsAdapter } = await import('../../scanner/src/adapters/imports.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  // No git init here, deliberately. "I could not check" must never quietly
  // become "there was nothing there" -- that is the omission this scanner
  // exists to refuse, arriving through the back door.
  const repoRoot = makeRepo({
    '.gitignore': 'generated/' + NEWLINE,
    'src/a.js': "import { b } from '../generated/b.js';" + NEWLINE,
    'generated/b.js': "import { c } from './c.js';" + NEWLINE + 'export const b = c;' + NEWLINE,
    'generated/c.js': 'export const c = 1;' + NEWLINE,
  });
  const { facts } = await runAdapter(importsAdapter, { repoRoot, revision: REVISION });
  assert.ok(facts.some((fact) => fact.subject === 'generated/b.js'),
    'without git to ask, every file must still be scanned rather than assumed absent');
});

test('[2.8] a computed specifier is a Gap with the line, never a guessed fact', async () => {
  const { importsAdapter } = await import('../../scanner/src/adapters/imports.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'src/dynamic.js': [
      "const name = 'x';",
      "const mod = await import('./mods/' + name + '.js');",
    ].join('\n') + '\n',
  });
  const { facts, gaps } = await runAdapter(importsAdapter, { repoRoot, revision: REVISION });

  assert.equal(facts.filter((f) => f.predicate === 'depends-on').length, 0, 'a computed specifier produced a fact -- that is a guess');
  const gap = gaps.find((g) => g.path === 'src/dynamic.js');
  assert.ok(gap, 'the computed specifier did not become a Gap');
  assert.match(gap.reason, /line 2/, 'the Gap does not carry the line');
  assert.match(gap.reason, /computed|dynamic/i);
});

test('[2.8] an unresolvable relative specifier is a Gap, not a fabricated path', async () => {
  const { importsAdapter } = await import('../../scanner/src/adapters/imports.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'src/a.js': "import { gone } from './missing.js';\n",
  });
  const { facts, gaps } = await runAdapter(importsAdapter, { repoRoot, revision: REVISION });
  assert.equal(facts.filter((f) => f.predicate === 'depends-on').length, 0);
  const gap = gaps.find((g) => g.path === 'src/a.js');
  assert.ok(gap, 'the unresolvable import did not become a Gap');
  assert.match(gap.reason, /missing\.js/);
});

test('[2.8] imports inside comments and strings are not facts', async () => {
  const { importsAdapter } = await import('../../scanner/src/adapters/imports.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'src/a.js': [
      "// import { no } from './not-real.js';",
      "/* import { also } from './nope.js'; */",
      "const s = \"import { s } from './stringy.js';\";",
      "import { yes } from './real.js';",
    ].join('\n') + '\n',
    'src/real.js': 'export const yes = 1;\n',
  });
  const { facts, gaps } = await runAdapter(importsAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  const objects = facts.filter((f) => f.predicate === 'depends-on').map((f) => f.object);
  assert.deepEqual(objects, ['src/real.js'], `commented or quoted imports leaked into facts: ${JSON.stringify(objects)}`);
});

// ---------------------------------------------------------------------------
// Row 2.10 — HTTP routes
// ---------------------------------------------------------------------------

test('[2.10] route scanner reports Express and Fastify registrations with method, path and line', async () => {
  const { routesAdapter } = await import('../../scanner/src/adapters/routes.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'src/server.js': [
      "app.get('/users/:id', handler);",
      "router.post('/orders', createOrder);",
      "fastify.route({ method: 'PUT', url: '/items/:id' });",
    ].join('\n') + '\n',
  });
  const { facts, gaps } = await runAdapter(routesAdapter, { repoRoot, revision: REVISION });

  assert.deepEqual(gaps, []);
  const routes = facts.filter((f) => f.predicate === 'exposes').map((f) => f.object).sort();
  assert.deepEqual(routes, ['GET /users/:id', 'POST /orders', 'PUT /items/:id']);
  const get = facts.find((f) => f.object === 'GET /users/:id');
  assert.equal(get.subject, 'src/server.js');
  assert.equal(get.provenance, 'statically-derived');
  assert.deepEqual(get.location.lines, [1, 1]);
});

test('[2.10] Next.js file-based routes are config-derived facts -- the path IS the config', async () => {
  const { routesAdapter } = await import('../../scanner/src/adapters/routes.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'pages/api/users.ts': 'export default function handler() {}\n',
    'app/orders/route.ts': 'export async function POST() {}\nexport async function GET() {}\n',
  });
  const { facts } = await runAdapter(routesAdapter, { repoRoot, revision: REVISION });

  const objects = facts.filter((f) => f.predicate === 'exposes').map((f) => f.object).sort();
  assert.deepEqual(objects, ['ANY /api/users', 'GET /orders', 'POST /orders']);
  for (const f of facts) assert.equal(f.provenance, 'config-derived');
});

test('[2.10] a computed route path is a Gap, never a guessed route', async () => {
  const { routesAdapter } = await import('../../scanner/src/adapters/routes.mjs');
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const repoRoot = makeRepo({
    'src/server.js': "app.get(base + '/x', handler);\n",
  });
  const { facts, gaps } = await runAdapter(routesAdapter, { repoRoot, revision: REVISION });
  assert.equal(facts.filter((f) => f.predicate === 'exposes').length, 0);
  const gap = gaps.find((g) => g.path === 'src/server.js');
  assert.ok(gap, 'the computed route path did not become a Gap');
  assert.match(gap.reason, /line 1/);
});

// ---------------------------------------------------------------------------
// The contract itself
// ---------------------------------------------------------------------------

test('runAdapter enforces the Fact and Gap shapes, so a sloppy adapter cannot poison the graph', async () => {
  const { runAdapter } = await import('../../scanner/src/adapter.mjs');
  const sloppy = {
    id: 'sloppy',
    async scan() {
      return { facts: [{ subject: 'x' }], gaps: [], inventory: [] };
    },
  };
  await assert.rejects(
    () => runAdapter(sloppy, { repoRoot: os.tmpdir(), revision: REVISION }),
    /predicate|invalid fact/,
    'a malformed fact from an adapter reached the caller unvalidated',
  );
});
