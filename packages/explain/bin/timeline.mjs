// `mirofy timeline [--limit 5] [--top 15] [--json] [--since <git-date>]`
// (in a checkout: `npm run timeline -- ...`)
//
// How the system changed, from the history it is already cited to (row 6.20).
//
// Reports CITED-FILE CHURN: commits that touched a file a component is cited
// to. That is a real signal about what is moving, and it is not the same as
// "the component changed" -- a file edit is not a shape change, and this says
// so rather than letting the reader assume.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline } from '../src/timeline.mjs';
import { commitsForRepo } from '../src/git-log.mjs';

// Which repository's history to read. Defaults to this checkout, so the npm
// script behaves exactly as it always has; `mirofy timeline` passes `--root`
// so an installed copy reads the user's repository rather than its own
// node_modules. Without it the command was correct and useless once installed:
// every path it asked git about belonged to the wrong repository.
const selfRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const flags = { limit: 5, top: 15 };
let json = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--json') { json = true; continue; }
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i += 1; }
}

const repoRoot = flags.root ? path.resolve(flags.root) : selfRoot;
if (!flags.model) flags.model = path.join(repoRoot, 'scan', 'model.json');

const modelPath = path.resolve(flags.model);
if (!fs.existsSync(modelPath)) {
  console.error(`timeline: no system model at ${modelPath}. Run \`mirofy map .\` to produce one `
    + '(in a checkout: `npm run scan && npm run model`).');
  process.exit(2);
}
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

// Bound to the repository named by --root, and memoised there.
const commitsFor = commitsForRepo(repoRoot, { since: flags.since });

const report = buildTimeline({ model, commitsFor, limit: Number(flags.limit) });

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`timeline: ${report.measures} across ${report.components} cited component(s)\n`);
for (const entry of report.entries.slice(0, Number(flags.top))) {
  const last = entry.lastChanged;
  console.log(`${String(entry.commitCount).padStart(4)} commit(s)  ${entry.label} (${entry.id})`);
  if (last) console.log(`              last ${last.date.slice(0, 10)} ${last.sha} ${last.subject.slice(0, 60)}`);
}

if (report.uncitedComponents > 0) {
  console.log(`\n${report.uncitedComponents} component(s) have no cited source paths, so history cannot`);
  console.log('speak to them. That is unknown, not unchanged.');
}
console.log(`\n${report.claim}`);
