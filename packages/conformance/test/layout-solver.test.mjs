// Row 3.12. The constraint solver, and row 1.11's promise that authored
// positions survive it.
//
// webcola does the force layout. It does NOT do the pinning: both documented
// mechanisms were measured in this harness and neither held a pinned node --
// `node.fixed = 1` drifted 100.8px and `Descent.locks.add()` drifted 123.2px
// over 60 iterations. `fixed` is consumed by the d3 drag adaptor rather than
// by the descent, and the lock did not survive the tick loop.
//
// So pins are enforced here, after the solve, and asserted rather than
// assumed. "Authored positions are hard constraints" is a promise to the
// person who typed the coordinates; a promise kept only when the library
// feels like it is not a constraint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/render.mjs';

/** A view IR shaped like what `npm run compile` emits. */
function view() {
  const node = (id) => ({ id, label: id.toUpperCase(), kind: 'backend', provenance: 'authored', evidenceRefs: [] });
  const edge = (id, from, to) => ({ id, from, to, label: null, provenance: 'authored', evidenceRefs: [] });
  return {
    schemaVersion: 1,
    type: 'architecture',
    scope: 'system',
    audience: 'engineering',
    budget: 6,
    planner: 'deterministic',
    nodes: ['a', 'b', 'c', 'd', 'e'].map(node),
    edges: [edge('r1', 'a', 'b'), edge('r2', 'b', 'c'), edge('r3', 'c', 'd'), edge('r4', 'd', 'e')],
    intent: { group: [], rank: [], mainPath: ['a', 'b', 'c', 'd', 'e'], adjacency: [] },
    omissions: [],
  };
}

/** @type {[number, number]} */
const SIZE = [180, 60];
/** @type {[number, number]} */
const CANVAS = [1200, 800];

test('[3.12] an authored position is a hard constraint and survives the solve exactly', async () => {
  const { solve } = await import('../../layout/src/solve.mjs');
  /** @type {Record<string, [number, number]>} */
  const pinned = { a: [500, 400], e: [900, 120] };
  const result = solve(view(), { pinned, size: SIZE, canvas: CANVAS });

  for (const [id, [x, y]] of Object.entries(pinned)) {
    assert.deepEqual(result.positions[id], [x, y],
      `authored position for ${id} moved: ${JSON.stringify(result.positions[id])} != ${JSON.stringify([x, y])}. `
      + 'A pin the solver may relocate is not a constraint.');
  }
  assert.deepEqual([...result.pinned].sort(), ['a', 'e']);
});

test('[3.12] every node receives a finite position, and none is left where it started by accident', async () => {
  const { solve } = await import('../../layout/src/solve.mjs');
  const result = solve(view(), { size: SIZE, canvas: CANVAS });
  for (const node of view().nodes) {
    const position = result.positions[node.id];
    assert.ok(Array.isArray(position) && position.length === 2, `${node.id} has no position`);
    assert.ok(Number.isFinite(position[0]) && Number.isFinite(position[1]),
      `${node.id} has a non-finite position: ${JSON.stringify(position)}`);
  }
  // Five nodes on a chain should not all land on one point.
  const distinct = new Set(Object.values(result.positions).map((p) => p.join(',')));
  assert.equal(distinct.size, 5, 'the solve collapsed nodes onto shared coordinates');
});

test('[3.12] solved nodes do not overlap, including against pinned ones', async () => {
  const { solve } = await import('../../layout/src/solve.mjs');
  // The pin sits exactly where the force layout would like to put something
  // else, so this is the case where enforcing the pin could create an overlap.
  const result = solve(view(), { pinned: { c: /** @type {[number, number]} */ ([600, 400]) }, size: SIZE, canvas: CANVAS });

  const boxes = Object.entries(result.positions).map(([id, [x, y]]) => ({
    id, x, y, right: x + SIZE[0], bottom: y + SIZE[1],
  }));
  const overlaps = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) {
        overlaps.push(`${a.id} overlaps ${b.id}`);
      }
    }
  }
  assert.deepEqual(overlaps, [], overlaps.join('\n  '));
  // And the pin still held while that was resolved.
  assert.deepEqual(result.positions.c, [600, 400], 'the pin moved while overlaps were resolved');
});

test('[3.12] the same view solves to the same coordinates twice', async () => {
  const { solve } = await import('../../layout/src/solve.mjs');
  // A layout that changes between runs is unreviewable: every render would
  // produce a different golden digest for an unchanged document.
  const first = solve(view(), { size: SIZE, canvas: CANVAS });
  const second = solve(view(), { size: SIZE, canvas: CANVAS });
  assert.deepEqual(first.positions, second.positions);
});

test('[3.12] the solver invents no node and drops none', async () => {
  const { solve } = await import('../../layout/src/solve.mjs');
  const result = solve(view(), { size: SIZE, canvas: CANVAS });
  assert.deepEqual(Object.keys(result.positions).sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('[3.12] a pin for an unknown node is refused, not silently ignored', async () => {
  const { solve } = await import('../../layout/src/solve.mjs');
  // A typo'd pin that quietly does nothing is the failure mode: the author
  // believes they placed something and the layout disagrees in silence.
  assert.throws(
    () => solve(view(), { pinned: { ghost: /** @type {[number, number]} */ ([0, 0]) }, size: SIZE, canvas: CANVAS }),
    /ghost/,
    'a pin naming a node absent from the view was accepted',
  );
});

test('[3.12] the solver is dev-time: @mirofy/layout declares no runtime dependencies', () => {
  // webcola is real and useful, and it is a build-time tool. The shipped
  // artifact must keep row 6.9's promise, so the dependency is declared as a
  // devDependency of the one package that uses it.
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/layout/package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined, 'packages/layout declares runtime dependencies');
  assert.ok(pkg.devDependencies?.webcola, 'packages/layout does not declare webcola as a devDependency');
});
