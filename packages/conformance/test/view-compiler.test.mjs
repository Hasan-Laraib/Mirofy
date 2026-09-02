// Row 1.18. The view compiler.
//
// Contract, verbatim from 31-V1-ARCHITECTURE.md §3:
//
//   input:   system model + view request (type, scope, audience)
//   output:  typed view IR with intent (group/rank/mainPath/adjacency),
//            no coordinates
//   rule:    may select, group, name, and omit. May NOT invent a relationship
//            absent from the model. Omissions are recorded, not silent.
//
// The compiler is where the AI will eventually live, behind a planner seam.
// So every contract assertion here runs against a planner written
// SPECIFICALLY TO VIOLATE IT. A contract proven only against the
// well-behaved default planner is not proven at all -- the default planner
// is the one implementation guaranteed not to be the problem.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A small model with a genuine chain a->b->c, a side node, and one boundary.
function model() {
  const component = (id, label) => ({
    id, kind: 'backend', labels: [label], sources: [], evidenceRefs: [],
    provenance: 'authored', metadata: {}, authoredId: true,
  });
  const relationship = (id, from, to) => ({
    id, kind: 'relationship', from, to, labels: [], sources: [],
    evidenceRefs: [], provenance: 'authored', metadata: {}, authoredId: true,
  });
  return {
    schemaVersion: 1,
    components: [component('a', 'Alpha'), component('b', 'Beta'), component('c', 'Gamma'), component('d', 'Delta')],
    relationships: [relationship('r1', 'a', 'b'), relationship('r2', 'b', 'c'), relationship('r3', 'a', 'd')],
    boundaries: [{
      id: 'eu', kind: 'region', labels: ['eu-west-1'], wraps: ['a', 'b'],
      sources: [], evidenceRefs: [], provenance: 'authored', metadata: {}, authoredId: true,
    }],
    provenanceSummary: { authored: 8 },
  };
}

const request = (over = {}) => ({ type: 'architecture', scope: 'system', audience: 'engineering', budget: 4, ...over });

// Walks the whole IR looking for anything positional. Asserted by traversal
// rather than by checking a known field list, so a coordinate field added
// later cannot slip in unnoticed.
const COORDINATE_FIELDS = new Set(['pos', 'x', 'y', 'size', 'width', 'height', 'route', 'via', 'points', 'd']);
function coordinateFields(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => coordinateFields(item, `${path}[${i}]`, found));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (COORDINATE_FIELDS.has(key)) found.push(`${path}.${key}`);
      coordinateFields(child, `${path}.${key}`, found);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Task 1 — the request and the seam
// ---------------------------------------------------------------------------

test('[1.18] a view request is validated, and an unknown type is refused naming the permitted set', async () => {
  const { assertViewRequest, VIEW_TYPES } = await import('../../compile/src/request.mjs');
  assert.doesNotThrow(() => assertViewRequest(request()));

  assert.throws(() => assertViewRequest(request({ type: 'mindmap' })), (error) => {
    const message = error instanceof Error ? error.message : String(error);
    for (const type of VIEW_TYPES) {
      assert.match(message, new RegExp(type), `the refusal does not name the ${type} view type`);
    }
    return true;
  });

  assert.throws(() => assertViewRequest(request({ budget: 0 })), /budget/);
  // A default exists and is documented, so a caller need not know the number.
  assert.equal(typeof assertViewRequest({ type: 'architecture', scope: 'system' }).budget, 'number');
});

// ---------------------------------------------------------------------------
// Task 2 — the contract, against a hostile planner
// ---------------------------------------------------------------------------

test('[1.18] a planner cannot invent a relationship absent from the model', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const inventing = {
    id: 'inventing',
    plan: () => ({
      select: ['a', 'c'],
      groups: [],
      rank: [],
      mainPath: [],
      // 'a' and 'c' both exist, but NO relationship between them does. This
      // is the exact failure the rule names: a plausible edge the model does
      // not contain.
      edges: [{ id: 'invented', from: 'a', to: 'c' }],
    }),
  };
  assert.throws(
    () => compileView(model(), request(), { planner: inventing }),
    /invented|not in the model/i,
    'an invented relationship reached the IR, or was dropped without complaint',
  );
});

test('[1.18] a planner cannot select a node absent from the model', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const hallucinating = {
    id: 'hallucinating',
    plan: () => ({ select: ['a', 'ghost'], groups: [], rank: [], mainPath: [], edges: [] }),
  };
  assert.throws(
    () => compileView(model(), request(), { planner: hallucinating }),
    /ghost/,
    'a node absent from the model was accepted into the view',
  );
});

test('[1.18] every relationship in the compiled view exists in the model', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const view = compileView(model(), request());
  const modelEdgeIds = new Set(model().relationships.map((r) => r.id));
  for (const edge of view.edges) {
    assert.ok(modelEdgeIds.has(edge.id), `view edge ${edge.id} is not a model relationship`);
  }
});

test('[1.18] the compiled view carries no coordinates at any depth', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const view = compileView(model(), request());
  // Position is the solver's job. Emitting one here would quietly move that
  // boundary, and a later field could do it without anyone noticing -- hence
  // the traversal rather than a fixed field check.
  assert.deepEqual(coordinateFields(view), [],
    'the view IR carries positional fields; layout belongs to the solver');
});

