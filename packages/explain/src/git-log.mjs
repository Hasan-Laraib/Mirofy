// Commits touching a path, read from a real repository.
//
// `timeline.mjs` takes `commitsFor` as an argument so that it stays a pure
// function the tests can drive with a fixed history. This is the
// implementation that reads an actual repository, kept BESIDE it rather than
// inside it -- both the `timeline` command and the MCP server need the same
// one, and two copies of a git invocation drift the moment either is touched.

import { execFileSync } from 'node:child_process';

// git's --format field separator, built from a char code rather than written
// as an escape.
//
// This is not fussiness. The separator here was a literal control byte in the
// source, and every tool that rewrites this file -- including the one that
// generates the published pipeline -- is one bad escape away from turning it
// into the two ordinary characters that would split nothing, hand every field
// back as a single string, and report a commit whose sha was the entire log
// line. A char code cannot be collapsed into something else.
const FIELD = String.fromCharCode(31);
const NEWLINE = String.fromCharCode(10);

/**
 * A `commitsFor(path)` function bound to one repository.
 *
 * Results are memoised per path: a model cites the same file from several
 * components, and `git log --follow` is the expensive part of a timeline.
 *
 * @param {string} repoRoot
 * @param {{since?: string}} [options]
 * @returns {(filePath: string) => Array<{sha: string, date: string, author: string, subject: string}>}
 */
export function commitsForRepo(repoRoot, options = {}) {
  const cache = new Map();
  return function commitsFor(filePath) {
    if (cache.has(filePath)) return cache.get(filePath);
    let commits = [];
    try {
      const format = ['%H', '%ad', '%an', '%s'].join(FIELD);
      const args = ['log', '--follow', '--date=iso-strict', `--format=${format}`];
      if (options.since) args.push(`--since=${options.since}`);
      args.push('--', filePath);
      const out = execFileSync('git', args, {
        cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      commits = out.split(NEWLINE).filter(Boolean).map((line) => {
        const [sha, date, author, subject] = line.split(FIELD);
        return { sha: String(sha).slice(0, 7), date, author, subject };
      });
    } catch {
      // A path git does not know is not an error: the model can cite a file
      // that was deleted, or that lives in another repository entirely. It
      // simply has no history here, and an empty list says exactly that.
      commits = [];
    }
    cache.set(filePath, commits);
    return commits;
  };
}
