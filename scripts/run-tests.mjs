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
// That was true of some of them and false of most: 54 of the 82 files passed
// the moment anyone ran them, including geometry (54 tests) and degraded (38).
// They had simply never been run, so nothing reported the difference -- and a
// change to port placement silently broke seven of them before this exclusion
// was opened.
//
// So the exclusion is now per-file and has to say why. A blanket skip hides
// how much is skipped; a list this long is uncomfortable to look at, which is
// the point. Entries come off it as they are fixed, and `npm run
// test:quarantine` runs exactly these files so you can see which ones have
// started passing.
const QUARANTINE = new Map([
  // Fork-era expectations: assert artifacts, page structure or copy that this
  // product does not produce.
  ['packages/core/test/architecture-delta.test.mjs', 'delta receipt shape predates the evidence spine'],
  ['packages/core/test/community-proof-intake.test.mjs', 'asserts an upstream intake flow that was not imported'],
  ['packages/core/test/cursor-onboarding.test.mjs', 'asserts upstream onboarding copy'],
  ['packages/core/test/landing.test.mjs', 'asserts a landing page this product does not build'],
  ['packages/core/test/preset-tryon.test.mjs', 'asserts upstream preset try-on copy'],
  ['packages/core/test/proof-aperture.test.mjs', 'asserts an upstream proof-aperture surface'],
  ['packages/core/test/readme-showcase.test.mjs', 'asserts the upstream README structure'],
  ['packages/core/test/skill-metadata.test.mjs', 'asserts upstream SKILL.md front matter'],
  ['packages/core/test/repository-language-metadata.test.mjs', 'asserts upstream repo language metadata'],

  // Real behaviour, real disagreement: these test things this product still
  // does, and they fail. Each is a genuine question to answer, not a rename.
  ['packages/core/test/cli.test.mjs', '3 of 33 fail: verb surface drifted from the upstream CLI'],
  ['packages/core/test/layout-rules.test.mjs', '9 of 96 fail: thresholds moved with the solver'],
  ['packages/core/test/output-path.test.mjs', '10 of 19 fail: output path conventions changed'],
  ['packages/core/test/generated-artifact-xml.test.mjs', 'asserts artifact XML this renderer no longer emits'],
  ['packages/core/test/preview.test.mjs', '1 of 10 fails: preview server contract drifted'],
  ['packages/core/test/preview-contract.test.mjs', 'asserts the upstream preview contract'],
  ['packages/core/test/reach-share-card.test.mjs', '1 of 6 fails: share card copy drifted'],
  ['packages/core/test/route-share-card.test.mjs', '1 of 8 fails: share card copy drifted'],
  ['packages/core/test/share-card-export.test.mjs', '1 of 8 fails: share card copy drifted'],
  ['packages/core/test/repair-receipt.test.mjs', '1 of 6 fails: receipt shape predates repair --safe'],
  ['packages/core/test/real-repository-proof.test.mjs', 'needs a real checkout the runner does not provide'],

  // Browser-dependent: the conformance suite owns the Chrome-gated rows.
  ['packages/core/test/repository-evidence.test.mjs', 'needs Chrome; conformance covers rows 2.2 and 2.6'],
  ['packages/core/test/desktop-reader-browser.test.mjs', 'registers no tests without Chrome'],
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
