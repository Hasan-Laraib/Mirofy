// View IR to a renderable document (row 1.20).
//
// `compile` produces a view IR: nodes, edges, intent, omissions -- and
// deliberately no coordinates, because deciding WHAT to show and deciding
// WHERE to put it are different problems that should be able to fail
// separately.
//
// Nothing joined those two halves. `compile` wrote `scan/view.json` and the
// renderer refused it, because a view IR is not a document: it uses
// `schemaVersion` where the schema requires `schema_version`, it has `nodes`
// where architecture has `components`, and it carries no positions at all. The
// pipeline this project describes -- repository to diagram -- stopped one step
// short of a diagram, and the README documented a command that could not work.
//
// This is that step. It solves the view into coordinates and emits a document
// the renderer accepts.
//
// What it must not do is invent meaning. A derived node knows it is a package;
// it does not know whether that package is a "database" or a "frontend", and
// the renderer's component types are exactly that kind of claim. So a kind the
// schema does not have becomes `external` -- the type that asserts least --
// and the original is preserved in the node's tag, where it is visible and
// checkable rather than silently rewritten.

import { solve } from './solve.mjs';

/** Component types the architecture schema accepts. */
const SCHEMA_TYPES = new Set([
  'frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'module', 'external',
]);

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Map a model kind onto a schema type without asserting anything new.
 *
 * `external` is the honest fallback: it is the type that claims least about
 * what something does. Guessing "backend" from a package name would be exactly
 * the invention this project refuses everywhere else.
 */
export function schemaTypeFor(kind) {
  const text = String(kind ?? '').toLowerCase();
  if (SCHEMA_TYPES.has(text)) return text;
  return 'external';
}

/**
 * A schema-safe id, and a stable one.
 *
 * The schema requires `^[a-zA-Z][a-zA-Z0-9_-]*$`, and a derived id is a real
 * package name like `@mirofy/core`, which is not. Slugifying is not cosmetic:
 * every edge references these ids, so the map has to be applied consistently
 * or the diagram loses its connections.
 *
 * The real name is not thrown away -- it is carried onto the component so a
 * reader of the diagram, and anything reading the document afterwards, can
 * still recover what it actually is.
 */
export function safeId(raw) {
  const slug = String(raw ?? '')
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-zA-Z]/.test(slug) ? slug : `n-${slug}`;
}

/**
 * Place a dependency graph in layers, left to right.
 *
 * The general solver treats a view as a physical system and settles it. That
 * is right for a graph with no inherent direction, and wrong for this one: a
 * package dependency graph is a DAG, its edges all mean "depends on", and a
 * force-directed settle scatters them so that routes double back. The
 * composition gates then reject the diagram for endpoint-side violations --
 * correctly, because the picture really was harder to read than it needed to
 * be.
 *
 * Depth is the LONGEST path to a node, not the shortest: with the shortest,
 * a node with one direct edge and one three-hop path lands in column one and
 * its long edge runs backwards over two columns.
 *
 * Cycles are tolerated rather than rejected. A real dependency graph
 * occasionally has one, and refusing to draw the whole system because of it
 * would be worse than drawing it with one edge pointing back.
 */
