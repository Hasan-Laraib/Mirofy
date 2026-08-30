// Mermaid import (row 1.13): pasted Mermaid becomes a typed document the
// renderers already accept.
//
// Hand-written, because row 6.9 forbids runtime dependencies. That is a real
// constraint on how much syntax this understands, and the honest response is
// the scanner rule, applied here unchanged:
//
//   NEVER guess. A line the reader does not understand becomes a Gap naming
//   the line number and its text -- never a silently dropped node, never an
//   invented edge.
//
// An importer that quietly discards what it cannot parse produces a diagram
// that is confidently wrong about the very thing it was asked to convert,
// and the person who pasted the Mermaid has no way to notice.
//
// Mapping, and why each target guesses least:
//
//   flowchart / graph  -> architecture
//       A flowchart is boxes and arrows. Architecture is the only type that
//       requires neither lanes nor positions, so it invents nothing.
//
//   sequenceDiagram    -> sequence
//       Direct. `y` is required by the schema and derived from message ORDER,
//       which the source genuinely carries: it is sequence, not layout.
//
//   stateDiagram(-v2)  -> lifecycle
//       Direct, except lifecycle requires a lane and a state diagram has
//       none. ONE lane, explicitly named, rather than several invented ones --
//       the absence of lane information made visible instead of fabricated
//       into domain structure.

const SUPPORTED = ['flowchart', 'graph', 'sequenceDiagram', 'stateDiagram', 'stateDiagram-v2'];

/** Mermaid node shapes, and the component type each reads as. */
const SHAPES = [
  { open: '[(', close: ')]', type: 'database' },   // cylinder: storage
  { open: '((', close: '))', type: 'external' },   // circle: an outside actor
  { open: '{{', close: '}}', type: 'messagebus' }, // hexagon: a bus
  { open: '[', close: ']', type: 'backend' },      // rectangle: a service
  { open: '(', close: ')', type: 'frontend' },     // rounded: a surface
  { open: '{', close: '}', type: 'security' },     // diamond: a decision/gate
];

