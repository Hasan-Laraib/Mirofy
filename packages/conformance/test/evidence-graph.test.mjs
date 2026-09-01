// Rows 2.7 and 2.17. The evidence graph and the honest coverage report.
//
// The graph's contract, verbatim from 31-V1-ARCHITECTURE.md: "append-only per
// revision. A fact is never edited, only superseded." These tests exist to
// make that sentence expensive to violate: there is no mutation API to test
// the absence of, so the assertions target what CAN be observed -- appends
// return ids, supersede preserves the old fact, and no query path ever throws
// on an empty answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REVISION = 'a'.repeat(40);

function fact(overrides = {}) {
  return {
    subject: 'orders',
    predicate: 'calls',
    object: 'payments',
    provenance: 'statically-derived',
    location: { path: 'src/orders/checkout.ts', lines: [118, 132] },
    revision: REVISION,
    adapter: 'imports',
    ...overrides,
  };
}

test('a fact appends and is queryable by subject, predicate and provenance (2.7)', async () => {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const graph = new EvidenceGraph();
  const id = graph.append(fact());
  assert.ok(typeof id === 'string' && id.length > 0, 'append must return a fact id');

  assert.equal(graph.facts({ subject: 'orders' }).length, 1);
  assert.equal(graph.facts({ predicate: 'calls' }).length, 1);
  assert.equal(graph.facts({ provenance: 'statically-derived' }).length, 1);
  assert.equal(graph.facts({ subject: 'orders', predicate: 'calls' }).length, 1);
  // Queries are total: an unknown subject is an empty answer, never a throw.
  assert.deepEqual(graph.facts({ subject: 'nothing-here' }), []);
});

test('scanners may claim exactly two provenance classes, and the refusal names them (2.7)', async () => {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const graph = new EvidenceGraph();
  // The published vocabulary has six classes; a scanner may claim only the
  // two that describe machine analysis. `authored` from a scanner would be a
  // lie about a human, `inferred` a guess dressed as a finding.
  for (const provenance of ['authored', 'inferred', 'runtime-observed', 'vibes']) {
    assert.throws(
      () => graph.append(fact({ provenance })),
      /statically-derived.*config-derived|config-derived.*statically-derived/s,
      `provenance "${provenance}" was accepted, or refused without naming the permitted classes`,
    );
  }
  graph.append(fact({ provenance: 'config-derived', adapter: 'workspace' }));
  assert.equal(graph.facts({}).length, 1);
});

test('a fact is never edited, only superseded -- and the superseded fact survives (2.7)', async () => {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const graph = new EvidenceGraph();
  const first = graph.append(fact());

  // The stored fact is not the caller's object, and is frozen: the two
  // available mutation routes -- mutating the input after append, or mutating
  // a query result -- must both be dead ends.
  const input = fact({ object: 'inventory-service' });
  const second = graph.append(input);
  input.object = 'CHANGED-AFTER-APPEND';
  assert.equal(graph.facts({ subject: 'orders' }).find((f) => f.id === second).object,
    'inventory-service', 'mutating the input after append reached the stored fact');
  const queried = graph.facts({ subject: 'orders' })[0];
  assert.throws(() => { queried.object = 'x'; }, TypeError, 'query results must be frozen');

  // Supersede: the old fact stays retrievable, marked, and excluded from
  // current-facts queries by default.
  const replacement = graph.supersede(first, fact({ object: 'billing' }));
  const all = graph.facts({ subject: 'orders', includeSuperseded: true });
  const old = all.find((f) => f.id === first);
  assert.ok(old, 'the superseded fact vanished; append-only means it survives');
  assert.equal(old.supersededBy, replacement);
  const current = graph.facts({ subject: 'orders' });
  assert.ok(!current.some((f) => f.id === first), 'a superseded fact still reads as current');
  assert.ok(current.some((f) => f.id === replacement));
});

test('the graph round-trips through JSON without loss (2.7)', async () => {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const graph = new EvidenceGraph();
  const first = graph.append(fact());
  graph.supersede(first, fact({ object: 'billing' }));
  graph.addGap({
    adapter: 'imports',
    path: 'src/dynamic.ts',
    reason: 'computed import specifier at line 12',
    revision: REVISION,
  });

  const restored = (await import('../../evidence/src/graph.mjs')).EvidenceGraph.fromJSON(graph.toJSON());
  assert.deepEqual(
    restored.facts({ includeSuperseded: true }),
    graph.facts({ includeSuperseded: true }),
  );
  assert.deepEqual(restored.gaps(), graph.gaps());
});

test('a malformed fact is refused naming the missing field (2.7)', async () => {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const graph = new EvidenceGraph();
  for (const [field, broken] of [
    ['subject', fact({ subject: '' })],
    ['predicate', fact({ predicate: null })],
    ['location', fact({ location: { lines: [1, 2] } })],
    ['revision', fact({ revision: 'abc' })],
    ['adapter', fact({ adapter: '' })],
  ]) {
    assert.throws(() => graph.append(broken), new RegExp(String(field)),
      `a fact with a broken ${field} was accepted, or refused without naming it`);
  }
});

