// Choosing where an edge label sits, instead of asking the author to.
//
// Every renderer here already detected label collisions and printed a
// suggestion: "labelAt [100, 76] or labelDy -54 (above)". Two things were
// wrong with that. The suggestion is a guess -- it moves the label clear of
// the ONE obstacle it collided with, and never checks whether the new spot is
// occupied by a different node or by another label. And more importantly, a
// tool that can compute the answer should not make a person type it.
//
// So this solves the placement rather than suggesting it. For each label it
// walks a fixed ladder of candidate positions outward from where the label
// naturally falls, and takes the first one that touches nothing.
//
// TWO PROPERTIES MAKE THIS SAFE TO TURN ON EVERYWHERE.
//
// The natural position is always the first candidate tried, so a label that
// was already clear does not move by so much as a pixel, and a document that
// renders correctly today renders byte-identically tomorrow.
//
// AUTHORED PLACEMENT IS NEVER OVERRIDDEN. A label carrying labelAt, labelDx
// or labelDy was placed by a person who meant it, and that is a fact about
// the document -- not a default for this module to improve on. Those labels
// are reserved before solving, so automatic labels route around them, and if
// an authored label still collides the renderer reports it exactly as before.
// Only placement the tool chose is placement the tool may change.
//
// When no candidate is clear, the label stays where it naturally fell and the
// collision is reported. Moving it somewhere else that is also wrong would
// trade a diagnosed problem for an undiagnosed one.

import { rectsOverlap } from './geometry.mjs';

// How far a label may be nudged, in the order the nudges are tried.
//
// Vertical first, and further: an edge label reads as belonging to its line
// when it sits above or below it, and reads as belonging to nothing when it
// drifts along it. The horizontal ladder is shorter for the same reason.
const VERTICAL_STEPS = [0, -18, 18, -34, 34, -50, 50, -66, 66];
const HORIZONTAL_STEPS = [0, -28, 28, -56, 56];

// A sideways nudge costs more than a vertical one of the same size, so the
// solver spends its displacement budget on the axis that reads better.
const HORIZONTAL_COST = 1.6;

/**
 * The candidate offsets, nearest-first.
 *
 * Built once and frozen: the order IS the algorithm's tie-breaking, and it
 * must not vary between runs or the same document would render differently on
 * two machines.
 */
const CANDIDATES = Object.freeze(
  HORIZONTAL_STEPS.flatMap((dx) => VERTICAL_STEPS.map((dy) => ({ dx, dy })))
    .sort((a, b) => {
      const costA = Math.abs(a.dy) + Math.abs(a.dx) * HORIZONTAL_COST;
      const costB = Math.abs(b.dy) + Math.abs(b.dx) * HORIZONTAL_COST;
      if (costA !== costB) return costA - costB;
      // Equal cost: prefer above to below, then left to right. Arbitrary, but
      // fixed, which is the part that matters.
      if (a.dy !== b.dy) return a.dy - b.dy;
      return a.dx - b.dx;
    }),
);

/** The rect a label would occupy at a given offset from its natural point. */
function rectAt(label, dx, dy) {
  return {
    x: label.x + dx,
    y: label.y + dy,
    width: label.width,
    height: label.height,
  };
}

/**
 * Place automatically-positioned edge labels so they clear nodes and each
 * other.
 *
 * @param {{labels: Array<{key: string, x: number, y: number, width: number,
 *          height: number, pinned?: boolean}>,
 *          obstacles: Array<{x: number, y: number, width: number, height: number}>,
 *          clearance?: number,
 *          bounds?: {width: number, height: number}|null}} options
 * @returns {{placements: Map<string, {dx: number, dy: number}>, moved: number,
 *            unplaceable: Array<string>}}
 */
export function solveLabelPlacements({ labels, obstacles, clearance = -2, bounds = null }) {
  const placements = new Map();
  const unplaceable = [];
  let moved = 0;

  // Anything a person placed is immovable, and is reserved before the first
  // automatic label is solved -- otherwise an automatic label could be sent to
  // a spot an authored label already owns, and the order of the input would
  // decide which of the two collided.
  const taken = labels.filter((label) => label.pinned).map((label) => rectAt(label, 0, 0));

  for (const label of labels) {
    if (label.pinned) {
      placements.set(label.key, { dx: 0, dy: 0 });
      continue;
    }
    const choice = CANDIDATES.find((candidate) => {
      const rect = rectAt(label, candidate.dx, candidate.dy);
      if (bounds && (rect.x < 0 || rect.y < 0
        || rect.x + rect.width > bounds.width || rect.y + rect.height > bounds.height)) {
        return false;
      }
      if (obstacles.some((obstacle) => rectsOverlap(rect, obstacle, clearance))) return false;
      // Labels are checked against each other with no tolerance: two labels
      // that merely touch are still two labels a reader can separate.
      return !taken.some((other) => rectsOverlap(rect, other, 0));
    });

    if (!choice) {
      // Left where it fell, and named. The renderer's own collision check will
      // report it, which is the honest outcome -- this module could not solve
      // it, and should not disguise that by moving it somewhere arbitrary.
      unplaceable.push(label.key);
      placements.set(label.key, { dx: 0, dy: 0 });
      taken.push(rectAt(label, 0, 0));
      continue;
    }

    if (choice.dx !== 0 || choice.dy !== 0) moved += 1;
    placements.set(label.key, choice);
    taken.push(rectAt(label, choice.dx, choice.dy));
  }

  return { placements, moved, unplaceable };
}

/**
 * Whether a relation's label position was chosen by its author.
 *
 * `labelSegment` is deliberately NOT in this list. It names which segment of
 * the route the label belongs beside -- which is about meaning, and survives a
 * nudge -- where labelAt/labelDx/labelDy name a position, which does not.
 */
export function hasAuthoredLabelPosition(relation) {
  return Boolean(relation?.labelAt)
    || Number.isFinite(relation?.labelDx)
    || Number.isFinite(relation?.labelDy);
}
