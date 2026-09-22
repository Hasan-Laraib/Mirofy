import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { startPreview } from '../bin/preview.mjs';
import { verifyRepositoryEvidence } from '../renderers/shared/repository-evidence.mjs';
import { HOST_IDS } from '../renderers/shared/hosts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const cli = path.join(skillRoot, 'bin', 'mirofy.mjs');

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function fixture() {
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
function diagramCitingSource(repo, url, { locations = 1 } = {}) {
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

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
}

function evidencePayload(html) {
  const match = html.match(/<script id="mirofy-source-evidence-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'verified evidence payload missing');
  return JSON.parse(match[1]);
}

test('repository evidence accepts canonical HTTPS and common SSH remotes', () => {
  const data = fixture();
  const output = path.join(data.root, 'remote-form.html');
  for (const remote of [
    'https://github.com/example/evidence-repo.git/',
    'git@github.com:example/evidence-repo.git',
    'ssh://git@github.com/example/evidence-repo.git',
  ]) {
    git(data.root, 'remote', 'set-url', 'origin', remote);
    const result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
    assert.equal(result.status, 0, `${remote}: ${result.stderr || result.stdout}`);
  }
});

async function waitForState(url, predicate, timeoutMs = 12000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    latest = await (await fetch(new URL('/state', url))).json();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail(`preview did not settle; latest state: ${JSON.stringify(latest)}`);
}

test('repository evidence is revision-verified, receipt-backed, searchable, and export-clean', () => {
  const data = fixture();
  const output = path.join(data.root, 'verified.html');
  const result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const receipt = JSON.parse(result.stdout);
  assert.deepEqual(receipt.evidence, {
    verified: true,
    repository: 'https://github.com/example/evidence-repo',
    revision: data.revision,
    references: 2,
  });

  const html = fs.readFileSync(output, 'utf8');
  const evidence = evidencePayload(html);
  assert.equal(evidence.verified, true);
  assert.equal(evidence.repository.shortRevision, data.revision.slice(0, 7));
  assert.equal(evidence.nodes.users.length, 2);
  assert.equal(evidence.nodes.users[0].href, `https://github.com/example/evidence-repo/blob/${data.revision}/src/router.js#L1-L3`);
  assert.match(html, /Verified source/);
  assert.match(html, /Mirofy\.sourceEvidence = \(function \(\)/);
  assert.match(html, /var sourceSearch = sources\.map/);
  assert.match(html, /renderSourceEvidence\(id\)/);
  assert.match(html, /referrerPolicy = 'no-referrer'/);
  assert.match(html, /classList\.add\('source-evidence-beacon'\)/);
  assert.match(html, /text\.textContent = viewerText\('viewer\.passport\.sourceMarker'\) \+ ' ' \+ count/);
  assert.match(html, /Mirofy\.sourceEvidence\.installBeacons\(\)/);
  assert.match(html, /querySelectorAll\('\[data-source-evidence-beacon\]'\)/);
  assert.match(html, /data-source-evidence-original-label/);

  const svg = html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0] || '';
  assert.doesNotMatch(svg, /src\/router\.js|github\.com\/example\/evidence-repo|source-evidence/);
});

test('repository evidence is opt-in and never appears in ordinary artifacts', () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-no-evidence-')), 'plain.html');
  const input = path.join(skillRoot, 'examples', 'web-app.architecture.json');
  const result = run(['render', 'architecture', input, output]);
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(output, 'utf8');
  assert.doesNotMatch(html, /id="mirofy-source-evidence-data"/);
  assert.match(html, /id="focus-evidence" hidden/);
  const svg = html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0] || '';
  assert.doesNotMatch(svg, /source-evidence-beacon|data-source-evidence-count/);
});

test('evidence fails closed without a root, on wrong origin, missing blobs, or impossible lines', () => {
  const data = fixture();
  const output = path.join(data.root, 'must-stay.html');
  fs.writeFileSync(output, 'trusted previous artifact');

  let result = run(['deliver', 'architecture', data.input, output, '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).stage, 'render');
  assert.match(JSON.parse(result.stdout).error, /Pass --repo-root/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'trusted previous artifact');

  git(data.root, 'remote', 'set-url', 'origin', 'https://github.com/example/other-repo.git');
  result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /does not match/);
  git(data.root, 'remote', 'set-url', 'origin', 'git@github.com:example/evidence-repo.git');

  data.diagram.components[0].sources = [{ path: '../outside.js' }];
  fs.writeFileSync(data.input, JSON.stringify(data.diagram));
  result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /must stay inside the repository/);

  data.diagram.components[0].sources = [{ path: 'src/router.js\n' }];
  fs.writeFileSync(data.input, JSON.stringify(data.diagram));
  result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /repo-relative POSIX path/);

  data.diagram.components[0].sources = [{ path: 'src/missing.js' }];
  fs.writeFileSync(data.input, JSON.stringify(data.diagram));
  result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /does not identify a file/);

  data.diagram.components[0].sources = [{ path: 'src/router.js', line: 99 }];
  fs.writeFileSync(data.input, JSON.stringify(data.diagram));
  result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /requests line 99/);

  data.diagram.components[0].sources = [{ path: 'src/router.js', line: 4 }];
  fs.writeFileSync(data.input, JSON.stringify(data.diagram));
  result = run(['deliver', 'architecture', data.input, output, '--repo-root', data.root, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /has 3 lines/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'trusted previous artifact');
});

