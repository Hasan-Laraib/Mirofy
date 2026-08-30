// Row 2.6. Multi-repo evidence identity: `{repository, revision, path, range}`.
//
// A system rarely lives in one repository. Today a document names ONE
// `/meta/repository`, so every citation is implicitly "in that repo" -- and a
// component whose code lives elsewhere either cites a path that does not
// exist, or goes uncited. Both are worse than saying which repository the
// evidence is in.
//
// `meta.repositories` names several, each with its own url and revision, and
// a source may say which one it belongs to. The single-repository form still
// works untouched: every document authored before this change uses it, and a
// migration nobody asked for is a bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-multirepo-'));
const cli = path.join(coreRoot, 'bin/mirofy.mjs');

const git = (repo, ...args) => execFileSync('git', args, {
  cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

/** A throwaway repository with one file, so evidence verifies against real blobs. */
function makeRepo(name, slug, lines = 20) {
  const repo = path.join(tmp, name);
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'src', `${name}.js`),
    Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n') + '\n',
  );
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'remote', 'add', 'origin', `https://github.com/${slug}.git`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'initial');
  return { root: repo, revision: git(repo, 'rev-parse', 'HEAD'), url: `https://github.com/${slug}` };
}

const api = makeRepo('api', 'acme/api');
const web = makeRepo('web', 'acme/web');

function render(doc, repoRootArgs) {
  const input = path.join(tmp, `doc-${process.hrtime.bigint()}.json`);
  const out = `${input}.html`;
  fs.writeFileSync(input, JSON.stringify(doc));
  try {
    execFileSync(process.execPath, [cli, 'render', 'architecture', input, out, ...repoRootArgs], {
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
  } catch (error) {
    return { ok: false, message: `${error.stdout ?? ''}${error.stderr ?? ''}`, payload: null };
  }
  const html = fs.readFileSync(out, 'utf8');
  const match = html.match(/<script id="mirofy-source-evidence-data" type="application\/json">([\s\S]*?)<\/script>/);
  return { ok: true, message: '', payload: match ? JSON.parse(match[1]) : null };
}

/** Two components, each with evidence in a DIFFERENT repository. */
function multiRepoDocument() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Two repositories',
      repositories: [
        { id: 'api', url: api.url, revision: api.revision },
        { id: 'web', url: web.url, revision: web.revision },
      ],
    },
    components: [
      {
        id: 'service', type: 'backend', label: 'API', pos: [80, 120], size: [200, 60],
        sources: [{ repository: 'api', path: 'src/api.js', line: 2, end_line: 6 }],
      },
      {
        id: 'ui', type: 'frontend', label: 'Web', pos: [520, 120], size: [200, 60],
        sources: [{ repository: 'web', path: 'src/web.js', line: 3, end_line: 4 }],
      },
    ],
    connections: [{ from: 'ui', to: 'service', label: 'calls' }],
  };
}

const repoRootArgs = ['--repo-root', `api=${api.root}`, '--repo-root', `web=${web.root}`];

test('[2.6] evidence from two repositories resolves, each against its own checkout', () => {
  const result = render(multiRepoDocument(), repoRootArgs);
  assert.equal(result.ok, true, result.message);
  assert.ok(result.payload, 'no evidence payload was embedded');
  assert.equal(result.payload.verified, true);

  const service = result.payload.nodes.service;
  const ui = result.payload.nodes.ui;
  assert.ok(service?.length === 1, 'the api-repo component has no resolved evidence');
  assert.ok(ui?.length === 1, 'the web-repo component has no resolved evidence');

  // Each href points at ITS OWN repository and revision. A single-repo
  // resolver would have pointed both at whichever repo it happened to hold.
  assert.match(service[0].href, new RegExp(`acme/api/blob/${api.revision}/src/api\\.js#L2-L6$`));
  assert.match(ui[0].href, new RegExp(`acme/web/blob/${web.revision}/src/web\\.js#L3-L4$`));
});

test('[2.6] a source naming an unknown repository is refused, naming the declared ids', () => {
  const doc = multiRepoDocument();
  doc.components[0].sources[0].repository = 'billing';
  const result = render(doc, repoRootArgs);
  assert.equal(result.ok, false, 'a citation into an undeclared repository was accepted');
  assert.match(result.message, /billing/, 'the refusal does not name the offending repository');
  // Naming what IS declared is the difference between a dead end and a fix.
  assert.match(result.message, /api/, 'the refusal does not name the declared repositories');
});

test('[2.6] a declared repository with no --repo-root is refused, naming which one', () => {
  const result = render(multiRepoDocument(), ['--repo-root', `api=${api.root}`]);
  assert.equal(result.ok, false, 'evidence was verified for a repository that was never supplied');
  assert.match(result.message, /web/, 'the refusal does not say which repository root is missing');
});

test('[2.6] evidence is verified against the right repository, not merely a repository', () => {
  // The failure this row exists to prevent: a path that exists in the OTHER
  // repo. A resolver that verified against any available checkout would call
  // this fine.
  const doc = multiRepoDocument();
  doc.components[0].sources[0] = { repository: 'api', path: 'src/web.js', line: 1, end_line: 1 };
  const result = render(doc, repoRootArgs);
  assert.equal(result.ok, false, 'a path from the wrong repository was accepted');
  assert.match(result.message, /src\/web\.js/);
});

test('[2.6] the single-repository form still works, untouched', () => {
  // Every document authored before this change uses meta.repository, and a
  // migration nobody asked for is a bug.
  const doc = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'One repository', repository: { url: api.url, revision: api.revision } },
    components: [{
      id: 'service', type: 'backend', label: 'API', pos: [80, 120], size: [200, 60],
      sources: [{ path: 'src/api.js', line: 2, end_line: 6 }],
    }],
    connections: [],
  };
  const result = render(doc, ['--repo-root', api.root]);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.payload.verified, true);
  assert.match(result.payload.nodes.service[0].href, new RegExp(`acme/api/blob/${api.revision}/src/api\\.js#L2-L6$`));
});

test('[2.6] declaring both forms at once is refused rather than silently preferring one', () => {
  const doc = multiRepoDocument();
  doc.meta.repository = { url: api.url, revision: api.revision };
  const result = render(doc, repoRootArgs);
  assert.equal(result.ok, false, 'a document declaring both repository forms was accepted');
  // A specific phrase, not merely /repositor/i: while `meta.repositories` was
  // absent from the schema, ANY rejection mentioned "repositories" and this
  // assertion passed while proving nothing.
  assert.match(result.message, /declare either/i,
    'refused, but not for declaring both forms');
});
