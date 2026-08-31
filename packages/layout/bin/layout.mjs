// `npm run layout [-- --view scan/view.json] [--out scan/diagram.json] [--json]`
//
// The missing step between `compile` and `render` (row 1.20).
//
// `compile` decides WHAT to show and deliberately emits no coordinates. This
// solves those into positions and writes a document the renderer accepts, so
// the pipeline runs end to end: scan -> model -> compile -> layout -> render.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { viewToDocument } from '../src/document.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const args = { view: path.join(repoRoot, 'scan', 'view.json'), out: path.join(repoRoot, 'scan', 'diagram.json') };
let json = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--json') { json = true; continue; }
  if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
}

const viewPath = path.resolve(args.view);
if (!fs.existsSync(viewPath)) {
  console.error(`layout: no view at ${viewPath}. Run \`npm run compile\` first.`);
  process.exit(2);
}

/**
 * The repository the citations should verify against.
 *
 * Read from git rather than asked for, because the answer is already on disk
 * and a flag nobody passes produces a diagram with its evidence quietly
 * stripped. If git cannot answer, the citations are dropped and the run says
 * so -- a citation that cannot be checked is worse than none.
 */
function resolveRepository() {
  if (args['repo-url'] && args.revision) return { url: args['repo-url'], revision: args.revision };
  try {
    const git = (...a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const url = git('remote', 'get-url', 'origin').replace(/\.git$/i, '');
    const revision = git('rev-parse', 'HEAD');
    if (!/^[a-f0-9]{40}$/i.test(revision)) return null;
    return { url, revision };
  } catch {
    return null;
  }
}

let result;
try {
  result = viewToDocument(JSON.parse(fs.readFileSync(viewPath, 'utf8')), {
    title: args.title,
    repository: resolveRepository(),
  });
} catch (error) {
  console.error(`layout: ${error.message}`);
  process.exit(2);
}

fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(result.document, null, 2)}\n`);

if (json) {
  console.log(JSON.stringify({ ...result.receipt, out: path.resolve(args.out) }, null, 2));
} else {
  console.log(`layout: ${result.receipt.nodes} nodes, ${result.receipt.edges} edges -> ${path.resolve(args.out)}`);
  if (result.receipt.pinned.length > 0) console.log(`layout: ${result.receipt.pinned.length} authored position(s) kept`);
  if (result.receipt.retyped.length > 0) {
    console.log(`layout: ${result.receipt.retyped.length} component(s) had no schema type and were rendered as `
      + '"external"; the original kind is kept as a tag.');
  }
  if (result.receipt.citationsDropped > 0) {
    console.log(`layout: ${result.receipt.citationsDropped} citation(s) dropped -- no repository could be `
      + 'resolved to verify them against. Pass --repo-url and --revision to keep them.');
  }
  if (result.receipt.omissions > 0) {
    console.log(`layout: the compiled view left out ${result.receipt.omissions} item(s); see scan/view.json`);
  }
}
