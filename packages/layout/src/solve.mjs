// The constraint solver (row 3.12). View IR with intent goes in; coordinates
// come out. Dev-time: webcola is a devDependency of this package alone, so
// the rendered artifact keeps row 6.9's zero-runtime-dependency promise.
//
// WHAT WEBCOLA DOES HERE: the force layout and overlap avoidance. It is good
// at both.
//
// WHAT IT DOES NOT DO: hold a pinned node. Both documented mechanisms were
// measured in this harness and neither worked -- `node.fixed = 1` drifted
// 100.8px and `Descent.locks.add()` drifted 123.2px over 60 iterations.
// `fixed` is read by the d3 drag adaptor rather than by the descent, and the
// lock did not survive the tick loop.
//
// Row 1.11 promises that "manual pins are still honoured as hard
// constraints", and that is a promise to the person who typed the
// coordinates. So pins are enforced HERE, after the solve, and the tests
// assert them rather than trusting the library. A pin the solver may
// relocate is not a constraint; it is a suggestion with better marketing.
//
// Determinism matters as much as quality: initial positions are seeded from
// the node order rather than at random, because a layout that changes
// between runs makes every render produce a new golden digest for an
// unchanged document.

import * as cola from 'webcola';

/** @type {[number, number]} */
const DEFAULT_SIZE = [180, 60];
/** @type {[number, number]} */
const DEFAULT_CANVAS = [1200, 800];
const ITERATIONS = { unconstrained: 40, userConstraints: 20, allConstraints: 20 };

/** Deterministic seed positions: a ring, so no two nodes start co-located. */
function seedPositions(count, canvas) {
  const [width, height] = canvas;
  const radius = Math.min(width, height) / 3;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2;
    return [
      width / 2 + radius * Math.cos(angle),
      height / 2 + radius * Math.sin(angle),
    ];
  });
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Push `mover` clear of `fixed` along the shallower axis -- the smaller
 * correction, so a node displaced by a pin moves as little as the overlap
 * requires.
 */
function separate(mover, fixed) {
  const overlapX = Math.min(mover.x + mover.w, fixed.x + fixed.w) - Math.max(mover.x, fixed.x);
  const overlapY = Math.min(mover.y + mover.h, fixed.y + fixed.h) - Math.max(mover.y, fixed.y);
  if (overlapX <= 0 || overlapY <= 0) return;
  if (overlapX < overlapY) {
    mover.x += mover.x < fixed.x ? -overlapX : overlapX;
  } else {
    mover.y += mover.y < fixed.y ? -overlapY : overlapY;
  }
}

/**
 * Solve a view IR into coordinates.
 *
 * @param {{nodes: Array<{id: string}>, edges: Array<{from: string, to: string}>}} view
 * @param {{pinned?: Record<string, [number, number]>, size?: [number, number],
 *          canvas?: [number, number]}} [options]
 * @returns {{positions: Record<string, [number, number]>, pinned: string[],
 *            size: [number, number], canvas: [number, number]}}
 */
export function solve(view, options = {}) {
  if (!view || !Array.isArray(view.nodes)) throw new TypeError('solve: a view IR with nodes[] is required');
  const size = options.size ?? DEFAULT_SIZE;
  const canvas = options.canvas ?? DEFAULT_CANVAS;
  const pinned = options.pinned ?? {};

  const ids = view.nodes.map((node) => node.id);
  const indexOf = new Map(ids.map((id, index) => [id, index]));

  // A pin naming a node the view does not contain is refused. A typo'd pin
  // that quietly does nothing is the failure mode worth preventing: the
  // author believes they placed something and the layout silently disagrees.
  for (const id of Object.keys(pinned)) {
    if (!indexOf.has(id)) {
      throw new RangeError(`solve: pinned node ${JSON.stringify(id)} is not in the view`);
    }
  }

  const seeds = seedPositions(ids.length, canvas);
  const nodes = ids.map((id, index) => ({
    name: id,
    width: size[0],
    height: size[1],
    // A pinned node starts where it belongs, so the force layout arranges the
    // rest around it rather than against it.
    x: pinned[id] ? pinned[id][0] + size[0] / 2 : seeds[index][0],
    y: pinned[id] ? pinned[id][1] + size[1] / 2 : seeds[index][1],
  }));

  const links = (view.edges ?? [])
    .filter((edge) => indexOf.has(edge.from) && indexOf.has(edge.to))
    .map((edge) => ({ source: indexOf.get(edge.from), target: indexOf.get(edge.to) }));

  new cola.Layout()
    .size(canvas)
    .nodes(nodes)
    .links(links)
    .avoidOverlaps(true)
    .linkDistance(Math.max(size[0], size[1]) * 1.6)
    .start(ITERATIONS.unconstrained, ITERATIONS.userConstraints, ITERATIONS.allConstraints, 0, false);

  // webcola reports centres; the schema wants top-left.
  const boxes = nodes.map((node) => ({
    id: node.name,
    x: node.x - size[0] / 2,
    y: node.y - size[1] / 2,
    w: size[0],
    h: size[1],
  }));

  // Pins, enforced. Restored exactly, then anything the restoration collided
  // with is moved -- the pin never is.
  const pinnedIds = new Set(Object.keys(pinned));
  for (const box of boxes) {
    if (!pinnedIds.has(box.id)) continue;
    [box.x, box.y] = pinned[box.id];
  }
  if (pinnedIds.size) {
    const anchors = boxes.filter((box) => pinnedIds.has(box.id));
    const free = boxes.filter((box) => !pinnedIds.has(box.id));
    // Bounded passes: each pass strictly reduces overlap, and stopping after
    // a fixed count is better than a loop that might not terminate on a
    // pathological input.
    for (let pass = 0; pass < 8; pass += 1) {
      let moved = false;
      for (const mover of free) {
        for (const anchor of anchors) {
          if (!overlaps(mover, anchor)) continue;
          separate(mover, anchor);
          moved = true;
        }
        for (const other of free) {
          if (other === mover || !overlaps(mover, other)) continue;
          separate(mover, other);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Rounded, because sub-pixel coordinates make golden digests noisy without
  // making any diagram better.
  /** @type {Record<string, [number, number]>} */
  const positions = {};
  for (const box of boxes) {
    positions[box.id] = /** @type {[number, number]} */ ([Math.round(box.x), Math.round(box.y)]);
  }

  return { positions, pinned: [...pinnedIds], size, canvas };
}
