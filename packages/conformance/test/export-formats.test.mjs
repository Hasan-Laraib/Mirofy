// Row 6.25. draw.io and Excalidraw export — the escape hatch.
//
// Every diagram tool eventually asks its users to trust it will still be here
// next year. The honest answer is to make leaving cheap: a diagram you can
// only edit in the tool that made it is a diagram held hostage.
//
// So the tests below care about two things, and the second one more than the
// first.
//
// The output must actually OPEN. A file that a tool rejects is not an escape
// hatch, so both formats are checked structurally: draw.io as parseable XML
// with real vertices and edges, Excalidraw as JSON with bound arrows.
//
// And the export must be HONEST about what it lost. Conversion here is lossy
// by necessity -- evidence citations, provenance, guided views and boundary
// rules have no counterpart in either format -- and a converter that stayed
// quiet would hand someone a file that looks complete and quietly is not. The
// loss report is computed from the document, so it names what THIS export
// dropped rather than reciting a generic disclaimer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDrawio, toExcalidraw, toGraph, lossReport, escapeXml } from '../../export/src/drawio.mjs';

function document() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Checkout & "billing"',
      views: [{ id: 'v1', label: 'Payment path' }],
      repository: { url: 'https://github.com/acme/api', revision: 'a'.repeat(40) },
    },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', pos: [80, 100], size: [180, 60], sources: [{ path: 'src/web.js' }] },
      { id: 'api', type: 'backend', label: 'API <prod>', pos: [400, 100], size: [180, 60] },
      { id: 'db', type: 'database', label: 'Database', pos: [720, 100], size: [180, 60] },
    ],
    boundaries: [{ kind: 'region', label: 'us-east-1', wraps: ['api', 'db'] }],
    connections: [
      { id: 'c1', from: 'web', to: 'api', label: 'calls' },
      { id: 'c2', from: 'api', to: 'db', label: 'reads', via: [[600, 100], [600, 200]] },
    ],
  };
}

test('[6.25] draw.io output is XML a tool can open, with real vertices and edges', () => {
  const { content, extension } = toDrawio(document(), 'architecture');
  assert.equal(extension, '.drawio');
  assert.match(content, /^<\?xml version="1\.0"/);
  assert.match(content, /<mxfile[^>]*>[\s\S]*<mxGraphModel/);
  // Three components, two connections. mxGraph also carries two structural
  // cells (id 0 and 1) that are not part of the diagram.
  assert.equal((content.match(/vertex="1"/g) || []).length, 3);
  assert.equal((content.match(/edge="1"/g) || []).length, 2);
  // Edges must reference node ids, or draw.io opens a diagram of floating
  // arrows attached to nothing.
  assert.match(content, /source="web" target="api"/);
  assert.match(content, /source="api" target="db"/);
});

