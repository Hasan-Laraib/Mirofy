// The parity harness: one line of accounting per harvested (H) row.
//
// Honesty rules (doc 37 §1 — a skipped test is skipped, never described as
// passing):
//   - a browser-deferred row is reported explicitly, by id, and is never
//     counted toward "proved" unless PRODUCT_CHROME actually ran it;
//   - a row with proof: null is reported as UNPROVEN, by id and reason, and
//     is never counted as passing;
//   - a suite failure fails the whole run.
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

let failures = 0;
for (const suite of suites) {
  const file = path.join(repoRoot, 'packages/conformance/test', suite);
  console.log(`\n-- ${suite} --`);
  try {
    execFileSync(process.execPath, ['--test', file], { stdio: 'inherit' });
  } catch {
    failures += 1;
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

console.log(`\nconformance: ${HARVESTED_ROWS.length} harvested rows total`);
console.log(`  proved:            ${failures === 0 ? provableRows.length : 0} / ${provableRows.length}${failures ? ' (suite failures below; none counted as passing)' : ''}`);
console.log(`  browser-deferred:  ${deferredBrowserRows.length} (never counted as passing; set PRODUCT_CHROME to run them)`);
if (deferredBrowserRows.length) {
  console.log(`    ids: ${deferredBrowserRows.map((row) => row.id).join(', ')}`);
}
console.log(`  UNPROVEN:          ${unproven.length} (no real assertion exists; never counted as passing)`);
for (const row of unproven) {
  console.log(`    ${row.id} — ${row.name}`);
  console.log(`      reason: ${row.note}`);
}

const accounted = provableRows.length + deferredBrowserRows.length + unproven.length;
if (accounted !== HARVESTED_ROWS.length) {
  console.error(`\naccounting error: ${accounted} rows accounted for, expected ${HARVESTED_ROWS.length}`);
  process.exit(1);
}

process.exit(failures === 0 ? 0 : 1);
