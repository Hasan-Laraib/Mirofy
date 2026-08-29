// Present-tense drift gate for packages/core/.
//
// There are two provenance-shaped checks in this repo and they answer
// different questions. Keeping them apart matters:
//
//   check:provenance  -- a HISTORICAL claim about the ancestor. "At the
//                        anchor commit, these 163 files were byte-identical
//                        to tt-a1i/archify@12106be." It reads an immutable
//                        commit, so it is a constant function of history: it
//                        can never fail because of a code change, and it can
//                        never notice one.
//
//   check:drift       -- a PRESENT-TENSE claim about intentionality. "Every
//                        file under packages/core/ is exactly what it was the
//                        last time someone deliberately re-baselined this
//                        manifest." It says nothing about the ancestor.
//
// Before the identifier rename, one script did both jobs, because
// "identical to the ancestor" and "not quietly edited" were the same
// sentence. The rename split them, and converting that script to the
// historical claim left the present-tense one with no owner. This restores
// it, because that job was always the more operationally useful of the two:
//
//   scripts/golden.mjs renders five fixtures through five renderers. Plenty
//   of packages/core/ is not on any of those five paths -- most of test/,
//   the CLI, the brand-mark data, schema branches no fixture exercises. An
//   edit there moves no golden digest and, without this check, is flagged by
//   nothing at all.
//
// Deliberately NOT "the current tree equals the anchor tree modulo the
// identifier substitutions". packages/core/ is expected to change from here
// on -- a regenerated template, a preview.mjs fix, examples removed -- and a
// gate phrased against the ancestor would fail on correct work and get
// switched off. The manifest is re-baselineable for exactly that reason. The
// point is not that packages/core/ never changes; it is that it never
// changes without someone saying so in a reviewable diff.
//
// Same shape as scripts/golden.mjs, including its --update rule.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const coreRoot = path.join(repoRoot, 'packages/core');
const manifestPath = path.join(here, 'core-manifest.json');
const writeMode = process.argv.includes('--update');

if (writeMode && process.env.CI) {
  console.error('refusing to re-baseline the core manifest in CI: --update must be a deliberate local action');
  console.error('a re-baseline in CI hides exactly the unreviewed change this gate exists to catch;');
  console.error('run it locally and commit the manifest diff for review');
  process.exit(1);
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function gitBlobSha1(buffer) {
  const header = `blob ${buffer.byteLength}\0`;
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(header, 'utf8'), buffer]))
    .digest('hex');
}

// Tracked files, plus untracked-but-not-ignored ones, so a new file dropped
// into packages/core/ is caught rather than ignored for being unknown.
/** @returns {string[]} */
function listCorePaths() {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const args of [
    ['ls-files', '--', 'packages/core'],
    ['ls-files', '--others', '--exclude-standard', '--', 'packages/core'],
  ]) {
    const out = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // git ls-files reports forward slashes, on Windows included.
      paths.add(trimmed.replace(/^packages[/]core[/]/, ''));
    }
  }
  return [...paths].sort();
}

/** @returns {Record<string, string>} */
function hashCore() {
  /** @type {Record<string, string>} */
  const files = {};
  for (const relPath of listCorePaths()) {
    // A tracked file deleted from the working tree is still listed by
    // `git ls-files`. Skipping it here is what lets the comparison below
    // report it as REMOVED, instead of this loop dying on ENOENT and
    // burying the answer under a stack trace.
    const abs = path.join(coreRoot, relPath);
    if (!fs.existsSync(abs)) continue;
    files[relPath] = gitBlobSha1(fs.readFileSync(abs));
  }
  return files;
}

const current = hashCore();

if (writeMode) {
  const entries = Object.keys(current).length;
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ schemaVersion: 1, root: 'packages/core', files: current }, null, 2)}\n`,
  );
  console.log(`wrote ${entries} core blob hashes`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
/** @type {Record<string, string>} */
const expected = manifest.files;

/** @type {Array<[string, string]>} */
const problems = [];

for (const relPath of Object.keys(expected).sort()) {
  if (!(relPath in current)) {
    problems.push(['REMOVED', relPath]);
    continue;
  }
  if (current[relPath] !== expected[relPath]) {
    problems.push(['CHANGED', `${relPath}\n              ${expected[relPath]} -> ${current[relPath]}`]);
  }
}

for (const relPath of Object.keys(current).sort()) {
  if (!(relPath in expected)) problems.push(['ADDED', relPath]);
}

const total = Object.keys(expected).length;

if (problems.length) {
  console.error(`core-drift: FAILED -- ${problems.length} unreviewed change(s) under packages/core/\n`);
  for (const [kind, detail] of problems) console.error(`  ${kind.padEnd(8)} ${detail}`);
  console.error('\nThis gate does not say the change is wrong -- it says nobody has said it is right.');
  console.error('If it is deliberate and reviewed, re-baseline it and commit the manifest diff');
  console.error('alongside the change, so the two are reviewed together:');
  console.error('\n  node scripts/check-core-drift.mjs --update\n');
  process.exit(1);
}

console.log(`core-drift: ${total}/${total} files under packages/core/ match the reviewed manifest`);
process.exit(0);
