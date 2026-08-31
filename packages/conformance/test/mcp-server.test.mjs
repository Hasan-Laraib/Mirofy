// Row 6.18. MCP server — the system model as agent context.
//
// An agent asked to change a codebase answers questions first: what calls
// this, what is downstream, which components touch the payment data. Today it
// answers with grep, which finds strings, cannot tell a call from a comment,
// and has no way to report what it missed.
//
// This serves the same query engine `explain` uses, so an agent gets the same
// answers the CLI gives -- built from the evidence graph, carrying citations,
// and carrying what they could be WRONG about.
//
// That last part is why this is worth building rather than a convenience. An
// agent that reads "nothing calls PaymentService" and deletes it has done real
// damage if six files failed to parse. So the incompleteness report is
// asserted here in the TEXT an agent reads, not only in the structured
// payload, and the tool descriptions are asserted not to overclaim: a
// description promising "what will break" would produce exactly the confident
// wrong action this exists to prevent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot } from '../src/render.mjs';
import {
  handleMessage, handleLine, TOOLS, PROTOCOL_VERSION, ERRORS,
} from '../../mcp/src/server.mjs';
import { VERBS } from '../../explain/src/query.mjs';

const context = {
  model: {
    components: [
      { id: 'web', kind: 'frontend', labels: ['Web'], sources: [{ path: 'src/web.js' }] },
      { id: 'api', kind: 'backend', labels: ['API'], sources: [{ path: 'src/api.js' }] },
      { id: 'db', kind: 'database', labels: ['Database'], sources: [] },
    ],
    relationships: [
      { id: 'r1', from: 'web', to: 'api' },
      { id: 'r2', from: 'api', to: 'db' },
    ],
  },
  graph: { gaps: [{ path: 'src/worker.js', reason: 'computed import specifier at line 12' }] },
  serverInfo: { name: 'mirofy', version: '0.1.0' },
};

const call = (name, args = {}, id = 1) => handleMessage(
  { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, context,
);

test('[6.18] initialize answers with a protocol version and server identity', () => {
  const response = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, context);
  assert.equal(response.result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(response.result.serverInfo.name, 'mirofy');
  assert.ok(response.result.capabilities.tools, 'the server advertises no tool capability');
});

test('[6.18] a notification draws no response at all', () => {
  // Replying to a notification is a protocol violation, and clients surface it
  // as a stray message with no request to match. The absence IS the behaviour.
  assert.equal(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, context), null);
  assert.equal(handleLine('   ', context), null, 'a blank line produced a message');
});

