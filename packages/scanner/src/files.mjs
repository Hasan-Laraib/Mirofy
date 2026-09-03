// Which files exist in a repository, and which of those git is ignoring.
//
// Lifted out of the imports adapter so that the SCAN and the ADAPTERS agree on
// what "the files" means. They did not, and the disagreement was the quietest
// bug in this project.
//
// `scan.mjs` built its coverage denominator from the union of the adapters'
// inventories -- the files an adapter had looked at. Every adapter looks only
// at JavaScript and TypeScript (plus package.json and docker-compose), so on a
// Python repository the report read:
//
//     Of 0 files: 0 analysed, 0 with gaps, 0 not analysed.
//
// directly above its own sentence about how a percentage "silently claims its
// denominator is the whole system". The count was true and the impression was
// false, which is worse than a wrong number: a reader of coverage.md alone
// would conclude the repository had been fully understood.
//
// coverageReport already partitions correctly and already has a "not analysed
// -- no adapter examined these at all" bucket. That bucket could never fill,
// because a file no adapter handles was never a candidate in the first place.
// It is not that the tool could not read those files; it is that it never
// admitted they were there.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { posixPath } from './adapter.mjs';

// Directories that are never source: a package manager's, git's own, and this
// tool's own output.
//
// `dist` and `build` USED TO BE HERE, and the comment on gitIgnored below has
// always said why they should not be -- skipping by name over-reaches, and a
// repository with real source in `build/` loses it silently. moby/moby proved
// it: four Go packages named `build`, 53 imports of them, every one recorded
// as a gap against a directory the walk had refused to look at. The tool was
// reporting that it could not resolve something it had declined to see.
//
// Generated output is what git ignores, and git is asked directly a few lines
// down. A tracked directory called `build` is a directory somebody committed.
export const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'preview', 'scan']);

/**
 * Which of these paths git is ignoring.
 *
 * A hard-coded skip list cannot answer this. It skips `dist` and `build` by
 * NAME, which both over-reaches -- a repository with real source in `build/`
 * loses it silently, the exact omission this scanner exists to refuse -- and
 * under-reaches: generated directories with any other name are read as source.
 *
 * One batched call. If git cannot answer -- no repository, no git on PATH --
 * nothing is ignored, because "I could not check" must never quietly become
 * "there was nothing there".
 *
 * @param {string} root
 * @param {string[]} relatives
 * @returns {Set<string>}
 */
export function gitIgnored(root, relatives) {
  if (!relatives.length) return new Set();
  try {
    const result = spawnSync('git', ['check-ignore', '--stdin'], {
      cwd: root, input: relatives.join(String.fromCharCode(10)), encoding: 'utf8',
    });
    // 0 = some ignored, 1 = none ignored. Anything else is git failing, and a
    // failure is not evidence that the tree is clean.
    if (result.error) return new Set();
    if (result.status !== 0 && result.status !== 1) return new Set();
    return new Set(String(result.stdout || '').split(String.fromCharCode(10))
      .map((line) => posixPath(line.trim())).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Every file under `root`, skip-dirs and dotfiles aside. Ignoring not applied. */
function* walkAll(root, rel = '') {
  const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkAll(root, posixPath(path.join(rel, entry.name)));
    } else {
      yield posixPath(path.join(rel, entry.name));
    }
  }
}

/**
 * Every file in the repository that git is not ignoring — of ANY type.
 *
 * This is the coverage denominator. A `.py` file belongs in it exactly because
 * no adapter can read one: that is what makes it a visible absence rather than
 * an invisible one.
 *
 * @param {string} root
 * @returns {string[]} repo-relative POSIX paths, sorted
 */
export function repositoryFiles(root) {
  const found = [...walkAll(root)];
  const ignored = gitIgnored(root, found);
  return found.filter((file) => !ignored.has(file)).sort();
}
