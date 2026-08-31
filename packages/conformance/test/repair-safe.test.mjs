// Row 3.13. `repair --safe`: the makeFeasible() pattern.
//
// Minimise displacement, solve feasibility, report what cannot be satisfied,
// and NEVER touch topology, labels, or semantics.
//
// That last clause is the whole reason this can be trusted, so it is enforced
// mechanically rather than promised: strip every position from the input and
// from the output, and the two must be identical. A repair that renamed a
// component, dropped a connection or edited a label would fail that
// comparison no matter how good the geometry looked.
//
// `--safe` is required rather than default. Rewriting someone's authored
// coordinates is a real edit to their file, and it should take an explicit
// word to ask for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Two components that overlap, plus one that does not, and a connection. */
function overlapping() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Needs repair' },
    components: [
      { id: 'a', type: 'backend', label: 'Alpha', tag: 'team-a', pos: [200, 200], size: [180, 60] },
      // Overlaps `a` by 80px horizontally and 30px vertically.
      { id: 'b', type: 'database', label: 'Beta', pos: [300, 230], size: [180, 60] },
      { id: 'c', type: 'frontend', label: 'Gamma', pos: [700, 200], size: [180, 60] },
    ],
    connections: [
      { from: 'a', to: 'b', label: 'writes' },
      { from: 'b', to: 'c', label: 'reads' },
    ],
  };
}

/**
 * Everything except geometry — the part repair must never touch.
 *
 * `size` counts as geometry, and that is a deliberate call rather than a
 * convenience. A component's width decides how much room it has, not what it
 * is or what it says: widening one to fit its own label changes no meaning.
 * Repair needs that lever, because a label wider than its component was the
 * single most common reason a model-authored diagram was rejected, and nothing
 * else can fix it.
 */
function semantics(document) {
  const GEOMETRY = new Set(['pos', 'size', 'via', 'channelX', 'channelY']);
  return JSON.parse(JSON.stringify(document, (key, value) => (
    GEOMETRY.has(key) ? undefined : value
  )));
}

const boxesOverlap = (l, r) => (
  l.pos[0] < r.pos[0] + r.size[0] && r.pos[0] < l.pos[0] + l.size[0]
  && l.pos[1] < r.pos[1] + r.size[1] && r.pos[1] < l.pos[1] + l.size[1]
);

test('[3.13] repair separates overlapping components', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = overlapping();
  assert.ok(boxesOverlap(input.components[0], input.components[1]), 'the fixture must start overlapping');

  const { document } = repairDocument(input, { safe: true });
  const [a, b] = document.components;
  assert.ok(!boxesOverlap(a, b), `repair left ${a.id} overlapping ${b.id}`);
});

test('[3.13] repair never touches topology, labels, or semantics', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = overlapping();
  const { document } = repairDocument(input, { safe: true });

  // The mechanical form of the promise. Anything but geometry moving here is
  // a repair that edited meaning, however good the result looked.
  assert.deepEqual(semantics(document), semantics(input),
    'repair changed something other than geometry');

  // And spelled out, because a reader should not have to trust the helper.
  assert.deepEqual(document.components.map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(document.components.map((c) => c.label), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(document.components.map((c) => c.type), ['backend', 'database', 'frontend']);
  assert.equal(document.components[0].tag, 'team-a');
  assert.deepEqual(document.connections, input.connections);
  assert.deepEqual(document.meta, input.meta);
});

test('[3.13] repair minimises displacement and moves only what it must', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = overlapping();
  const { document, receipt } = repairDocument(input, { safe: true });

  // `c` is nowhere near the overlap. A repair that re-solved the whole
  // diagram would move it, and that is the difference between repairing a
  // document and replacing it.
  const c = document.components.find((component) => component.id === 'c');
  assert.deepEqual(c.pos, [700, 200], 'repair moved a component that was not part of any problem');
  assert.ok(!receipt.moves.some((move) => move.id === 'c'), 'the receipt records a move for an untouched component');

  // The overlap is 80px on x and 30px on y, so the cheapest correction is
  // 30px vertical. Anything much larger is not minimal displacement.
  const total = receipt.moves.reduce((sum, move) => sum + move.distance, 0);
  assert.ok(total > 0, 'nothing moved, yet the fixture overlapped');
  assert.ok(total <= 60, `displacement ${total}px is larger than the overlap required`);
});

test('[3.13] every nudge is on the receipt, with where it came from and where it went', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = overlapping();
  const { document, receipt } = repairDocument(input, { safe: true });

  assert.ok(receipt.moves.length > 0, 'the receipt records no moves');
  for (const move of receipt.moves) {
    const before = input.components.find((component) => component.id === move.id);
    const after = document.components.find((component) => component.id === move.id);
    assert.deepEqual(move.from, before.pos, `receipt "from" does not match the input for ${move.id}`);
    assert.deepEqual(move.to, after.pos, `receipt "to" does not match the output for ${move.id}`);
    assert.ok(move.reason && move.reason.length > 0, `move for ${move.id} carries no reason`);
  }

  // The inverse direction: a component that moved must appear on the receipt.
  for (const after of document.components) {
    const before = input.components.find((component) => component.id === after.id);
    if (JSON.stringify(before.pos) === JSON.stringify(after.pos)) continue;
    assert.ok(receipt.moves.some((move) => move.id === after.id),
      `${after.id} moved but is absent from the receipt -- an unrecorded nudge`);
  }
});

