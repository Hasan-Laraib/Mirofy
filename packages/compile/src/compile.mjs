// The view compiler. Contract, verbatim from 31-V1-ARCHITECTURE.md §3:
//
//   input:   system model + view request (type, scope, audience)
//   output:  typed view IR with intent (group/rank/mainPath/adjacency),
//            no coordinates
//   rule:    may select, group, name, and omit. May NOT invent a relationship
//            absent from the model. Omissions are recorded, not silent.
//
// This is where the AI will live, behind the planner seam. Which is exactly
// why the compiler VALIDATES the planner rather than trusting it: a planner
// is the one component in this system that will eventually be probabilistic,
// and the contract has to hold when it is wrong, not only when it is right.
//
// Two design choices follow from that:
//
//   1. An invented relationship THROWS. It would be easy to filter it out
//      quietly, and that would be worse -- a planner emitting relationships
//      the model does not contain is broken, and a compiler that silently
//      cleans up after it hides the breakage forever.
//
//   2. An omission the planner did not ask for is still recorded. Dropping an
//      edge because its endpoint was not selected is a legitimate,
//      compiler-side decision, and "omissions are recorded, not silent"
//      does not distinguish whose decision it was.
//
// No coordinates are emitted anywhere. Layout is the solver's job (P2), and
// a position here would quietly move that boundary.

import { assertViewRequest, assertPlan } from './request.mjs';
import { deterministicPlanner } from './planners/deterministic.mjs';

/**
 * @param {object} model  a system model from @mirofy/model
 * @param {object} request
 * @param {{planner?: {id: string, plan: Function}}} [options]
 * @returns {object} the view IR
 */
