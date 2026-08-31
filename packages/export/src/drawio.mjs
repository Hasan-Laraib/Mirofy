// draw.io and Excalidraw export (row 6.25) — the escape hatch.
//
// Every diagram tool eventually asks its users to trust that it will still be
// here next year. The honest answer is to make leaving cheap: a diagram that
// can only be edited in the tool that made it is a diagram held hostage.
//
// So this converts a validated document into two formats people already own
// editors for. draw.io (`.drawio`, mxGraph XML) opens in the desktop app, the
// VS Code extension and diagrams.net. Excalidraw (`.excalidraw`, JSON) opens
// in the browser app and its VS Code extension.
//
// The conversion is deliberately LOSSY and says so. What survives is what
// those formats can represent: nodes, edges, labels, positions, and the
// semantic colour of each component. What does not survive is everything this
// project adds -- evidence citations, provenance, guided views, gaps. Those
// have no counterpart in either format, and inventing one would produce a file
// that looks complete and quietly is not.
//
// The receipt names what was dropped, per document, every time. A user who
// exports and then edits elsewhere has forked their diagram, and they should
// learn that from the tool rather than from a surprise three weeks later.

const asArray = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_SIZE = [180, 60];

/** Fills borrowed from the shipped palette, so an export still reads as itself. */
const KIND_COLOUR = {
  frontend: { fill: '#dbeafe', stroke: '#0757ba' },
  backend: { fill: '#dcfce7', stroke: '#166b2e' },
  database: { fill: '#ede9fe', stroke: '#6b3fbe' },
  cloud: { fill: '#fef3c7', stroke: '#7d5400' },
  security: { fill: '#fee2e2', stroke: '#ab1c26' },
  messagebus: { fill: '#ffedd5', stroke: '#9c3f00' },
  external: { fill: '#f1f5f9', stroke: '#5c6672' },
};

const colourFor = (kind) => KIND_COLOUR[kind] ?? KIND_COLOUR.external;

/** XML text escaping. mxGraph attribute values carry user labels verbatim. */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * What a document carries that neither target format can hold.
 *
 * Computed from the document rather than hard-coded, so the receipt reports
 * what THIS export actually dropped instead of a generic disclaimer.
 */
export function lossReport(document, relationships) {
  const dropped = [];
  const components = asArray(document.components);

  const cited = components.filter((c) => asArray(c.sources).length > 0).length;
  if (cited > 0) dropped.push(`${cited} component(s) carry source citations; neither format can hold them`);

  const boundaries = asArray(document.boundaries).length;
  if (boundaries > 0) dropped.push(`${boundaries} boundary/boundaries become plain groups with no membership rules`);

  const views = asArray(document.meta?.views).length;
  if (views > 0) dropped.push(`${views} guided view(s) have no counterpart`);

  const routed = relationships.filter((r) => r.via || r.route || r.channelX !== undefined).length;
  if (routed > 0) dropped.push(`${routed} authored route(s) are exported as straight edges`);

  if (document.meta?.repository || document.meta?.repositories) {
    dropped.push('repository pinning and revision-verified links are not represented');
  }
  return dropped;
}

const RELATIONSHIPS = {
  architecture: 'connections',
  workflow: 'edges',
  sequence: 'messages',
  dataflow: 'flows',
  lifecycle: 'transitions',
};