test('--repo-root stays bounded to architecture and schema limits evidence shape', () => {
  const data = fixture();
  let result = run(['render', 'workflow', path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'), '--repo-root', data.root]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /architecture diagrams only/);

  data.diagram.components[0].sources = [
    { path: 'src/router.js' },
    { path: 'src/router.js' },
    { path: 'src/router.js' },
    { path: 'src/router.js' },
  ];
  fs.writeFileSync(data.input, JSON.stringify(data.diagram));
  result = run(['validate', 'architecture', data.input, '--repo-root', data.root]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must NOT have more than 3 items/);
});

test('live preview forwards repo-root and publishes only verified evidence', { timeout: 20000 }, async () => {
  const data = fixture();
  const output = path.join(data.root, 'preview.html');
  const preview = await startPreview({
    type: 'architecture',
    input: data.input,
    output,
    repoRoot: data.root,
    open: false,
    debounceMs: 30,
    pollMs: 60,
  });
  try {
    const state = await waitForState(preview.url, (candidate) => candidate.status === 'verified');
    assert.equal(state.revision, 1);
    const html = await (await fetch(new URL('/artifact.html', preview.url))).text();
    assert.equal(evidencePayload(html).repository.revision, data.revision);
  } finally {
    await preview.stop();
  }
});

// This task ships the unrecognised / self-hosted host case (a self-hosted
// GitLab, an internal Gitea, an enterprise GitHub): a well-formed URL on a
// forge Mirofy does not recognise. It does NOT ship a repository with no
// remote at all -- that is blocked upstream, unmodified by this task, by the
// schema's required `/meta/repository/url` and by the origin-remote-required
// check just below in this file -- and is deferred to a follow-up plan.
const UNRECOGNISED_HOST_URL = 'https://git.self-hosted.example/team/widgets';

test('a repository on an unrecognised host renders instead of failing', () => {
  const repo = fixture();
  const result = verifyRepositoryEvidence(
    'architecture',
    diagramCitingSource(repo, UNRECOGNISED_HOST_URL),
    repo.root,
  );
  assert.equal(result.verified, true);
  assert.equal(result.repository.host, 'local');
  assert.equal(result.repository.treeUrl, null);
});

test('a local repository reports one limitation naming it', () => {
  const repo = fixture();
  const result = verifyRepositoryEvidence(
    'architecture',
    diagramCitingSource(repo, UNRECOGNISED_HOST_URL),
    repo.root,
  );
  assert.equal(result.limitations.length, 1);
  assert.match(result.limitations[0].reason, /cannot be linked/);
  assert.equal(result.limitations[0].declaredUrl, UNRECOGNISED_HOST_URL);
  // The single-repository form declares no id of its own (the reserved id is
  // ''), so "naming it" must fall back to something else -- the verified
  // checkout path -- rather than silently reporting an empty string.
  assert.equal(result.limitations[0].repository, fs.realpathSync(repo.root));
});

test('an unrecognised forge is named by its declared URL', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'https://git.internal.example/owner/repo');
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal(result.repository.host, 'local');
  assert.equal(result.limitations[0].declaredUrl, 'https://git.internal.example/owner/repo');
});

test('one limitation per repository, not per cited source location', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, UNRECOGNISED_HOST_URL, { locations: 3 });
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal(result.limitations.length, 1);
});

test('a hosted repository carries no limitations key at all', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'https://github.com/owner/repo');
  const result = verifyRepositoryEvidence('architecture', diagram, repo.root);
  assert.equal('limitations' in result, false);
});

test('a malformed url is still a hard failure, naming the supported hosts', () => {
  const repo = fixture();
  const diagram = diagramCitingSource(repo, 'not a url at all');
  // The thrown Error's own `.message` is the human-readable diagnostic text,
  // not the diagnostic code (see diagnostics.mjs's normalizedDiagnostic) --
  // the code rides alongside on `mirofyDiagnostics`, so that is asserted
  // directly rather than by matching the message against it.
  try {
    verifyRepositoryEvidence('architecture', diagram, repo.root);
    assert.fail('expected verifyRepositoryEvidence to throw');
  } catch (error) {
    assert.equal(error.mirofyDiagnostics?.[0]?.code, 'repository-evidence/url-invalid');
    // Naming the supported hosts is the difference between a dead end and a
    // fixable error: the author cannot guess which forges are understood.
    for (const id of HOST_IDS) {
      assert.match(error.message, new RegExp(id), `the rejection does not name the ${id} adapter`);
    }
  }
});

test('an unrecognised origin that does not match the declared URL is still rejected', () => {
  // remoteSlug(origin) and remoteSlug(declaredUrl) are both null for two
  // different unrecognised hosts, so `remoteSlug(a) !== remoteSlug(b)` alone
  // cannot tell them apart -- without the text-comparison fallback in
  // `sameRemote`, this origin-mismatch check goes inert for every
  // unrecognised host and accepts ANY two unrelated self-hosted remotes.
  const repo = fixture();
  const diagram = diagramCitingSource(repo, UNRECOGNISED_HOST_URL);
  git(repo.root, 'remote', 'set-url', 'origin', 'https://git.totally-unrelated.example/someone/else');
  assert.throws(
    () => verifyRepositoryEvidence('architecture', diagram, repo.root),
    (error) => error.mirofyDiagnostics?.[0]?.code === 'repository-evidence/origin-mismatch',
  );
});

test('the viewer template never synthesises a repository url', () => {
  const template = fs.readFileSync(
    path.join(skillRoot, 'assets', 'template.html'), 'utf8',
  );
  assert.equal(
    /repository\.url \+ '\/tree\/'/.test(template), false,
    'template.html must not build a tree URL by string concatenation',
  );
});
