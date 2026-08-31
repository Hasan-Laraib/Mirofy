import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLabelPlacements, hasAuthoredLabelPosition } from '../../core/renderers/shared/label-placement.mjs';

/** A label rect at (x, y), sized like a short edge label. */
function label(key, x, y, width = 40, height = 14, pinned = false) {
  return { key, x, y, width, height, pinned };
}

function box(x, y, width = 120, height = 60) {
  return { x, y, width, height };
}

test('a label that is already clear does not move', () => {
  const { placements, moved } = solveLabelPlacements({
    labels: [label('a', 300, 300)],
    obstacles: [box(0, 0)],
  });
  assert.deepEqual(placements.get('a'), { dx: 0, dy: 0 });
  assert.equal(moved, 0, 'a clean document must render byte-identically');
});

test('a label sitting on a node is moved off it', () => {
  const { placements, moved, unplaceable } = solveLabelPlacements({
    labels: [label('a', 40, 20)],
    obstacles: [box(0, 0)],
  });
  const { dx, dy } = placements.get('a');
  assert.equal(moved, 1);
  assert.deepEqual(unplaceable, []);
  const rect = { x: 40 + dx, y: 20 + dy, width: 40, height: 14 };
  const overlaps = rect.x < 120 && rect.x + rect.width > 0
    && rect.y < 60 && rect.y + rect.height > 0;
  assert.equal(overlaps, false, `label still on the node at ${dx},${dy}`);
});

test('two labels that would collide are separated', () => {
  const { placements } = solveLabelPlacements({
    labels: [label('a', 200, 200), label('b', 210, 202)],
    obstacles: [],
  });
  const a = placements.get('a');
  const b = placements.get('b');
  const rectA = { x: 200 + a.dx, y: 200 + a.dy };
  const rectB = { x: 210 + b.dx, y: 202 + b.dy };
  const overlaps = rectA.x < rectB.x + 40 && rectA.x + 40 > rectB.x
    && rectA.y < rectB.y + 14 && rectA.y + 14 > rectB.y;
  assert.equal(overlaps, false, 'the second label was placed on top of the first');
});

test('an authored position is never moved, and the automatic label yields to it', () => {
  // The pinned label sits exactly where the automatic one naturally falls.
  const { placements } = solveLabelPlacements({
    labels: [label('auto', 200, 200), label('pinned', 200, 200, 40, 14, true)],
    obstacles: [],
  });
  assert.deepEqual(placements.get('pinned'), { dx: 0, dy: 0 },
    'an authored placement is a fact about the document, not a default to improve on');
  const auto = placements.get('auto');
  assert.notDeepEqual(auto, { dx: 0, dy: 0 }, 'the automatic label should have yielded');
});

test('a label with nowhere to go is reported rather than moved somewhere arbitrary', () => {
  // A wall of obstacles across the whole ladder's reach.
  const obstacles = [];
  for (let x = -200; x <= 400; x += 40) {
    for (let y = -200; y <= 400; y += 20) obstacles.push({ x, y, width: 40, height: 20 });
  }
  const { placements, unplaceable } = solveLabelPlacements({
    labels: [label('a', 100, 100)],
    obstacles,
  });
  assert.deepEqual(unplaceable, ['a']);
  assert.deepEqual(placements.get('a'), { dx: 0, dy: 0 },
    'an unsolvable label stays where it fell so the collision is still reported');
});

test('bounds keep a label on the canvas', () => {
  // The label is boxed in from below, so the cheapest escape is upward -- and
  // upward is off the top of the canvas. Only the bounds check can reject it,
  // which is what makes this test bite: without bounds the solver picks the
  // cheaper move (dy -18) and puts the label at y -8.
  const boxedInFromBelow = [box(0, 12, 60, 40)];
  const free = solveLabelPlacements({
    labels: [label('a', 10, 10)],
    obstacles: boxedInFromBelow,
  });
  assert.ok(10 + free.placements.get('a').dy < 0,
    'the fixture no longer tempts the solver off-canvas, so it proves nothing');

  const { placements } = solveLabelPlacements({
    labels: [label('a', 10, 10)],
    obstacles: boxedInFromBelow,
    bounds: { width: 400, height: 400 },
  });
  const { dx, dy } = placements.get('a');
  assert.ok(10 + dx >= 0 && 10 + dy >= 0 && 10 + dx + 40 <= 400 && 10 + dy + 14 <= 400,
    `moved off the canvas to ${10 + dx},${10 + dy}`);
});

test('the same input always produces the same placement', () => {
  const build = () => ({
    labels: [label('a', 40, 20), label('b', 44, 24), label('c', 48, 28)],
    obstacles: [box(0, 0), box(200, 0)],
  });
  const first = solveLabelPlacements(build());
  const second = solveLabelPlacements(build());
  assert.deepEqual([...first.placements], [...second.placements],
    'placement must not vary between runs or a document renders differently on two machines');
});

test('labelSegment alone does not count as an authored position', () => {
  // It names which segment the label belongs beside -- meaning, which survives
  // a nudge -- not a position, which does not.
  assert.equal(hasAuthoredLabelPosition({ labelSegment: 2 }), false);
  assert.equal(hasAuthoredLabelPosition({ labelAt: [10, 10] }), true);
  assert.equal(hasAuthoredLabelPosition({ labelDx: 12 }), true);
  assert.equal(hasAuthoredLabelPosition({ labelDy: 0 }), true, '0 is a decision, not an absence');
  assert.equal(hasAuthoredLabelPosition({}), false);
  assert.equal(hasAuthoredLabelPosition(undefined), false);
});
