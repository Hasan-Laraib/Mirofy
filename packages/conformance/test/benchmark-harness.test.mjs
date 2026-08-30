// Row 7.8. First-pass usable rate: measured on a schedule, never per PR.
//
// This is the only number in the repo that moves without a commit, because it
// measures what an external model does with the tool. That single fact drives
// every requirement below: it must never gate a pull request, it must never
// report a rate it did not measure, and it must never blame the tool for the
// author's failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/render.mjs';
import { runBenchmark, OUTCOMES, classifyValidationFailure } from '../../benchmark/src/harness.mjs';

const clean = { errors: [], warnings: [] };
const at = () => new Date('2026-01-01T00:00:00Z');
const ids = (count) => Array.from({ length: count }, (_, i) => ({ id: `t${i + 1}`, diagramType: 'architecture' }));

/** Every task authors fine and evaluates however `verdicts` says. */
const withVerdicts = (verdicts) => ({
  tasks: ids(verdicts.length),
  model: 'stub',
  now: at,
  author: async () => ({}),
  evaluate: async (_document, task) => verdicts[Number(task.id.slice(1)) - 1],
});

test('[7.8] the rate is computed from the outcomes, not asserted', async () => {
  const run = await runBenchmark(withVerdicts([
    clean, clean, clean, { errors: ['components overlap'], warnings: [] },
  ]));
  assert.equal(run.status, 'measured');
  assert.equal(run.firstPassUsableRate, 0.75);
  assert.equal(run.usable, 3);
  assert.equal(run.byOutcome[OUTCOMES.COMPOSITION], 1);
});

test('[7.8] a warning is not usable', async () => {
  // First-pass usable means it came out clean, not that it was accepted. A
  // warning is the diagram saying it needs a second look, which is exactly
  // the second look this metric exists to count.
  const run = await runBenchmark(withVerdicts([clean, { errors: [], warnings: ['label is tight'] }]));
  assert.equal(run.firstPassUsableRate, 0.5);
  assert.equal(run.byOutcome[OUTCOMES.COMPOSITION], 1);
});

test('[7.8] the author failing is never counted as the tool failing', async () => {
  const run = await runBenchmark({
    tasks: ids(10),
    model: 'stub',
    now: at,
    author: async (task) => {
      if (task.id === 't1') throw new Error('503 from upstream');
      return {};
    },
    evaluate: async () => clean,
  });
  // Distinguished, not summed. "The model returned prose" and "the layout
  // overlapped" have different owners and different fixes.
  assert.equal(run.byOutcome[OUTCOMES.AUTHOR_ERROR], 1);
  assert.equal(run.byOutcome[OUTCOMES.INVALID], 0);
  assert.equal(run.byOutcome[OUTCOMES.COMPOSITION], 0);
  assert.match(run.results[0].detail, /503/, 'the author failure lost its reason');
});

test('[7.8] a run that could not measure reports no rate at all', async () => {
  // The failure this row exists to prevent. During a model outage a harness
  // that reports 10% looks exactly like a catastrophic regression in this
  // repo, and someone will go looking for the commit that caused it.
  const run = await runBenchmark({
    tasks: ids(10),
    model: 'stub',
    now: at,
    author: async (task) => {
      if (task.id === 't1' || task.id === 't2') return {};
      throw new Error('503 from upstream');
    },
    evaluate: async () => clean,
  });
  assert.equal(run.status, 'inconclusive');
  assert.equal(run.firstPassUsableRate, null,
    'a rate was reported for a run that measured an outage');
  assert.match(run.inconclusiveReason, /availability/);
});

test('[7.8] the rate counts every task, including ones the author lost', async () => {
  // One author error in ten is below the inconclusive threshold, so the run
  // still reports. It must report 9/10 and not 9/9: dividing by what the
  // author managed to answer would let a model that skipped its hard tasks
  // post a perfect score.
  const run = await runBenchmark({
    tasks: ids(10),
    model: 'stub',
    now: at,
    author: async (task) => {
      if (task.id === 't1') throw new Error('refused');
      return {};
    },
    evaluate: async () => clean,
  });
  assert.equal(run.status, 'measured');
  assert.equal(run.firstPassUsableRate, 0.9);
});

