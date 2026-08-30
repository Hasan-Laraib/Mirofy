// @ts-check
// Cross-platform test discovery. Passes explicit file paths to `node --test`.
//
// Why not `node --test` bare: it auto-discovers packages/core/test/, whose
// tests assert a repo structure that doesn't match this one and
// cannot pass here. Why not a shell glob: pwsh on windows-latest does not expand
// it. Why not `node --test <dir>`: errors with "Cannot find module" on Node 24.
// Why not Node's own --test glob: requires Node 21+, and the CI matrix includes 18.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(repoRoot, 'packages');
const EXCLUDED = new Set(['core']);

/**
 * @param {string} dir
 * @param {string[]} [found]
 * @returns {string[]}
 */
function findTests(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findTests(full, found);
    else if (entry.name.endsWith('.test.mjs')) found.push(path.relative(repoRoot, full));
  }
  return found;
}

/** @type {string[]} */
const files = [];
if (fs.existsSync(packagesDir)) {
  for (const pkg of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory() || EXCLUDED.has(pkg.name)) continue;
    const testDir = path.join(packagesDir, pkg.name, 'test');
    if (fs.existsSync(testDir)) findTests(testDir, files);
  }
}

if (files.length === 0) {
  console.log('no test files found');
  process.exit(0);
}

console.log(`running ${files.length} test file(s)`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
