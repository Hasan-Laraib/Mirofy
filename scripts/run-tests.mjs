// @ts-check
// Cross-platform test discovery. Passes explicit file paths to `node --test`.
//
// Why not a shell glob: pwsh on windows-latest does not expand
// it. Why not `node --test <dir>`: errors with "Cannot find module" on Node 24.
// Why not Node's own --test glob: requires Node 21+, and the CI matrix includes 18.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(repoRoot, 'packages');
// packages/core/test/ was excluded wholesale, on the grounds that its tests
// "assert a repo structure that doesn't match this one and cannot pass here".
// That was true of six files and false of the other seventy-six: most passed
// the moment anyone ran them, and the rest were a mix of upstream
// documentation expectations, one broken path repeated across files, and two
// real bugs -- one of them a `doctor` that crashed on the incomplete install
// it exists to diagnose.
//
// What remains here is only what genuinely cannot run in this job. Everything
// else is fixed, deleted with a reason, or skipped at the test with the
// platform fact that makes it unrunnable. `npm run test:quarantine` runs
// exactly these files.
const QUARANTINE = new Map([
  // Browser-dependent, and the conformance suite already owns the Chrome-gated
  // rows. These would fail here for want of a browser, not for want of
  // correctness, and `npm run check` deliberately runs without one.
  ['packages/core/test/repository-evidence.test.mjs', 'needs Chrome; conformance covers rows 2.2 and 2.6'],
  ['packages/core/test/desktop-reader-browser.test.mjs', 'needs Chrome; registers no tests without one'],
]);

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
    if (!pkg.isDirectory()) continue;
    const testDir = path.join(packagesDir, pkg.name, 'test');
    if (fs.existsSync(testDir)) findTests(testDir, files);
  }
}

const quarantined = process.argv.includes('--quarantine');
const normalise = (file) => file.split(String.fromCharCode(92)).join('/');
const selected = files.filter((file) => QUARANTINE.has(normalise(file)) === quarantined);

// A quarantine entry naming a file that no longer exists is a stale excuse.
for (const name of QUARANTINE.keys()) {
  if (!fs.existsSync(path.join(repoRoot, name))) {
    console.error(`quarantine names a file that does not exist: ${name}`);
    process.exit(1);
  }
}

files.length = 0;
files.push(...selected);

if (files.length === 0) {
  console.log('no test files found');
  process.exit(0);
}

console.log(`running ${files.length} test file(s)${quarantined ? ' (quarantined)' : ''}`);
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