export function layeredPositions(view, { size = [180, 60], margin = 80, gapX = 120, gapY = 40 } = {}) {
  const ids = view.nodes.map((node) => node.id);
  const outgoing = new Map(ids.map((id) => [id, []]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const edge of asArray(view.edges)) {
    if (!outgoing.has(edge.from) || !indegree.has(edge.to)) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const depth = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const remaining = new Map(indegree);
  // Kahn's algorithm, relaxing depth as each node is settled.
  while (queue.length > 0) {
    const id = queue.shift();
    for (const next of outgoing.get(id) ?? []) {
      depth.set(next, Math.max(depth.get(next), depth.get(id) + 1));
      remaining.set(next, remaining.get(next) - 1);
      if (remaining.get(next) === 0) queue.push(next);
    }
  }
  // Anything a cycle left unsettled goes one column past its deepest settled
  // dependency, so it still reads as downstream rather than piling at zero.
  for (const id of ids) {
    if (remaining.get(id) > 0) {
      const deepest = Math.max(0, ...asArray(view.edges)
        .filter((edge) => edge.to === id && remaining.get(edge.from) === 0)
        .map((edge) => depth.get(edge.from) ?? 0));
      depth.set(id, deepest + 1);
    }
  }

  const columns = new Map();
  for (const id of ids) {
    const column = depth.get(id);
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(id);
  }

  // A LAYER WIDER THAN THIS WRAPS into further columns. Every node of one depth
  // used to share a single column however many there were, so a hub importing
  // seven siblings produced an eight-row ladder in two columns: the artifact ran
  // to 2169px against a 900px viewport, the tool's own visual-check rejected it,
  // and `map` reported success anyway. No amount of edge routing fixes a shape
  // that is simply too tall -- the columns have to exist before anything can be
  // routed between them.
  //
  // Five, because the viewer's viewport is wider than it is tall: spending the
  // width is free and spending the height costs a scrollbar.
  const MAX_ROWS = 5;
  /** @type {string[][]} */
  const slots = [];
  for (const depth of [...columns.keys()].sort((left, right) => left - right)) {
    const members = columns.get(depth);
    const parts = Math.max(1, Math.ceil(members.length / MAX_ROWS));
    // Balanced rather than greedy: 8 into two columns of 4, not 5 and 3.
    const per = Math.ceil(members.length / parts);
    for (let part = 0; part < parts; part += 1) {
      const slice = members.slice(part * per, (part + 1) * per);
      if (slice.length) slots.push(slice);
    }
  }

  /** @type {Record<string, [number, number]>} */
  const positions = {};
  const tallest = Math.max(...slots.map((slot) => slot.length), 1);
  slots.forEach((members, column) => {
    // Centre each column vertically so the diagram reads as a shape rather
    // than a ragged top edge.
    const offset = ((tallest - members.length) * (size[1] + gapY)) / 2;
    members.forEach((id, row) => {
      positions[id] = [
        margin + column * (size[0] + gapX),
        margin + offset + row * (size[1] + gapY),
      ];
    });
  });
  return { positions, columns: slots.length, tallest };
}

/**
 * Does a straight segment pass through any node box, other than its own ends?
 *
 * A detour that dodges one node by crossing another has not solved anything --
 * it has moved the Clean Flow violation somewhere the author is less likely to
 * predict. Both routers picked a channel by arithmetic alone and checked only
 * that it stayed on the canvas.
 *
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @param {Array<[string, [number, number]]>} boxes
 * @param {[number, number]} size
 * @param {string[]} ignore ids the segment is allowed to touch: its own ends
 */
function segmentIsClear(from, to, boxes, size, ignore) {
  const [width, height] = size;
  const left = Math.min(from[0], to[0]);
  const right = Math.max(from[0], to[0]);
  const top = Math.min(from[1], to[1]);
  const bottom = Math.max(from[1], to[1]);
  const CLEARANCE = 6;
  for (const [id, [x, y]] of boxes) {
    if (ignore.includes(id)) continue;
    if (x + width + CLEARANCE < left || x - CLEARANCE > right) continue;
    if (y + height + CLEARANCE < top || y - CLEARANCE > bottom) continue;
    return false;
  }
  return true;
}

/**
 * Routes for edges whose endpoints sit in the same column.
 *
 * A layered layout puts every node of one depth in one vertical column, and a
 * straight edge between two members of that column runs through every member
 * between them. With three packages in a layer nobody noticed; with ten, an
 * edge from the first to the fourth crosses two nodes and the Clean Flow gate
 * rejects the diagram -- which is how this was found: the layout engine
 * produced a document its own renderer refused.
 *
 * So those edges leave sideways instead, run down a channel beside the column,
 * and come back in on the same side. Three orthogonal segments, both endpoints
 * crossing their border perpendicularly, which is what the endpoint-side rule
 * asks for.
 *
 * ADJACENT MEMBERS ARE LEFT ALONE. Nothing sits between them, their straight
 * edge is correct and readable, and detouring it would trade a clean line for
 * a detour around nothing. That also keeps every diagram that renders today
 * rendering identically.
 *
 * Each edge gets its own channel so two detours in one gap do not merge into a
 * single ambiguous corridor.
 *
 * @param {Array<{from: string, to: string}>} edges
 * @param {Record<string, [number, number]>} positions
 * @param {[number, number]} size
 * @param {number} gapX horizontal space between columns
 * @returns {Map<number, {fromSide: string, toSide: string, via: Array<[number, number]>}>}
 *   keyed by index into `edges`
 */
export function sameColumnDetours(edges, positions, size, gapX) {
  // Only the height is needed: the channel runs beside the column, so the
  // endpoints attach at each node's vertical centre and the box width never
  // enters the arithmetic.
  const height = size[1];
  const rowsByColumn = new Map();
  for (const [id, [x, y]] of Object.entries(positions)) {
    if (!rowsByColumn.has(x)) rowsByColumn.set(x, []);
    rowsByColumn.get(x).push({ id, y });
  }
  /** @type {Map<string, number>} */
  const rowOf = new Map();
  for (const members of rowsByColumn.values()) {
    members.sort((left, right) => left.y - right.y);
    members.forEach((member, row) => rowOf.set(member.id, row));
  }

  const detours = new Map();
  let channel = 0;
  for (const [index, edge] of edges.entries()) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to || from[0] !== to[0]) continue;
    if (Math.abs(rowOf.get(edge.from) - rowOf.get(edge.to)) <= 1) continue;

    // The channel sits in the gap to the LEFT of the column, stepping further
    // out for each successive detour. Left rather than right because the
    // layered layout reads left to right, so the outbound side is the one a
    // reader is not already following.
    const columnLeft = from[0];
    const boxes = Object.entries(positions);
    // Step outward until the channel is CLEAR, not merely on the canvas. The
    // old arithmetic picked an offset and checked the canvas only, so a
    // detour could dodge its column-mates by running straight through a node
    // in the gap -- trading one Clean Flow violation for a less predictable
    // one.
    let placed = null;
    for (let step = 0; step < 6; step += 1) {
      const offset = 32 + ((channel + step) % 6) * 26;
      const channelX = columnLeft - offset;
      // `continue`, NOT `break`. The starting offset rotates per edge so
      // successive detours do not stack, and with `break` an edge whose
      // rotation happened to begin on an out-of-range offset abandoned the
      // search before trying any of the valid ones. It worked in isolation,
      // where the counter is always zero, and failed on the twelfth edge of a
      // real diagram -- which then ran straight through five nodes.
      if (channelX <= 8 || offset >= gapX - 8) continue;
      const a = /** @type {[number, number]} */ ([channelX, from[1] + height / 2]);
      const b = /** @type {[number, number]} */ ([channelX, to[1] + height / 2]);
      if (segmentIsClear(a, b, boxes, size, [edge.from, edge.to])) { placed = [a, b]; break; }
    }
    channel += 1;
    // Nothing clear to route into. Left straight, and reported by the gate
    // rather than moved somewhere equally wrong.
    if (!placed) continue;

    detours.set(index, { fromSide: 'left', toSide: 'left', via: placed });
  }
  return detours;
}

