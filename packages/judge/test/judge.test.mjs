import assert from 'node:assert/strict';
import test from 'node:test';
import { runJudge, stateDigest } from '../src/judge.mjs';

const candidate = (from, to) => ({
  from,
  to,
  fromLabel: from,
  toLabel: to,
  matched: to,
  gap: { path: 'a/load.mjs', line: 3, reason: 'computed import specifier at line 3; the target cannot be known statically', adapter: 'imports' },
  state: { file: 'a/load.mjs', line: 3, candidate_component: to },
});

const answering = (probability) => ({
  model: 'jev-1.13.0',
  ask: async () => ({
    probability,
    model: 'jev-1.13.0',
    requestId: 'req_1',
    usage: { input_tokens: 100, output_tokens: 0 },
  }),
});

test('the state digest ignores key order but not content', () => {
  assert.equal(stateDigest({ a: 1, b: 2 }), stateDigest({ b: 2, a: 1 }));
  assert.notEqual(stateDigest({ a: 1 }), stateDigest({ a: 2 }));
});

test('every judgment carries a receipt that identifies what answered it', async () => {
  const result = await runJudge({ candidates: [candidate('app', 'billing')], client: answering(0.62) });
  assert.equal(result.judgments.length, 1);
  const [judgment] = result.judgments;
  assert.equal(judgment.probability, 0.62);
  // Without a seed or temperature, the number is not reproducible; it must at
  // least be attributable.
  assert.equal(judgment.asked.model, 'jev-1.13.0');
  assert.equal(judgment.asked.request_id, 'req_1');
  assert.match(judgment.asked.state_sha256, /^[a-f0-9]{64}$/);
  assert.ok(judgment.asked.instructions.includes('line 3'));
  assert.ok(Date.parse(judgment.asked.at) > 0);
  // And the gap it came from stays attached, so a reader can go and look.
  assert.equal(judgment.gap.path, 'a/load.mjs');
  assert.equal(judgment.gap.line, 3);
});

test('the resolved version wins over the requested one', async () => {
  const client = {
    model: 'jev-1.13.0',
    ask: async () => ({ probability: 0.9, model: 'jev-1.13.4', requestId: null, usage: {} }),
  };
  const result = await runJudge({ candidates: [candidate('a', 'b')], client });
  assert.equal(result.judgments[0].asked.model, 'jev-1.13.4', 'record what actually answered');
});

test('--limit truncates, and the report says so rather than implying completeness', async () => {
  const candidates = ['a', 'b', 'c', 'd'].map((to) => candidate('app', to));
  const result = await runJudge({ candidates, client: answering(0.8), limit: 2 });
  assert.equal(result.asked, 2);
  assert.equal(result.considered, 4);
  assert.equal(result.judgments.length, 2);
});

test('a limit of zero asks nothing and is not an error', async () => {
  const result = await runJudge({ candidates: [candidate('a', 'b')], client: answering(0.9), limit: 0 });
  assert.equal(result.asked, 0);
  assert.equal(result.judgments.length, 0);
});

test('usage is totalled across calls', async () => {
  const candidates = [candidate('app', 'b'), candidate('app', 'c')];
  const result = await runJudge({ candidates, client: answering(0.7) });
  assert.equal(result.usage.input_tokens, 200);
});

test('a rate limit is retried with backoff, then succeeds', async () => {
  let calls = 0;
  const waits = [];
  const client = {
    model: 'jev-1.13.0',
    ask: async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error('rate limited');
        error.status = 429;
        throw error;
      }
      return { probability: 0.55, model: 'jev-1.13.0', requestId: 'r', usage: {} };
    },
  };
  const result = await runJudge({
    candidates: [candidate('a', 'b')],
    client,
    sleep: async (ms) => { waits.push(ms); },
  });
  assert.equal(result.judgments.length, 1);
  assert.deepEqual(waits, [500, 1000], 'exponential backoff, the only guidance the API gives');
});

test('a persistent rate limit is recorded as a failure, never as a low probability', async () => {
  const client = {
    model: 'jev-1.13.0',
    ask: async () => { const e = new Error('rate limited'); e.status = 429; throw e; },
  };
  const result = await runJudge({
    candidates: [candidate('a', 'b')], client, sleep: async () => {},
  });
  assert.equal(result.judgments.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].status, 429);
  // A run where the question could not be asked is a different run from one
  // where the answer was "probably not".
  assert.ok(!('probability' in result.failures[0]));
});

test('a non-retryable error is not retried', async () => {
  let calls = 0;
  const client = {
    model: 'jev-1.13.0',
    ask: async () => { calls += 1; const e = new Error('bad question'); e.status = 422; throw e; },
  };
  const result = await runJudge({ candidates: [candidate('a', 'b')], client, sleep: async () => {} });
  assert.equal(calls, 1);
  assert.equal(result.failures[0].status, 422);
});

test('one failure does not abandon the rest of the run', async () => {
  let calls = 0;
  const client = {
    model: 'jev-1.13.0',
    ask: async () => {
      calls += 1;
      if (calls === 1) { const e = new Error('nope'); e.status = 422; throw e; }
      return { probability: 0.8, model: 'jev-1.13.0', requestId: 'r', usage: {} };
    },
  };
  const result = await runJudge({
    candidates: [candidate('app', 'b'), candidate('app', 'c')],
    client,
    sleep: async () => {},
  });
  assert.equal(result.failures.length, 1);
  assert.equal(result.judgments.length, 1);
});

test('no candidates is a clean empty run', async () => {
  const result = await runJudge({ candidates: [], client: answering(0.9) });
  assert.deepEqual(result.judgments, []);
  assert.equal(result.considered, 0);
});
