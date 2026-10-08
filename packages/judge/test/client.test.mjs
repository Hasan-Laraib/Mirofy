// The response bodies below are written to the DOCUMENTED direct-dialect wire
// shape (`{model, answers, usage, request_id}`, answer `{type, noul}`). They
// were NOT captured from the live API -- no authenticated request was made
// while this package was designed. So they prove this client matches the
// published contract; they cannot prove the published contract matches the
// server. If the first real run fails, suspect the contract before the code.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE_URL, JudgeAuthError, JudgeOverloadedError, JudgeProtocolError,
  JudgeRateLimitError, JudgeValidationError, MODEL, createClient, errorFor, readNoul,
} from '../src/client.mjs';

const okBody = (noul) => ({
  model: 'jev-1.13.0',
  request_id: 'req_01H',
  answers: { q: { type: 'noul', noul } },
  usage: { input_tokens: 275, output_tokens: 0 },
});

const responseOf = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('the pinned model is a version, never the moving alias', () => {
  assert.equal(MODEL, 'jev-1.13.0');
  assert.ok(!MODEL.includes('latest'), 'an alias moving under a tuned threshold changes output silently');
});

test('a missing key is refused at construction, not at the first request', () => {
  assert.throws(() => createClient({ apiKey: '' }), JudgeAuthError);
  assert.throws(() => createClient({ apiKey: '   ' }), JudgeAuthError);
  assert.throws(() => createClient({}), JudgeAuthError);
});

test('the request carries bearer auth, the pinned model, and exactly one question', async () => {
  let seen = null;
  const client = createClient({
    apiKey: 'k-123',
    fetchImpl: async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return responseOf(200, okBody(0.62));
    },
  });
  await client.ask({ id: 'q', state: { file: 'a.mjs' }, question: { type: 'noul', instructions: 'x' } });

  assert.equal(seen.url, `${BASE_URL}/v1/systemone`);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer k-123');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.equal(seen.body.model, 'jev-1.13.0');
  // One question per call: the batched-partial-failure semantics are
  // undocumented, so this client never creates the situation.
  assert.deepEqual(Object.keys(seen.body.questions), ['q']);
  assert.equal(seen.body.questions.q.type, 'noul');
  assert.deepEqual(seen.body.state, { file: 'a.mjs' });
});

test('a good answer yields the probability, the resolved version and the receipt', async () => {
  const client = createClient({ apiKey: 'k', fetchImpl: async () => responseOf(200, okBody(0.62)) });
  const result = await client.ask({ id: 'q', state: {}, question: {} });
  assert.equal(result.probability, 0.62);
  // The response reports the version that actually answered.
  assert.equal(result.model, 'jev-1.13.0');
  assert.equal(result.requestId, 'req_01H');
  assert.equal(result.usage.input_tokens, 275);
});

test('the documented failures map to distinct types', () => {
  assert.ok(errorFor(401, '') instanceof JudgeAuthError);
  assert.ok(errorFor(422, '') instanceof JudgeValidationError);
  assert.ok(errorFor(429, '') instanceof JudgeRateLimitError);
  assert.ok(errorFor(529, '') instanceof JudgeOverloadedError);
});

test('an undocumented status is not squeezed into a documented one', () => {
  const error = errorFor(502, 'bad gateway');
  assert.ok(!(error instanceof JudgeValidationError), 'a proxy 502 is not the caller question being wrong');
  assert.equal(error.status, 502);
});

test('a failing request throws the typed error', async () => {
  const client = createClient({ apiKey: 'k', fetchImpl: async () => responseOf(429, { error: 'slow down' }) });
  await assert.rejects(() => client.ask({ id: 'q', state: {}, question: {} }), JudgeRateLimitError);
});

test('a body with no answer for the question is refused, not read as zero', async () => {
  // NaN >= min is false, so a coerced misread would look exactly like a
  // confident "no" and edges would silently stop being drawn.
  await assert.rejects(
    () => createClient({ apiKey: 'k', fetchImpl: async () => responseOf(200, { answers: {} }) })
      .ask({ id: 'q', state: {}, question: {} }),
    JudgeProtocolError,
  );
});

test('the gateway dialect is detected and named rather than misread', () => {
  const gatewayShaped = {
    model: 'typesafe-ai/jev',
    answers: { q: { type: 'boolean', probability: 0.62 } },
    usage: { inputTokens: 275 },
  };
  assert.throws(
    () => readNoul(gatewayShaped, 'q'),
    (error) => error instanceof JudgeProtocolError && /gateway dialect/.test(error.message),
  );
});

test('a probability outside 0..1 is refused', () => {
  assert.throws(() => readNoul(okBody(1.4), 'q'), JudgeProtocolError);
  assert.throws(() => readNoul(okBody(-0.1), 'q'), JudgeProtocolError);
});

test('the honest edges of the range are accepted', () => {
  assert.equal(readNoul(okBody(0), 'q').probability, 0);
  assert.equal(readNoul(okBody(1), 'q').probability, 1);
});
