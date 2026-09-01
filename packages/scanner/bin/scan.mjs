// `npm run scan [-- <repoRoot>] [--out <dir>]`
//
// Runs every v1 adapter against a repository, assembles the evidence graph,
// and writes two artifacts:
//
//   evidence-graph.json — the graph, facts and gaps, via EvidenceGraph.toJSON
//   coverage.md         — the honest coverage report
//
// The revision is read from the target repository's own HEAD: facts are
// pinned to what was actually scanned, not to whatever repository the tool
// happens to run from.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { EvidenceGraph } from '../../evidence/src/graph.mjs';
import { coverageReport, renderCoverage } from '../../evidence/src/coverage.mjs';
import { repositoryFiles } from '../src/files.mjs';
import { runAdapter } from '../src/adapter.mjs';
import { workspaceAdapter } from '../src/adapters/workspace.mjs';
import { importsAdapter } from '../src/adapters/imports.mjs';
import { routesAdapter } from '../src/adapters/routes.mjs';
import { composeAdapter } from '../src/adapters/compose.mjs';

const ADAPTERS = [workspaceAdapter, importsAdapter, routesAdapter, composeAdapter];

function parseArgs(argv) {
  const args = { repoRoot: process.cwd(), out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      args.out = argv[i + 1];
      i += 1;
    } else if (!argv[i].startsWith('-')) {
      args.repoRoot = argv[i];
    }
  }
  args.repoRoot = path.resolve(args.repoRoot);
  args.out = path.resolve(args.out ?? path.join(args.repoRoot, 'scan'));
  return args;
}

const { repoRoot, out } = parseArgs(process.argv.slice(2));

let revision;
try {
  revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {
  console.error(`scan: ${repoRoot} is not a git repository (facts are pinned to a revision; there is nothing to pin to).`);
  process.exit(1);
}

const graph = new EvidenceGraph();
const inventories = {};
const allFiles = new Set();

for (const adapter of ADAPTERS) {
  const started = Date.now();
  const { facts, gaps, inventory } = await runAdapter(adapter, { repoRoot, revision });
  for (const fact of facts) graph.append(fact);
  for (const gap of gaps) graph.addGap(gap);
  inventories[adapter.id] = inventory;
  for (const file of inventory) allFiles.add(file);
  console.log(`scan: ${adapter.id.padEnd(10)} ${String(facts.length).padStart(5)} facts  ${String(gaps.length).padStart(3)} gaps  ${String(inventory.length).padStart(4)} files  ${Date.now() - started} ms`);
}

// THE DENOMINATOR IS THE REPOSITORY, not the union of what the adapters
// managed to look at. Built from the union, a repository written in a language
// no adapter handles reported "Of 0 files: 0 analysed, 0 not analysed" --
// every unread file invisible rather than listed. The files an adapter reached
// are still folded in, so a path examined outside the walk cannot fall out.
for (const file of repositoryFiles(repoRoot)) allFiles.add(file);
const report = coverageReport(graph, { inventories, allFiles: [...allFiles] });

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'evidence-graph.json'), JSON.stringify(graph.toJSON(), null, 2) + '\n');
fs.writeFileSync(path.join(out, 'coverage.md'), renderCoverage(report));

console.log(`scan: ${graph.facts({}).length} facts, ${graph.gaps().length} gaps at ${revision.slice(0, 7)}`);
console.log(`scan: coverage — ${report.analysed.length} analysed, ${report.gapped.length} with gaps, ${report.notAnalysed.length} not analysed, of ${report.totalFiles} files`);
console.log(`scan: wrote ${path.join(out, 'evidence-graph.json')}`);
console.log(`scan: wrote ${path.join(out, 'coverage.md')}`);
