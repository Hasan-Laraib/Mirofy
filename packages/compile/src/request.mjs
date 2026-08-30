// The view request: what to compile a view OF, and how large it may be.
//
// `budget` is the reason this type exists. A view that grows with the model
// stops being a view — the whole point of "one inventory, diagrams become
// views of it" is that scale is answered with MORE views, each bounded,
// rather than one denser canvas. So the budget is part of the request rather
// than a rendering afterthought, and exceeding it is impossible by
// construction: the compiler omits, and records what it omitted.

/** The diagram types a view can be compiled into — the five the renderers know. */
export const VIEW_TYPES = Object.freeze(['architecture', 'dataflow', 'lifecycle', 'sequence', 'workflow']);

/**
 * The default node budget.
 *
 * Twelve, because that is the ceiling the source project hit and the number
 * `32-PARITY-AND-FEATURE-MATRIX.md` row 1.14 names when it says the model
 * "kills the 12-node ceiling". It kills it by making twelve a *per-view*
 * bound that the compiler enforces honestly, not a limit the whole system
 * runs into.
 */
export const DEFAULT_BUDGET = 12;

/**
 * Validate a view request and return it with defaults filled in.
 *
 * @param {{type: string, scope?: string, audience?: string, budget?: number}} request
 * @returns {{type: string, scope: string, audience: string, budget: number}}
 */
export function assertViewRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new TypeError('view request: must be an object with at least a type');
  }
  if (!VIEW_TYPES.includes(request.type)) {
    throw new TypeError(
      `view request: type ${JSON.stringify(request.type)} is not one of ${VIEW_TYPES.join(', ')}`,
    );
  }
  const budget = request.budget === undefined ? DEFAULT_BUDGET : request.budget;
  if (!Number.isInteger(budget) || budget < 1) {
    throw new TypeError(`view request: budget must be an integer of at least 1 (got ${JSON.stringify(request.budget)})`);
  }
  return {
    type: request.type,
    scope: typeof request.scope === 'string' && request.scope ? request.scope : 'system',
    audience: typeof request.audience === 'string' && request.audience ? request.audience : 'engineering',
    budget,
  };
}

/**
 * Validate the shape a planner returned, at the seam, before any of it is
 * trusted. A planner is the place an LLM will eventually sit; catching a
 * malformed plan here means the failure names the planner rather than
 * surfacing as a confusing error somewhere downstream.
 *
 * @param {object} plan
 * @param {string} plannerId
 */
export function assertPlan(plan, plannerId) {
  const where = `planner ${JSON.stringify(plannerId)}`;
  if (!plan || typeof plan !== 'object') throw new TypeError(`${where}: plan must be an object`);
  if (!Array.isArray(plan.select)) throw new TypeError(`${where}: plan.select must be an array of model ids`);
  for (const key of ['groups', 'rank', 'mainPath']) {
    if (plan[key] !== undefined && !Array.isArray(plan[key])) {
      throw new TypeError(`${where}: plan.${key} must be an array when present`);
    }
  }
  // `edges` has three meanings, and null is one of them: an array names the
  // relationships to draw, while null (or absent) means "every model
  // relationship between the nodes I selected". A planner that chose the
  // nodes is not thereby in the business of hiding edges between them, so
  // the common case should not require restating them.
  if (plan.edges !== undefined && plan.edges !== null && !Array.isArray(plan.edges)) {
    throw new TypeError(`${where}: plan.edges must be an array, or null to include every relationship between selected nodes`);
  }
  return {
    select: plan.select,
    groups: plan.groups ?? [],
    rank: plan.rank ?? [],
    mainPath: plan.mainPath ?? [],
    edges: plan.edges === undefined ? null : plan.edges,
  };
}