test('[6.18] every advertised tool maps to a real query verb', () => {
  assert.ok(TOOLS.length >= 8, `only ${TOOLS.length} tools advertised`);
  for (const tool of TOOLS) {
    assert.ok(VERBS.includes(tool.name), `tool ${tool.name} has no matching query verb`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object input schema`);
    assert.ok(tool.description.length > 40, `${tool.name} has a description too thin to act on`);
  }
  // And the inverse: a verb the CLI answers but MCP hides would be a capability
  // an agent cannot reach.
  const advertised = new Set(TOOLS.map((t) => t.name));
  for (const verb of VERBS) assert.ok(advertised.has(verb), `verb ${verb} is not exposed as a tool`);
});

test('[6.18] no tool description promises more than the model can support', () => {
  // `impact` is the one that invites overclaiming. "What will break if I change
  // this" is what a reader wants; reachability is what the model knows.
  const impact = TOOLS.find((tool) => tool.name === 'impact');
  assert.match(impact.description, /REACHABILITY|reachability/);
  assert.match(impact.description, /not a prediction of breakage/i);
  for (const tool of TOOLS) {
    assert.doesNotMatch(tool.description, /\bwill break\b|\bguarantee|\bsafe to\b/i,
      `${tool.name} promises something the model cannot know`);
  }
});

test('[6.18] a tool answer carries its incompleteness in the text an agent reads', () => {
  // The structured payload is easy to assert and easy for a client to drop.
  // The prose is what most agents actually consume, so the warning has to be
  // in there too.
  const response = call('callers', { id: 'api' });
  const prose = response.result.content[0].text;
  assert.match(prose, /INCOMPLETE/);
  assert.match(prose, /src\/worker\.js/, 'the unread file is not named in the prose');

  const structured = JSON.parse(response.result.content[1].text);
  assert.equal(structured.incompleteness.complete, false);
  assert.equal(structured.results[0].id, 'web');
});

test('[6.18] a clean scan says so rather than staying quiet', () => {
  const clean = { ...context, graph: { gaps: [] } };
  const response = handleMessage(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'callers', arguments: { id: 'api' } } },
    clean,
  );
  assert.match(response.result.content[0].text, /Scan complete/);
});

test('[6.18] a bad component id comes back as tool content, not a protocol error', () => {
  // Most clients never show a JSON-RPC error to the model, so returning one
  // here would leave the agent with a silent failure it cannot correct. As
  // tool content with isError, the agent reads the message and retries.
  const response = call('callers', { id: 'nope' });
  assert.equal(response.result.isError, true);
  assert.equal(response.error, undefined, 'a caller mistake was raised as a protocol error');
  assert.match(response.result.content[0].text, /no component "nope"/);
});

test('[6.18] impact respects a depth argument', () => {
  const deep = JSON.parse(call('impact', { id: 'web', depth: 5 }).result.content[1].text);
  assert.deepEqual(deep.results.map((r) => r.id).sort(), ['api', 'db']);
  const shallow = JSON.parse(call('impact', { id: 'web', depth: 1 }).result.content[1].text);
  assert.deepEqual(shallow.results.map((r) => r.id), ['api']);
});

test('[6.18] protocol faults are reported with JSON-RPC codes', () => {
  const unknown = handleMessage({ jsonrpc: '2.0', id: 9, method: 'nope/nope' }, context);
  assert.equal(unknown.error.code, ERRORS.METHOD_NOT_FOUND);

  const malformed = handleLine('{not json', context);
  assert.equal(malformed.error.code, ERRORS.PARSE);

  const wrongShape = handleMessage({ id: 1, method: 'tools/list' }, context);
  assert.equal(wrongShape.error.code, ERRORS.INVALID_REQUEST);

  const noName = handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} }, context);
  assert.equal(noName.error.code, ERRORS.INVALID_PARAMS);
});

test('[6.18] an unknown notification is still silent', () => {
  // A notification with a method the server does not know must not produce an
  // error response either -- it has no id to answer to.
  assert.equal(handleMessage({ jsonrpc: '2.0', method: 'notifications/cancelled' }, context), null);
});

test('[6.18] the server runs over stdio and answers a real client exchange', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-mcp-'));
  const modelPath = path.join(tmp, 'model.json');
  const graphPath = path.join(tmp, 'graph.json');
  fs.writeFileSync(modelPath, JSON.stringify(context.model));
  fs.writeFileSync(graphPath, JSON.stringify(context.graph));

  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'impact', arguments: { id: 'web' } } },
  ].map((m) => JSON.stringify(m)).join('\n');

  const stdout = execFileSync(process.execPath, [
    path.join(coreRoot, '../mcp/bin/mcp.mjs'), '--model', modelPath, '--graph', graphPath,
  ], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

  const lines = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  // Three requests, one notification: exactly three responses. A fourth means
  // the notification was answered.
  assert.equal(lines.length, 3, `expected 3 responses, got ${lines.length}`);
  assert.deepEqual(lines.map((l) => l.id), [1, 2, 3]);
  assert.equal(lines[0].result.protocolVersion, PROTOCOL_VERSION);
  assert.ok(lines[1].result.tools.length >= 8);
  assert.match(lines[2].result.content[0].text, /INCOMPLETE/);
});

test('[6.18] the server refuses to start without a model rather than serving an empty one', () => {
  // Serving an empty model would answer every question with "nothing", which
  // is the most dangerous possible output: confident, structured, and wrong.
  assert.throws(() => execFileSync(process.execPath, [
    path.join(coreRoot, '../mcp/bin/mcp.mjs'), '--model', path.join(os.tmpdir(), 'no-such-model.json'),
  ], { input: '', stdio: ['pipe', 'pipe', 'pipe'] }), /./);
});
