// Operator command: checks whether scripts/roadmap-snapshot.mjs's frozen
// ROADMAP_SNAPSHOT still agrees with the live roadmap document
// (analysis/future/32-PARITY-AND-FEATURE-MATRIX.md in the sibling archify
// repo). Deliberately NOT wired into `npm run check` -- the same as
// `gallery` and `docs:pdf` -- because CI never checks out the sibling repo
// this command needs to read.
//
// Without this, docs/IMPLEMENTATION-STATUS.md's PLANNED section is
// checked for internal consistency only: `status:check` proves the
// committed file matches what matrix.mjs + the frozen snapshot would
// generate, never that the frozen snapshot still matches the live
// document. This command closes that second, wider gap.
//
// Re-parses the live file with the exact same parseRoadmapTable the
// snapshot was built with (scripts/roadmap-snapshot.mjs), then diffs by
// id: rows only in the live file are ADDED, rows only in the snapshot are
// REMOVED, rows in both with a different name/origin/phase are CHANGED.
// A missing live file is reported as "could not check" and exits distinct
// from both a clean and a dirty result -- silence must never look like a
// pass.
//
// Usage: node scripts/check-roadmap-snapshot.mjs [path-to-roadmap.md]
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROADMAP_PATH, parseRoadmapTable, ROADMAP_SNAPSHOT } from './roadmap-snapshot.mjs';

// Mirrors packages/core/bin/visual-check.mjs's EXIT convention: a skip is
// not a pass, and must not share an exit code with one.
const EXIT = Object.freeze({ pass: 0, fail: 1, skipped: 2 });

const target = process.argv[2] || DEFAULT_ROADMAP_PATH;

if (!fs.existsSync(target)) {
  console.error(`check:roadmap: could not check -- no file at ${target}`);
  console.error('This is not the same as "checked and clean": nothing was verified.');
  console.error('Pass an explicit path if the sibling archify repo lives elsewhere, e.g.:');
  console.error('  node scripts/check-roadmap-snapshot.mjs /path/to/32-PARITY-AND-FEATURE-MATRIX.md');
  process.exit(EXIT.skipped);
}

const liveRows = parseRoadmapTable(fs.readFileSync(target, 'utf8'));
const liveById = new Map(liveRows.map((row) => [row[0], row]));
const snapshotById = new Map(ROADMAP_SNAPSHOT.map((row) => [row[0], row]));

const added = [...liveById.keys()].filter((id) => !snapshotById.has(id)).sort();
const removed = [...snapshotById.keys()].filter((id) => !liveById.has(id)).sort();
const FIELDS = ['id', 'name', 'origin', 'phase'];
const changed = [];
for (const id of snapshotById.keys()) {
  if (!liveById.has(id)) continue;
  const snapshotRow = snapshotById.get(id);
  const liveRow = liveById.get(id);
  const diffs = FIELDS
    .map((field, index) => ({ field, was: snapshotRow[index], now: liveRow[index] }))
    .filter((entry) => entry.was !== entry.now);
  if (diffs.length) changed.push({ id, diffs });
}
changed.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

console.log(`check:roadmap: snapshot ${ROADMAP_SNAPSHOT.length} rows, live ${liveRows.length} rows (${path.resolve(target)})`);

if (!added.length && !removed.length && !changed.length) {
  console.log('check:roadmap: no divergence -- ROADMAP_SNAPSHOT still matches the live document.');
  process.exit(EXIT.pass);
}

if (added.length) {
  console.error(`\nADDED (in the live document, not in ROADMAP_SNAPSHOT): ${added.length}`);
  for (const id of added) {
    const [, name, origin, phase] = liveById.get(id);
    console.error(`  ${id} -- ${name} (${origin}, ${phase})`);
  }
}
if (removed.length) {
  console.error(`\nREMOVED (in ROADMAP_SNAPSHOT, not in the live document): ${removed.length}`);
  for (const id of removed) {
    const [, name, origin, phase] = snapshotById.get(id);
    console.error(`  ${id} -- ${name} (${origin}, ${phase})`);
  }
}
if (changed.length) {
  console.error(`\nCHANGED (same id, different field(s)): ${changed.length}`);
  for (const entry of changed) {
    console.error(`  ${entry.id}:`);
    for (const diff of entry.diffs) {
      console.error(`    ${diff.field}: ${JSON.stringify(diff.was)} -> ${JSON.stringify(diff.now)}`);
    }
  }
}
console.error('\nRun `npm run status` after hand-editing scripts/roadmap-snapshot.mjs to match.');
process.exit(EXIT.fail);
