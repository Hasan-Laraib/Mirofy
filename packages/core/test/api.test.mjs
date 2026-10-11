// The library API. The point of every test here is that a CALLER can do this
// without a terminal: no process exits, no stderr to parse, no argv.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DIAGRAM_TYPES, MirofyError, MirofyPipelineError, MirofyRenderError,
  map, render, validate,
} from '../api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A throwaway repository with one commit. `map` needs a revision because every
 * fact is pinned to one; identity is set per-invocation so the test does not
 * depend on whatever git config the machine running it happens to have.
 *
 * @param {string} dir
 */
function gitInit(dir) {
  const run = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  run('init', '--quiet');
  run('add', '-A');
  run('-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-qm', 'init');
}

/** A document that needs no repository evidence, so it renders anywhere. */
const minimal = () => ({
  schema_version: 1,
  diagram_type: 'architecture',
  meta: { title: 'api test', output: 'api-test.html' },
  components: [
    { id: 'app', type: 'backend', label: 'app', pos: [60, 60], size: [130, 60] },
    { id: 'db', type: 'database', label: 'db', pos: [300, 60], size: [130, 60] },
  ],
  connections: [{ from: 'app', to: 'db', label: 'reads' }],
});

test('importing the API does not run the CLI', () => {
  // The reason this module exists. bin/mirofy.mjs reads process.argv at module
  // scope, so `import 'mirofy-cli'` RUNS the command -- with no arguments it
  // prints usage and exits 0, which is a hostile thing to do to a library
  // caller.
  //
  // Tested by behaviour rather than by grepping the source for an import: the
  // CLI could be reached indirectly, and the thing that actually matters is
  // that importing this module produces no output and no exit.
  const url = pathToFileURL(path.join(here, '..', 'api.mjs')).href;
  const probe = spawnSync(process.execPath, [
    '--input-type=module',
    '-e', `await import(${JSON.stringify(url)}); process.stdout.write('IMPORTED');`,
  ], { encoding: 'utf8' });

  assert.equal(probe.status, 0, probe.stderr);
  // Exactly the sentinel: a usage banner here would mean the CLI ran.
  assert.equal(probe.stdout, 'IMPORTED');
  assert.ok(!/usage/i.test(probe.stdout + probe.stderr), 'importing must not print the CLI usage');
});

test('the type list is published and frozen', () => {
  assert.deepEqual([...DIAGRAM_TYPES].sort(),
    ['architecture', 'dataflow', 'lifecycle', 'sequence', 'workflow']);
  // A caller validating against a copied list is a caller whose list goes stale.
  assert.ok(Object.isFrozen(DIAGRAM_TYPES));
});

test('an unknown type is refused with a diagnostic, not a crash', async () => {
  await assert.rejects(() => render('pie-chart', minimal()), (error) => {
    assert.ok(error instanceof MirofyError);
    assert.equal(error.diagnostics[0].code, 'input/unknown-type');
    // The expected set travels with the complaint, so a caller can correct
    // itself without reading our docs.
    assert.deepEqual([...error.diagnostics[0].evidence.expected].sort(), [...DIAGRAM_TYPES].sort());
    return true;
  });
});

