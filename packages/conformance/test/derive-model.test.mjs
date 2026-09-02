// Rows 1.19 and 1.20. Deriving a model from the scan, and laying it out.
//
// The README's headline claim was that pointing this at a repository builds a
// model of the system. It did not. Components came only from AUTHORED
// documents; the evidence graph was used solely to attach citations to names
// that already matched, so this repository's 987 scanned facts joined to
// nothing and `timeline` reported 62 of 62 components as uncited.
//
// Row 1.19 closes that: components and relationships come out of the facts.
// Row 1.20 closes the other end, where `compile` produced a view IR the
// renderer refused -- the pipeline stopped one step short of a diagram, and
// the README documented a command that could not work.
//
// The rule running through both: nothing is invented. A component is a package
// a manifest was found for. A relationship is an import that was read, and it
// carries the file and line that produced it. Where a decision has to be made
// that the evidence cannot settle -- a package's "type", what to do with 734
// imports of node:fs -- the answer is recorded rather than guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFromGraph, packageIndex, moduleIndex, ownerOf, classifyTarget } from '../../model/src/derive.mjs';
import { viewToDocument, schemaTypeFor, safeId, layeredPositions, sameColumnDetours, skipLevelDetours } from '../../layout/src/document.mjs';

/** Two packages, one importing the other, plus a builtin and an external. */
function graph() {
  return {
    schemaVersion: 1,
    facts: [
      {
        subject: '@acme/root', predicate: 'contains-package', object: '@acme/api',
        provenance: 'config-derived', location: { path: 'packages/api/package.json' },
      },
      {
        subject: '@acme/root', predicate: 'contains-package', object: '@acme/core',
        provenance: 'config-derived', location: { path: 'packages/core/package.json' },
      },
      {
        subject: 'packages/api/src/index.mjs', predicate: 'depends-on', object: 'packages/core/src/core.mjs',
        provenance: 'statically-derived', location: { path: 'packages/api/src/index.mjs', lines: [3, 3] },
      },
      {
        subject: 'packages/api/src/other.mjs', predicate: 'depends-on', object: 'packages/core/src/core.mjs',
        provenance: 'statically-derived', location: { path: 'packages/api/src/other.mjs', lines: [7, 7] },
      },
      {
        subject: 'packages/api/src/index.mjs', predicate: 'depends-on', object: 'package:node:fs',
        provenance: 'statically-derived', location: { path: 'packages/api/src/index.mjs', lines: [1, 1] },
      },
      {
        subject: 'packages/api/src/index.mjs', predicate: 'depends-on', object: 'packages/api/src/util.mjs',
        provenance: 'statically-derived', location: { path: 'packages/api/src/index.mjs', lines: [4, 4] },
      },
      {
        subject: 'packages/core/src/core.mjs', predicate: 'depends-on', object: 'package:webcola',
        provenance: 'statically-derived', location: { path: 'packages/core/src/core.mjs', lines: [2, 2] },
      },
    ],
    gaps: [],
  };
}

/** A repository that declares no workspaces at all: no manifest facts, just
 *  imports between files in two source directories. This is the shape of most
 *  repositories, and the shape that used to model to nothing. */
function flatGraph() {
  return {
    schemaVersion: 1,
    facts: [
      {
        subject: 'src/api/server.mjs', predicate: 'depends-on', object: 'src/db/pool.mjs',
        provenance: 'statically-derived', location: { path: 'src/api/server.mjs', lines: [2, 2] },
      },
      {
        subject: 'src/api/server.mjs', predicate: 'depends-on', object: 'src/api/cache.mjs',
        provenance: 'statically-derived', location: { path: 'src/api/server.mjs', lines: [3, 3] },
      },
      {
        subject: 'src/db/pool.mjs', predicate: 'depends-on', object: 'package:node:process',
        provenance: 'statically-derived', location: { path: 'src/db/pool.mjs', lines: [1, 1] },
      },
    ],
    gaps: [],
  };
}

test('[1.19] a repository with no workspaces models its source directories, not nothing', () => {
  const { components, relationships, notModelled } = deriveFromGraph(flatGraph());
  const ids = components.filter((c) => c.kind === 'module').map((c) => c.id).sort();
  assert.deepEqual(ids, ['src/api', 'src/db'],
    'a repo that declares no packages derived no components at all, which is most repositories');
  const edge = relationships.find((r) => r.from === 'src/api' && r.to === 'src/db');
  assert.ok(edge, 'the import from src/api into src/db is an edge between two modules');
  assert.equal(edge.evidenceRefs[0].path, 'src/api/server.mjs',
    'the edge cites the file it was read from');
  // The import inside src/api is the inside of one module, not an edge.
  assert.ok(!relationships.some((r) => r.from === 'src/api' && r.to === 'src/api'));
  assert.ok(!notModelled.some((n) => /outside any package/.test(n.reason ?? '')),
    'every edge found an owner, so nothing should be reported as unattributable');
});

