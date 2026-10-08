// Orchestration: ask about each candidate, and keep the receipt.
//
// The client is a PARAMETER. Nothing in this file constructs one, which is why
// the whole suite runs offline with no key and no socket.
//
// WHY EVERY JUDGMENT CARRIES A RECEIPT. There is no seed and no temperature
// parameter, and run-to-run determinism is documented nowhere -- so the same
// question may not return the same number tomorrow. A number that cannot be
// reproduced must at least be ATTRIBUTABLE: which version answered, which
// request, which exact question, against which exact state. That is what makes
// a drawn guess checkable rather than merely plausible, and checkable is the
// whole standard this repository holds itself to.
//
// FAILURES ARE RECORDED, NOT SWALLOWED. A run where eleven of twenty-five
// questions were rate-limited is a different run from one where fourteen edges
// were genuinely judged unlikely, and a report that cannot tell them apart is
// not a report.

import { createHash } from 'node:crypto';
import { noulFor } from './questions.mjs';

/** Statuses worth retrying. The API reference's only retry guidance is backoff. */
const RETRYABLE = new Set([429, 529]);
const MAX_ATTEMPTS = 3;

/**
 * A stable digest of the exact state that was sent.
 *
 * Key order is fixed before hashing: two states that differ only in the order
 * their keys were built are the same state, and a digest that said otherwise
 * would make identical runs look like different ones.
 *
 * @param {object} state
 * @returns {string}
 */
export function stateDigest(state) {
  const ordered = {};
  for (const key of Object.keys(state ?? {}).sort()) ordered[key] = state[key];
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

/** @param {number} ms */
const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Ask about every candidate, up to `limit`.
 *
 * @param {object} args
 * @param {Array<object>} args.candidates
 * @param {{model: string, ask: Function}} args.client
 * @param {number} [args.limit]
 * @param {(ms: number) => Promise<void>} [args.sleep] injected so tests do not wait
 * @param {(event: object) => void} [args.onProgress]
 * @returns {Promise<{judgments: Array<object>, failures: Array<object>, considered: number, asked: number, usage: object}>}
 */
export async function runJudge({ candidates, client, limit = 25, sleep = defaultSleep, onProgress }) {
  const all = Array.isArray(candidates) ? candidates : [];
  const selected = all.slice(0, Math.max(0, limit));

  const judgments = [];
  const failures = [];
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (const [index, candidate] of selected.entries()) {
    const id = `edge_${index}`;
    const question = noulFor(candidate);
    const digest = stateDigest(candidate.state);

    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const answer = await client.ask({ id, state: candidate.state, question });
        usage.input_tokens += Number(answer.usage?.input_tokens ?? 0);
        usage.output_tokens += Number(answer.usage?.output_tokens ?? 0);
        judgments.push({
          from: candidate.from,
          to: candidate.to,
          probability: answer.probability,
          // The receipt. Everything needed to ask this exact question again
          // and to say what answered it last time.
          asked: {
            // The RESOLVED version from the response, not the one requested:
            // it is what actually answered.
            model: answer.model ?? client.model,
            request_id: answer.requestId,
            instructions: question.instructions,
            state_sha256: digest,
            at: new Date().toISOString(),
          },
          // Where the scanner stopped, so a reader can go and look.
          gap: {
            path: candidate.gap.path,
            line: candidate.gap.line,
            reason: candidate.gap.reason,
            adapter: candidate.gap.adapter,
          },
          matched_name: candidate.matched,
        });
        if (onProgress) onProgress({ kind: 'judged', from: candidate.from, to: candidate.to, probability: answer.probability });
        break;
      } catch (error) {
        const retryable = RETRYABLE.has(error?.status) && attempt < MAX_ATTEMPTS;
        if (retryable) {
          if (onProgress) onProgress({ kind: 'retry', attempt, status: error.status });
          // Exponential backoff is the only retry guidance the API reference
          // gives, so it is the only thing done here.
          await sleep(2 ** (attempt - 1) * 500);
          continue;
        }
        failures.push({
          from: candidate.from,
          to: candidate.to,
          error: error?.name ?? 'Error',
          message: error?.message ?? String(error),
          status: error?.status ?? null,
          state_sha256: digest,
        });
        if (onProgress) onProgress({ kind: 'failed', from: candidate.from, to: candidate.to, message: error?.message });
        break;
      }
    }
  }

  return {
    judgments,
    failures,
    // `considered` and `asked` differ whenever --limit truncated the run. A
    // report that printed only `asked` would imply it had seen everything.
    considered: all.length,
    asked: selected.length,
    usage,
  };
}
