// Row 6.20. `timeline` — how the system changed, from the history it is cited to.
//
// The obvious implementation checks out every commit and re-scans. It is also
// the wrong one: a full scan per commit, a clean worktree nobody has, and an
// answer to a question nobody asked, since most components do not change in
// most commits.
//
// The model knows which files each component cites. Git knows which commits
// touched which files. Joining those answers the real question -- what is
// moving -- for one `git log` per path.
//
// Which makes the naming the important part. This measures CITED-FILE CHURN. A
// commit that touched a component's cited file changed something in that file;
// it did not necessarily change the component's shape, its relationships or
// its meaning. And a component with no citations has no history here, which is
// UNKNOWN rather than unchanged -- in a table those look identical, and only
// one of them is a fact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, citedPaths } from '../../explain/src/timeline.mjs';

const history = {
  'src/api.js': [
    { sha: 'aaa1111', date: '2026-08-20T10:00:00+00:00', author: 'A', subject: 'rework auth' },
    { sha: 'bbb2222', date: '2026-08-10T10:00:00+00:00', author: 'B', subject: 'add endpoint' },
  ],
  'src/api-helpers.js': [
    // Shared with src/api.js: the same commit touched both files.
    { sha: 'aaa1111', date: '2026-08-20T10:00:00+00:00', author: 'A', subject: 'rework auth' },
  ],
  'src/web.js': [
    { sha: 'ccc3333', date: '2026-08-01T10:00:00+00:00', author: 'C', subject: 'first render' },
  ],
};

const model = {
  components: [
    { id: 'api', labels: ['API'], sources: [{ path: 'src/api.js' }], evidenceRefs: [{ path: 'src/api-helpers.js' }] },
    { id: 'web', labels: ['Web'], sources: [{ path: 'src/web.js' }] },
    { id: 'authored-only', labels: ['Hand drawn'], sources: [{ document: 'Sketch', diagramType: 'architecture' }] },
  ],
};

const commitsFor = (path) => history[path] ?? [];

test('[6.20] a component reports the commits that touched every file it cites', () => {
  const report = buildTimeline({ model, commitsFor });
  const api = report.entries.find((entry) => entry.id === 'api');
  assert.deepEqual(api.citedPaths.sort(), ['src/api-helpers.js', 'src/api.js']);
  // Both evidenceRefs and sources contribute paths; reading only one would
  // under-report the component's history.
  assert.equal(api.commitCount, 2);
});

test('[6.20] one commit touching two cited files counts once, not twice', () => {
  // aaa1111 touched src/api.js AND src/api-helpers.js. Counting it twice would
  // make a component look twice as volatile as it is.
  const report = buildTimeline({ model, commitsFor });
  const api = report.entries.find((entry) => entry.id === 'api');
  const shas = api.commits.map((commit) => commit.sha);
  assert.deepEqual([...new Set(shas)], shas, 'a commit was counted more than once');
  const shared = api.commits.find((commit) => commit.sha === 'aaa1111');
  assert.deepEqual(shared.paths.sort(), ['src/api-helpers.js', 'src/api.js'],
    'the shared commit lost one of its paths');
});

test('[6.20] commits are newest first, and lastChanged is the newest', () => {
  const report = buildTimeline({ model, commitsFor });
  const api = report.entries.find((entry) => entry.id === 'api');
  assert.deepEqual(api.commits.map((c) => c.sha), ['aaa1111', 'bbb2222']);
  assert.equal(api.lastChanged.sha, 'aaa1111');
});

test('[6.20] entries are ordered by churn, because that is the question', () => {
  const report = buildTimeline({ model, commitsFor });
  assert.deepEqual(report.entries.map((entry) => entry.id), ['api', 'web']);
});

test('[6.20] a component with no cited paths is UNKNOWN, not unchanged', () => {
  // The failure this row exists to prevent. In a table, "no commits" and "no
  // information" look the same, and only one of them is a fact about the
  // system. A hand-authored component has no cited file, so git has nothing
  // to say about it.
  const report = buildTimeline({ model, commitsFor });
  assert.equal(report.uncitedComponents, 1);
  assert.equal(report.uncited[0].id, 'authored-only');
  assert.match(report.uncited[0].reason, /cannot speak to this component/);
  // And it is NOT in the entries list with a zero, which would read as stable.
  assert.ok(!report.entries.some((entry) => entry.id === 'authored-only'),
    'an uncited component was reported as having no changes');
});

test('[6.20] the report says what it measures, and does not overclaim', () => {
  const report = buildTimeline({ model, commitsFor });
  assert.equal(report.measures, 'cited-file churn');
  assert.match(report.claim, /did not necessarily change this component/);
  // "This component changed" is a claim about intent that a file path cannot
  // support, so the word must not appear as an assertion.
  assert.doesNotMatch(report.claim, /\bthe component changed\b/i);
});

test('[6.20] a cited path git knows nothing about yields no history, not a crash', () => {
  // The model can cite a deleted file, or one that lives in another
  // repository. Neither is an error; both simply have no history here.
  const orphanModel = { components: [{ id: 'gone', sources: [{ path: 'src/deleted.js' }] }] };
  const report = buildTimeline({ model: orphanModel, commitsFor });
  assert.equal(report.entries[0].commitCount, 0);
  assert.equal(report.entries[0].lastChanged, null);
});

test('[6.20] limit bounds the commits kept per component but not the count', () => {
  const report = buildTimeline({ model, commitsFor, limit: 1 });
  const api = report.entries.find((entry) => entry.id === 'api');
  assert.equal(api.commits.length, 1, 'limit did not bound the listed commits');
  assert.equal(api.commitCount, 2, 'limit silently changed the reported total');
});

test('[6.20] citedPaths reads both sources and evidenceRefs, in either shape', () => {
  assert.deepEqual(citedPaths({ sources: [{ path: 'a' }], evidenceRefs: ['b', { path: 'c' }] }).sort(),
    ['a', 'b', 'c']);
  assert.deepEqual(citedPaths({}), []);
  assert.deepEqual(citedPaths(null), []);
});

test('[6.20] a missing commit lookup is refused rather than defaulted', () => {
  // @ts-expect-error deliberately omitting the required lookup: the point is
  // that it refuses at runtime rather than defaulting to an empty history,
  // which would report every component as never touched.
  assert.throws(() => buildTimeline({ model }), /commitsFor/);
});