test('[1.18] an edge whose endpoint was not selected is recorded as an omission, never silently dropped', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const partial = {
    id: 'partial',
    // Selects a and b but not d, so r3 (a->d) cannot be drawn.
    plan: () => ({ select: ['a', 'b'], groups: [], rank: [], mainPath: [], edges: ['r1', 'r3'] }),
  };
  const view = compileView(model(), request(), { planner: partial });
  assert.ok(!view.edges.some((edge) => edge.id === 'r3'), 'an edge with an unselected endpoint was drawn');
  const omission = view.omissions.find((entry) => entry.id === 'r3');
  assert.ok(omission, 'the dropped edge is not recorded in omissions');
  assert.match(omission.reason, /d\b|endpoint|not selected/i, 'the omission does not say why');
});

// ---------------------------------------------------------------------------
// Task 3 — the deterministic default planner
// ---------------------------------------------------------------------------

test('[1.18] a budget smaller than the model omits the least-connected nodes, and records them', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const view = compileView(model(), request({ budget: 2 }));
  assert.equal(view.nodes.length, 2, 'the view exceeded its budget');
  // 'a' has degree 2 (r1, r3) and 'b' has degree 2 (r1, r2); 'c' and 'd'
  // have 1 each, so the omitted pair is the least connected.
  const omittedIds = view.omissions.map((entry) => entry.id);
  assert.ok(omittedIds.includes('c') && omittedIds.includes('d'),
    `the budgeted-out nodes were not recorded: ${JSON.stringify(view.omissions)}`);
  for (const entry of view.omissions.filter((e) => e.kind === 'component')) {
    assert.match(entry.reason, /budget/i, 'a budget omission does not name the budget');
  }
});

test('[1.18] a node the budget stranded is omitted, not drawn alone', async () => {
  // A box with no edges says "this connects to nothing". When every
  // counterpart was simply cut to fit the budget, that is a false statement
  // about the system, and a reader cannot tell it from a component that
  // really is isolated.
  //
  // Reported from a real map: `flask` sat alone in a corner because the one
  // module importing it did not make the top twelve.
  //
  // A planner that names the pair explicitly is used here, so the assertion
  // is about the compiler rather than about which nodes the default planner
  // happens to rank -- 'd' is reachable only through 'a'.
  const { compileView } = await import('../../compile/src/compile.mjs');
  const strandsD = { id: 'strands-d', plan: () => ({ select: ['b', 'c', 'd'], edges: null, groups: [], rank: [], mainPath: [] }) };
  const view = compileView(model(), request({ budget: 3 }), { planner: strandsD });

  const drawn = view.nodes.map((node) => node.id);
  assert.ok(!drawn.includes('d'),
    `d has only the edge a->d, and a was not selected: ${JSON.stringify(drawn)}`);
  assert.deepEqual(drawn, ['b', 'c'], 'the connected pair must survive');

  const record = view.omissions.find((entry) => entry.id === 'd' && entry.kind === 'component');
  assert.ok(record, 'a stranded node must be recorded, not silently dropped');
  assert.match(record.reason, /budget left out/,
    'the reason must say the budget stranded it, not merely that it was unselected');
});

test('[1.18] a component isolated in the MODEL is still drawn', async () => {
  // The other half of the rule, and the one that keeps the fix from becoming
  // a filter that hides real answers. A component with no relationships at
  // all is isolated in the model too; that is true, and worth seeing.
  const { compileView } = await import('../../compile/src/compile.mjs');
  const lonely = model();
  lonely.components.push({
    id: 'z', kind: 'backend', labels: ['Zeta'], sources: [], evidenceRefs: [],
    provenance: 'authored', metadata: {}, authoredId: true,
  });
  const picksZ = { id: 'picks-z', plan: () => ({ select: ['a', 'b', 'z'], edges: null, groups: [], rank: [], mainPath: [] }) };
  const view = compileView(lonely, request({ budget: 3 }), { planner: picksZ });
  assert.ok(view.nodes.map((node) => node.id).includes('z'),
    'a genuinely unconnected component must not be filtered away with the stranded ones');
});

test('[1.18] mainPath is a real path in the model, not a plausible sequence', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const view = compileView(model(), request());
  assert.ok(view.intent.mainPath.length >= 2, 'no mainPath was produced for a model with a chain');

  const adjacency = new Set(model().relationships.map((r) => `${r.from}->${r.to}`));
  for (let i = 0; i < view.intent.mainPath.length - 1; i += 1) {
    const pair = `${view.intent.mainPath[i]}->${view.intent.mainPath[i + 1]}`;
    assert.ok(adjacency.has(pair), `mainPath contains ${pair}, which is not a relationship in the model`);
  }
});

test('[1.18] grouping follows model boundaries, and the view carries all four intents', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  const view = compileView(model(), request());
  for (const key of ['group', 'rank', 'mainPath', 'adjacency']) {
    assert.ok(key in view.intent, `the view IR is missing the ${key} intent`);
  }
  const eu = view.intent.group.find((group) => group.label === 'eu-west-1');
  assert.ok(eu, 'the model boundary did not become a group');
  assert.deepEqual([...eu.members].sort(), ['a', 'b']);
});

test('[1.18] the same model and request compile to the same view twice', async () => {
  const { compileView } = await import('../../compile/src/compile.mjs');
  assert.deepEqual(compileView(model(), request()), compileView(model(), request()));
});