test('[6.25] labels with XML metacharacters do not corrupt the file', () => {
  // 'API <prod>' and 'Checkout & "billing"' are ordinary labels and lethal
  // unescaped: the file stops parsing and the export is worthless.
  const { content } = toDrawio(document(), 'architecture');
  assert.match(content, /value="API &lt;prod&gt;"/);
  assert.match(content, /name="Checkout &amp; &quot;billing&quot;"/);
  assert.doesNotMatch(content, /value="API <prod>"/);
  assert.equal(escapeXml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
});

test('[6.25] Excalidraw output is JSON with bound arrows', () => {
  const { content, extension } = toExcalidraw(document(), 'architecture');
  assert.equal(extension, '.excalidraw');
  const parsed = JSON.parse(content);
  assert.equal(parsed.type, 'excalidraw');
  assert.equal(parsed.version, 2);

  const kinds = parsed.elements.reduce((acc, el) => ({ ...acc, [el.type]: (acc[el.type] ?? 0) + 1 }), {});
  assert.equal(kinds.rectangle, 3);
  assert.equal(kinds.text, 3);
  assert.equal(kinds.arrow, 2);

  // An unbound arrow does not move when the reader drags a box, which turns
  // the first edit into a broken diagram.
  for (const arrow of parsed.elements.filter((el) => el.type === 'arrow')) {
    assert.ok(arrow.startBinding?.elementId, 'an arrow is not bound at its start');
    assert.ok(arrow.endBinding?.elementId, 'an arrow is not bound at its end');
  }
});

test('[6.25] the export says what it could not carry, computed from the document', () => {
  // The assertion that matters. A converter that stayed quiet would hand
  // someone a file that looks complete and is not.
  const dropped = toDrawio(document(), 'architecture').dropped;
  assert.ok(dropped.some((line) => /source citations/.test(line)), 'citations lost silently');
  assert.ok(dropped.some((line) => /boundar/.test(line)), 'boundaries lost silently');
  assert.ok(dropped.some((line) => /guided view/.test(line)), 'guided views lost silently');
  assert.ok(dropped.some((line) => /authored route/.test(line)), 'authored routing lost silently');
  assert.ok(dropped.some((line) => /repository/.test(line)), 'repository pinning lost silently');

  // Both formats report the same losses: the loss is in the target format's
  // vocabulary, not in one exporter's implementation.
  assert.deepEqual(toExcalidraw(document(), 'architecture').dropped, dropped);
});

test('[6.25] a document with nothing to lose reports nothing lost', () => {
  // A generic disclaimer printed unconditionally is noise, and noise gets
  // skipped -- including on the day it matters.
  const plain = {
    meta: { title: 'Plain' },
    components: [{ id: 'a', type: 'backend', label: 'A', pos: [0, 0], size: [180, 60] }],
    connections: [],
  };
  assert.deepEqual(lossReport(plain, []), []);
  assert.deepEqual(toDrawio(plain, 'architecture').dropped, []);
});

test('[6.25] a document with no coordinates still exports somewhere readable', () => {
  // Grid-mode documents and fresh Mermaid imports carry no positions. Both
  // formats need one, and stacking every node at the origin produces a file
  // that technically opens and is unusable.
  const gridded = {
    meta: { title: 'Imported' },
    layout: { mode: 'grid' },
    components: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, type: 'backend', label: `N${i}` })),
    connections: [{ from: 'n0', to: 'n1' }],
  };
  const { nodes } = toGraph(gridded, 'architecture');
  const positions = new Set(nodes.map((node) => `${node.x},${node.y}`));
  assert.equal(positions.size, nodes.length, 'nodes were laid out on top of each other');
  for (const node of nodes) {
    assert.ok(node.width > 0 && node.height > 0, 'a node has no size');
  }
});

test('[6.25] every diagram type finds its own relationship collection', () => {
  // Each type names its relationships differently. Reading only `connections`
  // would export a sequence diagram as a set of participants with no messages
  // between them -- a file that opens, and says nothing.
  const cases = [
    ['sequence', 'participants', 'messages'],
    ['workflow', 'nodes', 'edges'],
    ['dataflow', 'components', 'flows'],
    ['lifecycle', 'states', 'transitions'],
  ];
  for (const [type, nodeKey, edgeKey] of cases) {
    const doc = {
      meta: { title: type },
      [nodeKey]: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      [edgeKey]: [{ from: 'a', to: 'b', label: 'goes' }],
    };
    const graph = toGraph(doc, type);
    assert.equal(graph.nodes.length, 2, `${type}: nodes not found under ${nodeKey}`);
    assert.equal(graph.edges.length, 1, `${type}: relationships not found under ${edgeKey}`);
  }
});

test('[6.25] an edge pointing at a node that is not there is dropped, not exported broken', () => {
  const broken = {
    meta: { title: 'Broken' },
    components: [{ id: 'a', type: 'backend', label: 'A', pos: [0, 0], size: [180, 60] }],
    connections: [{ from: 'a', to: 'ghost', label: 'nowhere' }],
  };
  const parsed = JSON.parse(toExcalidraw(broken, 'architecture').content);
  // Excalidraw needs both endpoints to bind. An arrow bound to a missing id
  // makes the file fail to load, which is worse than an absent edge.
  assert.equal(parsed.elements.filter((el) => el.type === 'arrow').length, 0);
});