/**
 * Routes for edges that skip a column.
 *
 * Same problem as `sameColumnDetours`, other axis. A layered layout puts every
 * node of one depth in one column, so an edge from column 0 to column 2 runs
 * straight through whatever sits in column 1 on the same row -- and Clean Flow
 * rejects it, correctly.
 *
 * It is not a rare shape. `A imports B`, `A imports C`, `B imports C` is the
 * commonest three-module arrangement there is, and it put A, B and C in one row
 * with the A-to-C edge crossing B. `mirofy map` therefore failed outright on an
 * ordinary small repository -- found by running the published package against
 * one, which is the only place it shows.
 *
 * The channel runs BELOW the rows: a layered diagram reads left to right, so
 * the space under it is the one a reader is not tracking.
 *
 * @param {Array<{from: string, to: string}>} edges
 * @param {Record<string, [number, number]>} positions
 * @param {[number, number]} size
 * @returns {Map<number, {fromSide: string, toSide: string, via: Array<[number, number]>}>}
 */
export function skipLevelDetours(edges, positions, size) {
  const [width, height] = size;
  const entries = Object.entries(positions);
  if (!entries.length) return new Map();
  const columns = [...new Set(entries.map(([, [x]]) => x))].sort((left, right) => left - right);
  const columnOf = new Map(entries.map(([id, [x]]) => [id, columns.indexOf(x)]));
  const lowest = Math.max(...entries.map(([, [, y]]) => y)) + height;
  const highest = Math.min(...entries.map(([, [, y]]) => y));

  const detours = new Map();
  let channel = 0;
  for (const [index, edge] of edges.entries()) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to || from[0] === to[0]) continue;
    if (Math.abs(columnOf.get(edge.to) - columnOf.get(edge.from)) <= 1) continue;

    // Only detour when something is ACTUALLY in the way. A skip-level edge over
    // an empty column is a straight line, and bending it would be decoration.
    const left = Math.min(from[0], to[0]);
    const right = Math.max(from[0], to[0]);
    const top = Math.min(from[1], to[1]);
    const bottom = Math.max(from[1], to[1]) + height;
    const blocked = entries.some(([id, [x, y]]) => id !== edge.from && id !== edge.to
      && x > left && x < right && y < bottom && y + height > top);
    if (!blocked) continue;

    // BELOW *or* ABOVE. The horizontal run clears every box by construction, but
    // the two drops into it do not: a node directly under either end is crossed
    // on the way down. Routing below is the natural choice for a node at the
    // bottom of its column and the wrong one for a node at the top -- and after
    // layers began wrapping, a source in the top row with three nodes beneath it
    // had no clear way down at all, so the edge stayed straight and ran through
    // whatever sat between the columns.
    let placed = null;
    let side = 'bottom';
    for (let step = 0; step < 8 && !placed; step += 1) {
      const below = step % 2 === 0;
      const nudge = 34 + (((channel + step) >> 1) % 4) * 24;
      const channelY = below ? lowest + nudge : highest - nudge;
      if (channelY <= 8) continue;
      const edgeY = below ? height : 0;
      const a = /** @type {[number, number]} */ ([from[0] + width / 2, channelY]);
      const b = /** @type {[number, number]} */ ([to[0] + width / 2, channelY]);
      const clear = segmentIsClear([from[0] + width / 2, from[1] + edgeY], a, entries, size, [edge.from, edge.to])
        && segmentIsClear([to[0] + width / 2, to[1] + edgeY], b, entries, size, [edge.from, edge.to])
        && segmentIsClear(a, b, entries, size, [edge.from, edge.to]);
      if (clear) { placed = [a, b]; side = below ? 'bottom' : 'top'; }
    }
    channel += 1;
    if (!placed) continue;
    detours.set(index, { fromSide: side, toSide: side, via: placed });
  }
  return detours;
}

