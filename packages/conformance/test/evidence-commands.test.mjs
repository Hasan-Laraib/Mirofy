// Rows 6.19, 3.15, 6.20, 6.17 — the four evidence commands, reachable.
//
// `explain`, `assert`, `timeline` and `drift` were written, tested and shipped
// INSIDE the published tarball, and no user could reach any of them. They
// existed only as root-repo npm scripts, so they ran for someone who had
// cloned the monorepo and for nobody else. The roadmap marked all four
// shipped; the README documented all four in the product's own voice, as
// `npm run assert`; and every gate was green throughout, because each one
// asked a question that was true.
//
// Two things were wrong and neither was tested:
//
//   1. The CLI did not route them at all.
//   2. Their defaults resolved against their own installation directory
//      rather than the user's repository -- so even reached, `timeline` would
//      have read the history of node_modules.
//
// The tests below are written against (2) in particular. Passing --model
// explicitly would exercise the command and walk straight past the bug, so
// every command here runs from inside a throwaway repository with no explicit
// paths, and asserts it answered about THAT repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { coreRoot } from '../src/render.mjs';

const cli = path.join(coreRoot, 'bin/mirofy.mjs');
const NEWLINE = String.fromCharCode(10);

/** A tiny two-package repository with one real import between them. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-evidence-'));
  fs.mkdirSync(path.join(root, 'packages/api/src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages/store/src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ name: 'subject', version: '0.0.0', workspaces: ['packages/*'] }));
  fs.writeFileSync(path.join(root, 'packages/api/package.json'),
    JSON.stringify({ name: '@subject/api', version: '0.0.0' }));
  fs.writeFileSync(path.join(root, 'packages/store/package.json'),
    JSON.stringify({ name: '@subject/store', version: '0.0.0' }));
  fs.writeFileSync(path.join(root, 'packages/api/src/index.mjs'),
    `import { save } from '../../store/src/index.mjs';${NEWLINE}export const app = () => save();${NEWLINE}`);
  fs.writeFileSync(path.join(root, 'packages/store/src/index.mjs'),
    `export const save = () => 1;${NEWLINE}`);
  for (const args of [['init', '-q'], ['add', '-A'],
    ['-c', 'user.email=probe@local', '-c', 'user.name=probe', 'commit', '-qm', 'the subject commit']]) {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  }
  execFileSync(process.execPath, [cli, 'map', '.', 'out.html', '--out', './scan', '--quiet'],
    { cwd: root, stdio: 'ignore' });
  return root;
}

/** Run the CLI inside a repository, with no explicit paths. */
function run(root, argv) {
  const result = spawnSync(process.execPath, [cli, ...argv],
    { cwd: root, encoding: 'utf8' });
  return { ...result, output: String(result.stdout ?? '') + String(result.stderr ?? '') };
}

let repo;
test('[6.19] set up a repository to answer questions about', () => {
  repo = makeRepo();
  assert.ok(fs.existsSync(path.join(repo, 'scan/model.json')), 'the subject was not mapped');
});

test('[6.19] the CLI advertises all four evidence commands', () => {
  const help = run(repo, ['--help']).output;
  for (const command of ['explain', 'assert', 'timeline', 'drift']) {
    assert.ok(help.includes(`${command} `),
      `--help does not advertise ${command}; it is unreachable however well it works`);
  }
});

test('[6.19] explain answers about the working directory, not its own installation', () => {
  const { status, output } = run(repo, ['explain', 'summary']);
  assert.equal(status, 0, output);
  // The subject has exactly two packages. Mirofy's own model has eighteen, and
  // reading that one instead is the precise failure this guards.
  assert.match(output, /2 components/, output);
});

test('[6.19] explain finds the edge the subject actually declares', () => {
  const { status, output } = run(repo, ['explain', 'callers', '@subject/store']);
  assert.equal(status, 0, output);
  assert.match(output, /api/, output);
});

