// The parity harness: one line of accounting per imported (H) row.
//
// Honesty rules (doc 37 §1 — a skipped test is skipped, never described as
// passing):
//   - a browser-deferred row is reported explicitly, by id, and is never
//     counted toward "proved" unless MIROFY_CHROME actually ran it;
//   - a row with proof: null is reported as UNPROVEN, by id and reason, and
//     is never counted as passing;
//   - a suite failure fails the whole run;
//   - a row whose `testTitle` did not report a passing `ok` in its proof
//     file's TAP output is never counted as proved, even if the proof file
//     overall exited 0. Before fix-round-1, a row was counted "proved"
//     purely because its proof FILE exited 0 — a 14-row suite with only 4
//     real assertions inside it made all 14 read as proved. Fix-round-2
//     extended `testTitle` from the 14 browser rows to all 54 provable
//     rows (the 1 exception, 4.3, is a plain script with no TAP output —
//     see its comment in matrix.mjs) after the coordinator proved the same
//     defect at file scale by deleting a covering test from
//     validation-gates.test.mjs (21 rows sharing that one file) and
//     getting an unchanged "proved" tally. See matrix.mjs's testTitle doc
//     comment for the full incident and the per-row mapping rules.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPORTED_ROWS } from '../packages/conformance/src/matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const includeBrowser = process.env.MIROFY_CHROME ? true : false;

const unproven = IMPORTED_ROWS.filter((row) => row.proof === null);
const browserRows = IMPORTED_ROWS.filter((row) => row.browser);
const deferredBrowserRows = browserRows.filter(() => !includeBrowser);
const provableRows = IMPORTED_ROWS.filter((row) => row.proof !== null && (!row.browser || includeBrowser));

const suites = new Set(
  provableRows
    .map((row) => row.proof)
    .filter((proof) => proof.endsWith('.test.mjs')),
);

