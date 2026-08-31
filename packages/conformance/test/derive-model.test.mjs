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
import { deriveFromGraph, packageIndex, ownerOf, classifyTarget } from '../../model/src/derive.mjs';
import { viewToDocument, schemaTypeFor, safeId, layeredPositions } from '../../layout/src/document.mjs';

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
