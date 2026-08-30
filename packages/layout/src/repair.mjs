// `repair --safe` (row 3.13): the makeFeasible() pattern.
//
//   minimise displacement · solve feasibility · report what cannot be satisfied
//   NEVER touch topology, labels, or semantics
//
// The last clause is what makes this safe to run on someone's file, so it is
// structural rather than aspirational: this module reads geometry and writes
// geometry. It never looks at `connections`, `label`, `type`, `id` or `meta`
// except to copy them through untouched, and repair-safe.test.mjs strips
// every position from the input and the output and demands the rest be
// identical.
//
// Minimal displacement is the other half. A repair that re-solves the whole
// diagram is not a repair -- it is a replacement that happens to start from
// your file. So only components involved in a problem move, each along the
// SHALLOWER axis of its overlap, which is the smallest correction that
// resolves it.
//
// And feasibility is reported, not faked. Two components at identical
// positions with identical sizes cannot be separated by direction alone;
// repair says so instead of looping or nudging at random.

const DEFAULT_MAX_PASSES = 12;

// The validator does not ask for "not overlapping" -- it asks for CLEARANCE.
// architecture's component rule is rectsOverlap(a, b, 8), so two boxes that
// merely touch still fail it. Separating to exactly zero gap produced
// documents that repair called fixed and validate still rejected, which is
// the worst possible outcome: a repair that reports success and changes
// nothing that matters. Feasibility here means the real rule, not the
// intuitive one.
const DEFAULT_CLEARANCE = 8;

const boxOf = (component) => ({
  id: component.id,
  x: component.pos[0],
  y: component.pos[1],
  w: component.size?.[0] ?? 0,
  h: component.size?.[1] ?? 0,
});

const overlaps = (a, b, clearance = 0) => (
  a.x - clearance < b.x + b.w && b.x - clearance < a.x + a.w
  && a.y - clearance < b.y + b.h && b.y - clearance < a.y + a.h
);

/**
 * Move `mover` clear of `other` along the shallower axis.
 *
 * Returns false when the two cannot be separated by direction -- identical
 * centres on the deciding axis leave no "away" to move towards. That is a
 * genuine infeasibility, and the caller reports it rather than guessing.
 */
function separate(mover, other, clearance = 0) {
  // Overlap measured against the CLEARANCE band, so the correction carries
  // the box past the gap the validator requires rather than up against it.
  const overlapX = Math.min(mover.x + mover.w, other.x + other.w) - Math.max(mover.x, other.x) + clearance;
  const overlapY = Math.min(mover.y + mover.h, other.y + other.h) - Math.max(mover.y, other.y) + clearance;
  if (overlapX <= 0 || overlapY <= 0) return true;

  const moverCentreX = mover.x + mover.w / 2;
  const otherCentreX = other.x + other.w / 2;
  const moverCentreY = mover.y + mover.h / 2;
  const otherCentreY = other.y + other.h / 2;

  if (overlapX < overlapY) {
    if (moverCentreX === otherCentreX) return false;
    mover.x += moverCentreX < otherCentreX ? -overlapX : overlapX;
    return true;
  }
  if (moverCentreY === otherCentreY) return false;
  mover.y += moverCentreY < otherCentreY ? -overlapY : overlapY;
  return true;
}

/**
 * Repair a document's geometry.
 *
 * @param {object} document
 * @param {{safe?: boolean, maxPasses?: number, clearance?: number}} [options]
 * @returns {{document: object, receipt: {moves: Array<object>, resolved: Array<object>,
 *            unsatisfiable: Array<object>, passes: number}}}
 */
export function repairDocument(document, options = {}) {
  // Rewriting authored coordinates is a real edit to someone's file. It takes
  // an explicit word, not a default.
  if (options.safe !== true) {
    throw new TypeError('repair: pass --safe to rewrite authored geometry; repair does not run by default');
  }
  if (!document || !Array.isArray(document.components)) {
    throw new TypeError('repair: a document with components[] is required');
  }

  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES;
  const clearance = options.clearance ?? DEFAULT_CLEARANCE;
  const original = new Map(document.components.map((component) => [component.id, component.pos ? [...component.pos] : null]));

  // Only positioned, sized components take part. Anything else is copied
  // through: repair has no basis for placing what was never placed.
  const boxes = document.components
    .filter((component) => Array.isArray(component.pos) && Array.isArray(component.size))
    .map(boxOf);

  /** @type {Array<{a: string, b: string, reason: string}>} */
  const unsatisfiable = [];
  const resolvedPairs = new Set();
  let passes = 0;

  for (; passes < maxPasses; passes += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (!overlaps(a, b, clearance)) continue;
        const key = `${a.id}|${b.id}`;
        // Move the SECOND of the pair, so the outcome does not depend on
        // iteration order in a way a reader cannot predict.
        if (separate(b, a, clearance)) {
          resolvedPairs.add(key);
          moved = true;
        } else if (!unsatisfiable.some((entry) => entry.a === a.id && entry.b === b.id)) {
          unsatisfiable.push({
            a: a.id,
            b: b.id,
            reason: `${a.id} and ${b.id} share the same centre on the deciding axis, so there is no direction to `
              + 'separate them in. Move one of them, or give them different sizes.',
          });
        }
      }
    }
    if (!moved) break;
  }

  // Anything still overlapping after the pass budget is reported rather than
  // left to be discovered by the next validation run.
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!overlaps(a, b, clearance)) continue;
      if (unsatisfiable.some((entry) => entry.a === a.id && entry.b === b.id)) continue;
      unsatisfiable.push({
        a: a.id,
        b: b.id,
        reason: `still overlapping after ${maxPasses} passes; the surrounding layout is too tight for a `
          + 'displacement-only repair.',
      });
    }
  }

  const solved = new Map(boxes.map((box) => [box.id, [Math.round(box.x), Math.round(box.y)]]));

  // The output document. Geometry is replaced; everything else is the input,
  // carried through by reference-free copy so nothing is shared or mutated.
  const repaired = {
    ...document,
    components: document.components.map((component) => {
      const position = solved.get(component.id);
      if (!position) return { ...component };
      return { ...component, pos: position };
    }),
  };

  const moves = [];
  for (const component of repaired.components) {
    const before = original.get(component.id);
    const after = component.pos;
    if (!before || !after) continue;
    if (before[0] === after[0] && before[1] === after[1]) continue;
    moves.push({
      id: component.id,
      from: before,
      to: [...after],
      distance: Math.round(Math.hypot(after[0] - before[0], after[1] - before[1])),
      reason: 'separated from an overlapping component along the shallower axis',
    });
  }

  return {
    document: repaired,
    receipt: {
      moves,
      resolved: [...resolvedPairs].map((key) => {
        const [a, b] = key.split('|');
        return { a, b };
      }),
      unsatisfiable,
      passes,
    },
  };
}
