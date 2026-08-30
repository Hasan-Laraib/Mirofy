// Rows 1.12, 1.14, 1.17. Stable IDs, the system model, and human overrides.
//
// Row 1.12 says IDs are "mandatory for every object". Read as tightening the
// five authored schemas, that breaks every document ever written, every
// fixture and all 25 golden digests -- for a capability the MODEL needs and
// authors do not. Read as "every object in the model has a stable id", it is
// non-breaking and delivers the same thing. These tests take the second
// reading, and pin the honesty that makes it acceptable: a derived id is
// marked as derived, because it is stable only while the content it derives
// from is.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const architecture = () => ({
  schema_version: 1,
  diagram_type: 'architecture',
  meta: { title: 'Shop' },
  components: [
    { id: 'orders', type: 'backend', label: 'Orders', pos: [0, 0], size: [10, 10] },
    { type: 'database', label: 'Ledger', pos: [40, 0], size: [10, 10] },
    { type: 'database', label: 'Ledger', pos: [80, 0], size: [10, 10] },
  ],
  boundaries: [{ kind: 'region', label: 'eu-west-1', wraps: ['orders'] }],
  connections: [{ from: 'orders', to: 'orders', label: 'self' }],
});

// ---------------------------------------------------------------------------
// Row 1.12 — stable semantic IDs
// ---------------------------------------------------------------------------

test('[1.12] every model object gets an id, and an authored id survives verbatim', async () => {
  const { assignIds } = await import('../../model/src/ids.mjs');
  const assigned = assignIds(architecture());

  for (const group of ['components', 'boundaries', 'relationships']) {
    assert.ok(assigned[group].length > 0, `${group} is empty`);
    for (const entry of assigned[group]) {
      assert.ok(typeof entry.id === 'string' && entry.id.length > 0, `${group} object has no id`);
      assert.equal(typeof entry.authoredId, 'boolean', `${group} object does not say whether its id was authored`);
    }
  }

  const orders = assigned.components.find((c) => c.id === 'orders');
  assert.ok(orders, 'the authored id did not survive verbatim');
  assert.equal(orders.authoredId, true);
});

test('[1.12] a derived id is deterministic and marked as derived', async () => {
  const { assignIds } = await import('../../model/src/ids.mjs');
  const first = assignIds(architecture());
  const second = assignIds(architecture());

  const derived = first.components.filter((c) => !c.authoredId);
  assert.equal(derived.length, 2, 'expected the two unlabelled-id components to be derived');
  assert.deepEqual(
    first.components.map((c) => c.id),
    second.components.map((c) => c.id),
    'the same document produced different ids on a second run -- derived ids must be deterministic',
  );
});

test('[1.12] objects differing only in position get different ids', async () => {
  const { assignIds } = await import('../../model/src/ids.mjs');
  const assigned = assignIds(architecture());
  // Two components share type AND label and differ only by position. A
  // derivation keyed on content alone would collapse them into one id and
  // silently merge two real things.
  const ledgers = assigned.components.filter((c) => c.label === 'Ledger');
  assert.equal(ledgers.length, 2);
  assert.notEqual(ledgers[0].id, ledgers[1].id, 'two distinct components were given the same derived id');
});

test('[1.12] an authored id always wins a collision with a derived one', async () => {
  const { assignIds } = await import('../../model/src/ids.mjs');
  const doc = architecture();
  // Author an id that collides with what the second component would derive.
  const probe = assignIds(architecture());
  const derivedId = probe.components.find((c) => !c.authoredId).id;
  doc.components[0].id = derivedId;

  const assigned = assignIds(doc);
  const holder = assigned.components.filter((c) => c.id === derivedId);
  assert.equal(holder.length, 1, 'the collision produced two objects sharing one id');
  assert.equal(holder[0].authoredId, true, 'the derived id displaced the authored one');
  assert.equal(new Set(assigned.components.map((c) => c.id)).size, assigned.components.length,
    'ids are not unique after collision resolution');
});

