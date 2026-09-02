// @ts-check
// Temporary directories: nothing may create one the runner cannot clean up.
//
//   node scripts/check-scratch.mjs
//
// scripts/scratch-cleanup.mjs removes every scratch directory a test process
// makes, by patching `fs.mkdtempSync` on the DEFAULT export -- which is the
// object `import fs from 'node:fs'` hands you. A namespace import
// (`await import('node:fs')`, or `import * as fs`) holds the original named
// binding instead and walks straight past the patch.
//
// That is not hypothetical. It was the last leak standing after the guard went
// in: two tests using `const fs = await import('node:fs')` kept leaving
// directories behind while every other file was clean, and the guard's own
// header already claimed a check for it that did not exist.
//
// The failure mode is quiet by construction -- everything passes, a few
// directories accumulate per run, and a year later the disk is full and the
// gate fails at random in a different place each time. That is exactly how the
// 20,460 directories and 35.4 GB that prompted all of this went unnoticed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

/** @param {string} claim @param {boolean} ok @param {string} detail */
function check(claim, ok, detail) {
  results.push({ claim, ok, detail });
}

/** Every .mjs under the repository, minus the places that are not source. */
function sources(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules'
      || entry.name === 'dist' || entry.name === 'site' || entry.name === 'scan') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, found);
    else if (entry.name.endsWith('.mjs')) found.push(full);
  }
  return found;
}

// This file and the guard both QUOTE the patterns they are about, so scanning
// them finds the literals in their own regexes and comments. Excluded by name
// rather than by making the matcher cleverer, which is how a matcher stops
// catching the thing it was written for.
const DESCRIBES_THE_RULE = ['scripts/check-scratch.mjs', 'scripts/scratch-cleanup.mjs'];
const files = sources(repoRoot).filter((file) => {
  const rel = path.relative(repoRoot, file).split(path.sep).join('/');
  return !DESCRIBES_THE_RULE.includes(rel);
});

// A namespace import of node:fs, in any file that also makes a temp directory.
const namespaced = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('mkdtemp')) continue;
  // Match the BAD form directly, per occurrence. Inferring it as "has a
  // namespace import AND lacks a default one" was per-FILE, so a file with one
  // of each passed -- and that is exactly the file this was written for, which
  // has two such imports. A plant flipping one of them went undetected.
  const bad = [
    ...text.matchAll(/(?:const|let|var)\s+\w+\s*=\s*await import\(['"]node:fs['"]\)/g),
    ...text.matchAll(/import \* as \w+ from ['"]node:fs['"]/g),
  ];
  for (let i = 0; i < bad.length; i += 1) {
    namespaced.push(`${path.relative(repoRoot, file)}: ${bad[i][0].trim()}`);
  }
}
check(
  'every file that makes scratch reaches fs through the default export',
  namespaced.length === 0,
  namespaced.length === 0
    ? `${files.filter((f) => fs.readFileSync(f, 'utf8').includes('mkdtemp')).length} file(s) make scratch, all patchable`
    : `unpatchable binding: ${namespaced.join('; ')}`,
);

// The runners have to actually load the guard, or none of the above matters.
for (const runner of ['scripts/run-tests.mjs', 'scripts/conformance.mjs']) {
  const text = fs.readFileSync(path.join(repoRoot, runner), 'utf8');
  check(`${runner} loads the cleanup guard`, text.includes('scratch-cleanup'),
    text.includes('scratch-cleanup') ? 'passes --import' : 'spawns node without it');
}

// And no TEST may write scratch inside packages/. A command staging output
// next to its own output file is fine and is not this; the hazard is a test
// dropping a directory into a package that other tests read, which is what made
// build-skill and degraded.test.mjs fail at random on test ordering.
//
// A root is acceptable when it is os.tmpdir(), or a variable this same file
// assigns from os.tmpdir(), or the one declared scratch directory.
const strays = [];
for (const file of files) {
  // Normalised first: a character class written for both separators collapsed
  // to just the forward slash on the way into this file, so on Windows it
  // matched nothing, skipped every file, and the check passed on an empty set.
  const unixPath = file.split(path.sep).join('/');
  if (!unixPath.includes('/test/')) continue;
  const text = fs.readFileSync(file, 'utf8');
  const fromTmp = new Set(
    [...text.matchAll(/const\s+(\w+)\s*=[^;]*tmpdir\(\)/g)].map((match) => match[1]),
  );
  for (const match of text.matchAll(/mkdtempSync\(path\.join\(([^,]+),/g)) {
    const root = match[1].trim();
    if (/tmpdir\(\)/.test(root) || fromTmp.has(root) || root === 'scratchRoot') continue;
    strays.push(`${path.relative(repoRoot, file)} -> ${root}`);
  }
}
check(
  'no test writes scratch inside a package other tests read',
  strays.length === 0,
  strays.length === 0 ? 'every test scratches in the system temp directory, or the declared one'
    : `writes into a package: ${strays.join('; ')}`,
);

// Directories made with plain mkdirSync inside packages/, too. The first
// version of this check only knew about mkdtempSync, and the thing that was
// actually breaking the suite was `fs.mkdirSync(packages/core/__bundle_probe__)`
// -- a live directory appearing and vanishing inside a package that two other
// tests copy wholesale, which failed them with ENOENT on an entry that had just
// gone. Dot-prefixed names are exempt: everything that reads packages/core
// already skips those, which is what makes them safe.
const madeInPackages = [];
for (const file of files) {
  const unixPath = file.split(path.sep).join('/');
  if (!unixPath.includes('/test/')) continue;
  const text = fs.readFileSync(file, 'utf8');
  // The path is built into a variable and the variable is what gets created:
  //   const invented = path.join(repoRoot, 'packages/core/__bundle_probe__');
  //   fs.mkdirSync(invented, { recursive: true });
  // Matching `mkdirSync(path.join(...))` inline found nothing here, and the
  // check passed on the very case it was written for.
  for (const match of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*path\.join\([^;]*?'([^']*packages\/[^']*)'\s*\)/g)) {
    const [, name, made] = match;
    const leaf = made.slice(made.lastIndexOf('/') + 1);
    if (leaf.startsWith('.')) continue;
    // A plain string test, not a regex inside a template literal: there the
    // backslashes resolve as string escapes before RegExp sees them, so the
    // pattern became mkdirSync(s*<name><backspace> and matched nothing.
    if (!text.includes('mkdirSync(' + name) && !text.includes('mkdirSync( ' + name)) continue;
    madeInPackages.push(`${path.relative(repoRoot, file)} -> ${made}`);
  }
}

check(
  'no test creates a visible directory inside a package',
  madeInPackages.length === 0,
  madeInPackages.length === 0 ? 'nothing appears and vanishes inside a package mid-run'
    : `appears inside a package: ${madeInPackages.join('; ')}`,
);

for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.claim}`);
  console.log(`          ${result.detail}`);
}
const failed = results.filter((result) => !result.ok);
console.log(`\nscratch: ${results.length - failed.length}/${results.length} verified`);
if (failed.length) {
  console.error('\nA leaked temp directory is invisible until the disk is full, and then it '
    + 'looks like\na flaky test suite rather than a full disk. Fix it here.');
  process.exit(1);
}
