// MCP server over stdio (row 6.18).
//
//   node packages/mcp/bin/mcp.mjs [--model scan/model.json] [--graph scan/evidence-graph.json]
//
// Add to an MCP client's config as a stdio server. Everything it answers comes
// from the system model built by `npm run scan` && `npm run model`.
//
// This file does nothing but move bytes: read a line, hand it to the pure
// handler, write a line. All the behaviour is in ../src/server.mjs, where it
// can be tested without a subprocess.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { handleLine } from '../src/server.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const flags = {
  model: path.join(repoRoot, 'scan', 'model.json'),
  graph: path.join(repoRoot, 'scan', 'evidence-graph.json'),
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i += 1; }
}

const modelPath = path.resolve(flags.model);
if (!fs.existsSync(modelPath)) {
  // stderr, never stdout: stdout is the protocol channel, and a stray line
  // there is a parse error in the client rather than a message anyone reads.
  process.stderr.write(`mirofy-mcp: no system model at ${modelPath}. `
    + 'Run `npm run scan` then `npm run model` first.\n');
  process.exit(2);
}

const context = {
  model: JSON.parse(fs.readFileSync(modelPath, 'utf8')),
  graph: fs.existsSync(path.resolve(flags.graph))
    ? JSON.parse(fs.readFileSync(path.resolve(flags.graph), 'utf8'))
    : null,
  serverInfo: { name: 'mirofy', version: '0.1.0' },
};

if (!context.graph) {
  process.stderr.write('mirofy-mcp: no evidence graph found; answers will report completeness they '
    + 'cannot verify. Run `npm run scan` to fix.\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  let response;
  try {
    response = handleLine(line, context);
  } catch (error) {
    // A throw here would kill the server mid-session and the client would see
    // a closed pipe with no explanation. Report it as a protocol error and
    // keep serving.
    response = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: `mirofy-mcp: ${error.message ?? error}` },
    };
  }
  if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
});

rl.on('close', () => process.exit(0));
