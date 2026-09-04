// The audit gate has to tell three outcomes apart, and only one of them is a
// pass. An outage is not a pass and not a failure; conflating it with either is
// how a release either lies about being audited or waits on someone else's
// incident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from '../../../scripts/check-audit.mjs';

// The exact shape npm printed on 2026-09-04 while the bulk advisories endpoint
// was returning 503. No metadata block, and a top-level `message`.
const OUTAGE = {
  message: '503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk - Service Unavailable',
  error: { summary: '', detail: '' },
};

const clean = (counts = {}) => ({
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...counts } },
  vulnerabilities: {},
});

test('a clean audit passes', () => {
  const result = verdict(clean(), '');
  assert.equal(result.state, 'ok');
  assert.match(result.detail, /none at any severity/);
});

test('a high advisory fails and names the package', () => {
  const report = clean({ high: 1, total: 1 });
  report.vulnerabilities = { 'tar-fs': { severity: 'high' } };
  const result = verdict(report, '');
  assert.equal(result.state, 'fail');
  assert.match(result.detail, /tar-fs \(high\)/);
});

test('a critical advisory fails', () => {
  assert.equal(verdict(clean({ critical: 2, total: 2 }), '').state, 'fail');
});

// The severity floor is a decision, not an accident: moderate and below are
// reported in the tally but do not stop a release.
test('a moderate advisory passes but is still counted out loud', () => {
  const result = verdict(clean({ moderate: 3, total: 3 }), '');
  assert.equal(result.state, 'ok');
  assert.match(result.detail, /3 moderate/);
});

test('an unreachable endpoint is unverified, not a pass', () => {
  const result = verdict(OUTAGE, 'npm error audit endpoint returned an error');
  assert.equal(result.state, 'unverified');
  assert.notEqual(result.state, 'ok');
  assert.match(result.detail, /NOT CHECKED/);
  assert.match(result.detail, /503/);
});

// A reader looking at CI output needs the reason, and the path to a debug log
// on a machine they do not have is not one.
test('the reason names the endpoint rather than unrelated npm noise', () => {
  // Real CI stderr, warnings and all: the config warning comes FIRST, so a
  // reason picked without looking for the word audit picks the wrong line.
  const stderr = [
    'npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.',
    'npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    'npm error audit endpoint returned an error',
    'npm error A complete log of this run can be found in: /home/runner/.npm/_logs/x-debug-0.log',
  ].join(String.fromCharCode(10));
  const result = verdict({ error: { summary: '', detail: '' } }, stderr);
  assert.equal(result.state, 'unverified');
  assert.doesNotMatch(result.detail, /debug-0\.log/);
  assert.match(result.detail, /registry\.npmjs\.org/);
});

test('unparseable output is unverified rather than silently clean', () => {
  assert.equal(verdict(null, '').state, 'unverified');
});
