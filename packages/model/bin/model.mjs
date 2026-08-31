// `npm run model [-- <doc.json>...] [--graph <evidence-graph.json>]
//                 [--overrides <overrides.json>] [--out <model.json>]`
//
// Assembles the system model from authored diagram documents plus, if given,
// the evidence graph a scan produced. With no documents named it reads
// fixtures/sources/*.json, so the command does something useful in this
// repository without arguments.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceGraph } from '../../evidence/src/graph.mjs';
import { buildModel } from '../src/model.mjs';
import { deriveFromGraph } from '../src/derive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const args = { documents: [], graph: null, overrides: null, fromGraph: false, out: path.join(repoRoot, 'scan', 'model.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--from-graph') { args.fromGraph = true; continue; }
    if (flag === '--graph' || flag === '--overrides' || flag === '--out') {
      const key = flag.slice(2);
      args[key] = argv[i + 1];
      i += 1;
    } else if (!flag.startsWith('-')) {
      args.documents.push(flag);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.documents.length) {
  // With --from-graph the scan is the input; loading example diagrams too would
  // mix a model of THIS repository with descriptions of other systems.
  const fixtures = args.fromGraph ? null : path.join(repoRoot, 'fixtures', 'sources');
  if (fixtures && fs.existsSync(fixtures)) {
    args.documents = fs.readdirSync(fixtures)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(fixtures, name));
  }
}

if (!args.documents.length && !args.fromGraph) {
  console.error('model: no documents given and fixtures/sources holds none.');
  console.error('       Pass --from-graph to build the model from a scan instead.');
  process.exit(1);
}

const documents = args.documents.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

let graph = null;
if (args.graph) {
  if (!fs.existsSync(args.graph)) {
    console.error(`model: no evidence graph at ${args.graph}. Run \`npm run scan\` first, or omit --graph.`);
    process.exit(1);
  }
  graph = EvidenceGraph.fromJSON(JSON.parse(fs.readFileSync(args.graph, 'utf8')));
}

const overrides = args.overrides ? JSON.parse(fs.readFileSync(args.overrides, 'utf8')) : [];

let derivedReport = null;
if (args.fromGraph) {
  if (!graph) {
    console.error('model: --from-graph needs --graph <evidence-graph.json>. Run `npm run scan` first.');
    process.exit(2);
  }
  derivedReport = deriveFromGraph(graph);
}

const model = buildModel({ documents, graph, overrides });

if (derivedReport) {
  // Derived entries are ADDED, never substituted. An authored document and a
  // scan describe the same system from two directions, and dropping either
  // loses something the other cannot see.
  const known = new Set(model.components.map((component) => component.id));
  for (const component of derivedReport.components) {
    if (!known.has(component.id)) model.components.push(component);
  }
  const edges = new Set(model.relationships.map((r) => `${r.from} -> ${r.to}`));
  for (const relationship of derivedReport.relationships) {
    if (!edges.has(`${relationship.from} -> ${relationship.to}`)) model.relationships.push(relationship);
  }
  model.notModelled = derivedReport.notModelled;
  model.provenanceSummary = model.components.concat(model.relationships).reduce((summary, entry) => {
    const key = entry.provenance ?? 'unknown';
    return { ...summary, [key]: (summary[key] ?? 0) + 1 };
  }, {});
}

fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), JSON.stringify(model, null, 2) + '\n');

const derived = model.components.filter((c) => !c.authoredId).length;
console.log(`model: ${documents.length} documents -> ${model.components.length} components, `
  + `${model.relationships.length} relationships, ${model.boundaries.length} boundaries`);
console.log(`model: ${derived} component ids derived (stable only while their content is), `
  + `${model.components.length - derived} authored`);
console.log(`model: provenance ${JSON.stringify(model.provenanceSummary)}`);
for (const entry of model.notModelled ?? []) {
  console.log(`model: not modelled - ${entry.count} ${entry.what}`);
}
console.log(`model: wrote ${path.resolve(args.out)}`);
