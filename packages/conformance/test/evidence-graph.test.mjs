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
