// `npm run drift -- --base <graph.json> --head <graph.json> [--json] [--markdown]`
//
// Evidence drift between two scans (P5.1). Reports changed facts and nothing
// else: no score, no risk label, no merge recommendation.
//
// Exit code is 0 whatever it finds. Drift is information for a reviewer, not a
// verdict, and a command that failed the build on "a fact changed" would be
// failing every pull request that does any work.

import fs from 'node:fs';
import path from 'node:path';
import { evidenceDrift, renderDrift } from '../src/drift.mjs';

const flags = {};
const argv = process.argv.slice(2);
let json = false;
let markdown = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--json') { json = true; continue; }
  if (argv[i] === '--markdown') { markdown = true; continue; }
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i += 1; }
}

for (const side of ['base', 'head']) {
  if (!flags[side]) {
    console.error(`drift: --${side} <evidence-graph.json> is required.`);
    process.exit(2);
  }
  if (!fs.existsSync(path.resolve(flags[side]))) {
    console.error(`drift: no evidence graph at ${flags[side]}.`);
    process.exit(2);
  }
}

const read = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const report = evidenceDrift(read(flags.base), read(flags.head));

if (json) console.log(JSON.stringify(report, null, 2));
else if (markdown) console.log(renderDrift(report));
else {
  console.log(`drift: +${report.counts.added} -${report.counts.removed} ~${report.counts.moved} `
    + `(${report.counts.base} -> ${report.counts.head} facts)`);
  if (report.caveat) console.log(report.caveat);
  console.log(report.claim);
}