// ---------------------------------------------------------------------------
// Row 2.17 — the honest coverage report
// ---------------------------------------------------------------------------

function coverageFixture() {
  return {
    inventories: {
      imports: ['src/a.js', 'src/b.js', 'src/dynamic.js'],
      routes: ['src/a.js', 'src/b.js', 'src/dynamic.js', 'src/server.js'],
    },
    graphFacts: [
      fact({ subject: 'src/a.js', object: 'src/b.js', location: { path: 'src/a.js', lines: [1, 1] } }),
    ],
    graphGaps: [
      { adapter: 'imports', path: 'src/dynamic.js', reason: 'computed import specifier at line 2', revision: REVISION },
    ],
    allFiles: ['src/a.js', 'src/b.js', 'src/dynamic.js', 'src/server.js', 'assets/logo.svg'],
  };
}

async function builtReport() {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const { coverageReport } = await import('../../evidence/src/coverage.mjs');
  const { inventories, graphFacts, graphGaps, allFiles } = coverageFixture();
  const graph = new EvidenceGraph();
  for (const f of graphFacts) graph.append(f);
  for (const g of graphGaps) graph.addGap(g);
  return coverageReport(graph, { inventories, allFiles });
}

test('coverage buckets every file exactly once, and the buckets sum to the whole (2.17)', async () => {
  const report = await builtReport();
  const { allFiles } = coverageFixture();

  const bucketed = [
    ...report.analysed.map((entry) => entry.path),
    ...report.gapped.map((entry) => entry.path),
    ...report.notAnalysed,
  ].sort();
  assert.deepEqual(bucketed, [...allFiles].sort(),
    'the three buckets must partition the file list -- an uncounted or double-counted file is a lie about coverage');

  // A file with a gap belongs to the gap bucket even though another adapter
  // analysed it cleanly: a partial analysis is not a complete one.
  const dynamic = report.gapped.find((entry) => entry.path === 'src/dynamic.js');
  assert.ok(dynamic, 'the gapped file is missing from the gap bucket');
  assert.match(dynamic.reasons[0], /computed import/);

  const analysed = report.analysed.find((entry) => entry.path === 'src/a.js');
  assert.deepEqual(analysed.adapters.sort(), ['imports', 'routes']);

  assert.deepEqual(report.notAnalysed, ['assets/logo.svg'],
    'a file no adapter examined must appear as not analysed, never silently dropped');
});

const EOL = String.fromCharCode(10);

test('[2.17] the coverage denominator is the repository, not what the adapters could read', async () => {
  const { repositoryFiles } = await import('../../scanner/src/files.mjs');
  const { default: fs } = await import('node:fs');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { execFileSync } = await import('node:child_process');

  // A repository in a language no adapter handles. The scan built its
  // denominator from the union of adapter inventories, so this reported
  // "Of 0 files: 0 analysed, 0 not analysed" -- printed directly above its own
  // sentence about denominators claiming to be the whole system. Every unread
  // file was invisible rather than listed, and a reader of coverage.md alone
  // would conclude the repository had been fully understood.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-denominator-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/cli.py'), ['def main():', '    return 1', ''].join(EOL));
  fs.writeFileSync(path.join(root, 'src/graph.py'), ['def build():', '    return 2', ''].join(EOL));
  fs.writeFileSync(path.join(root, 'README.md'), '# a repository' + EOL);
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });

  const files = repositoryFiles(root);
  assert.ok(files.includes('src/cli.py'),
    'a file no adapter can read must still be a candidate; that is what makes it a visible absence');
  assert.ok(files.includes('README.md'), 'the denominator is every file, not every source file');
  assert.equal(files.length, 3);
});

test('[2.17] a file git ignores is not counted against coverage', async () => {
  const { repositoryFiles } = await import('../../scanner/src/files.mjs');
  const { default: fs } = await import('node:fs');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { execFileSync } = await import('node:child_process');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-denominator-'));
  fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), 'generated/' + EOL);
  fs.writeFileSync(path.join(root, 'app.py'), 'x = 1' + EOL);
  fs.writeFileSync(path.join(root, 'generated/out.py'), 'y = 2' + EOL);
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });

  const files = repositoryFiles(root);
  assert.deepEqual(files, ['app.py'],
    'build output is not unread source, and counting it would invent a coverage problem');
});

test('the rendered coverage report never fabricates a percentage (2.17)', async () => {
  const { renderCoverage } = await import('../../evidence/src/coverage.mjs');
  const report = await builtReport();
  const text = renderCoverage(report);

  // The spec: "What was derived, inferred, and not analysed. Never a
  // fabricated percentage." Counts with a stated denominator are honest;
  // a bare percentage is not, because "82% covered" silently claims the
  // denominator is the whole system.
  assert.doesNotMatch(text, /\d+(\.\d+)?\s*%/, 'the report contains a percentage');
  assert.match(text, /5 files/, 'the report must state its denominator as a count');
  assert.match(text, /not analysed/i);
  assert.match(text, /assets\/logo\.svg/, 'the not-analysed list must name the files, not summarise them away');
});