// The schema allows a component AT MOST THREE sources. The document was built
// from every evidence ref the model held, and a dependency imported from four
// files -- which is most dependencies in most repositories -- produced a
// document the renderer then refused. `fastapi` arrived with 43.
//
// It stayed hidden because it only fires when such a component is among the
// dozen the bounded view draws, and which dozen that is moves when the evidence
// moves. One extra fact elsewhere in the graph surfaced it.
//
// Truncated deterministically, by path then line, so the same document renders
// the same way twice. The full list is not lost: the model keeps every citation,
// and viewToDocument reports how many it left behind.
const MAX_SOURCES = 3;
let citationsTruncated = 0;

function citationsFor(node) {
  const all = asArray(node.evidenceRefs)
    .filter((ref) => ref && ref.path)
    .map((ref) => ({
      path: ref.path,
      ...(Array.isArray(ref.lines) ? { line: ref.lines[0], end_line: ref.lines[1] } : {}),
    }))
    .sort((left, right) => left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0));
  if (all.length > MAX_SOURCES) citationsTruncated += all.length - MAX_SOURCES;
  return all.slice(0, MAX_SOURCES);
}

/**
 * Turn a compiled view into a renderable architecture document.
 *
 * @param {object} view the view IR from `compile`
 * @param {{title?: string, size?: [number, number], canvas?: [number, number],
 *          pinned?: Record<string, [number, number]>,
 *          repository?: {url: string, revision: string}|null,
 *          solver?: boolean}} [options]  asks for the physical
 *   settle instead of the layered default.
 * @returns {{document: object, receipt: object}}
 */