// ---------------------------------------------------------------------------
// Row 1.14 — the system model
// ---------------------------------------------------------------------------

const REVISION = 'c'.repeat(40);

async function graphWithFact(subject) {
  const { EvidenceGraph } = await import('../../evidence/src/graph.mjs');
  const graph = new EvidenceGraph();
  const id = graph.append({
    subject, predicate: 'calls', object: 'ledger',
    provenance: 'statically-derived',
    location: { path: 'src/orders.ts', lines: [10, 12] },
    revision: REVISION, adapter: 'imports',
  });
  return { graph, id };
}

test('[1.14] components sharing an id across documents merge into one, keeping both labels', async () => {
  const { buildModel } = await import('../../model/src/model.mjs');
  const a = architecture();
  const b = architecture();
  b.meta.title = 'Shop (ops view)';
  b.components[0].label = 'Orders Service';

  const model = buildModel({ documents: [a, b] });
  const orders = model.components.filter((c) => c.id === 'orders');
  assert.equal(orders.length, 1, 'the same component from two documents did not merge');
  // The merge must not be a silent overwrite: both labels are on record.
  assert.ok(orders[0].labels.includes('Orders') && orders[0].labels.includes('Orders Service'),
    `the merge dropped a label: ${JSON.stringify(orders[0].labels)}`);
  assert.equal(orders[0].sources.length, 2, 'the merged component does not cite both documents');
});

test('[1.14] a component with graph facts takes the fact provenance; one without is authored', async () => {
  const { buildModel } = await import('../../model/src/model.mjs');
  const { graph, id } = await graphWithFact('orders');

  const model = buildModel({ documents: [architecture()], graph });
  const orders = model.components.find((c) => c.id === 'orders');
  assert.equal(orders.provenance, 'statically-derived');
  assert.ok(orders.evidenceRefs.includes(id), 'the model object does not cite the fact it came from');

  const ledger = model.components.find((c) => c.labels.includes('Ledger'));
  assert.equal(ledger.provenance, 'authored', 'a component with no evidence must be authored, not flattered');
  assert.deepEqual(ledger.evidenceRefs, []);
});

test('[1.14] the provenance summary counts every object exactly once', async () => {
  const { buildModel } = await import('../../model/src/model.mjs');
  const { graph } = await graphWithFact('orders');
  const model = buildModel({ documents: [architecture()], graph });

  const objects = model.components.length + model.relationships.length + model.boundaries.length;
  const counted = Object.values(model.provenanceSummary).reduce((sum, n) => sum + n, 0);
  assert.equal(counted, objects,
    'the provenance summary does not sum to the object count -- an object is uncounted or double-counted');
});

// ---------------------------------------------------------------------------
// Row 1.17 — human overrides
// ---------------------------------------------------------------------------

test('[1.17] an override is recorded as authored even when it replaces derived provenance', async () => {
  const { buildModel } = await import('../../model/src/model.mjs');
  const { graph } = await graphWithFact('orders');
  const model = buildModel({
    documents: [architecture()],
    graph,
    overrides: [{ id: 'orders', label: 'Order Management' }],
  });

  const orders = model.components.find((c) => c.id === 'orders');
  assert.equal(orders.provenance, 'authored',
    'an overridden object kept its derived provenance -- a human decision disguised as analysis');
  assert.ok(orders.labels.includes('Order Management'));
  // Inspectable: what the override replaced is on record, not erased.
  assert.ok(orders.overridden, 'the object does not record that it was overridden');
  assert.equal(orders.overridden.previousProvenance, 'statically-derived');
});

test('[1.17] an override naming an unknown id is refused, not silently ignored', async () => {
  const { buildModel } = await import('../../model/src/model.mjs');
  // A typo'd override that quietly does nothing is the failure mode: the
  // author believes they changed the model and nothing says otherwise.
  assert.throws(
    () => buildModel({ documents: [architecture()], overrides: [{ id: 'ordrs', label: 'typo' }] }),
    /ordrs/,
    'an override for an unknown id was accepted silently',
  );
});
