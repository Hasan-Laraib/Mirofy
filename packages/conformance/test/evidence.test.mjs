// Row 2.4. The differentiator: every relationship can answer "why do I believe
// this?". Asserted per diagram type, because evidence existed for exactly one
// of the five before this task -- architecture components -- and a
// single-type test would have passed while four types silently had no support
// at all.
//
// Validation goes through the CLI rather than importing the validator, so the
// test exercises the path a user actually takes: schema -> generated
// validator -> receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot, fixturesRoot, repoRoot } from '../src/render.mjs';
import { PROVENANCE_CLASSES, isProvenanceClass, resolveProvenance } from '../../core/renderers/shared/evidence-provenance.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-evidence-'));
const cli = path.join(coreRoot, 'bin/mirofy.mjs');

const FIXTURE = {
  architecture: 'web-app.architecture.json',
  dataflow: 'event-stream.dataflow.json',
  lifecycle: 'agent-run.lifecycle.json',
  sequence: 'cache-miss-request.sequence.json',
  workflow: 'agent-tool-call.workflow.json',
};

const EDGE_EVIDENCE_PATH = {
  architecture: 'packages/core/renderers/architecture/render-architecture.mjs',
  dataflow: 'packages/core/renderers/dataflow/render-dataflow.mjs',
  lifecycle: 'packages/core/renderers/lifecycle/render-lifecycle.mjs',
  sequence: 'packages/core/renderers/sequence/render-sequence.mjs',
  workflow: 'packages/core/renderers/workflow/render-workflow.mjs',
};

const RELATIONSHIP_ARRAY = {
  architecture: 'connections',
  dataflow: 'flows',
  lifecycle: 'transitions',
  sequence: 'messages',
  workflow: 'edges',
};

