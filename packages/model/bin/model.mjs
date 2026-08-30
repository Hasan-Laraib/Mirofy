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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const args = { documents: [], graph: null, overrides: null, out: path.join(repoRoot, 'scan', 'model.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
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
  const fixtures = path.join(repoRoot, 'fixtures', 'sources');
  if (fs.existsSync(fixtures)) {
    args.documents = fs.readdirSync(fixtures)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(fixtures, name));
  }
}

if (!args.documents.length) {
  console.error('model: no documents given and fixtures/sources holds none.');
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

const model = buildModel({ documents, graph, overrides });

fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), JSON.stringify(model, null, 2) + '\n');

const derived = model.components.filter((c) => !c.authoredId).length;
console.log(`model: ${documents.length} documents -> ${model.components.length} components, `
  + `${model.relationships.length} relationships, ${model.boundaries.length} boundaries`);
console.log(`model: ${derived} component ids derived (stable only while their content is), `
  + `${model.components.length - derived} authored`);
console.log(`model: provenance ${JSON.stringify(model.provenanceSummary)}`);
console.log(`model: wrote ${path.resolve(args.out)}`);