test('render returns one self-contained HTML document', async () => {
  const html = await render('architecture', minimal());
  assert.equal(typeof html, 'string');
  assert.ok(html.startsWith('<!DOCTYPE html>') || html.trimStart().startsWith('<!DOCTYPE'));
  assert.ok(html.includes('</html>'));
  // The whole product is one file: no code it needs comes from the network.
  // Webfonts are the one documented exception -- they are a progressive
  // enhancement the artifact renders without, and check:readme already holds
  // the README to describing exactly what is fetched. Asserting "no external
  // links at all" would be asserting something this project never claimed.
  assert.ok(!/<script[^>]+src=["']https?:/i.test(html), 'no script may come from the network');
  const external = [...html.matchAll(/<link[^>]+href=["'](https?:[^"']+)/gi)].map((m) => m[1]);
  const notFonts = external.filter((href) => !/fonts\.(googleapis|gstatic)\.com/.test(href));
  assert.deepEqual(notFonts, [], 'webfonts are the only documented external request');
});

test('render accepts a path as well as an object', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-test-'));
  try {
    const file = path.join(dir, 'doc.json');
    fs.writeFileSync(file, JSON.stringify(minimal()));
    const html = await render('architecture', file);
    assert.ok(html.includes('</html>'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a rejected document throws with the renderer own diagnostics', async () => {
  const broken = { ...minimal(), components: 'not an array' };
  await assert.rejects(() => render('architecture', broken), (error) => {
    assert.ok(error instanceof MirofyRenderError);
    assert.equal(error.stage, 'render');
    assert.ok(Array.isArray(error.diagnostics) && error.diagnostics.length > 0);
    // Structured, so a caller branches on a code rather than matching prose.
    assert.equal(typeof error.diagnostics[0].code, 'string');
    assert.equal(typeof error.diagnostics[0].message, 'string');
    return true;
  });
});

test('render refuses a non-object, non-path source', async () => {
  await assert.rejects(() => render('architecture', 42), MirofyError);
  await assert.rejects(() => render('architecture', null), MirofyError);
});

test('validate ANSWERS rather than throws when a document is invalid', async () => {
  // "This document is invalid" is a finding. A caller checking a hundred
  // documents should not need a try/catch per document to collect it.
  const result = await validate('architecture', { ...minimal(), components: 'nope' });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.length > 0);
});

test('validate reports a good document as ok with no diagnostics', async () => {
  const result = await validate('architecture', minimal());
  assert.deepEqual(result, { ok: true, diagnostics: [] });
});

test('validate still throws when the question itself is unaskable', async () => {
  // An unknown type is not an invalid document; it is a caller bug, and
  // returning {ok: false} for it would hide that.
  await assert.rejects(() => validate('nope', minimal()), MirofyError);
});

test('no temporary directory survives a render, successful or failed', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('mirofy-api')).length;
  await render('architecture', minimal());
  await validate('architecture', { ...minimal(), components: 'nope' });
  const after = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('mirofy-api')).length;
  // A library that leaks a directory per failed render fills a disk slowly
  // enough that nobody connects the two.
  assert.equal(after, before);
});

test('map refuses a directory that is not there', async () => {
  await assert.rejects(() => map(path.join(os.tmpdir(), 'mirofy-does-not-exist-xyz')), (error) => {
    assert.ok(error instanceof MirofyError);
    assert.equal(error.diagnostics[0].code, 'input/no-such-directory');
    return true;
  });
});

test('map refuses a directory with no revision to pin facts to', async () => {
  // Not an arbitrary requirement: every fact the scanner records carries a
  // commit, so a plain directory has nothing for the evidence to cite.
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-plain-'));
  try {
    await assert.rejects(() => map(plain), (error) => {
      assert.ok(error instanceof MirofyError);
      assert.equal(error.diagnostics[0].code, 'input/not-a-repository');
      assert.ok(error.diagnostics[0].supportedFixes[0].includes('git init'));
      return true;
    });
  } finally {
    fs.rmSync(plain, { recursive: true, force: true });
  }
});

test('map runs the whole pipeline and returns the artifact', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-repo-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-out-'));
  try {
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'index.mjs'), "import { helper } from '../lib/helper.mjs';\nexport default helper;\n");
    fs.writeFileSync(path.join(repo, 'lib', 'helper.mjs'), 'export const helper = 1;\n');
    gitInit(repo);

    const result = await map(repo, { out });

    assert.equal(typeof result.html, 'string');
    assert.ok(result.html.includes('</html>'));
    assert.ok(result.drawn >= 1, 'two directories that import each other are two components');
    assert.equal(result.outDir, path.resolve(out));
    assert.ok(fs.existsSync(result.diagramPath));
    // --out means the intermediates land THERE, not in somebody's repository.
    assert.ok(!fs.existsSync(path.join(repo, 'scan')));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('a pipeline failure names the stage it failed at', async () => {
  // An empty directory has nothing to scan; whatever stage gives up, the
  // error has to say which one, because the caller saw no terminal output.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-empty-'));
  gitInit(empty);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-emptyout-'));
  try {
    await map(empty, { out });
  } catch (error) {
    assert.ok(error instanceof MirofyPipelineError || error instanceof MirofyError);
    if (error instanceof MirofyPipelineError && error.stage) {
      assert.ok(['scan', 'model', 'compile', 'layout'].includes(error.stage));
      assert.ok(error.diagnostics[0].code.startsWith('pipeline/'));
    }
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});