function validate(mode, doc, { repoRoot: root = null } = {}) {
  const file = path.join(tmp, `${mode}-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(file, JSON.stringify(doc));
  const args = [cli, 'validate', mode, file, '--json'];
  if (root) args.push('--repo-root', root);
  // The CLI exits non-zero on an invalid document, which is the point of half
  // these assertions, and execFileSync throws on a non-zero exit. The receipt
  // is on stdout either way, so read it from the thrown error rather than
  // letting a correctly-rejected document look like a broken test.
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) throw error;
  }
  const receipt = JSON.parse(stdout);
  return { ok: receipt.ok === true, message: receipt.error ?? JSON.stringify(receipt.diagnostics ?? []) };
}

for (const [mode, arrayName] of Object.entries(RELATIONSHIP_ARRAY)) {
  test(`[2.4] ${mode} accepts sources on its ${arrayName} and rejects a malformed entry`, () => {
    const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, FIXTURE[mode]), 'utf8'));
    const rels = source[arrayName];
    assert.ok(Array.isArray(rels) && rels.length, `${mode} fixture has no ${arrayName}`);

    // Accepted: a well-formed evidence entry on the first relationship.
    // Evidence also requires /meta/repository -- a citation with no statement
    // of which repository it cites is incomplete, and the same rule already
    // governs component sources. The path is a real file here, pinned to
    // HEAD, so acceptance means the whole authoring contract holds rather
    // than just the shape.
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: repoRoot }).trim();
    source.meta = { ...source.meta, repository: { url: 'https://github.com/Hasan-Laraib/Mirofy', revision } };
    rels[0].sources = [{ path: EDGE_EVIDENCE_PATH[mode], line: 1, end_line: 40, label: 'renderer' }];
    const accepted = validate(mode, source, { repoRoot });
    assert.equal(accepted.ok, true, accepted.message);

    // Rejected: `path` is required, so an entry without it must fail validation
    // rather than being silently dropped -- evidence that vanishes quietly is
    // worse than evidence that was never claimed.
    rels[0].sources = [{ line: 12 }];
    assert.equal(validate(mode, source, { repoRoot }).ok, false, `${mode} accepted a source with no path`);
  });
}

// Row 2.4, second half: the schema accepting `sources` on a relationship is
// worth nothing if resolution never walks them. Evidence resolution traversed
// components only, so an authored edge source validated cleanly and then
// vanished -- the silent-drop failure the rejection assertions above exist to
// prevent, one layer further down.
//
// Asserted per diagram type for the same reason as above, and pinned to this
// repository at HEAD: the fixtures cite real files here, so the verification
// path exercised is the real one (git cat-file, real blobs, real line counts)
// rather than a stub that would pass whatever it was handed.

function renderWithEvidence(mode) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: repoRoot }).trim();
  const doc = JSON.parse(fs.readFileSync(path.join(fixturesRoot, FIXTURE[mode]), 'utf8'));
  doc.meta = { ...doc.meta, repository: { url: 'https://github.com/Hasan-Laraib/Mirofy', revision } };
  // The evidence is added here rather than committed into the fixture. A
  // fixture carrying sources must also carry repository metadata pinned to a
  // revision, and pinning a SHA into a golden fixture would make rendering
  // depend on history that a shallow CI clone does not have.
  doc[RELATIONSHIP_ARRAY[mode]][0].sources = [
    { path: EDGE_EVIDENCE_PATH[mode], line: 1, end_line: 40, label: `${mode} renderer` },
  ];
  const input = path.join(tmp, `${mode}-evidence.json`);
  fs.writeFileSync(input, JSON.stringify(doc));
  const out = path.join(tmp, `${mode}-evidence.html`);
  execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', mode, input, out, '--repo-root', repoRoot,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const html = fs.readFileSync(out, 'utf8');
  const match = html.match(/<script id="mirofy-source-evidence-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, `${mode}: rendered artifact carries no source-evidence payload`);
  return JSON.parse(match[1]);
}

for (const mode of Object.keys(RELATIONSHIP_ARRAY)) {
  test(`[2.4] ${mode} resolves verified evidence for a relationship, not just a component`, () => {
    const payload = renderWithEvidence(mode);
    assert.equal(payload.verified, true, `${mode}: evidence payload is not verified`);
    assert.ok(payload.edges, `${mode}: payload has no edges map -- resolution still walks components only`);

    // The fixture puts evidence on the first relationship, index 0, which is
    // also the data-edge-key the renderers emit for it.
    const sources = payload.edges['0'];
    assert.ok(Array.isArray(sources) && sources.length === 1,
      `${mode}: no resolved evidence at edge key 0 (got ${JSON.stringify(payload.edges)})`);
    assert.equal(sources[0].path, EDGE_EVIDENCE_PATH[mode]);
    assert.equal(sources[0].line, 1);
    assert.equal(sources[0].endLine, 40);
    assert.match(sources[0].href, /^https:\/\/github\.com\/.+#L1-L40$/);
  });
}

// Row 2.5. The six-class vocabulary. These tests exist mostly to pin things
// that are easy to "tidy" into being wrong: the class list's ORDER (it is the
// published display order, not a confidence ranking), and the resolution rule
// that makes an unclaimed-but-evidenced subject source-backed rather than
// leaving it to be re-declared in a second field.
test('[2.5] the six provenance classes are exactly these six, in the published order', () => {
  assert.deepEqual([...PROVENANCE_CLASSES], [
    'authored',
    'source-backed',
    'statically-derived',
    'config-derived',
    'runtime-observed',
    'inferred',
  ]);
  assert.equal(Object.isFrozen(PROVENANCE_CLASSES), true, 'the class list must not be mutable');
});

test('[2.5] provenance resolves from evidence when it is not claimed', () => {
  // Claimed explicitly: taken at its word.
  assert.equal(resolveProvenance({ provenance: 'runtime-observed' }), 'runtime-observed');
  // Unclaimed but evidenced: source-backed, without needing a second field.
  assert.equal(resolveProvenance({ sources: [{ path: 'src/app.js' }] }), 'source-backed');
  // Claimed AND evidenced: the explicit claim still wins.
  assert.equal(resolveProvenance({ provenance: 'config-derived', sources: [{ path: 'a.js' }] }), 'config-derived');
  // Neither: authored, the truthful default for a hand-written document.
  assert.equal(resolveProvenance({}), 'authored');
  assert.equal(resolveProvenance({ sources: [] }), 'authored');
  // A class outside the six is not honoured here either -- the schema rejects
  // it first, and passing it through would paint an unknown treatment.
  assert.equal(resolveProvenance({ provenance: 'vibes' }), 'authored');
  assert.equal(isProvenanceClass('vibes'), false);
});

test('[2.5] no provenance class collides with a geometry field on the same subject', () => {
  // `authored` and `inferred` both already mean layout things elsewhere in
  // this repository (authoredToSide, sideOrigin === 'inferred'). The classes
  // are carried in their own field, so the collision is a reader hazard
  // rather than a data one -- this asserts it stays that way.
  const subject = { provenance: 'inferred', authoredToSide: 'left', sources: [{ path: 'a.js' }] };
  assert.equal(resolveProvenance(subject), 'inferred');
  assert.equal(subject.authoredToSide, 'left', 'resolution must not touch geometry fields');
});

test('[2.5] the schema rejects a provenance class outside the six', () => {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, FIXTURE.architecture), 'utf8'));
  source.connections[0].provenance = 'runtime-observed';
  assert.equal(validate('architecture', source).ok, true, 'a valid provenance class was rejected');
  source.connections[0].provenance = 'vibes';
  const rejected = validate('architecture', source);
  assert.equal(rejected.ok, false, 'the schema accepted a provenance class outside the six');
  assert.match(rejected.message, /provenance/, 'the rejection did not name the provenance field');
});