export function compileView(model, request, { planner = deterministicPlanner } = {}) {
  const viewRequest = assertViewRequest(request);
  if (!model || !Array.isArray(model.components) || !Array.isArray(model.relationships)) {
    throw new TypeError('compileView: model must carry components[] and relationships[]');
  }

  const componentsById = new Map(model.components.map((component) => [component.id, component]));
  const relationshipsById = new Map(model.relationships.map((relationship) => [relationship.id, relationship]));
  const boundaries = Array.isArray(model.boundaries) ? model.boundaries : [];

  const plan = assertPlan(planner.plan(model, viewRequest), planner.id ?? 'anonymous');
  const omissions = [];

  // --- Selection: every selected id must exist. ---------------------------
  let selected = [];
  for (const id of plan.select) {
    if (!componentsById.has(id)) {
      throw new RangeError(
        `compileView: planner ${JSON.stringify(planner.id ?? 'anonymous')} selected `
        + `${JSON.stringify(id)}, which is not in the model`,
      );
    }
    if (!selected.includes(id)) selected.push(id);
  }
  if (selected.length > viewRequest.budget) {
    throw new RangeError(
      `compileView: planner selected ${selected.length} nodes against a budget of ${viewRequest.budget}`,
    );
  }
  const selectedSet = new Set(selected);

  for (const component of model.components) {
    if (selectedSet.has(component.id)) continue;
    omissions.push({
      id: component.id,
      kind: 'component',
      reason: `not selected: the view budget is ${viewRequest.budget} node(s)`,
    });
  }

  // --- Edges: the rule the whole contract turns on. -----------------------
  // A planner may name edges explicitly, or leave it to the compiler to
  // include every model relationship between selected nodes.
  const proposed = plan.edges === null
    ? model.relationships.filter((r) => selectedSet.has(r.from) && selectedSet.has(r.to)).map((r) => r.id)
    : plan.edges;

  const edges = [];
  for (const candidate of proposed) {
    // A planner may pass an id or an object; either way it must correspond
    // to a relationship the model actually contains.
    const id = typeof candidate === 'string' ? candidate : candidate?.id;
    const relationship = relationshipsById.get(id);
    if (!relationship) {
      const described = typeof candidate === 'string'
        ? JSON.stringify(candidate)
        : `${JSON.stringify(candidate?.from)} -> ${JSON.stringify(candidate?.to)}`;
      throw new RangeError(
        `compileView: planner ${JSON.stringify(planner.id ?? 'anonymous')} proposed relationship `
        + `${described}, which is not in the model. A view may omit, name and group, but it may not invent.`,
      );
    }
    if (!selectedSet.has(relationship.from) || !selectedSet.has(relationship.to)) {
      const missing = !selectedSet.has(relationship.from) ? relationship.from : relationship.to;
      omissions.push({
        id: relationship.id,
        kind: 'relationship',
        reason: `endpoint ${JSON.stringify(missing)} is not selected in this view`,
      });
      continue;
    }
    if (!edges.some((edge) => edge.id === relationship.id)) {
      edges.push({
        id: relationship.id,
        from: relationship.from,
        to: relationship.to,
        label: relationship.labels?.[0] ?? null,
        provenance: relationship.provenance,
        evidenceRefs: relationship.evidenceRefs ?? [],
      });
    }
  }

  // Relationships the planner never proposed at all are omissions too.
  for (const relationship of model.relationships) {
    if (edges.some((edge) => edge.id === relationship.id)) continue;
    if (omissions.some((entry) => entry.id === relationship.id)) continue;
    omissions.push({
      id: relationship.id,
      kind: 'relationship',
      reason: 'not included in this view',
    });
  }

  // --- Nodes the budget stranded. ----------------------------------------
  // A box with no edges says "this connects to nothing". When the model says
  // otherwise -- every counterpart was simply cut to fit the budget -- that is
  // a false statement about the system, and a reader has no way to tell it
  // from a genuinely isolated component.
  //
  // Seen on a real map: `flask` was drawn alone in a corner because the one
  // thing importing it did not make the top twelve.
  //
  // A component with no relationships AT ALL stays. That box is isolated in
  // the model too, and saying so is true and worth seeing.
  const connected = new Set();
  for (const edge of edges) { connected.add(edge.from); connected.add(edge.to); }
  const stranded = selected.filter((id) => !connected.has(id)
    && model.relationships.some((r) => r.from === id || r.to === id));
  for (const id of stranded) {
    selectedSet.delete(id);
    omissions.push({
      id,
      kind: 'component',
      reason: 'every relationship it has leads to a component the view budget '
        + 'left out, so drawing it would show an isolated box that the model '
        + 'contradicts',
    });
  }
  if (stranded.length) selected = selected.filter((id) => selectedSet.has(id));

  // --- Intent. No coordinates: this describes relationships, not places. --
  const groups = [];
  for (const boundary of boundaries) {
    const members = (boundary.wraps ?? []).filter((id) => selectedSet.has(id));
    if (!members.length) continue;
    groups.push({ id: boundary.id, label: boundary.labels?.[0] ?? boundary.id, members });
  }
  for (const group of plan.groups) {
    const members = (group.members ?? []).filter((id) => selectedSet.has(id));
    if (!members.length) continue;
    if (groups.some((existing) => existing.label === group.label)) continue;
    groups.push({ id: group.id ?? `group-${groups.length}`, label: group.label, members });
  }

  const mainPath = plan.mainPath.filter((id) => selectedSet.has(id));
  const adjacency = selected.map((id) => ({
    id,
    out: edges.filter((edge) => edge.from === id).map((edge) => edge.to),
    in: edges.filter((edge) => edge.to === id).map((edge) => edge.from),
  }));

  return {
    schemaVersion: 1,
    type: viewRequest.type,
    scope: viewRequest.scope,
    audience: viewRequest.audience,
    budget: viewRequest.budget,
    planner: planner.id ?? 'anonymous',
    nodes: selected.map((id) => {
      const component = componentsById.get(id);
      return {
        id,
        label: component.labels?.[0] ?? id,
        kind: component.kind,
        provenance: component.provenance,
        evidenceRefs: component.evidenceRefs ?? [],
      };
    }),
    edges,
    intent: {
      group: groups,
      rank: plan.rank.map((tier) => tier.filter((id) => selectedSet.has(id))).filter((tier) => tier.length),
      mainPath,
      adjacency,
    },
    omissions,
  };
}
