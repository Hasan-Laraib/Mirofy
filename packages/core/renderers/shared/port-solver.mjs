// Straight-route port placement (row 3.16).
//
// When several relationships leave the same side of a component, they need
// distinct ports or they collapse into one line. Spreading them evenly about
// the side's centre achieves that -- and introduces a dogleg on every edge
// whose counterpart is not at the centre, including edges that could have run
// dead straight.
//
// So placement is asked a sharper question. Each endpoint has an IDEAL
// coordinate: the one that would make its edge straight, which is where its
// counterpart sits. Ports are then placed as close to their ideals as the
// side allows, subject to three hard constraints:
//
//   * they stay inside the side's usable band            (lo <= p <= hi)
//   * they keep a minimum separation                     (p[i+1] - p[i] >= gap)
//   * they keep their given order                        (implied by the gap)
//
// The order matters as much as the placement. Callers sort endpoints by
// counterpart coordinate before solving, which is what stops the edges
// crossing each other on the way out; the gap constraint then preserves that
// order through the solve. Sorting fixes WHICH slot each edge gets, and this
// module fixes WHERE the slots are.
//
// The result is the exact least-squares projection of the ideals onto that
// constraint set -- the minimum total displacement that satisfies all three.
// Not a heuristic, not an iteration with a budget: a closed-form solve, so
// the same diagram always produces the same ports.
//
// Even spreading is not replaced by this; it is contained in it. When every
// counterpart sits at the same coordinate, every ideal is equal, no port can
// improve on any other, and the solution is an even spread centred on that
// shared coordinate. The old behaviour is this one's degenerate case.

/**
 * Pool Adjacent Violators: the least-squares non-decreasing fit to `values`.
 *
 * Runs in O(n). Each block holds a pooled mean and the count it was pooled
 * from, so merging two blocks is a weighted average rather than a re-scan.
 *
 * @param {number[]} values
 * @returns {number[]} a non-decreasing sequence, closest to `values` in L2
 */
function isotonic(values) {
  /** @type {Array<{sum: number, count: number}>} */
  const blocks = [];
  for (const value of values) {
    let block = { sum: value, count: 1 };
    // Absorb every preceding block whose mean now exceeds this one, since a
    // non-decreasing fit cannot keep them apart.
    while (blocks.length > 0) {
      const previous = blocks[blocks.length - 1];
      if (previous.sum / previous.count <= block.sum / block.count) break;
      blocks.pop();
      block = { sum: previous.sum + block.sum, count: previous.count + block.count };
    }
    blocks.push(block);
  }
  const fitted = [];
  for (const block of blocks) {
    const mean = block.sum / block.count;
    for (let i = 0; i < block.count; i += 1) fitted.push(mean);
  }
  return fitted;
}

/**
 * Place ports along one side.
 *
 * @param {number[]} ideals coordinate that would make each edge straight,
 *   in the order the ports must appear (non-decreasing in practice, because
 *   callers sort by counterpart position to avoid crossings)
 * @param {{lo: number, hi: number, gap: number}} band the usable extent of
 *   the side and the minimum separation between adjacent ports
 * @returns {number[]} one coordinate per ideal, in the same order
 */
export function solvePortPositions(ideals, { lo, hi, gap }) {
  const count = ideals.length;
  if (count === 0) return [];
  if (count === 1) return [Math.min(Math.max(ideals[0], lo), hi)];

  const span = (count - 1) * gap;
  // The band must hold every port at full separation. Callers derive `gap`
  // from the band for exactly this reason, so a violation here is a caller
  // bug rather than a layout the solver should paper over -- but papering
  // over it silently is worse than compressing, so compress and stay inside.
  const spacing = span > hi - lo ? (hi - lo) / (count - 1) : gap;

  // Subtracting each port's minimum offset turns "separated by at least
  // `spacing`" into plain "non-decreasing", which is what PAVA solves. And
  // because a non-decreasing sequence has its minimum first and its maximum
  // last, the two endpoint bounds become one uniform bound on every element
  // -- so clipping the isotonic fit is exact, not an approximation.
  const ceiling = hi - (count - 1) * spacing;
  const shifted = ideals.map((ideal, index) => ideal - index * spacing);
  const fitted = isotonic(shifted);

  return fitted.map((value, index) => (
    Math.min(Math.max(value, lo), ceiling) + index * spacing
  ));
}
