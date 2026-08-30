// @ts-check
// Proves docs/CHANGELOG.md has not been forgotten. A changelog is narrative
// -- no script can judge whether its prose is accurate, complete, or well
// written. What CAN be checked mechanically is freshness: the file's most
// recent entry (its topmost `## ` section, since entries run
// reverse-chronological) must cite at least one commit SHA reachable from
// HEAD. That catches the common failure -- shipping several commits
// without ever touching the record -- and claims nothing more than that.
// Deliberately scoped to the newest entry only, not the whole document:
// older entries cite real, permanently-reachable commits forever, so a
// whole-file scan would never fail again once any one entry is honest --
// it would stop being a freshness check at all.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHANGELOG_PATH = 'docs/CHANGELOG.md';

/** @param {string} sha */
function isReachableFromHead(sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let text;
try {
  text = fs.readFileSync(CHANGELOG_PATH, 'utf8');
} catch {
  console.error(`check:changelog: ${CHANGELOG_PATH} does not exist.`);
  process.exit(1);
}

const headingIndex = text.indexOf('\n## ');
if (headingIndex === -1) {
  console.error(`check:changelog: no entry heading ("## ") found in ${CHANGELOG_PATH}.`);
  process.exit(1);
}
const nextHeadingIndex = text.indexOf('\n## ', headingIndex + 1);
const newestEntry = text.slice(
  headingIndex,
  nextHeadingIndex === -1 ? text.length : nextHeadingIndex,
);

/** @type {string[]} */
const shas = [...newestEntry.matchAll(/\b([0-9a-f]{7,40})\b/g)].map((m) => m[1]);

if (shas.length === 0) {
  console.error(`check:changelog: the newest entry in ${CHANGELOG_PATH} cites no commit SHA.`);
  process.exit(1);
}

if (!shas.some(isReachableFromHead)) {
  console.error(
    `check:changelog: no SHA in ${CHANGELOG_PATH}'s newest entry is reachable from HEAD -- ` +
      'the changelog looks stale. Add an entry for the current work before committing.',
  );
  process.exit(1);
}

console.log(`check:changelog: ${CHANGELOG_PATH}'s newest entry cites a commit reachable from HEAD`);
process.exit(0);
