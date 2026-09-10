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

import { explain, VERBS, indexModel, incompletenessFor } from '../../explain/src/query.mjs';
import { assertRules, OUTCOMES } from '../../explain/src/assert.mjs';
import { buildTimeline } from '../../explain/src/timeline.mjs';

/** The MCP revision this server implements. */
export const PROTOCOL_VERSION = '2024-11-05';

const NEWLINE = String.fromCharCode(10);

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
  // The two below do not go through the query engine. They are here because
  // they answer the questions an agent asks WHILE changing code -- "is this
  // change allowed" and "what has been moving here" -- and an agent that has
  // to shell out to answer them will not ask at all.
  //
  // `drift` is deliberately NOT offered. It compares two scans, which is a
  // pull-request question rather than a query, and inventing a second graph
  // for this session to diff against would be a made-up answer.
  {
    name: 'assert',
    description: 'Check architecture rules against the model. THREE outcomes, not two: pass, fail, and '
      + 'unproven — a rule that found no violation in a scan with unread files has not been shown to '
      + 'hold. Never read unproven as passing. Rules come from the repository unless you pass your own.',
    inputSchema: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          description: 'Rules to check. Omit to use the repository\'s architecture-rules.json. '
            + 'Each is {id, kind, ...}; kind is one of forbid-dependency, require-dependency, '
            + 'no-cycles, max-fan-in, max-fan-out.',
        },
      },
    },
  },
  {
    name: 'timeline',
    description: 'How often each component\'s cited files have changed, from git history. This is '
      + 'CITED-FILE CHURN: a commit here touched a file the component is cited to, which is not the '
      + 'same as the component changing shape or meaning. Components with no citations are reported '
      + 'separately rather than as unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Most recent commits to keep per component. Defaults to 5.' },
      },
    },
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

/**
 * A tool that cannot run because the session was not given what it needs.
 *
 * This is content, not a protocol error, and it says which input is missing
 * rather than returning an empty answer. An agent that reads "0 rules failed"
 * from a session that had no rules has been misled; one that reads this can
 * ask the user for a rule file.
 */
const unavailable = (text) => ({ content: [{ type: 'text', text }], isError: true });

/** `assert` over the session's model, with the rules the caller or repository supplied. */
function assertTool(args, context) {
  const rules = Array.isArray(args.rules) && args.rules.length ? args.rules : context.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    return unavailable('assert: no architecture rules in this session. Pass `rules` with the call, '
      + 'or start the server in a repository that has an architecture-rules.json.');
  }
  const report = assertRules({
    index: indexModel(context.model),
    incompleteness: incompletenessFor(context.graph),
    rules,
    acknowledgements: context.acknowledgedGaps ?? [],
    // Never silently tolerated over MCP. The caller sees `unproven` in the
    // result and decides; a server that quietly accepted it would be handing
    // an agent a green light it did not earn.
    allowUnproven: false,
  });

  const lines = [`${report.passed} passed, ${report.failed} failed, ${report.unproven} unproven `
    + `of ${report.total}.`];
  for (const outcome of report.results) {
    const mark = outcome.outcome === OUTCOMES.PASS ? 'pass'
      : outcome.outcome === OUTCOMES.FAIL ? 'FAIL' : 'UNPROVEN';
    lines.push(`[${mark}] ${outcome.id} — ${outcome.reason}`);
    for (const violation of outcome.violations.slice(0, 5)) {
      if (violation.cycle) lines.push(`    cycle: ${violation.cycle.join(' -> ')}`);
      else if (violation.missing) lines.push(`    ${violation.from} reaches nothing matching ${violation.to}`);
      else if (violation.component) lines.push(`    ${violation.component}: ${violation.degree} > ${violation.limit}`);
      else lines.push(`    ${violation.from} -> ${violation.to}`);
    }
  }
  if (report.unproven > 0) {
    lines.push('An unproven rule is not a passing rule: the violation could be in a file the scan '
      + 'could not read. Check `gaps` before treating this as clean.');
  }
  return {
    content: [
      { type: 'text', text: lines.join(NEWLINE) },
      { type: 'text', text: JSON.stringify(report, null, 2) },
    ],
    isError: false,
  };
}

/** `timeline` over the session's model, using the git reader the host supplied. */
function timelineTool(args, context) {
  if (typeof context.commitsFor !== 'function') {
    return unavailable('timeline: this session has no access to git history. Start the server from '
      + 'inside the repository the model was built from.');
  }
  const report = buildTimeline({
    model: context.model,
    commitsFor: context.commitsFor,
    limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : 5,
  });
  const lines = [`${report.measures} across ${report.components} cited component(s).`];
  for (const entry of report.entries.slice(0, 15)) {
    lines.push(`${String(entry.commitCount).padStart(4)} commit(s)  ${entry.label} (${entry.id})`);
  }
  if (report.uncitedComponents > 0) {
    lines.push(`${report.uncitedComponents} component(s) have no cited source paths, so history `
      + 'cannot speak to them. That is unknown, not unchanged.');
  }
  lines.push(report.claim);
  return {
    content: [
      { type: 'text', text: lines.join(NEWLINE) },
      { type: 'text', text: JSON.stringify(report, null, 2) },
    ],
    isError: false,
  };
}

/**
 * Run one tool and return MCP content.
 *
 * The nine query verbs share one shape and one formatter; `assert` and
 * `timeline` answer different questions and carry their own.
 */
export function callTool(name, args, context) {
  if (name === 'assert') return assertTool(args, context);
  if (name === 'timeline') return timelineTool(args, context);
  return toolContent(runTool(name, args, context));
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
 * `rules`, `acknowledgedGaps` and `commitsFor` are what the two non-query
 * tools need, and they arrive on the context rather than being read here: the
 * host supplies them, so this stays a pure function of (message, context) and
 * the tests drive it without a filesystem or a repository.
 *
 * @param {object} message
 * @param {{model: object, graph: object|null, serverInfo?: object,
 *          rules?: Array<object>|null, acknowledgedGaps?: Array<object>,
 *          commitsFor?: (path: string) => Array<object>}} context
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
        return result(message.id, callTool(name, args, context));
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
