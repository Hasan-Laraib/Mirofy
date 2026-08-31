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

// ---------------------------------------------------------------------------
// Correcting a side that faces the wrong way.
//
// The largest failure class a model-authored diagram hits, and it is not a
// routing problem at all: a model writes `fromSide: "top"` for two components
// sitting SIDE BY SIDE. A side is a direction contract -- the first segment has
// to leave perpendicular to it -- so no amount of rerouting can satisfy a side
// that faces away. The instruction is impossible, not merely awkward.
// ---------------------------------------------------------------------------

/** Two components side by side, with sides authored as if they were stacked. */
function sidewaysDocument() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Wrong sides' },
    layout: { mode: 'grid', cols: 3 },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', row: 0, col: 0 },
      { id: 'cdn', type: 'cloud', label: 'CDN', row: 0, col: 2 },
    ],
    connections: [
      { id: 'web_to_cdn', from: 'web', to: 'cdn', label: 'assets', fromSide: 'top', toSide: 'bottom' },
    ],
  };
}

test('[3.13] a side that faces away from the other component is corrected', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const { document, receipt } = repairDocument(sidewaysDocument(), { safe: true });
  const edge = document.connections[0];
  // `cdn` is to the right of `web`, so the sides that face are right and left.
  assert.equal(edge.fromSide, 'right');
  assert.equal(edge.toSide, 'left');
  assert.equal(receipt.resided.length, 1, 'the correction was not reported');
  assert.equal(receipt.resided[0].fromSide.from, 'top');
  assert.equal(receipt.resided[0].fromSide.to, 'right');
});

test('[3.13] a side that already faces correctly is left alone', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = sidewaysDocument();
  input.connections[0].fromSide = 'right';
  input.connections[0].toSide = 'left';
  const { document, receipt } = repairDocument(input, { safe: true });
  assert.deepEqual(receipt.resided, []);
  assert.equal(document.connections[0].fromSide, 'right');
});

test('[3.13] an authored route is steering, and repair does not overrule it', async () => {
  // `via` is the author taking the wheel. Correcting sides underneath a hand
  // routed edge would fight a decision someone made deliberately.
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = sidewaysDocument();
  input.connections[0].via = [[300, 40]];
  const { document, receipt } = repairDocument(input, { safe: true });
  assert.deepEqual(receipt.resided, []);
  assert.equal(document.connections[0].fromSide, 'top', 'a hand-routed edge was overruled');
});

test('[3.13] a side is never invented where there is nothing to compare', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = sidewaysDocument();
  input.connections.push(/** @type {any} */ ({ id: 'ghost', from: 'web', to: 'missing', fromSide: 'top' }));
  const { document, receipt } = repairDocument(input, { safe: true });
  const ghost = document.connections.find((c) => c.id === 'ghost');
  assert.equal(ghost.fromSide, 'top', 'a side was chosen for an endpoint that does not exist');
  assert.ok(!receipt.resided.some((entry) => entry.id === 'ghost'));
});

test('[3.13] correcting sides changes routing, not meaning', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const input = sidewaysDocument();
  const { document } = repairDocument(input, { safe: true });
  // A side decides how an edge is drawn, never what it connects. Topology and
  // labels come through untouched.
  assert.deepEqual(document.connections.map((c) => [c.from, c.to, c.label]),
    input.connections.map((c) => [c.from, c.to, c.label]));
});

// ---------------------------------------------------------------------------
// All five types. Repair used to refuse everything but architecture, so six of
// eight benchmark tasks came back "repair refused this document" -- the tool's
// own repair step contributed nothing to four fifths of its own surface.
//
// Extending it exposed a boundary worth naming rather than working around.
// ---------------------------------------------------------------------------

test('[3.13] every diagram type is accepted, none is refused outright', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const documents = {
    workflow: { diagram_type: 'workflow', lanes: [{ id: 'l' }], nodes: [{ id: 'a', lane: 'l', col: 0 }], edges: [] },
    lifecycle: { diagram_type: 'lifecycle', lanes: [{ id: 'l' }], states: [{ id: 'a', lane: 'l', col: 0 }], transitions: [] },
    dataflow: { diagram_type: 'dataflow', stages: [{ id: 's' }], nodes: [{ id: 'a', stage: 's', row: 0 }], flows: [] },
    sequence: { diagram_type: 'sequence', participants: [{ id: 'a' }], messages: [] },
    architecture: { diagram_type: 'architecture', components: [{ id: 'a', label: 'A', pos: [0, 0], size: [180, 60] }], connections: [] },
  };
  for (const [type, document] of Object.entries(documents)) {
    const result = repairDocument(document, { safe: true, diagramType: type });
    assert.ok(result.receipt, `${type} was refused`);
  }
});

test('[3.13] a type repair cannot help is told so, not reported as clean', async () => {
  // The distinction that matters. "Nothing needed fixing" and "there is nothing
  // here I can fix" look identical in a log, and only one of them is a fact
  // about the document.
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const { receipt } = repairDocument(
    { diagram_type: 'sequence', participants: [{ id: 'a' }], messages: [{ from: 'a', to: 'a' }] },
    { safe: true, diagramType: 'sequence' },
  );
  assert.ok(receipt.nothingToRepair, 'a sequence document was reported as a clean repair');
  assert.match(receipt.nothingToRepair, /carry no side/);
});

test('[3.13] a side is corrected in a lane-and-column type too', async () => {
  // Ordinals are enough: a side asks only which node is further left or
  // further down, and every renderer places columns and lanes in increasing
  // order.
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const document = {
    diagram_type: 'workflow',
    lanes: [{ id: 'ci' }],
    nodes: [{ id: 'build', lane: 'ci', col: 0 }, { id: 'test', lane: 'ci', col: 3 }],
    edges: [{ id: 'e1', from: 'build', to: 'test', fromSide: 'top', toSide: 'bottom' }],
  };
  const { document: fixed, receipt } = repairDocument(document, { safe: true, diagramType: 'workflow' });
  assert.equal(fixed.edges[0].fromSide, 'right', 'a side facing away was left in a workflow');
  assert.equal(fixed.edges[0].toSide, 'left');
  assert.equal(receipt.resided.length, 1);
});

test('[3.13] widening and nudging stay architecture-only, because the schema says so', async () => {
  // Not an omission. Only architecture lets a node declare `pos` and `size`;
  // elsewhere placement is derived from a lane and a column, and there is no
  // width to widen. Pretending otherwise would emit keys the schema rejects.
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  const document = {
    diagram_type: 'workflow',
    lanes: [{ id: 'ci' }],
    nodes: [{ id: 'a', lane: 'ci', col: 0, label: 'An extremely long node label indeed' }],
    edges: [],
  };
  const { document: fixed, receipt } = repairDocument(document, { safe: true, diagramType: 'workflow' });
  assert.deepEqual(receipt.widened, [], 'repair tried to widen a node that cannot carry a size');
  assert.equal(fixed.nodes[0].size, undefined, 'a size was written where the schema forbids one');
});

test('[3.13] an unknown diagram type is refused rather than guessed at', async () => {
  const { repairDocument } = await import('../../layout/src/repair.mjs');
  assert.throws(
    () => repairDocument({ diagram_type: 'mindmap', components: [] }, { safe: true }),
    /unknown diagram type/,
  );
});
