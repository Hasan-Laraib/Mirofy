// @ts-check
// The lockfile has to agree with the manifests.
//
//   node scripts/check-lockfile.mjs
//
// `npm ci` refuses to install when they disagree, and `npm ci` is what CI runs
// and what a contributor runs on a fresh clone. Nothing local notices, because
// node_modules is already sitting there -- so the whole gate can pass on a
// machine where the project would not install at all.
//
// That is not hypothetical: renaming the workspace package from @mirofy/core to
// mirofy passed `npm run check` locally and failed every one of the twelve CI
// jobs with "Missing: mirofy@0.1.0 from lock file".

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(repoRoot, 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.error('lockfile: package-lock.json is missing. Run `npm install`.');
  process.exit(1);
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

// Every workspace has to appear in the lockfile under its own name. This is the
// exact shape of the failure above: the package was renamed, the lockfile still
// described the old one, and `npm ci` had no entry for the new one.
const workspaces = fs.readdirSync(path.join(repoRoot, 'packages'))
  .map((name) => path.join('packages', name))
  .filter((relative) => fs.existsSync(path.join(repoRoot, relative, 'package.json')));

/** @type {string[]} */
const problems = [];
for (const relative of workspaces) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, relative, 'package.json'), 'utf8'));
  const key = relative.split(path.sep).join('/');
  const entry = lock.packages?.[key];
  if (!entry) {
    problems.push(`${key} is not in the lockfile at all`);
    continue;
  }
  if (entry.name !== manifest.name) {
    problems.push(`${key} is "${manifest.name}" but the lockfile says "${entry.name}"`);
  }
  if (entry.version !== manifest.version) {
    problems.push(`${manifest.name} is ${manifest.version} but the lockfile says ${entry.version}`);
  }
}

// And the authority on the question is npm itself. --dry-run installs nothing;
// it fails on exactly the mismatch `npm ci` would fail on, without needing a
// clean checkout to prove it.
if (problems.length === 0) {
  try {
    execFileSync(process.execPath, [
      String(process.env.npm_execpath ?? 'npm'), 'ci', '--dry-run', '--no-audit', '--no-fund',
    ], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    const detail = String(error.stderr || error.message);
    if (/can only install packages when/i.test(detail) || /Missing:/.test(detail)) {
      problems.push(detail.split('\n').filter((line) => /npm error/.test(line)).slice(0, 6).join('\n'));
    }
    // Any other failure is npm being unavailable or offline, not a mismatch.
    // The per-workspace checks above already ran; do not fail on a question
    // this could not ask.
  }
}

for (const problem of problems) console.log(`  FAIL  ${problem}`);
if (problems.length) {
  console.log(`\nlockfile: ${problems.length} mismatch(es). Run \`npm install\` and commit package-lock.json.`);
  console.log('`npm ci` refuses to install like this, so CI and every fresh clone would fail.');
  process.exit(1);
}
console.log(`lockfile: in sync with ${workspaces.length} workspace(s)`);
