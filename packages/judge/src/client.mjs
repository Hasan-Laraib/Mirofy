// The wire, and ONLY the wire. This module knows about TypeSafe; it knows
// nothing about Mirofy, gaps, components or diagrams.
//
// ONE DIALECT, NAMED. The same model is reachable through at least three
// mutually incompatible HTTP contracts, and they are not interchangeable:
//
//   direct TypeSafe        POST api.typesafe.ai/v1/systemone
//                          primitive `noul`, answer field `noul`,
//                          usage.input_tokens
//   Vercel passthrough     POST ai-gateway.vercel.sh/typesafe/v1/systemone
//                          same shapes, different credential
//   Vercel native          POST ai-gateway.vercel.sh/v1/evaluate
//                          primitive `boolean`, answer field `probability`,
//                          usage.inputTokens, providerMetadata
//
// This targets the first. Pointing it at the third would not fail loudly -- it
// would parse `answers.x.noul` as undefined and read every probability as
// missing. So the dialect is stated here, `BASE_URL` is overridable only to
// something speaking the SAME dialect, and the response reader below refuses a
// body it does not recognise rather than coercing one.
//
// NO SDK. `@typesafe-ai/sdk` exists and would do this for us. Every package in
// this repository declares zero runtime dependencies, and
// scripts/check-readme-claims.mjs enforces it, so this is forty lines of fetch
// instead.

/** The documented direct endpoint. */
export const BASE_URL = 'https://api.typesafe.ai';

/**
 * Pinned, not `jev-latest`.
 *
 * TypeSafe's own models page says to pin a version ID rather than the alias if
 * you have tuned thresholds against one, and this package has: `--min`
 * defaults to a number chosen against this version's behaviour. An alias that
 * silently moves under a tuned threshold changes what gets drawn without
 * changing a line of code here.
 */
export const MODEL = 'jev-1.13.0';

/** Requests that take longer than this are a hang, not a slow answer. */
const TIMEOUT_MS = 20_000;

export class JudgeError extends Error {
  /** @param {string} message @param {object} [detail] */
  constructor(message, detail = {}) {
    super(message);
    this.name = 'JudgeError';
    Object.assign(this, detail);
  }
}
export class JudgeAuthError extends JudgeError {}
export class JudgeValidationError extends JudgeError {}
export class JudgeRateLimitError extends JudgeError {}
export class JudgeOverloadedError extends JudgeError {}
export class JudgeProtocolError extends JudgeError {}

/**
 * Map a failing response onto a typed error.
 *
 * The four statuses are the ones TypeSafe's API reference documents. Anything
 * else is surfaced as-is rather than bucketed into the nearest of them: a 502
 * from a proxy is not a validation error, and saying it is would send a reader
 * looking at their own question.
 *
 * @param {number} status
 * @param {string} body
 * @returns {JudgeError}
 */
export function errorFor(status, body) {
  const detail = { status, body: String(body ?? '').slice(0, 400) };
  if (status === 401) {
    return new JudgeAuthError('TYPESAFE_API_KEY was rejected (401).', detail);
  }
  if (status === 422) {
    return new JudgeValidationError('the question was rejected as invalid (422).', detail);
  }
  if (status === 429) {
    return new JudgeRateLimitError('rate limited (429); back off and retry.', detail);
  }
  if (status === 529) {
    return new JudgeOverloadedError('the model is overloaded (529); back off and retry.', detail);
  }
  return new JudgeError(`unexpected HTTP ${status} from the model.`, detail);
}

/**
 * Read one `noul` answer out of a direct-dialect response body.
 *
 * Refuses rather than coerces. `Number(undefined)` is NaN and `NaN >= min` is
 * false, so a silently-misread body would look exactly like a confident "no"
 * -- edges would quietly stop being drawn and nothing would say why. That is
 * the failure this function exists to make loud.
 *
 * @param {object} body
 * @param {string} id the question key this call used
 * @returns {{probability: number, model: string|null, requestId: string|null, usage: object}}
 */
export function readNoul(body, id) {
  const answer = body?.answers?.[id];
  if (!answer || typeof answer !== 'object') {
    throw new JudgeProtocolError(`the response carried no answer for ${JSON.stringify(id)}.`, {
      keys: Object.keys(body?.answers ?? {}),
    });
  }
  // The gateway dialect names this field `probability` and the primitive
  // `boolean`. Seeing either here means the client is pointed at an endpoint
  // it does not speak, which is worth saying plainly.
  if (typeof answer.noul !== 'number') {
    const hint = typeof answer.probability === 'number'
      ? ' the body looks like the Vercel gateway dialect, which this client does not speak'
      : '';
    throw new JudgeProtocolError(`the answer for ${JSON.stringify(id)} carried no numeric noul.${hint}`, {
      answer,
    });
  }
  if (!(answer.noul >= 0 && answer.noul <= 1)) {
    throw new JudgeProtocolError(`noul ${answer.noul} is outside 0..1.`, { answer });
  }
  return {
    probability: answer.noul,
    // The response reports the RESOLVED version, which is the one worth
    // recording -- it is what actually answered.
    model: typeof body?.model === 'string' ? body.model : null,
    requestId: typeof body?.request_id === 'string' ? body.request_id : null,
    usage: body?.usage ?? {},
  };
}

/**
 * A client bound to one key.
 *
 * `fetchImpl` is injectable so the tests exercise this module's own encoding
 * and decoding without a socket. It is not a seam for swapping dialects --
 * see the header.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} [options.baseUrl]
 * @param {string} [options.model]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createClient({ apiKey, baseUrl = BASE_URL, model = MODEL, fetchImpl } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    // Refused here rather than at the first request, so a misconfigured run
    // stops before it has half-judged a diagram.
    throw new JudgeAuthError('no API key: set TYPESAFE_API_KEY.');
  }
  const doFetch = fetchImpl ?? fetch;

  return {
    model,
    /**
     * Ask one question about one state.
     *
     * ONE QUESTION PER CALL, deliberately. The API accepts a map of them, but
     * what happens when some of a batch fail is documented nowhere -- whether
     * the call 422s whole or returns an `answers` map with keys missing. With
     * one question per call the question does not arise: the call either
     * answered or it threw.
     *
     * @param {object} args
     * @param {string} args.id
     * @param {object} args.state
     * @param {object} args.question
     */
    async ask({ id, state, question }) {
      const controller = new globalThis.AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response;
      try {
        response = await doFetch(`${baseUrl}/v1/systemone`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ state, model, questions: { [id]: question } }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw errorFor(response.status, text);
      }
      const body = await response.json();
      return readNoul(body, id);
    },
  };
}