test('[6.19] explain carries its incompleteness into the answer', () => {
  const { output } = run(repo, ['explain', 'callers', '@subject/store']);
  assert.match(output, /complete:|INCOMPLETE:/,
    'an answer arrived with no statement of what it missed');
});

test('[3.15] assert refuses clearly when the repository has no rules', () => {
  const { status, output } = run(repo, ['assert']);
  assert.notEqual(status, 0, 'a missing rule file must not read as a pass');
  assert.match(output, /no rule file/i, output);
  // And it names the subject's path, not its own.
  assert.ok(output.includes(repo), `the hint named some other directory:${NEWLINE}${output}`);
});

test('[3.15] assert evaluates a rule against the subject and never calls unproven a pass', () => {
  fs.writeFileSync(path.join(repo, 'architecture-rules.json'),
    JSON.stringify({ rules: [{ id: 'no-cycles-here', kind: 'no-cycles' }] }));
  const { output } = run(repo, ['assert']);
  assert.match(output, /no-cycles-here/, output);
  // Whatever the outcome, an unproven rule must never be counted as passing.
  if (/UNPROVEN/.test(output)) {
    assert.match(output, /not a passing rule/i,
      'unproven was reported without telling the reader it is not a pass');
  }
});

test('[3.15] assert exits non-zero on an unproven rule unless told otherwise', () => {
  const strict = run(repo, ['assert']);
  const permissive = run(repo, ['assert', '--allow-unproven']);
  if (/UNPROVEN/.test(strict.output)) {
    assert.notEqual(strict.status, 0, 'an unproven rule passed the build');
    assert.equal(permissive.status, 0, '--allow-unproven did not change the outcome');
  }
});

test('[6.20] timeline reads the subject repository history, not the tool own', () => {
  const { status, output } = run(repo, ['timeline']);
  assert.equal(status, 0, output);
  // The subject has exactly one commit, with a subject line nothing else has.
  assert.match(output, /the subject commit/, output);
  assert.doesNotMatch(output, /mirofy-cli/,
    'timeline reported this tool history instead of the repository it was run in');
});

test('[6.20] timeline says churn is not the same as the component changing', () => {
  const { output } = run(repo, ['timeline']);
  assert.match(output, /did not necessarily change this component/i,
    'cited-file churn was presented as the component having changed');
});

test('[6.17] drift compares two scans and claims nothing about risk', () => {
  const graph = path.join(repo, 'scan/evidence-graph.json');
  const { status, output } = run(repo, ['drift', '--base', graph, '--head', graph]);
  assert.equal(status, 0, output);
  assert.match(output, /\+0 -0/, output);
  // The disclaimer is the feature. Drift reports changed facts and refuses to
  // grade them, and it says so in the output rather than leaving a reader to
  // infer that a small number means a safe change.
  assert.match(output, /not a risk score/i,
    'drift reported changes without refusing to grade them');
  assert.match(output, /not a merge recommendation/i, output);
});

test('[6.17] drift refuses without both sides rather than guessing one', () => {
  const graph = path.join(repo, 'scan/evidence-graph.json');
  const { status, output } = run(repo, ['drift', '--head', graph]);
  assert.notEqual(status, 0);
  assert.match(output, /--base/, output);
});

test('a user-supplied --root still wins over the one the CLI passes', () => {
  // The CLI prepends --root so that the working directory is the default; a
  // user naming their own must override it, which depends on the bins taking
  // the last value for a repeated flag.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-elsewhere-'));
  const { output } = run(repo, ['explain', 'summary', '--root', elsewhere]);
  assert.ok(output.includes(elsewhere),
    `--root was ignored; the command looked somewhere else:${NEWLINE}${output}`);
  fs.rmSync(elsewhere, { recursive: true, force: true });
});

test('clean up the subject repository', () => {
  fs.rmSync(repo, { recursive: true, force: true });
  assert.ok(!fs.existsSync(repo));
});
