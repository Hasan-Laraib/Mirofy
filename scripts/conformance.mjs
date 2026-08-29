// The parity harness: one line of accounting per harvested (H) row.
//
// Honesty rules (doc 37 §1 — a skipped test is skipped, never described as
// passing):
//   - a browser-deferred row is reported explicitly, by id, and is never
//     counted toward "proved" unless PRODUCT_CHROME actually ran it;
//   - a row with proof: null is reported as UNPROVEN, by id and reason, and
//     is never counted as passing;
//   - a suite failure fails the whole run;
//   - (fix-round-1) a row whose `testTitle` did not report a passing `ok`
//     in its proof file's TAP output is never counted as proved, even if
//     the proof file overall exited 0. Before this, a row was counted
//     "proved" purely because its proof FILE exited 0 — a suite with 14
//     rows mapped to it and only 4 real assertions inside it made all 14
//     read as proved. See viewer.browser.test.mjs's header comment and
//     matrix.mjs's testTitle doc comment for the full incident.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARVESTED_ROWS } from '../packages/conformance/src/matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const includeBrowser = process.env.PRODUCT_CHROME ? true : false;

const unproven = HARVESTED_ROWS.filter((row) => row.proof === null);
const browserRows = HARVESTED_ROWS.filter((row) => row.browser);
const deferredBrowserRows = browserRows.filter(() => !includeBrowser);
const provableRows = HARVESTED_ROWS.filter((row) => row.proof !== null && (!row.browser || includeBrowser));

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
  HARVESTED_ROWS
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
  for (const row of HARVESTED_ROWS) {
    if (row.proof !== suite || !row.testTitle) continue;
    const requiredTitles = Array.isArray(row.testTitle) ? row.testTitle : [row.testTitle];
    const missing = requiredTitles.filter((title) => !passedTitles.has(title));
    if (missing.length) titleFailures.push({ id: row.id, name: row.name, missing });
  }
}

const scriptProofs = new Set(provableRows.map((row) => row.proof).filter((proof) => !proof.endsWith('.test.mjs')));
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

console.log(`\nconformance: ${HARVESTED_ROWS.length} harvested rows total`);
console.log(`  proved:            ${failures === 0 ? trulyProvableRows.length : 0} / ${provableRows.length}${failures ? ' (suite or title-check failures below; none counted as passing)' : ''}`);
console.log(`  browser-deferred:  ${deferredBrowserRows.length} (never counted as passing; set PRODUCT_CHROME to run them)`);
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
if (accounted !== HARVESTED_ROWS.length) {
  console.error(`\naccounting error: ${accounted} rows accounted for, expected ${HARVESTED_ROWS.length}`);
  process.exit(1);
}

process.exit(failures === 0 ? 0 : 1);
