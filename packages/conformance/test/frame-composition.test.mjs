// Row 3.11. The `showcase` false negatives: boundary overlap and collinear
// frames.
//
// A frame-vs-frame check exists, but every part of it sits behind
// `requiresNestedBoundaryMembership` -- the opt-in deployment-ownership
// engineering profile. Its comment justifies that for the MEMBERSHIP
// contract, and correctly: ordinary architecture boundaries are sets, not an
// ownership tree, so orthogonal scopes may legitimately share some components
// while each contains others.
//
// But the same `continue` also skips the pure GEOMETRY check, which has
// nothing to do with membership semantics. Two frames that partially overlap
// are a visual defect whatever their memberships mean: a component in the
// intersection belongs to both regions and the reader cannot tell which
// border owns it. Under `showcase` -- the profile whose entire job is to
// refuse compositions that merely look plausible -- that goes unreported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-frames-'));

function render(doc, { showcase = true } = {}) {
  const input = path.join(tmp, `doc-${process.hrtime.bigint()}.json`);
  const out = `${input}.html`;
  fs.writeFileSync(input, JSON.stringify(doc));
  try {
    execFileSync(process.execPath, [path.join(coreRoot, 'renderers/architecture/render-architecture.mjs'), input, out], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, MIROFY_QUALITY_PROFILE: showcase ? 'showcase' : 'standard' },
    });
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

// Two regions whose components sit side by side but whose PADDED frames
// overlap in the middle. Memberships are disjoint, so no membership rule is
// implicated -- this is purely about the drawn rectangles.
function partiallyOverlappingFrames() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Overlapping regions', quality_profile: 'showcase' },
    // Frames resolve to One(140,60 300x140) and Two(340,160 300x140): they
    // overlap in 340..440 x 160..200 and neither contains the other. Height
    // is 140, not pad*2+60 -- topPad is max(pad, labelBaseline+clearance) and
    // there is a 20px bottom extra, which is worth stating because getting it
    // wrong produces frames that merely TOUCH and a fixture that proves
    // nothing.
    //
    // No connections at all: frame overlap is a boundary-to-boundary
    // property, and any edge here brings its own routing and label rules
    // along, which is how the first three attempts at this fixture failed for
    // reasons that had nothing to do with the overlap.
    components: [
      { id: 'a', type: 'backend', label: 'Alpha', pos: [200, 120], size: [180, 60] },
      { id: 'b', type: 'backend', label: 'Beta', pos: [400, 220], size: [180, 60] },
    ],
    boundaries: [
      { kind: 'region', label: 'Region One', wraps: ['a'], pad: 60 },
      { kind: 'region', label: 'Region Two', wraps: ['b'], pad: 60 },
    ],
    connections: [],
  };
}

test('[3.11] showcase reports boundary frames that partially overlap, with no deployment profile set', () => {
  const result = render(partiallyOverlappingFrames());
  assert.equal(result.ok, false,
    'two partially overlapping boundary frames rendered cleanly under showcase; '
    + 'a component in the intersection belongs to both regions and the reader cannot tell which border owns it');
  assert.match(result.message, /overlap/i, 'the failure does not mention the overlap');
  assert.match(result.message, /Region One|Region Two/, 'the failure does not name the boundaries');
});

test('[3.11] the geometry check does not depend on the deployment engineering profile', () => {
  // The membership contract is legitimately deployment-only. The geometry is
  // not: this document sets no engineering_profile at all, and must still be
  // refused. Asserted separately so a fix that merely widened the deployment
  // profile's reach would not satisfy it.
  const doc = partiallyOverlappingFrames();
  assert.equal(doc.meta.engineering_profile, undefined, 'the fixture must not opt into the deployment profile');
  const result = render(doc);
  assert.equal(result.ok, false);
  // The REASON matters. Asserting only ok===false would pass on any unrelated
  // rejection -- which is exactly how this test first passed while the
  // overlap went undetected and the fixture failed a viewBox check instead.
  assert.match(result.message, /overlap/i, 'refused, but not for the overlap');
});

test('[3.11] a legitimately nested boundary still renders under showcase', () => {
  // The compatibility half. Nesting is what boundaries are FOR, and a fix
  // that flagged containment would break every real document -- including
  // this repository's own fixtures, where a security-group sits inside a
  // region.
  const doc = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Nested regions', quality_profile: 'showcase' },
    components: [
      { id: 'a', type: 'backend', label: 'Alpha', pos: [140, 140], size: [180, 60] },
      { id: 'b', type: 'backend', label: 'Beta', pos: [400, 140], size: [180, 60] },
    ],
    boundaries: [
      { kind: 'region', label: 'Outer', wraps: ['a', 'b'], pad: 60 },
      { kind: 'security-group', label: 'Inner', wraps: ['a'], pad: 20 },
    ],
    connections: [{ from: 'a', to: 'b', label: 'calls' }],
  };
  const result = render(doc);
  assert.equal(result.ok, true, `a nested boundary was refused: ${result.message}`);
});

test('[3.11] the shipped fixtures still render under showcase', () => {
  // The strongest compatibility assertion available: the documents this
  // repository actually ships. A new gate that fails these is wrong about
  // what it is measuring, not right about the documents.
  const fixtures = ['web-app.architecture.json', 'production-deployment.architecture.json'];
  for (const name of fixtures) {
    const doc = JSON.parse(fs.readFileSync(path.join(coreRoot, '..', '..', 'fixtures', 'sources', name), 'utf8'));
    doc.meta = { ...doc.meta, quality_profile: 'showcase' };
    const result = render(doc);
    assert.equal(result.ok, true, `${name} was refused under showcase: ${result.message}`);
  }
});

test('[3.11] a document with no quality profile is unaffected — the fix is scoped, not global', () => {
  // The geometry check is gated on the quality profile, like every other
  // composition rule. A fix that fired unconditionally would change the
  // meaning of `standard` for every existing document.
  const doc = partiallyOverlappingFrames();
  delete doc.meta.quality_profile;
  const result = render(doc, { showcase: false });
  assert.equal(result.ok, true,
    `an overlapping-frame document was refused without a quality profile: ${result.message}`);
});
