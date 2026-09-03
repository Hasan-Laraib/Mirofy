// The default planner: deterministic, dependency-free, no network.
//
// This is the seam's reference implementation. When an LLM planner arrives it
// implements the same `plan(model, request)` contract and is policed by the
// same compiler — which is the point of shipping the seam before the model
// that fills it. The contract is testable today, against a planner that
// cannot be blamed for being probabilistic.
//
// The selection rule is INTERNAL degree: a view of N nodes should be the N
// nodes of THIS SYSTEM that it talks to most, counting only relationships
// whose both ends are the repository's own code. A bounded view's job is to
// show the shape of the thing, and the shape lives in the connections
// between its parts.
//
// Plain degree measured the wrong thing twice over. On a real repository the
// top-ranked node was `fastapi` with degree 43 -- a dependency, imported by
// dozens of benchmark fixtures, and not part of the architecture at all.
// Below it every one of those fixtures tied on degree 2, so which of them
// took the last slots was decided ALPHABETICALLY. Two separate people
// reported the same symptom: a single test fixture sitting in the default
// view where a real module should be.
//
// Internal degree separates them cleanly, and without guessing which
// directories look like tests. A fixture importing only third-party packages
// carries no information about how this system fits together, and its
// internal degree is zero for that reason rather than because of its path.
// On the repository above it drops every fixture to 0 and leaves exactly the
// nine real modules.
//
// Dependencies still earn their place from whatever budget the system leaves:
// they are context for the shape, not the shape. And when a repository has no
// internal edges at all -- one module, or a wrapper around somebody else's
// library -- the plain ranking is still there to fall back on, because an
// empty view of a real repository would be a worse answer.
//
// Ties break on id so the same model and request always compile to the same
// view: a view that changes between runs is unreviewable.

/**
 * Count relationships touching each component.
 *
 * @param {object} model
 * @param {boolean} [internalOnly] count only edges whose BOTH ends are code
 *   in this repository, which is what makes a dependency stop outranking the
 *   system that uses it.
 */
function degrees(model, internalOnly = false) {
  const kinds = new Map(model.components.map((component) => [component.id, component.kind]));
  const inside = (id) => kinds.has(id) && kinds.get(id) !== 'external';
  const degree = new Map(model.components.map((component) => [component.id, 0]));
  for (const relationship of model.relationships) {
    if (internalOnly && !(inside(relationship.from) && inside(relationship.to))) continue;
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
    const internalDegree = degrees(model, true);
    const degree = degrees(model);
    const byRank = (rankOf) => (a, b) => (rankOf.get(b.id) - rankOf.get(a.id))
      || a.id.localeCompare(b.id);

    // The system, ranked by how much of it connects to the rest of it.
    const ranked = [...model.components]
      .filter((component) => internalDegree.get(component.id) > 0)
      .sort(byRank(internalDegree))
      .map((component) => component.id);

    /** Dependencies of `ids` -- what those components rest on. */
    const dependenciesOf = (ids) => {
      const near = new Set();
      for (const relationship of model.relationships) {
        if (ids.has(relationship.from)) near.add(relationship.to);
        if (ids.has(relationship.to)) near.add(relationship.from);
      }
      return [...model.components]
        .filter((component) => component.kind === 'external')
        .filter((component) => near.has(component.id) && !ids.has(component.id))
        .sort(byRank(degree))
        .map((component) => component.id);
    };

    // Room is kept for what the system rests on, up to a third of the budget.
    //
    // Ranking the system first is right, and on its own it went too far: given
    // twelve slots fastapi's own modules filled all of them and the diagram no
    // longer showed that FastAPI is built on Starlette, which is one of the
    // more useful things about FastAPI. A repository whose packages mostly
    // import npm rather than each other went the other way -- two modules and
    // ten dependencies.
    //
    // Reserved against what is actually THERE, never a fixed slice: a system
    // with three dependencies gives up three slots, not four, and one with
    // none gives up nothing.
    const wanted = dependenciesOf(new Set(ranked.slice(0, request.budget)));
    const reserve = Math.min(wanted.length, Math.floor(request.budget / 3));

    const selected = ranked.slice(0, Math.max(0, request.budget - reserve));
    const taken = new Set(selected);

    // Then the dependencies the drawn system actually uses.
    //
    // Adjacency to something already selected is the test, not degree. On the
    // repository that prompted this, `fastapi` has degree 43 and every one of
    // those edges comes from a benchmark fixture -- nothing in the system
    // imports it. Adding it on degree alone would put a box on the canvas the
    // drawn system has no relationship with, which the compiler would then
    // have to strand back out again.
    // Capped at the reserve, not run to the budget. A repository whose
    // packages mostly import npm rather than each other has a small system and
    // a large dependency list, and letting the second fill the canvas produces
    // a diagram of somebody else's code: two modules and ten dependencies on
    // one real repository. Cap not quota applies to context as well.
    let placed = 0;
    for (const id of dependenciesOf(taken)) {
      if (selected.length >= request.budget || placed >= reserve) break;
      placed += 1;
      selected.push(id);
      taken.add(id);
    }

    // Anything the reserve did not need goes back to the system.
    for (const id of ranked) {
      if (selected.length >= request.budget) break;
      if (taken.has(id)) continue;
      selected.push(id);
      taken.add(id);
    }
    // THE BUDGET IS A CAP, NOT A QUOTA. Nine good boxes out of twelve is a
    // better answer than nine plus three arbitrary ones, and filling the
    // remainder with whatever ranked next is precisely the complaint that
    // started this: a single test fixture sitting where a module should be,
    // chosen alphabetically out of a tie.
    //
    // The exception is a repository this ranking cannot see at all -- one
    // module, or a set of files with no dependencies between them. There the
    // first two passes select nothing, and an empty diagram would be a worse
    // answer than a plain one, so plain degree decides.
    if (!selected.length) {
      for (const component of [...model.components].sort(byRank(degree))) {
        if (selected.length >= request.budget) break;
        selected.push(component.id);
        taken.add(component.id);
      }
    }

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
