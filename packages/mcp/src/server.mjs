// MCP server — the system model as agent context (row 6.18).
//
// An agent asked to change a codebase has to answer questions first. What
// calls this? What is downstream of it? Which components touch the payment
// data? Today it answers those with grep, which finds strings and cannot tell
// a call from a comment, and it has no way to know what it missed.
//
// This exposes the same query engine `explain` uses over the Model Context
// Protocol, so the answers an agent gets are the answers the CLI gives: built
// from the evidence graph, carrying their citations, and -- the part that
// matters most for an agent -- carrying what they could be WRONG about.
//
// That last point is the whole reason this is worth building. An agent that
// reads "nothing calls PaymentService" and deletes it has done real damage if
// six files failed to parse. Every tool result here carries the unread files
// that could change the answer, and says in words that an empty result means
// "not found" rather than "does not exist". An agent can act on that
// distinction; it cannot act on a distinction nobody told it about.
//
// The protocol is implemented directly rather than pulled from a package,
// because row 6.9 keeps this repository at zero runtime dependencies and MCP
// over stdio is newline-delimited JSON-RPC 2.0 -- small enough to own.
//
// Everything here is a pure function of (message, context). The stdio wiring
// lives in bin/mcp.mjs and does nothing but read lines and write lines, so the
// protocol can be tested without spawning anything.

import { explain, VERBS } from '../../explain/src/query.mjs';

/** The MCP revision this server implements. */
export const PROTOCOL_VERSION = '2024-11-05';

const JSONRPC = '2.0';

/** JSON-RPC error codes this server can return. */
export const ERRORS = Object.freeze({
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
});

const componentArg = {
  type: 'object',
  properties: { id: { type: 'string', description: 'Component id, exactly as it appears in the model.' } },
  required: ['id'],
};

/**
 * The tools this server offers.
 *
 * Descriptions are written for the agent that will read them, and each one
 * states its limit as plainly as its purpose. A tool description that oversold
 * `impact` as "what will break" would produce exactly the confident wrong
 * action this design exists to prevent.
 */
export const TOOLS = Object.freeze([
  {
    name: 'callers',
    description: 'What points at this component. Directed: these depend on it, not the other way round. '
      + 'Every result carries its citations and an incompleteness report.',
    inputSchema: componentArg,
  },
  {
    name: 'dependencies',
    description: 'What this component points at. The inverse of callers.',
    inputSchema: componentArg,
  },
  {
    name: 'impact',
    description: 'What is reachable downstream of this component, to a bounded depth. This is REACHABILITY '
      + 'in the authored model, not a prediction of breakage: it says what is connected, never what will fail.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Component id.' },
        depth: { type: 'number', description: 'Maximum hops to follow. Defaults to 3.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'upstream',
    description: 'What can reach this component, to a bounded depth.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        depth: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'path',
    description: 'A directed route between two components, if the model records one.',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'find',
    description: 'Components whose id, label, kind or metadata contain a term. Use this to answer questions '
      + 'like "which components touch PII" when the model records that as a label or tag.',
    inputSchema: {
      type: 'object',
      properties: { term: { type: 'string' } },
      required: ['term'],
    },
  },
  {
    name: 'orphans',
    description: 'Components nothing connects to in either direction.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gaps',
    description: 'Files the scanner could not analyse. Read this before concluding that something does not exist.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'summary',
    description: 'The shape of the model: component, relationship and boundary counts, and provenance mix.',
    inputSchema: { type: 'object', properties: {} },
  },
]);

const result = (id, value) => ({ jsonrpc: JSONRPC, id, result: value });
const failure = (id, code, message, data) => ({
  jsonrpc: JSONRPC, id, error: { code, message, ...(data ? { data } : {}) },
});

/**
 * Turn one query answer into MCP tool content.
 *
 * The incompleteness block is rendered into the TEXT, not only into the
 * structured payload. An agent that reads only the prose still learns that the
 * answer may be short, which is the reader most likely to act on it.
 */
