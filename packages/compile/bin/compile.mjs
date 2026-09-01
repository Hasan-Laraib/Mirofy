// `npm run compile [-- --model scan/model.json] [--type architecture]
//                     [--scope system] [--budget 12] [--out scan/view.json]`
//
// Compiles a bounded view from the system model. Reports what it omitted and
// why, because a view that quietly drops half the system is the thing this
// compiler exists to prevent.

import fs from 'node:fs';
import path from 'node:path';
import { compileView } from '../src/compile.mjs';
import { DEFAULT_BUDGET } from '../src/request.mjs';

// The repository being worked on is the CURRENT DIRECTORY, not wherever this
// script happens to live. Deriving it from import.meta.url meant that pointing
// Mirofy at somebody else's repository half-worked and was worse than failing:
// scan.mjs already honoured cwd, so it wrote an evidence graph into their repo,
// and then this step read and wrote inside the MIROFY CHECKOUT -- silently
// overwriting Mirofy's own scan output and leaving the target repo with no
// diagram at all. `--root` overrides it for anyone who needs to.
const rootFlag = process.argv.indexOf('--root');
const repoRoot = path.resolve(rootFlag === -1 ? process.cwd() : process.argv[rootFlag + 1]);

const args = { model: path.join(repoRoot, 'scan', 'model.json'), type: 'architecture', scope: 'system', budget: DEFAULT_BUDGET, out: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const flag = argv[i];
  if (flag === '--budget') { args.budget = Number(argv[i + 1]); i += 1; continue; }
  if (flag.startsWith('--')) { args[flag.slice(2)] = argv[i + 1]; i += 1; }
}
args.out = path.resolve(args.out ?? path.join(repoRoot, 'scan', 'view.json'));

if (!fs.existsSync(args.model)) {
  console.error(`compile: no system model at ${args.model}. Run \`npm run model\` first.`);
  process.exit(1);
}

const model = JSON.parse(fs.readFileSync(args.model, 'utf8'));
const view = compileView(model, { type: args.type, scope: args.scope, budget: args.budget });

fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, JSON.stringify(view, null, 2) + '\n');

const omittedComponents = view.omissions.filter((entry) => entry.kind === 'component').length;
const omittedRelationships = view.omissions.filter((entry) => entry.kind === 'relationship').length;

console.log(`compile: ${model.components.length} components, ${model.relationships.length} relationships in the model`);
console.log(`compile: view holds ${view.nodes.length} nodes, ${view.edges.length} edges (budget ${view.budget}, planner ${view.planner})`);
console.log(`compile: omitted ${omittedComponents} components and ${omittedRelationships} relationships, each with a recorded reason`);
console.log(`compile: mainPath ${view.intent.mainPath.length ? view.intent.mainPath.join(' -> ') : '(none: no chain among the selected nodes)'}`);
console.log(`compile: wrote ${args.out}`);
