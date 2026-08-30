// Row 1.15. First-class engineering metadata: `owner` and
// `deployment{regions, networkScope}` as REAL fields.
//
// Today they are smuggled: the ownership profile reads a team name out of a
// component's `tag` (its own diagnostic says `ownerField: 'tag'`) and infers
// regions from boundary membership. That works and is legible to nobody --
// `tag` is a display label that happens to be load-bearing.
//
// The fields are optional, and the fallbacks stay, because every existing
// document uses the old shape. What must NOT stay is the ambiguity about
// which source answered: the diagnostic reports it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot, fixturesRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-engmeta-'));
const cli = path.join(coreRoot, 'bin/mirofy.mjs');

function validate(doc) {
  const file = path.join(tmp, `doc-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(file, JSON.stringify(doc));
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [cli, 'validate', 'architecture', file, '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) throw error;
  }
  const receipt = JSON.parse(stdout);
  return { ok: receipt.ok === true, message: receipt.error ?? '' };
}

const base = () => JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));

test('[1.15] a component carries owner and deployment as real fields', () => {
  const doc = base();
  doc.components[0].owner = 'payments-team';
  doc.components[0].deployment = { regions: ['eu-west-1', 'us-east-1'], networkScope: 'internal' };
  const result = validate(doc);
  assert.equal(result.ok, true, result.message);
});

test('[1.15] an unknown networkScope is refused naming the field', () => {
  const doc = base();
  doc.components[0].deployment = { networkScope: 'wherever' };
  const result = validate(doc);
  assert.equal(result.ok, false, 'an arbitrary networkScope was accepted');
  assert.match(result.message, /networkScope/, 'the rejection does not name the field');
});

test('[1.15] documents using neither field still validate — the fields are additive', () => {
  // The compatibility assertion. Every document ever authored omits these,
  // and a required field here would break all of them at once.
  const result = validate(base());
  assert.equal(result.ok, true, result.message);
});

test('[1.15] the ownership diagnostic reports which source supplied the owner', () => {
  const doc = base();
  doc.meta = { ...doc.meta, engineering_profile: 'deployment-ownership' };
  // No owner anywhere: the diagnostic must fire AND say it looked at `tag`,
  // which is the legacy source.
  const withoutOwner = validate(doc);
  assert.equal(withoutOwner.ok, false, 'the ownership profile accepted a document with no owner');
  assert.match(withoutOwner.message, /owner/i);

  // With the real field set, the same component must stop being reported --
  // a profile that ignores the first-class field would keep demanding a tag.
  const doc2 = base();
  doc2.meta = { ...doc2.meta, engineering_profile: 'deployment-ownership' };
  for (const component of doc2.components) {
    component.owner = 'platform-team';
    component.deployment = { regions: ['eu-west-1'], networkScope: 'internal' };
  }
  const withOwner = validate(doc2);
  // The profile must have RUN and still be complaining about its other
  // requirements (security-group boundaries, connection mechanisms). Without
  // this, the doesNotMatch below would pass vacuously against any rejection
  // that happens not to mention owners -- including a schema that does not
  // know the field at all.
  assert.match(withOwner.message, /Engineering profile "deployment-ownership" failed/,
    'the ownership profile did not run, so the absence of an owner complaint proves nothing');
  assert.doesNotMatch(withOwner.message, /does not name its owner/,
    'a component with a real owner field was still reported as missing an owner');
  assert.doesNotMatch(withOwner.message, /is not assigned to a region/,
    'a component declaring deployment.regions was still reported as region-less');
});
