// @ts-check
// CHANGELOG.md is a running record, and this is what keeps it running.
//
//   node scripts/check-changelog.mjs
//
// It fails when code has changed since the newest entry. That is the whole
// mechanism: a changelog nobody is obliged to update is a file that is accurate
// on the day it is written and misleading every day after, and the misleading
// version is worse than none — it reads like a record.
//
// It also checks that every path the changelog names still exists. A changelog
// pointing at `scripts/check-provenance.mjs` two months after that script was
// deleted is telling a reader to look for something that is not there.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

// What counts as "code changed". Documentation and the changelog itself are
// excluded: requiring an entry for a typo fix would train people to write
// entries that say nothing, which is how a record becomes noise.
const WATCHED = ['packages', 'scripts', '.github', 'fixtures', 'benchmarks'];

/** @type {Array<{ok: boolean, claim: string, detail: string}>} */
const results = [];

/** @param {string} claim @param {boolean} ok @param {string} detail */
function check(claim, ok, detail) {
  results.push({ claim, ok, detail });
}

if (!fs.existsSync(changelogPath)) {
  console.error('changelog: CHANGELOG.md is missing.');
  process.exit(1);
}
const changelog = fs.readFileSync(changelogPath, 'utf8');

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------
const dates = [...changelog.matchAll(/^## (\d{4}-\d{2}-\d{2})\s*$/gm)].map((match) => match[1]);
check('the changelog has dated entries', dates.length > 0,
  dates.length ? `${dates.length} entries, newest ${dates[0]}` : 'no "## YYYY-MM-DD" heading found');

const sorted = [...dates].sort().reverse();
check('entries are newest first', dates.join() === sorted.join(),
  dates.join() === sorted.join() ? 'in order' : `found ${dates.join(', ')}`);

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------
/**
 * The date of the newest commit touching code.
 *
 * Returns null when git cannot answer — a tarball, a shallow clone with no
 * history. Absent history is not evidence of a stale changelog, so the check
 * says it could not look rather than failing on a question it did not ask.
 */
function newestCodeChange() {
  try {
    const out = execFileSync('git', [
      'log', '-1', '--format=%cd', '--date=short', '--', ...WATCHED,
    ], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return null;
  }
}

const newestCode = newestCodeChange();
const newestEntry = sorted[0] ?? null;
if (newestCode === null) {
  check('the changelog covers the newest code change', true,
    'no git history available, so freshness was not checked');
} else {
  check('the changelog covers the newest code change',
    newestEntry !== null && newestEntry >= newestCode,
    newestEntry !== null && newestEntry >= newestCode
      ? `newest entry ${newestEntry} covers code last changed ${newestCode}`
      : `code changed ${newestCode}; the newest entry is ${newestEntry ?? '(none)'}`);
}

// ---------------------------------------------------------------------------
// Paths it names
// ---------------------------------------------------------------------------
// Only paths that look like real repository paths: a backticked token with a
// slash and an extension. `--format svg-static` and `data-preset` are not paths
// and must not be treated as broken ones.
const named = [...new Set(
  [...changelog.matchAll(/`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`/g)]
    .map((match) => match[1])
    .filter((token) => token.includes('/')),
)];
// A path that exists on this machine but is gitignored is NOT a path a reader
// can follow: it is generated output that a fresh clone does not have. Checking
// only fs.existsSync passed locally and failed all twelve CI legs at once,
// because the entry named `scan/diagram.json` -- real here, absent there. Asking
// git as well makes local and CI agree, which is the whole point of a gate.
const ignored = (relative) => {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relative], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false; // exit 1 means "not ignored"; no git at all also lands here
  }
};
const absent = named.filter((relative) => !fs.existsSync(path.join(repoRoot, relative)));
const generated = named.filter((relative) => !absent.includes(relative) && ignored(relative));
const unfollowable = [...absent, ...generated];
// Two different problems deserve two different sentences. "not found:
// scan/diagram.json" is confusing to read on a machine where that file is
// plainly sitting there -- the reason it fails is that a reader cloning this
// repository would not have it.
check('every path it names exists', unfollowable.length === 0,
  unfollowable.length
    ? [
      absent.length ? `not found: ${absent.join(', ')}` : '',
      generated.length ? `gitignored, so a fresh clone has no such file: ${generated.join(', ')}` : '',
    ].filter(Boolean).join('; ')
    : `${named.length} path(s) checked`);

// ---------------------------------------------------------------------------
const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.claim}`);
  console.log(`          ${result.detail}`);
}
console.log(`\nchangelog: ${results.length - failed.length}/${results.length} verified`);
if (failed.length) {
  console.log('\nAdd an entry for what changed. If the change genuinely does not deserve one,');
  console.log('say so in the entry rather than skipping it — "no behaviour change" is a fact');
  console.log('a reader wants, and an absent line is not.');
  process.exit(1);
}
