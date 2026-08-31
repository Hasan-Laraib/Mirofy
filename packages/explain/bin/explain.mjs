// `npm run explain -- <verb> [args] [--json] [--depth N] [--model path] [--graph path]`
//
// Graph queries over the system model (row 6.19).
//
//   explain callers api            what points at api
//   explain dependencies api       what api points at
//   explain impact api --depth 3   what is downstream of api
//   explain upstream api           what is upstream of api
//   explain path web db            a directed route between two components
//   explain find payment           components whose id, label, kind or metadata match
//   explain orphans                components nothing connects to
//   explain gaps                   what the scan could not read
//   explain summary                the shape of the model
//
// Every answer carries what it could be WRONG about. An empty result from a
// scan with unread files means "not found", never "does not exist", and this
// prints that distinction rather than leaving the reader to assume.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { explain, VERBS } from '../src/query.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const argv = process.argv.slice(2);
const flags = { depth: 3, model: path.join(repoRoot, 'scan', 'model.json'), graph: path.join(repoRoot, 'scan', 'evidence-graph.json') };
const positional = [];
let json = false;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--json') { json = true; continue; }
  if (arg === '--depth') { flags.depth = Number(argv[i + 1]); i += 1; continue; }
  if (arg.startsWith('--')) { flags[arg.slice(2)] = argv[i + 1]; i += 1; continue; }
  positional.push(arg);
}

const [verb, ...args] = positional;
if (!verb || !VERBS.includes(verb)) {
  console.error(`explain: expected one of ${VERBS.join(', ')}`);
  console.error('  explain callers <id> | dependencies <id> | impact <id> | upstream <id>');
  console.error('  explain path <from> <to> | find <term> | orphans | gaps | summary');
  process.exit(2);
}

function readJson(file, what) {
  if (!fs.existsSync(file)) {
    // Naming the command that produces the missing input, rather than the
    // missing file alone: the answer to "no model.json" is always `npm run model`.
    console.error(`explain: no ${what} at ${file}. Run \`npm run scan\` then \`npm run model\` first.`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const model = readJson(path.resolve(flags.model), 'system model');
const graph = fs.existsSync(path.resolve(flags.graph))
  ? JSON.parse(fs.readFileSync(path.resolve(flags.graph), 'utf8'))
  : null;

let answer;
try {
  answer = explain({ model, graph, verb, args, depth: flags.depth });
} catch (error) {
  console.error(`explain: ${error.message}`);
  process.exit(2);
}

if (json) {
  console.log(JSON.stringify(answer, null, 2));
  process.exit(0);
}

const label = (entry) => `${entry.label ?? entry.id}${entry.label && entry.label !== entry.id ? ` (${entry.id})` : ''}`;

if (verb === 'summary') {
  console.log(`model: ${answer.components} components, ${answer.relationships} relationships, ${answer.boundaries} boundaries`);
  console.log(`provenance: ${Object.entries(answer.provenance).map(([k, v]) => `${k} ${v}`).join(', ') || 'none recorded'}`);
} else if (verb === 'gaps') {
  console.log(`${answer.count} gap(s) the scanner could not analyse:`);
  for (const gap of answer.results) console.log(`  ${gap.path ?? gap.location?.path ?? '?'} — ${gap.reason ?? gap.message ?? 'unanalysable'}`);
} else if (verb === 'path') {
  if (!answer.found) console.log(answer.claim);
  else console.log(`${answer.hops} hop(s): ${answer.results.map(label).join(' -> ')}`);
} else {
  if (answer.subject) console.log(`${verb} of ${label(answer.subject)}:`);
  console.log(`${answer.count} result(s)`);
  for (const entry of answer.results) {
    const depth = entry.depth ? ` [+${entry.depth}]` : '';
    const cited = (entry.evidence || []).length;
    console.log(`  ${label(entry)}${depth}${cited ? ` — ${cited} citation(s)` : ' — no citations'}`);
  }
  if (answer.claim) console.log(`\n${answer.claim}`);
}

// Printed last and always, because it qualifies everything above it.
const { incompleteness } = answer;
console.log(`\n${incompleteness.complete ? 'complete: ' : 'INCOMPLETE: '}${incompleteness.note}`);
for (const gap of incompleteness.gaps.slice(0, 5)) console.log(`  unread: ${gap.path} — ${gap.reason}`);