test('[1.19] a module that imports nothing is still a component, not a dropped edge', () => {
  // A leaf: imported by others, importing nothing itself. Constants, types, a
  // pure helper. Taking module directories only from the IMPORTING side made it
  // invisible, and the edge pointing at it was then discarded as unattributable
  // -- a silent omission dressed up as a clean model.
  const { components, relationships, notModelled } = deriveFromGraph({
    schemaVersion: 1,
    facts: [{
      subject: 'src/api/routes.mjs', predicate: 'depends-on', object: 'src/store/repo.mjs',
      provenance: 'statically-derived', location: { path: 'src/api/routes.mjs', lines: [1, 1] },
    }],
    gaps: [],
  });
  const ids = components.map((c) => c.id).sort();
  assert.deepEqual(ids, ['src/api', 'src/store'],
    'the imported-but-never-importing module must still be a component');
  assert.equal(relationships.length, 1, 'and the edge into it must survive');
  assert.ok(!notModelled.some((n) => /outside any package/.test(n.reason ?? '')));
});

test('[1.19] a module is statically-derived, never labelled config-derived like a package', () => {
  const { components } = deriveFromGraph(flatGraph());
  const api = components.find((c) => c.id === 'src/api');
  assert.equal(api.kind, 'module');
  assert.equal(api.provenance, 'statically-derived',
    'a directory read off import statements is not configuration and must not claim to be');
  assert.equal(api.labels[0], 'api', 'the label is the directory name, not the whole path');
});

test('[1.19] a real workspace keeps package granularity and never falls back to directories', () => {
  const { components } = deriveFromGraph(graph());
  assert.ok(components.some((c) => c.id === '@acme/api' && c.kind === 'package'));
  assert.ok(!components.some((c) => c.kind === 'module'),
    'two or more declared packages must keep package granularity -- this is what protects '
    + 'the model of this repository, and every golden digest, from the fallback');
  assert.equal(moduleIndex(graph().facts).length > 0, true,
    'moduleIndex still computes; it is simply not the one used here');
});

test('[1.19] components come out of the scan, each citing its manifest', () => {
  const derived = deriveFromGraph(graph());
  const packages = derived.components.filter((c) => c.kind === 'package');
  assert.deepEqual(packages.map((c) => c.id).sort(), ['@acme/api', '@acme/core']);
  for (const component of packages) {
    assert.equal(component.provenance, 'config-derived');
    assert.equal(component.authoredId, false, 'a derived id claims to be authored');
    assert.ok(component.sources[0].path.endsWith('package.json'),
      'a derived component cannot be checked against anything');
  }
});

test('[1.19] a package kind is `package`, not a guess at what it does', () => {
  // The scanner knows a manifest exists. It does not know whether something is
  // a backend or a database, and labelling it would dress a guess as a fact.
  for (const component of deriveFromGraph(graph()).components) {
    assert.ok(['package', 'external'].includes(component.kind),
      `a derived component claims to be a ${component.kind}`);
  }
});

test('[1.19] relationships are real imports, aggregated, citing every line', () => {
  const derived = deriveFromGraph(graph());
  const edge = derived.relationships.find((r) => r.from === '@acme/api' && r.to === '@acme/core');
  assert.ok(edge, 'the import between two packages produced no relationship');
  assert.equal(edge.provenance, 'statically-derived');
  // Two files import core; one edge, two citations. Emitting two edges would
  // draw the same dependency twice.
  assert.equal(edge.metadata.importCount, 2);
  assert.equal(edge.evidenceRefs.length, 2);
  assert.deepEqual(edge.evidenceRefs.map((r) => r.lines[0]).sort(), [3, 7]);
});

test('[1.19] an import inside one package is not an edge between two', () => {
  // `api/index.mjs` imports `api/util.mjs`. That is the inside of a component,
  // and drawing it would put a self-loop on every package in the diagram.
  const derived = deriveFromGraph(graph());
  assert.ok(!derived.relationships.some((r) => r.from === r.to), 'a package depends on itself');
  const internal = derived.notModelled.find((n) => /within one package/.test(n.what));
  assert.equal(internal.count, 1, 'the internal import was dropped without being counted');
});

