// Proves the founding claim ("packages/core/ is byte-identical to the
// ancestor at 12106be, apart from four documented deviations" -- see
// docs/harvest.md) in CI, instead of leaving it a paragraph verified by
// hand once at harvest time.
//
// Before this script existed, nothing stopped a later change to
// packages/core/ -- tests, examples, schemas, CLI help, docs, anything --
// from landing without anyone noticing, as long as it didn't happen to move
// a golden digest (scripts/golden.mjs only renders five fixtures through
// five renderers; it does not read every byte of packages/core/).
//
// How it works: `scripts/harvest-manifest.json` commits the git blob SHA-1
// of every one of the 163 files that were confirmed byte-for-byte identical
// to tt-a1i/archify@12106be at harvest time, plus the three other documented
// deviations (removed / added / changed). This script recomputes each
// current file's git blob hash directly from the bytes on disk -- the exact
// `sha1("blob " + byteLength + "\0" + content)` git itself uses for
// `git hash-object` -- and compares it against the manifest. It does not
// shell out to git for the comparison and does not need the ancestor
// repository or network access at runtue -- only to enumerate which paths
// currently exist under packages/core/, which needs a local git checkout
// (this repository's own).
//
// Deliberately reads bytes off disk, not `git show HEAD:...` -- so an
// uncommitted working-tree edit to a harvested file is caught the moment
// this script runs, not only after it is committed.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const coreRoot = path.join(repoRoot, 'packages/core');
const manifestPath = path.join(here, 'harvest-manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const identicalByPath = new Map(manifest.identical.map((entry) => [entry.path, entry.sha1]));
const changed = new Set(manifest.deviations.changed);
const added = new Set(manifest.deviations.added);
const removed = new Set(manifest.deviations.removed);

function gitBlobSha1(buffer) {
  const header = `blob ${buffer.byteLength}\0`;
  return createHash('sha1').update(Buffer.concat([Buffer.from(header, 'utf8'), buffer])).digest('hex');
}

// Enumerate every path this repository currently considers part of
// packages/core/ -- tracked (regardless of modification state) plus
// untracked-but-not-gitignored (so a brand-new file dropped in is also
// caught) -- using git only to list paths, never to read their content.
function listCurrentPaths() {
  const tracked = execFileSync('git', ['ls-files', '--', 'packages/core'], { cwd: repoRoot, encoding: 'utf8' });
  const untracked = execFileSync(
    'git', ['ls-files', '--others', '--exclude-standard', '--', 'packages/core'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const paths = new Set();
  for (const line of `${tracked}\n${untracked}`.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    paths.add(trimmed.replaceAll('\\', '/').replace(/^packages\/core\//, ''));
  }
  return paths;
}

const currentPaths = listCurrentPaths();
const problems = [];

for (const [relPath, expectedSha1] of identicalByPath) {
  if (!currentPaths.has(relPath)) {
    problems.push(`MISSING (expected byte-identical to ancestor): ${relPath}`);
    continue;
  }
  const bytes = fs.readFileSync(path.join(coreRoot, relPath));
  const actualSha1 = gitBlobSha1(bytes);
  if (actualSha1 !== expectedSha1) {
    problems.push(`DRIFTED (no longer byte-identical to ancestor 12106be): ${relPath}\n    expected ${expectedSha1}\n    actual   ${actualSha1}`);
  }
}

for (const relPath of changed) {
  if (!currentPaths.has(relPath)) {
    problems.push(`MISSING (documented as intentionally changed from the ancestor): ${relPath}`);
  }
}

for (const relPath of added) {
  if (!currentPaths.has(relPath)) {
    problems.push(`MISSING (documented as added, no ancestor counterpart): ${relPath}`);
  }
}

for (const relPath of removed) {
  if (currentPaths.has(relPath)) {
    problems.push(`REAPPEARED (documented as removed from the ancestor's copy, but present here): ${relPath}`);
  }
}

const accountedFor = new Set([...identicalByPath.keys(), ...changed, ...added]);
const unexpected = [...currentPaths].filter((relPath) => !accountedFor.has(relPath)).sort();
for (const relPath of unexpected) {
  problems.push(`UNEXPECTED (present under packages/core/ but not in harvest-manifest.json at all -- a file was added since the harvest, or the manifest is stale): ${relPath}`);
}

const totalExpected = identicalByPath.size + changed.size + added.size;
console.log(`harvest-identity: comparing packages/core/ against tt-a1i/archify@${manifest.ancestorRevision.slice(0, 7)}`);
console.log(`  expected tracked files: ${totalExpected} (${identicalByPath.size} identical + ${changed.size} intentionally changed + ${added.size} added)`);
console.log(`  found:                  ${currentPaths.size}`);

if (problems.length) {
  console.error(`\nharvest-identity: FAILED -- ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nIf this change to packages/core/ is deliberate and reviewed, update scripts/harvest-manifest.json');
  console.error('(and docs/harvest.md\'s accounting) to describe the new, deliberate deviation from the ancestor.');
  process.exit(1);
}

console.log(`\nharvest-identity: OK -- ${identicalByPath.size} files byte-identical, ${changed.size} intentionally changed, ${added.size} added, ${removed.size} intentionally removed`);
process.exit(0);