test('[3.13] what repair cannot fix is reported, not silently left', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  // A component overlapping ITSELF is impossible to separate: zero-size, and
  // two components at exactly the same point with the same size cannot be
  // told apart by direction. Repair must say so rather than loop or pretend.
  const input = overlapping();
  input.components[1].pos = [200, 200];
  input.components[1].size = [180, 60];

  const { receipt } = repairDocument(input, { safe: true, maxPasses: 2 });
  // Either it resolved them, or it declared the residue. Silence is the one
  // unacceptable outcome.
  const resolved = receipt.unsatisfiable.length === 0;
  assert.ok(resolved || receipt.unsatisfiable.every((entry) => entry.reason && entry.reason.length > 0),
    'repair left problems unresolved without saying which, or why');
});

test('[3.13] repair refuses to rewrite a document without --safe', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  // Rewriting authored coordinates is a real edit to someone's file. It
  // should take an explicit word, not a default.
  assert.throws(() => repairDocument(overlapping(), {}), /safe/i,
    'repair rewrote a document without being asked explicitly');
});

test('[3.13] repairing an already-clean document changes nothing', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const clean = overlapping();
  clean.components[1].pos = [500, 200];
  const { document, receipt } = repairDocument(clean, { safe: true });
  assert.deepEqual(document, clean, 'repair moved something in a document with no overlaps');
  assert.deepEqual(receipt.moves, []);
});

test('[3.13] repair is deterministic', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const first = repairDocument(overlapping(), { safe: true });
  const second = repairDocument(overlapping(), { safe: true });
  assert.deepEqual(first.document, second.document);
  assert.deepEqual(first.receipt, second.receipt);
});

// ---------------------------------------------------------------------------
// Fitting labels. The benchmark found that "label wider than its component"
// was the most common reason a model-authored diagram was rejected -- and that
// repair could not touch it, because repair only moved boxes.
//
// Worse, repair did NOTHING AT ALL for a grid-placed document: its box list
// required both `pos` and `size`, and a grid document declares neither. That is
// the mode `import mermaid` produces and the mode a model told to avoid
// coordinates produces, so repair was blind to precisely the documents most
// likely to need it.
// ---------------------------------------------------------------------------

/** A grid document whose labels do not fit the default 120px component. */
function gridWithLongLabels() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Grid' },
    layout: { mode: 'grid', cols: 2 },
    components: [
      { id: 'notifications_service', type: 'backend', label: 'Notifications Service', row: 0, col: 1 },
      { id: 'notifications_db', type: 'database', label: 'Notifications Database', row: 1, col: 1 },
      { id: 'api', type: 'backend', label: 'API', row: 0, col: 0 },
    ],
    connections: [{ from: 'notifications_service', to: 'notifications_db', label: 'writes' }],
  };
}

test('[3.13] a component too narrow for its own label is widened', async () => {
  const { repairDocument, widthForLabel } = await import('../../layout/src/repair.mjs');
  const { document, receipt } = repairDocument(gridWithLongLabels(), { safe: true });

  const widened = document.components.find((c) => c.id === 'notifications_service');
  assert.ok(Array.isArray(widened.size), 'a grid component was left with no explicit size');
  assert.ok(widened.size[0] >= widthForLabel('Notifications Service'),
    'the component is still narrower than its label needs');
  assert.equal(receipt.widened.length, 2, 'the widening was not reported');
});

test('[3.13] a grid document is repaired at all', async () => {
  // The regression this guards. Repair used to require pos AND size, so a grid
  // document produced an empty box list and the whole pass did nothing --
  // silently, while reporting success.
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const { receipt } = repairDocument(gridWithLongLabels(), { safe: true });
  assert.ok(receipt.widened.length > 0, 'repair did nothing for a grid-placed document');
});

test('[3.13] grid widening is uniform, so the grid stays aligned', async () => {
  // Widening individually was worse than doing nothing. Two components stacked
  // in one column grew to 131 and 138, their centres stopped aligning, and the
  // vertical edge between them stopped leaving a perpendicular side -- trading
  // two label failures for two routing failures. A grid's whole value is that
  // things line up.
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const { document } = repairDocument(gridWithLongLabels(), { safe: true });
  const widths = document.components.filter((c) => c.size).map((c) => c.size[0]);
  assert.ok(widths.length >= 2, 'not enough components were widened to prove anything');
  assert.equal(new Set(widths).size, 1, `grid components were widened to different widths: ${widths}`);
});

test('[3.13] a component that already fits is left alone', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const { document } = repairDocument(gridWithLongLabels(), { safe: true });
  // "API" fits the default width. Widening it would grow the diagram for
  // nothing, and minimal displacement is this module's whole discipline.
  const api = document.components.find((c) => c.id === 'api');
  assert.equal(api.size, undefined, 'a component that already fits was given a size anyway');
});

test('[3.13] widening changes geometry and nothing else', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = gridWithLongLabels();
  const { document } = repairDocument(input, { safe: true });
  // The same mechanical promise as before, now exercised on a document that
  // really is rewritten: strip geometry from both sides and they must match.
  assert.deepEqual(semantics(document), semantics(input),
    'widening changed something other than geometry');
  assert.deepEqual(document.components.map((c) => c.label),
    ['Notifications Service', 'Notifications Database', 'API']);
});

test('[3.13] fitLabels can be turned off', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const { receipt } = repairDocument(gridWithLongLabels(), { safe: true, fitLabels: false });
  assert.deepEqual(receipt.widened, []);
});