test('[7.8] the harness refuses to invent an author, a model or a corpus', async () => {
  const base = { tasks: ids(1), author: async () => ({}), evaluate: async () => clean, model: 'stub' };
  await assert.rejects(() => runBenchmark({ ...base, author: undefined }), /author/i);
  await assert.rejects(() => runBenchmark({ ...base, evaluate: undefined }), /evaluate/i);
  await assert.rejects(() => runBenchmark({ ...base, tasks: [] }), /task/i);
  // An unattributed rate cannot be compared to the run before it, which is
  // the only thing a trend line does.
  await assert.rejects(() => runBenchmark({ ...base, model: '' }), /model/i);
});

test('[7.8] every run records what produced it', async () => {
  const run = await runBenchmark(withVerdicts([clean]));
  assert.equal(run.model, 'stub');
  assert.equal(run.measuredAt, '2026-01-01T00:00:00.000Z');
  assert.equal(run.total, 1);
  assert.equal(run.schemaVersion, 1);
});

test('[7.8] the benchmark workflow is not, and cannot become, a per-PR gate', () => {
  // The loudest requirement on this row, so it is enforced rather than
  // documented. The number moves when an external model changes behaviour;
  // a required check would fail contributors for something they cannot see,
  // reproduce or fix.
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/benchmark.yml'), 'utf8');
  const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  assert.doesNotMatch(triggers, /pull_request/,
    'the benchmark workflow gained a pull_request trigger');
  assert.doesNotMatch(triggers, /\bpush:/,
    'the benchmark workflow gained a push trigger, which gates main the same way');
  assert.match(triggers, /schedule:/, 'the benchmark no longer runs on a schedule');
  assert.match(triggers, /release:/, 'the benchmark no longer runs at a release');
});

test('[7.8] the task corpus is real, and every task names a diagram type', () => {
  const dir = path.join(repoRoot, 'benchmarks/tasks');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 5, `only ${files.length} benchmark tasks; too few to mean anything`);
  const types = new Set();
  for (const file of files) {
    const task = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.ok(task.id, `${file} has no id`);
    assert.ok(task.diagramType, `${file} names no diagram type`);
    assert.ok(task.prompt && task.prompt.length > 40,
      `${file} has no real prompt -- a placeholder corpus measures nothing`);
    types.add(task.diagramType);
  }
  // A benchmark over one diagram type would report the health of one renderer
  // and call it the product's.
  assert.ok(types.size >= 4, `the corpus covers only ${types.size} diagram type(s)`);
});

test('[7.8] a badly composed document is not called malformed', () => {
  // The bug an end-to-end run caught and no unit test would have. A rejected
  // document comes back with the same exit code and the same stage whether
  // the author wrote nonsense or the layout engine disliked the geometry, so
  // classifying on either of those blames the author for both.
  const composed = classifyValidationFailure([
    { code: 'layout/constraint', message: 'components a and b overlap', severity: 'error' },
    { code: 'layout/rhythm', message: 'route segment is short', severity: 'warning' },
  ]);
  assert.equal(composed.kind, 'composition');
  assert.equal(composed.errors.length, 1);
  assert.equal(composed.warnings.length, 1);

  const malformed = classifyValidationFailure([
    { code: 'schema/required', message: 'components[0] must have property label', severity: 'error' },
  ]);
  assert.equal(malformed.kind, 'invalid');
  assert.match(malformed.message, /label/);

  // A mixture is malformed: nothing downstream of a schema failure can be
  // trusted, including the composition verdict.
  const mixed = classifyValidationFailure([
    { code: 'layout/constraint', message: 'overlap', severity: 'error' },
    { code: 'schema/required', message: 'missing label', severity: 'error' },
  ]);
  assert.equal(mixed.kind, 'invalid');

  // And a refusal with no diagnostics is still a refusal, not a clean pass.
  assert.equal(classifyValidationFailure([]).kind, 'invalid');
});