export function toolContent(answer) {
  const lines = [];
  if (answer.subject) lines.push(`${answer.verb} of ${answer.subject.label} (${answer.subject.id}):`);
  if (typeof answer.count === 'number') lines.push(`${answer.count} result(s).`);
  if (answer.claim) lines.push(answer.claim);

  const { incompleteness } = answer;
  if (incompleteness.complete) {
    lines.push('Scan complete: no unanalysed files, so this covers everything scanned.');
  } else {
    lines.push(`INCOMPLETE: ${incompleteness.note}`);
    for (const gap of incompleteness.gaps.slice(0, 5)) lines.push(`  unread: ${gap.path} — ${gap.reason}`);
  }

  return {
    content: [
      { type: 'text', text: lines.join('\n') },
      { type: 'text', text: JSON.stringify(answer, null, 2) },
    ],
    // Surfaced as structured data too, so a caller does not have to parse prose.
    isError: false,
  };
}

/** Map a tool call onto the query engine. */
function runTool(name, args, context) {
  const verbArgs = {
    callers: () => [String(args.id ?? '')],
    dependencies: () => [String(args.id ?? '')],
    impact: () => [String(args.id ?? '')],
    upstream: () => [String(args.id ?? '')],
    path: () => [String(args.from ?? ''), String(args.to ?? '')],
    find: () => [String(args.term ?? '')],
    orphans: () => [],
    gaps: () => [],
    summary: () => [],
  }[name];
  if (!verbArgs) throw new TypeError(`unknown tool ${JSON.stringify(name)}`);
  if (!VERBS.includes(name)) throw new TypeError(`tool ${name} has no matching query verb`);

  return explain({
    model: context.model,
    graph: context.graph,
    verb: name,
    args: verbArgs(),
    depth: Number.isFinite(Number(args.depth)) ? Number(args.depth) : 3,
  });
}

/**
 * Handle one JSON-RPC message.
 *
 * @param {object} message
 * @param {{model: object, graph: object|null, serverInfo?: object}} context
 * @returns {object|null} the response, or null for a notification
 */
export function handleMessage(message, context) {
  if (!message || message.jsonrpc !== JSONRPC || typeof message.method !== 'string') {
    return failure(message?.id ?? null, ERRORS.INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request with a method.');
  }

  // Notifications carry no id and must draw no response. Replying to one is a
  // protocol violation that clients report as a stray message.
  const isNotification = message.id === undefined || message.id === null;

  switch (message.method) {
    case 'initialize':
      return result(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: context.serverInfo ?? { name: 'mirofy', version: '0.1.0' },
      });

    case 'notifications/initialized':
    case 'initialized':
      return null;

    case 'tools/list':
      return result(message.id, { tools: TOOLS });

    case 'tools/call': {
      const { name, arguments: args = {} } = message.params ?? {};
      if (!name) return failure(message.id, ERRORS.INVALID_PARAMS, 'tools/call needs a tool name.');
      try {
        return result(message.id, toolContent(runTool(name, args, context)));
      } catch (error) {
        // A bad component id is the caller's mistake, not a server fault, and
        // it comes back as tool content rather than a protocol error: the
        // agent needs to read the message and correct itself, and a JSON-RPC
        // error is not shown to the model in most clients.
        return result(message.id, {
          content: [{ type: 'text', text: String(error.message ?? error) }],
          isError: true,
        });
      }
    }

    case 'ping':
      return result(message.id, {});

    default:
      if (isNotification) return null;
      return failure(message.id, ERRORS.METHOD_NOT_FOUND, `Unknown method ${JSON.stringify(message.method)}.`);
  }
}

/**
 * Parse one line and handle it, converting a parse failure into a protocol error.
 *
 * @param {string} line
 * @param {object} context
 * @returns {object|null}
 */
export function handleLine(line, context) {
  const text = line.trim();
  if (text === '') return null;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return failure(null, ERRORS.PARSE, 'Message was not valid JSON.');
  }
  return handleMessage(message, context);
}
