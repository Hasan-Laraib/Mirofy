import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Lowered 10 -> 6 in P1a Task 9, after removing ~3.4 MB of committed
// rendered examples (packages/core/examples/*.html) brought the tracked
// tree from 7.3 MB to a measured 3.9 MB. The ~2 MB of headroom below the
// new budget is reserved for P1b's evidence sources; a budget left at 10 MB
// after a 3.4 MB reduction would not be a gate.
// Raised 6 -> 8 on 2026-09-06. The 6 MB figure was chosen when the tree
// measured 3.9 MB, leaving 2.1 MB of headroom for evidence sources that have
// since landed. The tree now measures 6.0 MB, so the gate had 1,742 bytes of
// room and failed on a changelog paragraph -- which is not a bulk regression,
// and a gate that fires on prose teaches people to delete prose.
//
// 8 MB restores the same ~2 MB of absolute headroom the original choice had.
// What it is meant to catch has not changed and is worth naming: a committed
// build output, a directory of screenshots, a vendored dependency. Those
// arrive in hundreds of kilobytes at a time, not in paragraphs.
const BUDGET_MB = 8;
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

// The largest FILES are stable and mostly unavoidable; the largest AREAS are
// where growth actually shows up between releases, which is what a reader
// looking at a failure needs to see.
const byArea = new Map();
for (const { file, size } of largest) {
  const area = file.split('/').slice(0, 2).join('/');
  byArea.set(area, (byArea.get(area) ?? 0) + size);
}
console.log('largest areas:');
for (const [area, size] of [...byArea].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${(size / 1024).toFixed(0).padStart(7)} KB  ${area}`);
}

if (totalMb > BUDGET_MB) {
  console.error(`\nFAIL: tracked tree exceeds the ${BUDGET_MB} MB budget`);
  process.exit(1);
}
