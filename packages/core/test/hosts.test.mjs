import assert from 'node:assert/strict';
import test from 'node:test';
import { detectHost, hostOrLocal, LOCAL_HOST } from '../renderers/shared/hosts.mjs';

test('hostOrLocal returns the real adapter for a recognised forge', () => {
  const host = hostOrLocal('https://github.com/owner/repo');
  assert.equal(host.id, 'github');
  assert.equal(
    host.blobUrl('abc123', 'src/a.js', 4),
    'https://github.com/owner/repo/blob/abc123/src/a.js#L4',
  );
});

test('hostOrLocal falls back to the local adapter when nothing matches', () => {
  const host = hostOrLocal('https://git.internal.example/owner/repo');
  assert.equal(host.id, 'local');
  assert.equal(host.blobUrl('abc123', 'src/a.js', 4), null);
  assert.equal(host.treeUrl('abc123'), null);
  assert.equal(host.web, null);
});

// A total function on every input: `hostOrLocal` always answers an adapter,
// so no caller has to special-case a missing argument before asking. That is
// this unit's contract and nothing more -- it is NOT a claim that Mirofy
// renders a repository with no url. Production still refuses that, in three
// separate places (the published schema's required /meta/repository/url, the
// origin-remote-required check, and origin-mismatch), and relaxing it is
// deferred to its own plan.
test('hostOrLocal is total: an absent url resolves to local rather than throwing', () => {
  for (const value of ['', null, undefined]) {
    assert.equal(hostOrLocal(value).id, 'local', `${JSON.stringify(value)} should resolve to local`);
  }
});

test('detectHost keeps its existing contract and still returns null', () => {
  assert.equal(detectHost('https://git.internal.example/owner/repo'), null);
  assert.equal(detectHost(''), null);
});

test('LOCAL_HOST is frozen so a caller cannot give it a url', () => {
  assert.throws(() => { LOCAL_HOST.web = 'https://example.com'; }, TypeError);
});
