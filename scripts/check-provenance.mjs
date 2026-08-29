// Proves the founding provenance claim in CI.
//
// Until the identifier rename, this script proved a *present-tense* claim:
// every file under packages/core/ is byte-identical, right now, to the
// ancestor at 12106be. That claim stopped being true by design when the code
// took on the product's own identifiers -- the rename moved thousands of
// bytes across the tree, and every one of the 163 blob hashes below moved
// with them.
//
// Deleting the check at that point would have been the easy move, and it
// would have taken the audit trail with it: nothing in the tree would still
// assert where this code came from, and the claim in docs/harvest.md would
// become a paragraph nobody could verify. So the check was converted rather
// than removed. What it proves now is the *historical* claim, which is
// permanent and still exactly as falsifiable:
//
//   at commit <provenanceAnchor>, every one of these 163 files was
//   byte-identical to tt-a1i/archify@12106be.
//
// The anchor is the last commit before the rename. Its tree is immutable, so
// the assertion has a fixed answer forever, and anyone can check it by hand
// with `git show <anchor>:packages/core/<path> | git hash-object --stdin`.
//
// Bytes come from `git cat-file blob` rather than from the working tree,
// because the working tree no longer holds the pre-rename content. cat-file
// emits the blob exactly as stored, with no checkout filters applied, which
// is what the manifest's hashes were computed over. The hash itself is
// recomputed here -- `sha1("blob " + byteLength + "\0" + content)`, the same
// construction `git hash-object` uses -- rather than read back from git's own
// object names, so the comparison stays independent of git's bookkeeping.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const manifestPath = path.join(here, 'harvest-manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const anchor = manifest.provenanceAnchor;
const anchorTag = manifest.provenanceTag;
const ancestorRepo = manifest.ancestorRepo;
const ancestorRev = manifest.ancestorRevision.slice(0, 7);

/** @type {string[]} */
const problems = [];

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

/**
 * Read one blob out of the anchor commit's tree. Returns null when the path
 * does not exist there.
 * @param {string} relPath path relative to packages/core/
 * @returns {Buffer | null}
 */
function readAtAnchor(relPath) {
  try {
    return execFileSync('git', ['cat-file', 'blob', `${anchor}:packages/core/${relPath}`], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
      // An absent path is an expected answer here (the `removed` deviations),
      // so git's own "fatal: path ... does not exist" must not reach the
      // console -- the caller turns null into a pass or a problem itself.
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

if (typeof anchor !== 'string' || !/^[0-9a-f]{40}$/.test(anchor)) {
  console.error('provenance: FAILED -- harvest-manifest.json has no valid provenanceAnchor');
  process.exit(1);
}

/**
 * Resolve a revision to a commit SHA, or null when it is not reachable here.
 * @param {string} rev
 * @returns {string | null}
 */
function resolveCommit(rev) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// The anchor commit has to survive as a commit, not just as a SHA written down
// in a JSON file. A squash- or rebase-merge of the branch that introduced it
// leaves it unreferenced, and deleting that branch makes it collectable -- at
// which point this gate fails forever and the only *apparent* remedy is to
// edit the manifest. A gate that teaches people to edit the evidence it checks
// is worse than no gate, so the anchor is also pinned by an annotated tag.
//
// The tag is resolved first, because it is the thing that keeps the commit
// reachable; the raw SHA is the fallback for a checkout that has the history
// but not the tags. If both resolve and disagree, the tag has been moved off
// the recorded anchor, and that is a hard failure rather than something to
// paper over: one of the two records of the claim is now wrong.
const taggedAnchor = typeof anchorTag === 'string' && anchorTag ? resolveCommit(anchorTag) : null;
const directAnchor = resolveCommit(anchor);

if (taggedAnchor && taggedAnchor !== anchor) {
  console.error(`provenance: FAILED -- tag ${anchorTag} points at ${taggedAnchor}`);
  console.error(`  but harvest-manifest.json records the anchor as ${anchor}.`);
  console.error('  The tag has been moved. Do not reconcile this by editing the manifest --');
  console.error('  work out which record is wrong first.');
  process.exit(1);
}

if (!taggedAnchor && !directAnchor) {
  console.error(`provenance: FAILED -- anchor commit ${anchor} is not present in this repository.`);
  console.error('  The historical claim cannot be verified from a shallow clone or a rewritten history.');
  console.error('');
  console.error('  Do NOT "fix" this by editing scripts/harvest-manifest.json. The anchor is');
  console.error('  evidence, and rewriting it to whatever is reachable proves nothing at all.');
  console.error('');
  console.error('  If this is a shallow clone:  git fetch --unshallow --tags');
  console.error(`  If the tag was never pushed: git push origin ${anchorTag}`);
  console.error(`  (The tag is what keeps ${anchor.slice(0, 7)} reachable after a squash or`);
  console.error('  rebase merge. It must never be deleted.)');
  process.exit(1);
}

let verified = 0;
for (const entry of manifest.identical) {
  const bytes = readAtAnchor(entry.path);
  if (bytes === null) {
    problems.push(`MISSING at anchor: ${entry.path}`);
    continue;
  }
  const actual = gitBlobSha1(bytes);
  if (actual !== entry.sha1) {
    problems.push(
      `HASH MISMATCH at anchor: ${entry.path}\n    manifest ${entry.sha1}\n    anchor   ${actual}`,
    );
    continue;
  }
  verified += 1;
}

// The other three documented deviation classes were part of the same claim,
// so they are anchored too: what was changed or added must have existed at
// the anchor, and what was removed must not have.
/** @type {Array<[string, string[], boolean]>} */
const deviationChecks = [
  ['intentionally changed from the ancestor', manifest.deviations.changed, true],
  ['added, with no ancestor counterpart', manifest.deviations.added, true],
  ["removed from the ancestor's copy", manifest.deviations.removed, false],
];

for (const [label, paths, mustExist] of deviationChecks) {
  for (const relPath of paths) {
    const present = readAtAnchor(relPath) !== null;
    if (present !== mustExist) {
      problems.push(
        present
          ? `REAPPEARED at anchor (documented as ${label}): ${relPath}`
          : `MISSING at anchor (documented as ${label}): ${relPath}`,
      );
    }
  }
}

const total = manifest.identical.length;
console.log(`provenance: verifying the harvest claim at anchor ${anchor.slice(0, 7)}`);
console.log(`  anchor:   ${anchor} (${taggedAnchor ? `tag ${anchorTag}` : 'SHA only -- tag not present, run `git fetch --tags`'})`);
console.log(`  ancestor: ${ancestorRepo}@${ancestorRev} (subtree ${manifest.ancestorSubtree})`);

if (problems.length) {
  console.error(`\nprovenance: FAILED -- ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nThis is a claim about an immutable commit, so a failure here does not mean');
  console.error('someone edited packages/core/ -- it means the recorded history itself no longer');
  console.error('supports the attribution in NOTICE. Investigate before changing the manifest.');
  process.exit(1);
}

console.log(
  `\nprovenance: ${verified}/${total} files at ${anchor.slice(0, 7)} were byte-identical to ${ancestorRepo}@${ancestorRev}`,
);
console.log(
  `  plus ${manifest.deviations.changed.length} intentionally changed, ` +
    `${manifest.deviations.added.length} added, ${manifest.deviations.removed.length} intentionally removed`,
);
process.exit(0);