export function viewToDocument(view, options = {}) {
  // Reset per document. A module-level counter that survives between calls
  // reports the previous document's truncations as this one's.
  citationsTruncated = 0;
  if (!view || !Array.isArray(view.nodes)) {
    throw new TypeError('viewToDocument: a compiled view with nodes[] is required');
  }
  if (view.type && view.type !== 'architecture') {
    // Only architecture is wired here. Saying so beats emitting an
    // architecture document from a sequence view and letting the renderer
    // produce something confidently wrong.
    throw new TypeError(`viewToDocument: only architecture views are supported (got ${view.type})`);
  }

  const size = options.size ?? [180, 60];
  // Layered by default: these views are dependency DAGs, and the physical
  // solver is the wrong instrument for a graph whose edges all mean the same
  // directed thing. `--solver` asks for the settle instead.
  const solved = options.solver
    ? solve(view, { size, canvas: options.canvas, pinned: options.pinned })
    : { ...layeredPositions(view, { size }), pinned: Object.keys(options.pinned ?? {}) };

  const retyped = [];
  const renamed = [];
  // Built before the components, because the edges need the same map.
  const idOf = new Map();
  for (const node of view.nodes) {
    const safe = safeId(node.id);
    if (safe !== node.id) renamed.push({ from: node.id, to: safe });
    idOf.set(node.id, safe);
  }

  const components = view.nodes.map((node) => {
    const type = schemaTypeFor(node.kind);
    if (type !== node.kind) retyped.push({ id: node.id, from: node.kind ?? null, to: type });
    const position = solved.positions[node.id] ?? [0, 0];
    // Computed ONCE: calling it for the length test and again for the value
    // counted every truncation twice in the receipt.
    const citations = citationsFor(node);
    return {
      id: idOf.get(node.id),
      type,
      label: node.label ?? node.id,
      pos: [Math.round(position[0]), Math.round(position[1])],
      size,
      // The original kind survives where a reader can see it, rather than
      // being quietly replaced by the schema's nearest neighbour.
      ...(node.kind && node.kind !== type ? { tag: String(node.kind) } : {}),
      ...(citations.length > 0 ? { sources: citations } : {}),
    };
  });

  const drawnEdges = asArray(view.edges)
    .filter((edge) => edge && idOf.has(edge.from) && idOf.has(edge.to));
  // Only the layered placement stacks a whole depth into one column; the
  // physical solver spreads nodes freely and has no columns to route around.
  // Two axes, one map. A column-mate detour and a skip-level detour can never
  // apply to the same edge -- one requires equal x, the other requires
  // different x -- so merging cannot silently drop a route.
  const detours = options.solver
    ? new Map()
    : new Map([
      ...sameColumnDetours(drawnEdges, solved.positions, size, 120),
      ...skipLevelDetours(drawnEdges, solved.positions, size),
    ]);
  const connections = drawnEdges.map((edge, index) => ({
    from: idOf.get(edge.from),
    to: idOf.get(edge.to),
    ...(edge.label ? { label: String(edge.label) } : {}),
    ...(detours.get(index) ?? {}),
  }));

  // Citations need a pinned repository to verify against, and this module
  // cannot invent one. Given no repository, the sources are DROPPED and the
  // receipt says so -- emitting citations that cannot be checked would be
  // worse than emitting none.
  const repository = options.repository ?? null;
  let citationsDropped = 0;
  if (!repository) {
    for (const component of components) {
      if (component.sources) {
        citationsDropped += component.sources.length;
        delete component.sources;
      }
    }
  }

  const document = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      ...(repository ? { repository } : {}),
      // `intent` is a structured object, not a sentence. Passing it through
      // put an object where the schema wants a string.
      title: typeof options.title === 'string' && options.title
        ? options.title
        : 'System model',
    },
    components,
    connections,
  };

  return {
    document,
    receipt: {
      schemaVersion: 1,
      nodes: components.length,
      edges: connections.length,
      pinned: solved.pinned,
      renamed,
      retyped,
      // Carried forward so a reader of the diagram can still see what the
      // compiler left out. A view that dropped 7 components and says nothing
      // is the thing this project exists to prevent.
      omissions: asArray(view.omissions).length,
      citationsDropped,
      // Citations beyond the schema's limit of three per component. The model
      // keeps all of them; the document may not carry them.
      citationsTruncated,
    },
  };
}