const clean = (value) => String(value ?? '').trim().replace(/^["']|["']$/g, '');

function parseNode(token, nodes, order) {
  const raw = token.trim();
  if (!raw) return null;
  for (const shape of SHAPES) {
    const start = raw.indexOf(shape.open);
    if (start <= 0 || !raw.endsWith(shape.close)) continue;
    const id = raw.slice(0, start).trim();
    const label = clean(raw.slice(start + shape.open.length, raw.length - shape.close.length));
    if (!id) continue;
    if (!nodes.has(id)) {
      nodes.set(id, { id, type: shape.type, label: label || id });
      order.push(id);
    } else if (label) {
      nodes.get(id).label = label;
    }
    return id;
  }
  // A bare id with no shape: legitimate Mermaid, and the node may have been
  // (or may later be) declared with a shape elsewhere.
  const id = raw.split(/\s/)[0];
  if (!/^[A-Za-z_][\w-]*$/.test(id)) return null;
  if (!nodes.has(id)) {
    nodes.set(id, { id, type: 'backend', label: id });
    order.push(id);
  }
  return id;
}

// --> | --- | ==> | -.-> , optionally carrying |label| or `-- label -->`.
const EDGE_RE = /^(.*?)\s*(-{2,}>|={2,}>|-\.{1,}->|-{3,}|={3,})\s*(?:\|([^|]*)\|)?\s*(.*)$/;

const GRID_COLS = 3;

function parseFlowchart(lines, gaps) {
  const nodes = new Map();
  const order = [];
  const connections = [];

  for (const { text, line } of lines) {
    const match = EDGE_RE.exec(text);
    if (!match) {
      // A standalone node declaration is fine; anything else is a Gap.
      if (/^[A-Za-z_][\w-]*\s*[[({]/.test(text)) {
        parseNode(text, nodes, order);
        continue;
      }
      if (/^[A-Za-z_][\w-]*$/.test(text)) {
        parseNode(text, nodes, order);
        continue;
      }
      gaps.push({ line, text, reason: `line ${line} is not a node or edge this reader understands: ${JSON.stringify(text)}` });
      continue;
    }
    let [, left, , pipeLabel, right] = match;
    let label = clean(pipeLabel ?? '');
    // `A -- label --> B`: the label sits before the arrow.
    const inlineLabel = /^(.*?)\s+--\s*(.+)$/.exec(left);
    if (!label && inlineLabel) {
      left = inlineLabel[1];
      label = clean(inlineLabel[2]);
    }
    const from = parseNode(left, nodes, order);
    const to = parseNode(right, nodes, order);
    if (!from || !to) {
      gaps.push({ line, text, reason: `line ${line} has an edge whose endpoints could not be read: ${JSON.stringify(text)}` });
      continue;
    }
    connections.push({ from, to, ...(label ? { label } : {}) });
  }

  return {
    document: {
      schema_version: 1,
      diagram_type: 'architecture',
      meta: { title: 'Imported from Mermaid' },
      // The layout validator requires a position per component UNLESS the
      // document declares a layout mode. `grid` is the honest declaration
      // for an import: the source carried no coordinates, so the renderer
      // places them rather than the importer inventing a arrangement and
      // presenting it as authored intent.
      layout: { mode: 'grid' },
      // Grid mode still needs an index per component. `row`/`col` are grid
      // COORDINATES, not pixels -- the same category as lifecycle's lane/col
      // -- so assigning them from import order places nothing: it says "these
      // came in this order" and leaves the geometry to the renderer.
      components: order.map((id, index) => ({
        ...nodes.get(id),
        row: Math.floor(index / GRID_COLS),
        col: index % GRID_COLS,
      })),
      connections,
    },
    diagramType: 'architecture',
  };
}

const PARTICIPANT_RE = /^(?:participant|actor)\s+([A-Za-z_][\w-]*)(?:\s+as\s+(.+))?$/i;
// Longest arrow forms first, and a LAZY id, because `[\w-]*` is greedy
// enough to eat the arrow's own first hyphen: `S-->>U` parsed as a
// participant called "S-" before this was pinned down.
const MESSAGE_RE = /^([A-Za-z_][\w-]*?)\s*(-->>|--\)|->>|-->|->|-x|--x)\s*([A-Za-z_][\w-]*?)\s*:\s*(.*)$/;

function parseSequence(lines, gaps) {
  const participants = new Map();
  const order = [];
  const messages = [];
  const MESSAGE_SPACING = 60;
  const FIRST_MESSAGE_Y = 185;

  const ensure = (id, label) => {
    if (!participants.has(id)) {
      participants.set(id, { id, type: 'backend', label: label || id });
      order.push(id);
    } else if (label) {
      participants.get(id).label = label;
    }
  };

  for (const { text, line } of lines) {
    const participant = PARTICIPANT_RE.exec(text);
    if (participant) {
      ensure(participant[1], clean(participant[2] ?? ''));
      continue;
    }
    const message = MESSAGE_RE.exec(text);
    if (message) {
      ensure(message[1]);
      ensure(message[3]);
      messages.push({
        from: message[1],
        to: message[3],
        y: FIRST_MESSAGE_Y + messages.length * MESSAGE_SPACING,
        label: clean(message[4]) || 'message',
        ...(message[2].startsWith('--') ? { variant: 'dashed' } : {}),
      });
      continue;
    }
    gaps.push({ line, text, reason: `line ${line} is not a participant or message this reader understands: ${JSON.stringify(text)}` });
  }

  return {
    document: {
      schema_version: 1,
      diagram_type: 'sequence',
      meta: { title: 'Imported from Mermaid' },
      participants: order.map((id) => participants.get(id)),
      messages,
    },
    diagramType: 'sequence',
  };
}

const STATE_EDGE_RE = /^(\[\*\]|[A-Za-z_][\w-]*)\s*-->\s*(\[\*\]|[A-Za-z_][\w-]*)\s*(?::\s*(.*))?$/;

function parseStateDiagram(lines, gaps) {
  const states = new Map();
  const order = [];
  const transitions = [];
  // A state diagram carries no lanes. One explicit lane says so; several
  // invented ones would be inventing domain structure the source never had.
  //
  // State TYPES come from lifecycle's fixed vocabulary (start, active,
  // waiting, decision, success, failure, neutral, external). An ordinary
  // state is `active`; Mermaid's terminal [*] is `success`, which is the
  // closest honest reading of "the machine finished" -- Mermaid does not
  // distinguish a successful end from a failed one, so claiming `failure`
  // would be inventing an outcome.
  // `main` is reserved and required: it is lifecycle's phase rail, and a
  // diagram without it fails layout validation. A state diagram is a single
  // progression, so the rail is exactly where its states belong.
  const LANE = 'main';

  const ensure = (id, type) => {
    if (!states.has(id)) {
      states.set(id, { id, type, label: id, lane: LANE, col: order.length });
      order.push(id);
    }
    return id;
  };

  for (const { text, line } of lines) {
    const match = STATE_EDGE_RE.exec(text);
    if (!match) {
      if (/^state\s+/i.test(text) || /^[A-Za-z_][\w-]*\s*:\s*.+$/.test(text)) {
        const named = /^([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(text);
        if (named) {
          ensure(named[1], 'active');
          states.get(named[1]).label = clean(named[2]);
          continue;
        }
      }
      gaps.push({ line, text, reason: `line ${line} is not a state or transition this reader understands: ${JSON.stringify(text)}` });
      continue;
    }
    // `[*]` is Mermaid's start/end marker, not a state named "[*]". Carrying
    // it through literally would put a box called `[*]` on the canvas.
    const from = match[1] === '[*]' ? ensure('start', 'start') : ensure(match[1], 'active');
    const to = match[2] === '[*]' ? ensure('done', 'success') : ensure(match[2], 'active');
    if (match[1] === '[*]') states.get('start').label = 'Start';
    if (match[2] === '[*]') states.get('done').label = 'Done';
    const label = clean(match[3] ?? '');
    transitions.push({ from, to, ...(label ? { label } : {}) });
  }

  return {
    document: {
      schema_version: 1,
      diagram_type: 'lifecycle',
      meta: { title: 'Imported from Mermaid' },
      lanes: [{ id: LANE, label: 'States' }],
      states: order.map((id) => states.get(id)),
      transitions,
    },
    diagramType: 'lifecycle',
  };
}

/**
 * Read Mermaid text into a typed document.
 *
 * @param {string} text
 * @returns {{document: object, gaps: Array<{line: number, text: string, reason: string}>, diagramType: string}}
 */
export function importMermaid(text) {
  const rawLines = String(text ?? '').split(/\r?\n/);
  const numbered = rawLines
    .map((value, index) => ({ text: value.trim(), line: index + 1 }))
    .filter((entry) => entry.text && !entry.text.startsWith('%%'));

  if (!numbered.length) throw new TypeError('import mermaid: the input is empty');

  const header = numbered[0].text;
  const kind = SUPPORTED.find((supported) => header.toLowerCase().startsWith(supported.toLowerCase()));
  if (!kind) {
    throw new TypeError(
      `import mermaid: ${JSON.stringify(header)} is not a diagram kind this reader understands. `
      + `Supported: flowchart, graph, sequenceDiagram, stateDiagram, stateDiagram-v2.`,
    );
  }

  const body = numbered.slice(1);
  const gaps = [];
  const parsed = kind === 'sequenceDiagram' ? parseSequence(body, gaps)
    : kind.toLowerCase().startsWith('statediagram') ? parseStateDiagram(body, gaps)
      : parseFlowchart(body, gaps);

  return { ...parsed, gaps };
}