/** The nodes and edges both exporters work from. */
export function toGraph(document, diagramType) {
  const nodeKey = diagramType === 'sequence' ? 'participants'
    : diagramType === 'lifecycle' ? 'states'
      : diagramType === 'workflow' ? 'nodes' : 'components';
  const nodes = asArray(document[nodeKey]).length > 0
    ? asArray(document[nodeKey])
    : asArray(document.components);

  const relationships = asArray(document[RELATIONSHIPS[diagramType]] ?? document.connections);

  return {
    nodes: nodes.map((node, index) => ({
      id: node.id ?? `node-${index}`,
      label: node.label ?? node.id ?? `node-${index}`,
      kind: node.type ?? node.kind ?? 'external',
      // A document may be authored without coordinates (grid mode, or a fresh
      // Mermaid import). Both formats need a position, so lay out a readable
      // grid rather than stacking everything at the origin.
      x: Array.isArray(node.pos) ? node.pos[0] : 80 + (index % 4) * 240,
      y: Array.isArray(node.pos) ? node.pos[1] : 80 + Math.floor(index / 4) * 140,
      width: Array.isArray(node.size) ? node.size[0] : DEFAULT_SIZE[0],
      height: Array.isArray(node.size) ? node.size[1] : DEFAULT_SIZE[1],
    })),
    relationships,
    edges: relationships.map((relationship, index) => ({
      id: relationship.id ?? `edge-${index}`,
      from: relationship.from,
      to: relationship.to,
      label: relationship.label ?? '',
    })),
  };
}

/**
 * Convert to draw.io (mxGraph) XML.
 *
 * @returns {{content: string, extension: string, dropped: string[]}}
 */
export function toDrawio(document, diagramType) {
  const { nodes, edges, relationships } = toGraph(document, diagramType);
  const title = escapeXml(document.meta?.title ?? diagramType);

  const cells = [];
  for (const node of nodes) {
    const { fill, stroke } = colourFor(node.kind);
    const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};strokeWidth=2;`;
    cells.push(
      `        <mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}" style="${style}" vertex="1" parent="1">`
      + `\n          <mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry" />`
      + '\n        </mxCell>',
    );
  }
  for (const edge of edges) {
    const style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#5c6672;strokeWidth=2;';
    cells.push(
      `        <mxCell id="${escapeXml(edge.id)}" value="${escapeXml(edge.label)}" style="${style}" edge="1" parent="1"`
      + ` source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">`
      + '\n          <mxGeometry relative="1" as="geometry" />'
      + '\n        </mxCell>',
    );
  }

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="mirofy">
  <diagram name="${title}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="1600" pageHeight="1200">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
  return { content, extension: '.drawio', dropped: lossReport(document, relationships) };
}

/**
 * Convert to Excalidraw JSON.
 *
 * @returns {{content: string, extension: string, dropped: string[]}}
 */
export function toExcalidraw(document, diagramType) {
  const { nodes, edges, relationships } = toGraph(document, diagramType);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const elements = [];

  const base = (id, extra) => ({
    id,
    angle: 0,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillStyle: 'solid',
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    groupIds: [],
    frameId: null,
    roundness: null,
    ...extra,
  });

  for (const node of nodes) {
    const { fill, stroke } = colourFor(node.kind);
    elements.push(base(node.id, {
      type: 'rectangle',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeColor: stroke,
      backgroundColor: fill,
      roundness: { type: 3 },
    }));
    elements.push(base(`${node.id}-label`, {
      type: 'text',
      x: node.x + 12,
      y: node.y + node.height / 2 - 10,
      width: node.width - 24,
      height: 20,
      strokeColor: '#1b1f24',
      backgroundColor: 'transparent',
      text: node.label,
      originalText: node.label,
      fontSize: 16,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: node.id,
      lineHeight: 1.25,
    }));
  }

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    elements.push(base(edge.id, {
      type: 'arrow',
      x: startX,
      y: startY,
      width: (to.x + to.width / 2) - startX,
      height: (to.y + to.height / 2) - startY,
      strokeColor: '#5c6672',
      backgroundColor: 'transparent',
      points: [[0, 0], [(to.x + to.width / 2) - startX, (to.y + to.height / 2) - startY]],
      startBinding: { elementId: from.id, focus: 0, gap: 4 },
      endBinding: { elementId: to.id, focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: 'arrow',
    }));
  }

  const content = `${JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'mirofy',
    elements,
    appState: { viewBackgroundColor: '#ffffff', gridSize: null },
    files: {},
  }, null, 2)}\n`;

  return { content, extension: '.excalidraw', dropped: lossReport(document, relationships) };
}

export const EXPORTERS = Object.freeze({ drawio: toDrawio, excalidraw: toExcalidraw });