test('[1.19] what is not modelled is reported, with its reason', () => {
  // The judgement this row has to make and cannot avoid: every package imports
  // node:fs, and drawing those edges would bury the architecture. Leaving them
  // out is a decision, so it comes back with a reason rather than vanishing.
  const derived = deriveFromGraph(graph());
  const builtins = derived.notModelled.find((n) => /builtin/.test(n.what));
  assert.ok(builtins, 'node builtins were dropped silently');
  assert.equal(builtins.count, 1);
  assert.match(builtins.reason, /bury the architecture/);
  for (const entry of derived.notModelled) {
    assert.ok(entry.reason && entry.reason.length > 20, `${entry.what} was dropped without a reason`);
  }
});

test('[1.19] an external package becomes a component, a builtin does not', () => {
  const derived = deriveFromGraph(graph());
  const external = derived.components.find((c) => c.id === 'webcola');
  assert.ok(external, 'a real third-party dependency was dropped');
  assert.equal(external.kind, 'external');
  assert.ok(!derived.components.some((c) => /node:/.test(c.id)), 'a Node builtin became a component');
});

test('[1.19] path ownership resolves to the longest matching package', () => {
  // With a shorter prefix checked first, a nested package's files would be
  // attributed to its parent, and every edge from it would point at the wrong
  // component.
  const packages = packageIndex([
    { predicate: 'contains-package', object: '@acme/outer', location: { path: 'packages/package.json' } },
    { predicate: 'contains-package', object: '@acme/inner', location: { path: 'packages/inner/package.json' } },
  ]);
  assert.equal(ownerOf('packages/inner/src/x.mjs', packages).name, '@acme/inner');
  assert.equal(ownerOf('packages/other/x.mjs', packages).name, '@acme/outer');
  assert.equal(ownerOf('elsewhere/x.mjs', packages), null);
});

test('[1.19] dependency targets are classified without guessing', () => {
  assert.equal(classifyTarget('package:node:fs').kind, 'node-builtin');
  assert.equal(classifyTarget('package:webcola').kind, 'external-package');
  assert.equal(classifyTarget('packages/core/src/x.mjs').kind, 'path');
});

// ---------------------------------------------------------------------------
// Row 1.20 — the view IR becomes a document the renderer accepts.
// ---------------------------------------------------------------------------

const view = () => ({
  schemaVersion: 1,
  type: 'architecture',
  nodes: [
    { id: '@acme/api', label: 'api', kind: 'package', evidenceRefs: [{ path: 'packages/api/package.json' }] },
    { id: '@acme/core', label: 'core', kind: 'package', evidenceRefs: [{ path: 'packages/core/package.json' }] },
    { id: 'webcola', label: 'webcola', kind: 'external', evidenceRefs: [] },
  ],
  edges: [
    { from: '@acme/api', to: '@acme/core', label: 'imports' },
    { from: '@acme/core', to: 'webcola', label: 'imports' },
  ],
  omissions: [{ id: 'dropped', reason: 'over budget' }],
});

test('[1.20] a compiled view becomes a document the schema accepts', () => {
  const { document } = viewToDocument(view(), { title: 'Packages', repository: { url: 'https://github.com/a/b', revision: 'a'.repeat(40) } });
  assert.equal(document.schema_version, 1, 'the view IR key was passed straight through');
  assert.equal(document.diagram_type, 'architecture');
  assert.equal(document.meta.title, 'Packages');
  assert.equal(document.components.length, 3);
  assert.equal(document.connections.length, 2);
  for (const component of document.components) {
    assert.ok(Array.isArray(component.pos) && component.pos.length === 2, 'a component has no position');
    assert.ok(Array.isArray(component.size), 'a component has no size');
  }
});

test('[1.20] ids are made schema-safe consistently, and edges follow', () => {
  // The schema requires ^[a-zA-Z][a-zA-Z0-9_-]*$ and a real id is `@acme/api`.
  // Renaming components without renaming the edges would produce a diagram of
  // disconnected boxes -- valid, and wrong.
  const { document, receipt } = viewToDocument(view(), { title: 'x' });
  const ids = new Set(document.components.map((c) => c.id));
  for (const id of ids) assert.match(id, /^[a-zA-Z][a-zA-Z0-9_-]*$/, `${id} is not a legal id`);
  for (const connection of document.connections) {
    assert.ok(ids.has(connection.from), `edge from ${connection.from} points at no component`);
    assert.ok(ids.has(connection.to), `edge to ${connection.to} points at no component`);
  }
  assert.equal(receipt.renamed.length, 2, 'the rename was not reported');
  assert.equal(safeId('@acme/api'), 'acme-api');
  assert.equal(safeId('123-bad'), 'n-123-bad');
});

