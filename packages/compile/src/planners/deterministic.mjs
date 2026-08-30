// The default planner: deterministic, dependency-free, no network.
//
// This is the seam's reference implementation. When an LLM planner arrives it
// implements the same `plan(model, request)` contract and is policed by the
// same compiler — which is the point of shipping the seam before the model
// that fills it. The contract is testable today, against a planner that
// cannot be blamed for being probabilistic.
//
// The selection rule is degree: a view of N nodes should be the N nodes the
// system talks to most, because a bounded view's job is to show the shape of
// the thing, and the shape lives in the connections. Ties break on id so the
// same model and request always compile to the same view — a view that
// changes between runs is unreviewable.

/** Count relationships touching each component. */
function degrees(model) {
  const degree = new Map(model.components.map((component) => [component.id, 0]));
  for (const relationship of model.relationships) {
    if (degree.has(relationship.from)) degree.set(relationship.from, degree.get(relationship.from) + 1);
    if (degree.has(relationship.to)) degree.set(relationship.to, degree.get(relationship.to) + 1);
  }
  return degree;
}

/**
 * The longest simple chain among the selected nodes.
 *
 * Depth-first over the selected subgraph, which is exhaustive rather than
 * heuristic — the view is budget-bounded, so the search space is small by
 * construction, and an exhaustive answer means `mainPath` is a real path
 * rather than a plausible-looking one. The compiler's tests verify every
 * consecutive pair against the model regardless; this just makes it true.
 */
function longestChain(selected, relationships) {
  const selectedSet = new Set(selected);
  const out = new Map(selected.map((id) => [id, []]));
  for (const relationship of relationships) {
    if (!selectedSet.has(relationship.from) || !selectedSet.has(relationship.to)) continue;
    if (relationship.from === relationship.to) continue;
    out.get(relationship.from).push(relationship.to);
  }
  for (const list of out.values()) list.sort();

  let best = [];
  const walk = (node, seen, path) => {
    if (path.length > best.length) best = [...path];
    for (const next of out.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      path.push(next);
      walk(next, seen, path);
      path.pop();
      seen.delete(next);
    }
  };
  for (const start of [...selected].sort()) walk(start, new Set([start]), [start]);
  return best.length >= 2 ? best : [];
}

export const deterministicPlanner = {
  id: 'deterministic',

  /**
   * @param {object} model
   * @param {{budget: number}} request
   */
  plan(model, request) {
    const degree = degrees(model);
    const selected = [...model.components]
      .sort((a, b) => (degree.get(b.id) - degree.get(a.id)) || a.id.localeCompare(b.id))
      .slice(0, request.budget)
      .map((component) => component.id);

    const selectedSet = new Set(selected);

    // Groups mirror the model's boundaries; the compiler adds them too, but
    // a planner that proposes them keeps the seam honest about what a
    // planner is allowed to decide.
    const groups = (model.boundaries ?? [])
      .map((boundary) => ({
        id: boundary.id,
        label: boundary.labels?.[0] ?? boundary.id,
        members: (boundary.wraps ?? []).filter((id) => selectedSet.has(id)),
      }))
      .filter((group) => group.members.length > 0);

    // Rank by depth from the sources of the selected subgraph: things that
    // nothing points at come first. This is intent, not layout -- the solver
    // decides what "first" looks like on a canvas.
    const incoming = new Map(selected.map((id) => [id, 0]));
    for (const relationship of model.relationships) {
      if (!selectedSet.has(relationship.from) || !selectedSet.has(relationship.to)) continue;
      if (relationship.from === relationship.to) continue;
      incoming.set(relationship.to, incoming.get(relationship.to) + 1);
    }
    const tiers = new Map();
    for (const id of [...selected].sort()) {
      const tier = incoming.get(id) === 0 ? 0 : 1;
      if (!tiers.has(tier)) tiers.set(tier, []);
      tiers.get(tier).push(id);
    }

    return {
      select: selected,
      groups,
      rank: [...tiers.keys()].sort().map((tier) => tiers.get(tier)),
      mainPath: longestChain(selected, model.relationships),
      // Null means "include every model relationship between selected
      // nodes". The planner is not in the business of hiding edges between
      // things it chose to show.
      edges: null,
    };
  },
};
