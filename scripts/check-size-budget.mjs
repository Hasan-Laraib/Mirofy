import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BUDGET_MB = 20;
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
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
console.log(`tracked tree: ${totalMb.toFixed(1)} MB / ${BUDGET_MB} MB budget`);
console.log('largest tracked files:');
for (const { file, size } of largest.slice(0, 5)) {
  console.log(`  ${(size / 1024).toFixed(0).padStart(7)} KB  ${file}`);
}

if (totalMb > BUDGET_MB) {
  console.error(`\nFAIL: tracked tree exceeds the ${BUDGET_MB} MB budget`);
  process.exit(1);
}