test('[1.20] a kind the schema does not have becomes external, and says so', () => {
  // `package` is not a schema type. Guessing "backend" from a package name
  // would be exactly the invention refused everywhere else, so it becomes the
  // type that claims least and the original is kept as a tag.
  const { document, receipt } = viewToDocument(view(), { title: 'x' });
  const api = document.components.find((c) => c.label === 'api');
  assert.equal(api.type, 'external');
  assert.equal(api.tag, 'package', 'the original kind was lost');
  assert.ok(receipt.retyped.length >= 2, 'retyping was not reported');
  assert.equal(schemaTypeFor('database'), 'database');
  assert.equal(schemaTypeFor('package'), 'external');
});

test('[1.20] citations are kept only when they can be verified', () => {
  // A citation with no pinned repository cannot be checked. Emitting it would
  // be worse than emitting none, so it is dropped and counted.
  const withRepo = viewToDocument(view(), { title: 'x', repository: { url: 'https://github.com/a/b', revision: 'b'.repeat(40) } });
  assert.ok(withRepo.document.meta.repository, 'the repository was not declared');
  assert.ok(withRepo.document.components.some((c) => c.sources?.length > 0), 'citations were lost');
  assert.equal(withRepo.receipt.citationsDropped, 0);

  const without = viewToDocument(view(), { title: 'x' });
  assert.equal(without.document.meta.repository, undefined);
  assert.ok(!without.document.components.some((c) => c.sources), 'unverifiable citations were emitted');
  assert.ok(without.receipt.citationsDropped > 0, 'dropped citations were not counted');
});

test('[1.20] layers run left to right by longest path, not shortest', () => {
  // With shortest-path depth, a node reachable both directly and through two
  // hops lands in column one, and its long edge runs backwards across the
  // diagram. Longest path puts it after everything it depends on.
  const diamond = {
    type: 'architecture',
    nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id, kind: 'package' })),
    edges: [
      { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'a', to: 'd' },
    ],
  };
  const { positions } = layeredPositions(diamond);
  assert.ok(positions.d[0] > positions.c[0], 'd was placed before the chain that reaches it');
  assert.ok(positions.b[0] > positions.a[0]);
});

test('[1.20] a cycle is drawn rather than refused', () => {
  // Real dependency graphs occasionally contain one. Refusing to draw the
  // whole system because of it would be worse than drawing it.
  const cyclic = {
    type: 'architecture',
    nodes: ['a', 'b'].map((id) => ({ id, label: id, kind: 'package' })),
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  };
  const { positions } = layeredPositions(cyclic);
  assert.ok(positions.a && positions.b, 'a cycle produced no layout at all');
  assert.notDeepEqual(positions.a, positions.b, 'both nodes were placed on top of each other');
});

test('[1.20] a view of the wrong type is refused, not silently converted', () => {
  assert.throws(() => viewToDocument({ type: 'sequence', nodes: [] }), /only architecture views/);
  assert.throws(() => viewToDocument({}), /nodes\[\] is required/);
});

test('[1.20] the compiler’s omissions survive into the receipt', () => {
  // A view that dropped items and says nothing is the failure this project
  // exists to prevent; the count has to reach whoever reads the diagram.
  const { receipt } = viewToDocument(view(), { title: 'x' });
  assert.equal(receipt.omissions, 1);
});

// ---------------------------------------------------------------------------
// Same-column edges, which the layered placement used to run through whatever
// was standing between their endpoints.
//
// Found when this repository's own self-model stopped rendering: the layout
// engine produced a document its own renderer refused, because a tenth package
// joined a layer and an edge from the first to the fourth crossed two nodes.
// ---------------------------------------------------------------------------

test('an edge between adjacent members of a column is left straight', () => {
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [380, 80], b: [380, 180] };
  const detours = sameColumnDetours([{ from: 'a', to: 'b' }], positions, [180, 60], 120);
  assert.equal(detours.size, 0,
    'nothing stands between adjacent members, so a detour would go around nothing');
});

