import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Lowered 10 -> 6 in P1a Task 9, after removing ~3.4 MB of committed
// rendered examples (packages/core/examples/*.html) brought the tracked
// tree from 7.3 MB to a measured 3.9 MB. The ~2 MB of headroom below the
// new budget is reserved for P1b's evidence sources; a budget left at 10 MB
// after a 3.4 MB reduction would not be a gate.
const BUDGET_MB = 6;
// `git ls-files` lists what is ALREADY tracked, which made this check blind to
// exactly the change most likely to break it: five new screenshots pushed the
// tree to 6.1 MB, and the gate passed locally -- the files were still untracked
// -- then failed on every CI leg after the commit made them tracked. The only
// way to find out was to push.
//
// `--others --exclude-standard` adds files that are not tracked and not
// ignored: precisely the ones the next `git add` will pick up. Counting them
// means the number here is the number CI will see.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

let total = 0;
const largest = [];
for (const file of files) {
  let size = 0;
  try { size = fs.statSync(path.resolve(file)).size; } catch { continue; }
  total += size;
  largest.push({ file, size });
}
largest.sort((a, b) => b.size - a.size);

const totalMb = total / 1024 / 1024;
console.log(`tracked + new: ${totalMb.toFixed(1)} MB / ${BUDGET_MB} MB budget`);
console.log('largest files:');
for (const { file, size } of largest.slice(0, 5)) {
  console.log(`  ${(size / 1024).toFixed(0).padStart(7)} KB  ${file}`);
}

if (totalMb > BUDGET_MB) {
  console.error(`\nFAIL: tracked tree exceeds the ${BUDGET_MB} MB budget`);
  process.exit(1);
}
