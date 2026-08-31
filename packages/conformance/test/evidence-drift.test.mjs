// Row 6.17. Evidence drift on pull requests.
//
// On a pull request the useful question is not "is this safe to merge" -- no
// static tool can answer that -- but "what does this change say about the
// system that the last one did not". A fact appeared. A fact vanished. A fact
// moved to another file. Those are checkable, and they are exactly what a
// reviewer cannot see in a forty-file diff.
//
// So the whole design is about what this REFUSES to say. No score, no risk
// label, no merge recommendation. A reviewer reading "3 facts removed" can go
// and look; a reviewer reading "medium risk" has been handed a number nobody
// can defend, and will either trust it or ignore it -- both bad.
//
// The one judgement it does make is about its own vision. If either scan had
// unreadable files, a fact that appears deleted may have moved somewhere the
// scanner could not follow, and "removed" and "no longer visible" call for
// different reactions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evidenceDrift, renderDrift, factKey } from '../../explain/src/drift.mjs';
import { repoRoot } from '../src/render.mjs';

const fact = (subject, predicate, object, filePath, extra = {}) => ({
  id: `f-${subject}-${predicate}-${object}`,
  subject,
  predicate,
  object,
  provenance: 'statically-derived',
  location: { path: filePath },
  revision: 'abc123',
  ...extra,
});

const graph = (facts, gaps = []) => ({ schemaVersion: 1, facts, gaps });

test('[6.17] a fact that appeared, vanished or moved is reported as exactly that', () => {
  const base = graph([
    fact('web', 'imports', 'api', 'src/web.js'),
    fact('api', 'imports', 'db', 'src/api.js'),
    fact('api', 'imports', 'cache', 'src/api.js'),
  ]);
  const head = graph([
    fact('web', 'imports', 'api', 'src/web.js'),
    // moved file, same claim
    fact('api', 'imports', 'db', 'src/api/index.js'),
    // 'api imports cache' is gone
    fact('api', 'imports', 'queue', 'src/api/index.js'),
  ]);

  const report = evidenceDrift(base, head);
  assert.equal(report.counts.added, 1);
  assert.equal(report.added[0].object, 'queue');
  assert.equal(report.counts.removed, 1);
  assert.equal(report.removed[0].object, 'cache');

  // A move is one event. Reporting it as a removal plus an addition would
  // double-count it and bury the real changes in noise.
  assert.equal(report.counts.moved, 1);
  assert.equal(report.moved[0].from, 'src/api.js');
  assert.equal(report.moved[0].to, 'src/api/index.js');
  assert.ok(!report.removed.some((entry) => entry.object === 'db'), 'a move was also counted as a removal');
});

test('[6.17] rescanning an unchanged system reports no drift', () => {
  // Ids are positional and revisions are the commit; both change on every scan
  // of the same unchanged system. Folding them into identity would report the
  // whole graph as churned every run, which conveys exactly nothing.
  const facts = [fact('web', 'imports', 'api', 'src/web.js')];
  const base = graph(facts);
  const head = graph([{ ...facts[0], id: 'different-id', revision: 'def456' }]);

  const report = evidenceDrift(base, head);
  assert.deepEqual(report.counts, { added: 0, removed: 0, moved: 0, base: 1, head: 1 });
});

test('[6.17] the report claims nothing about risk or merge safety', () => {
  const report = evidenceDrift(graph([]), graph([fact('a', 'imports', 'b', 'x.js')]));

  // Scanned with the disclaimers removed. `claim` and `caveat` are where the
  // report DENIES making these judgements, and they must use the words to deny
  // them -- an earlier version of this test failed on its own "not a risk
  // score", which would have pushed the disclaimer out of the report to make
  // the assertion pass. The rule is that nothing ELSE may editorialise.
  const { claim, caveat, ...findings } = report;
  const prose = renderDrift(report).replace(claim, '').replace(caveat ?? '', '');
  const text = `${JSON.stringify(findings)}
${prose}`;
  for (const forbidden of [/\brisk\b/i, /\bsafe to merge\b/i, /\bapprove\b/i, /\bscore\b/i, /\bseverity\b/i]) {
    assert.doesNotMatch(text, forbidden, `the drift report editorialises: ${forbidden}`);
  }
  // And says so positively, on every report -- including a clean one, so a
  // clean report cannot be read as an endorsement.
  assert.match(report.claim, /not a risk score, not a merge recommendation/);
  const clean = evidenceDrift(graph([]), graph([]));
  assert.match(clean.claim, /not a risk score/);
});

test('[6.17] gaps on either side qualify a removal', () => {
  // "Removed" and "no longer visible" call for different reactions, and only
  // one of them is a fact about the system.
  const base = graph([fact('a', 'imports', 'b', 'x.js')], [{ path: 'y.js', reason: 'computed import' }]);
  const head = graph([], [{ path: 'y.js', reason: 'computed import' }]);
  const report = evidenceDrift(base, head);
  assert.equal(report.counts.removed, 1);
  assert.match(report.caveat, /may have moved into a file the scanner could not read/);

  // With clean scans on both sides there is nothing to qualify, and the
  // caveat is absent rather than boilerplate.
  const cleanReport = evidenceDrift(graph([fact('a', 'imports', 'b', 'x.js')]), graph([]));
  assert.equal(cleanReport.caveat, undefined);
});

test('[6.17] identity is the claim, not where it was written down', () => {
  const one = factKey(fact('a', 'imports', 'b', 'src/one.js'));
  const two = factKey(fact('a', 'imports', 'b', 'src/two.js'));
  assert.equal(one, two, 'the same claim in two files hashes differently');
  assert.notEqual(one, factKey(fact('a', 'imports', 'c', 'src/one.js')));
});

test('[6.17] markdown renders counts, entries and the caveat', () => {
  const base = graph([fact('a', 'imports', 'b', 'x.js')], [{ path: 'y.js', reason: 'computed' }]);
  const markdown = renderDrift(evidenceDrift(base, graph([], [])), { title: 'Drift' });
  assert.match(markdown, /^## Drift/);
  assert.match(markdown, /\| removed \| 1 \|/);
  assert.match(markdown, /`a` \*\*imports\*\* `b`/);
  assert.match(markdown, /> .*could not read/);
});

test('[6.17] a no-change report says so plainly', () => {
  const markdown = renderDrift(evidenceDrift(graph([]), graph([])));
  assert.match(markdown, /No change in what the evidence says/);
});

test('[6.17] the drift workflow runs on pull requests and never gates them', () => {
  // The point of this check is the ABSENCE of a failure path. A drift report
  // that could go red would go red on every pull request that does any work,
  // and would then be disabled by whoever it blocked first.
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/evidence-drift.yml'), 'utf8');
  assert.match(workflow, /^on:\n\s+pull_request:/m, 'the drift workflow does not run on pull requests');
  assert.match(workflow, /GITHUB_STEP_SUMMARY/, 'the report goes nowhere a reviewer will see it');

  // No step may assert, exit non-zero deliberately, or fail the job.
  assert.doesNotMatch(workflow, /exit 1|\|\| exit|continue-on-error: false/,
    'the drift workflow has a failure path');
  assert.doesNotMatch(workflow, /permissions:[\s\S]*write/,
    'the drift workflow asks for write permission it does not need');
});
