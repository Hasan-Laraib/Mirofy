// A capped citation list must say it is capped.
//
// The renderer's schema allows a component three sources, because a passport
// listing forty-three links is not a passport. The layout therefore truncates
// -- deterministically, by path then line -- and for several releases that was
// the whole story: the artifact showed three citations for a node with three
// and three for a node with forty-three, with nothing to tell them apart. A
// bound on the DRAWING had quietly become a claim about the EVIDENCE, which is
// the one thing this project is for.
//
// So the total travels alongside the shown few, as `source_count`, and the
// passport says "Showing 3 of 43". The receipt already counted truncations in
// aggregate; that tells the person who RAN it, not the person who READS it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { viewToDocument } from '../../layout/src/document.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(__dirname, '../../core');
const REPO = { url: 'https://github.com/a/b', revision: 'a'.repeat(40) };

/** A view whose single node cites `count` distinct files. */
function viewCiting(count) {
  return {
    schemaVersion: 1,
    type: 'architecture',
    nodes: [
      {
        id: 'app',
        label: 'app',
        kind: 'module',
        evidenceRefs: Array.from({ length: count }, (_, i) => ({
          path: `src/file${String(i).padStart(2, '0')}.py`,
          lines: [1, 1],
        })),
      },
      { id: 'other', label: 'other', kind: 'module', evidenceRefs: [{ path: 'src/z.py' }] },
    ],
    edges: [{ from: 'app', to: 'other', label: 'imports' }],
    omissions: [],
  };
}

test('[1.21] a truncated citation list carries the number it was truncated from', () => {
  const { document } = viewToDocument(viewCiting(43), { title: 'x', repository: REPO });
  const app = document.components.find((c) => c.label === 'app');
  assert.equal(app.sources.length, 3, 'the schema bound still holds');
  assert.equal(app.source_count, 43,
    'and the artifact must be able to say three of WHAT');
});

test('[1.21] a complete citation list claims no total, rather than a redundant one', () => {
  // `source_count` present and equal to the shown length would make every
  // passport say "Showing 2 of 2", which is noise that trains readers to
  // ignore the line that matters.
  const { document } = viewToDocument(viewCiting(2), { title: 'x', repository: REPO });
  const app = document.components.find((c) => c.label === 'app');
  assert.equal(app.sources.length, 2);
  assert.equal(app.source_count, undefined);
});

test('[1.21] dropping unverifiable citations drops the count describing them', () => {
  // With no repository the sources are removed entirely. A surviving
  // `source_count` would describe a list that is not there -- a passport
  // reporting "of 43" beside nothing at all.
  const { document } = viewToDocument(viewCiting(43), { title: 'x' });
  const app = document.components.find((c) => c.label === 'app');
  assert.equal(app.sources, undefined);
  assert.equal(app.source_count, undefined);
});

test('[1.21] the total reaches the artifact, not just the document', () => {
  // The document is an intermediate. What the reader opens is the HTML, and
  // the count has to survive schema validation and evidence verification to
  // get there -- both of which have refused new fields before.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-cite-'));
  const repoRoot = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  for (let i = 0; i < 43; i += 1) {
    fs.writeFileSync(path.join(repoRoot, 'src', `file${String(i).padStart(2, '0')}.py`), 'x = 1\n');
  }
  fs.writeFileSync(path.join(repoRoot, 'src/z.py'), 'y = 1\n');
  const git = (...args) => spawnSync('git', args, { cwd: repoRoot, stdio: 'ignore' });
  git('init', '-q');
  // Evidence verification asks the checkout which repository it IS.
  git('remote', 'add', 'origin', 'https://github.com/a/b');
  git('add', '-A');
  git('-c', 'user.email=p@l', '-c', 'user.name=p', 'commit', '-qm', 'p');
  const revision = spawnSync('git', ['rev-parse', 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

  const { document } = viewToDocument(viewCiting(43), {
    title: 'x',
    repository: { url: 'https://github.com/a/b', revision },
  });
  const docPath = path.join(tmp, 'doc.json');
  const outPath = path.join(tmp, 'doc.html');
  fs.writeFileSync(docPath, JSON.stringify(document));
  const result = spawnSync(process.execPath,
    [path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture', docPath, outPath],
    { cwd: coreRoot, encoding: 'utf8', env: { ...process.env, MIROFY_REPO_ROOT: repoRoot } });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const html = fs.readFileSync(outPath, 'utf8');
  const payload = JSON.parse(
    html.match(/"sourceTotals":\s*(\{[^}]*\})/)?.[1] ?? 'null',
  );
  assert.deepEqual(payload, { app: 43 },
    'the verified evidence payload must carry the real total for the node');
  assert.match(html, /Showing \{shown\} of \{total\} cited sources/,
    'and the artifact must carry the string that renders it');
});