// Parses `node --test --test-reporter=tap` output into the set of test
// titles that reported a passing (non-skipped) `ok` line. TAP result lines
// are always flush-left ("ok N - <title>" / "not ok N - <title>"); the
// indented diagnostic YAML blocks under them are not, so anchoring to the
// start of the line is sufficient to avoid false matches inside those
// blocks.
function passingTapTitles(tapOutput) {
  const titles = new Set();
  for (const line of tapOutput.split('\n')) {
    const match = line.match(/^ok\s+\d+\s+-\s+(.*)$/);
    if (!match) continue;
    if (/#\s*SKIP\b/i.test(match[1])) continue;
    titles.add(match[1].replace(/\s*#.*$/, '').trim());
  }
  return titles;
}

const titledSuiteNames = new Set(
  IMPORTED_ROWS
    .filter((row) => row.testTitle)
    .map((row) => row.proof),
);

let failures = 0;
const titleFailures = []; // { id, name, missing: [title, ...] }

for (const suite of suites) {
  const file = path.join(repoRoot, 'packages/conformance/test', suite);
  console.log(`\n-- ${suite} --`);

  if (!titledSuiteNames.has(suite)) {
    try {
      execFileSync(process.execPath, ['--test', file], { stdio: 'inherit' });
    } catch {
      failures += 1;
    }
    continue;
  }

  // This suite has rows that must be verified individually: run once,
  // capturing TAP so it can be parsed, but still print it so a human
  // reading the run sees exactly what ran (TAP is verbose but legible).
  let tapOutput = '';
  let suiteFailed = false;
  try {
    tapOutput = execFileSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8' });
  } catch (error) {
    suiteFailed = true;
    tapOutput = String(error.stdout || '');
    if (error.stderr) console.error(String(error.stderr));
  }
  console.log(tapOutput);
  if (suiteFailed) failures += 1;

  const passedTitles = passingTapTitles(tapOutput);
  for (const row of IMPORTED_ROWS) {
    if (row.proof !== suite || !row.testTitle) continue;
    // A browser row sharing a suite with non-browser rows (e.g. 6.3 inside
    // delivery.test.mjs) is expected to skip -- not pass -- when no browser
    // is available; it is already reported once as browser-deferred below
    // and must not also be flagged here as a title-check failure.
    if (row.browser && !includeBrowser) continue;
    const requiredTitles = Array.isArray(row.testTitle) ? row.testTitle : [row.testTitle];
    const missing = requiredTitles.filter((title) => !passedTitles.has(title));
    if (missing.length) titleFailures.push({ id: row.id, name: row.name, missing });
  }
}

const scriptProofs = new Set(provableRows.map((row) => row.proof).filter((proof) => !proof.endsWith('.test.mjs')));

// Guard: a script proof (anything not ending .test.mjs, e.g. scripts/golden.mjs
// for row 4.3) has no TAP output and no testTitle mechanism to verify -- its
// exit code is the entire signal, applied identically to every row that names
// it. That is only honest when exactly one row depends on it (see 4.3's
// comment in matrix.mjs for the accepted exemption). If a second row pointed
// at the same script, both would silently ride to "proved" on that one exit
// code with no way to tell them apart -- the exact file-level-accounting
// defect two fix rounds were just spent closing (see this file's header
// comment), reopened via the script path instead of the test-file path.
for (const scriptProof of scriptProofs) {
  const rowsForScript = IMPORTED_ROWS.filter((row) => row.proof === scriptProof);
  if (rowsForScript.length > 1) {
    console.error(
      `\nconfiguration error: ${rowsForScript.length} rows map to the script proof "${scriptProof}" ` +
      `(${rowsForScript.map((row) => row.id).join(', ')}).\n` +
      'A script proof has no TAP output and cannot distinguish per-row outcomes -- its exit code is ' +
      'all-or-nothing across every row that names it, so more than one row sharing it cannot be ' +
      'honestly proved. Exactly one row may use a script proof. Give the additional row(s) their own ' +
      'testTitle-verified test in a *.test.mjs suite instead.',
    );
    process.exit(1);
  }
}

for (const scriptProof of scriptProofs) {
  console.log(`\n-- ${scriptProof} --`);
  try {
    execFileSync(process.execPath, [path.join(repoRoot, scriptProof)], { stdio: 'inherit' });
  } catch {
    failures += 1;
  }
}

const titleFailedIds = new Set(titleFailures.map((entry) => entry.id));
const trulyProvableRows = provableRows.filter((row) => !titleFailedIds.has(row.id));
if (titleFailures.length) failures += 1;

console.log(`\nconformance: ${IMPORTED_ROWS.length} imported rows total`);
console.log(`  proved:            ${failures === 0 ? trulyProvableRows.length : 0} / ${provableRows.length}${failures ? ' (suite or title-check failures below; none counted as passing)' : ''}`);
console.log(`  browser-deferred:  ${deferredBrowserRows.length} (never counted as passing; set MIROFY_CHROME to run them)`);
if (deferredBrowserRows.length) {
  console.log(`    ids: ${deferredBrowserRows.map((row) => row.id).join(', ')}`);
}
console.log(`  title-check failed: ${titleFailures.length} (proof file exited but the row's own named test did not pass -- never counted as proved)`);
for (const entry of titleFailures) {
  console.log(`    ${entry.id} — ${entry.name}`);
  for (const title of entry.missing) console.log(`      missing passing test: ${title}`);
}
console.log(`  UNPROVEN:          ${unproven.length} (no real assertion exists; never counted as passing)`);
for (const row of unproven) {
  console.log(`    ${row.id} — ${row.name}`);
  console.log(`      reason: ${row.note}`);
}

const accounted = trulyProvableRows.length + deferredBrowserRows.length + unproven.length + titleFailures.length;
if (accounted !== IMPORTED_ROWS.length) {
  console.error(`\naccounting error: ${accounted} rows accounted for, expected ${IMPORTED_ROWS.length}`);
  process.exit(1);
}

process.exit(failures === 0 ? 0 : 1);
