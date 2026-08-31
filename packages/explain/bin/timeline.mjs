// `npm run timeline -- [--limit 5] [--top 15] [--json] [--since <git-date>]`
//
// How the system changed, from the history it is already cited to (row 6.20).
//
// Reports CITED-FILE CHURN: commits that touched a file a component is cited
// to. That is a real signal about what is moving, and it is not the same as
// "the component changed" -- a file edit is not a shape change, and this says
// so rather than letting the reader assume.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTimeline } from '../src/timeline.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const flags = { limit: 5, top: 15, model: path.join(repoRoot, 'scan', 'model.json') };
let json = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--json') { json = true; continue; }
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i += 1; }
}

const modelPath = path.resolve(flags.model);
if (!fs.existsSync(modelPath)) {
  console.error(`timeline: no system model at ${modelPath}. Run \`npm run scan\` then \`npm run model\`.`);
  process.exit(2);
}
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

const cache = new Map();
/** Commits touching one path, newest first. */
function commitsFor(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  let commits = [];
  try {
    const args = ['log', '--follow', '--date=iso-strict', '--format=%H%ad%an%s'];
    if (flags.since) args.push(`--since=${flags.since}`);
    args.push('--', filePath);
    const out = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    commits = out.split('\n').filter(Boolean).map((line) => {
      const [sha, date, author, subject] = line.split('');
      return { sha: sha.slice(0, 7), date, author, subject };
    });
  } catch {
    // A path git does not know is not an error: the model can cite a file that
    // was deleted, or that lives in another repository entirely. It simply has
    // no history here, and an empty list says exactly that.
    commits = [];
  }
  cache.set(filePath, commits);
  return commits;
}

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
