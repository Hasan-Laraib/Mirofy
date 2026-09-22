// A throwaway Git checkout plus a diagram that cites source in it: the two
// things every repository-evidence test needs before it can assert anything.
//
// Shared rather than copied because two suites now build the same fixture --
// the quarantined end-to-end file and the local-host file that runs in
// `npm test`. A copied fixture is a fixture that drifts, and a drifted
// fixture makes the two suites quietly stop testing the same repository.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const skillRoot = path.resolve(here, '..', '..');

export function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

/**
 * A committed two-file repository on `github.com`, and a diagram citing two
 * source locations in it. Returns `{ root, revision, diagram, input }`.
 */
export function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-evidence-repo-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'router.js'), 'export function route(input) {\n  return input.kind;\n}\n');
  fs.writeFileSync(path.join(root, 'src', 'store.js'), 'export const store = new Map();\n');
  git(root, 'init');
  git(root, 'config', 'user.name', 'Mirofy Tests');
  git(root, 'config', 'user.email', 'mirofy@example.test');
  git(root, 'remote', 'add', 'origin', 'git@github.com:example/evidence-repo.git');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  const revision = git(root, 'rev-parse', 'HEAD');

  const diagram = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', 'web-app.architecture.json'), 'utf8'));
  diagram.meta.repository = {
    url: 'https://github.com/example/evidence-repo',
    revision,
  };
  diagram.components[0].sources = [
    { path: 'src/router.js', line: 1, end_line: 3, label: 'Request router' },
    { path: 'src/store.js', line: 1 },
  ];
  const input = path.join(root, 'diagram.architecture.json');
  fs.writeFileSync(input, JSON.stringify(diagram, null, 2));
  return { root, revision, diagram, input };
}

/**
 * A diagram citing source evidence in `repo` (a `fixture()` result), for
 * tests that call `verifyRepositoryEvidence` directly rather than through the
 * CLI. Copies the diagram shape `fixture()` already proves works, overriding
 * only what the test needs to vary: the declared repository URL and how many
 * source locations are cited.
 *
 * `url` is always a well-formed URL (this task ships the unrecognised /
 * self-hosted host case -- a self-hosted GitLab, an internal Gitea, an
 * enterprise GitHub -- not a repository with no remote at all; that case is
 * deferred, see repository-evidence.mjs). The checkout's real `origin`
 * remote is repointed to the same URL, so `verifyRepositoryEvidence`'s
 * origin-mismatch check (unrelated to this task, and still required even
 * when neither side names a known forge) agrees with what the diagram
 * declares.
 */
export function diagramCitingSource(repo, url, { locations = 1 } = {}) {
  git(repo.root, 'remote', 'set-url', 'origin', url);
  const diagram = JSON.parse(JSON.stringify(repo.diagram));
  diagram.meta.repository = { url, revision: repo.revision };
  const candidates = [
    { path: 'src/router.js', line: 1, end_line: 3, label: 'Request router' },
    { path: 'src/store.js', line: 1 },
  ];
  diagram.components[0].sources = Array.from(
    { length: locations },
    (_, index) => candidates[index % candidates.length],
  );
  return diagram;
}