test('an edge that would cross an intervening node is routed around the column', () => {
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [380, 80], b: [380, 180], c: [380, 280], d: [380, 380] };
  const detours = sameColumnDetours([{ from: 'a', to: 'd' }], positions, [180, 60], 120);
  assert.equal(detours.size, 1);
  const route = detours.get(0);
  assert.equal(route.fromSide, 'left');
  assert.equal(route.toSide, 'left');
  // The channel has to sit clear of the column it is dodging, or the detour
  // runs through the very nodes it was supposed to avoid.
  for (const [x] of route.via) assert.ok(x < 380, `channel at ${x} is inside the column`);
  // Both via points share one x, so the middle segment is vertical and the two
  // end segments are horizontal -- perpendicular to the left border, which is
  // what the endpoint-side rule asks of them.
  assert.equal(route.via[0][0], route.via[1][0]);
  assert.equal(route.via[0][1], 110, 'the detour should leave at the source row centre');
  assert.equal(route.via[1][1], 410, 'and arrive at the target row centre');
});

test('edges in different columns are not touched', () => {
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [80, 80], b: [380, 380] };
  const detours = sameColumnDetours([{ from: 'a', to: 'b' }], positions, [180, 60], 120);
  assert.equal(detours.size, 0);
});

test('two detours in one gap take separate channels', () => {
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [380, 80], b: [380, 180], c: [380, 280], d: [380, 380] };
  const detours = sameColumnDetours(
    [{ from: 'a', to: 'd' }, { from: 'b', to: 'd' }], positions, [180, 60], 120,
  );
  assert.equal(detours.size, 2);
  const [first, second] = [detours.get(0), detours.get(1)];
  assert.notEqual(first.via[0][0], second.via[0][0],
    'both detours share a channel, so they merge into one ambiguous corridor');
});

test('a detour with nowhere to go is left straight rather than sent off-canvas', () => {
  // A column hard against the left edge has no gap to route through. Leaving
  // the edge alone lets the gate report it; a channel at x -20 would be a
  // different, undiagnosed problem.
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [8, 80], b: [8, 180], c: [8, 280], d: [8, 380] };
  const detours = sameColumnDetours([{ from: 'a', to: 'd' }], positions, [180, 60], 120);
  assert.equal(detours.size, 0);
});

test('the layered layout emits a document its own renderer accepts', () => {
  // Two nodes share a column when the depth pass cannot settle them, which is
  // what a CYCLE does -- and a package graph is full of cycles. Here `a` and
  // `e` point at each other, so both fall to the same depth as b, c and d, and
  // the a -> e edge has three nodes standing in its way.
  const view = {
    type: 'architecture',
    nodes: ['root', 'a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id, kind: 'package' })),
    edges: [
      { from: 'root', to: 'a' }, { from: 'root', to: 'b' }, { from: 'root', to: 'c' },
      { from: 'root', to: 'd' }, { from: 'root', to: 'e' },
      { from: 'a', to: 'e', label: 'imports' }, { from: 'e', to: 'a' },
    ],
  };
  const { document } = viewToDocument(view, { title: 'Column crossing' });
  const crossing = document.connections.find((connection) => connection.via);
  assert.ok(crossing, 'the edge across the column was left straight');
  const columnX = document.components.find((component) => component.id === 'a').pos[0];
  assert.equal(document.components.find((component) => component.id === 'e').pos[0], columnX,
    'the fixture no longer puts the two endpoints in one column, so it proves nothing');
  for (const [x] of crossing.via) {
    assert.ok(x < columnX, `the detour runs at x ${x}, inside the ${columnX} column`);
  }
});

test('[1.20] an edge that skips a column routes around what sits in it', () => {
  // A imports B, A imports C, B imports C -- the commonest three-module shape
  // there is. Layered, that is three boxes in one row, and the A-to-C edge runs
  // straight through B. Clean Flow rejects it, correctly, so `mirofy map`
  // failed outright on an ordinary small repository.
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [80, 100], b: [380, 100], c: [680, 100] };
  const size = /** @type {[number, number]} */ ([180, 60]);
  const detours = skipLevelDetours([{ from: 'a', to: 'c' }], positions, size);
  const route = detours.get(0);
  assert.ok(route, 'the skip-level edge was left to run through the node between its ends');
  assert.equal(route.fromSide, 'bottom');
  assert.equal(route.toSide, 'bottom');
  // The channel clears the bottom of every box, so it cannot re-enter a row.
  const lowest = 100 + size[1];
  for (const [, y] of route.via) assert.ok(y > lowest, `waypoint at ${y} is not below ${lowest}`);
});

test('[1.20] a skip-level edge over an empty column is left straight', () => {
  // Bending an edge that crosses nothing is decoration, and decoration in a
  // layout engine is a lie about what was in the way.
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [80, 100], c: [680, 100], b: [380, 400] };
  const detours = skipLevelDetours([{ from: 'a', to: 'c' }], positions,
    /** @type {[number, number]} */ ([180, 60]));
  assert.equal(detours.size, 0, 'nothing sits between a and c on their row, so nothing to route around');
});

test('[1.20] adjacent columns are never detoured', () => {
  /** @type {Record<string, [number, number]>} */
  const positions = { a: [80, 100], b: [380, 100] };
  const detours = skipLevelDetours([{ from: 'a', to: 'b' }], positions,
    /** @type {[number, number]} */ ([180, 60]));
  assert.equal(detours.size, 0);
});

test('[1.20] a detour never routes through another node', () => {
  // The routers picked a channel by arithmetic and checked only that it stayed
  // on the canvas, so a detour could dodge its column-mates by running straight
  // through a node sitting in the gap -- trading one Clean Flow violation for a
  // less predictable one. Found by mapping a seven-module Python repository.
  const size = /** @type {[number, number]} */ ([80, 40]);
  /** @type {Record<string, [number, number]>} */
  const positions = {
    a: [300, 100],
    // A column-mate between them: two ADJACENT rows run straight and need no
    // detour at all, which is what the first version of this fixture measured.
    middle: [300, 200],
    b: [300, 300],
    // Sits across the first two candidate channels (32px and 58px out) and
    // clear of the third, so a correct router has somewhere to go and an
    // arithmetic-only one lands inside it.
    blocker: [240, 180],
  };
  const route = sameColumnDetours([{ from: 'a', to: 'b' }], positions, size, 200).get(0);
  assert.ok(route, 'a same-column edge spanning two rows still needs a route around its column');
  const channelX = route.via[0][0];
  const clear = channelX + 6 < 240 || channelX - 6 > 240 + size[0];
  assert.ok(clear, `channel at x=${channelX} runs through the node spanning 240..${240 + size[0]}`);
});

test('[1.20] a component with more citations than the schema allows is truncated, and says so', () => {
  // The schema permits three sources per component. The document was built from
  // every evidence ref the model held, so a dependency imported from four files
  // -- which is most dependencies in most repositories -- produced a document
  // the renderer then refused. One real repository arrived with 43 on `fastapi`.
  const view = {
    nodes: [{
      id: 'fastapi',
      kind: 'external',
      evidenceRefs: Array.from({ length: 9 }, (_, i) => ({ path: `src/m${8 - i}.py`, lines: [i + 1, i + 1] })),
    }],
    edges: [],
  };
  // A repository must be resolvable or citations are dropped wholesale -- a
  // citation nobody can verify against a commit is worse than none, which is a
  // separate rule and not the one under test here.
  const { document, receipt } = viewToDocument(view,
    { repository: { url: 'https://example.invalid/repo', revision: 'a'.repeat(40) } });
  const sources = document.components[0].sources;
  assert.equal(sources.length, 3, 'the schema allows three, so three is what the document may carry');
  assert.equal(receipt.citationsTruncated, 6, 'and the ones left behind are counted, not dropped in silence');
  // Deterministic, so the same view renders the same document twice.
  assert.deepEqual(sources.map((s) => s.path), ['src/m0.py', 'src/m1.py', 'src/m2.py']);
});

test('[1.20] a detour search does not give up because its rotation started out of range', () => {
  // The starting offset rotates per edge so successive detours do not stack. It
  // used to `break` on an offset that was too wide for the gap, which abandoned
  // the search before trying any of the valid ones -- so once enough edges had
  // been routed, later ones got no route and ran straight through whatever was
  // between their ends. Isolated it always worked, because the counter is zero
  // on the first edge.
  const size = /** @type {[number, number]} */ ([180, 60]);
  /** @type {Record<string, [number, number]>} */
  const positions = {};
  for (let row = 0; row < 8; row += 1) positions[`n${row}`] = [380, 80 + row * 100];
  // Enough same-column edges to push the rotation right round.
  const edges = [];
  for (let i = 0; i < 8; i += 1) edges.push({ from: 'n0', to: `n${(i % 6) + 2}` });
  const detours = sameColumnDetours(edges, positions, size, 120);
  assert.equal(detours.size, edges.length,
    `every same-column edge spanning two rows needs a route; got ${detours.size} of ${edges.length}`);
});
