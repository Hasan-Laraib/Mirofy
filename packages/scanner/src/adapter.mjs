// The adapter contract, verbatim from 31-V1-ARCHITECTURE.md §3:
//
//   input:   repo root + revision
//   output:  Fact[] — {subject, predicate, object, provenance,
//                      location{path,lines}, revision, adapter}
//            Gap[]  — what it could not analyse and why
//   depends: nothing (each adapter is independent and separately testable)
//   rule:    NEVER guess. An unanalysable file is a Gap, not an omission.
//
// Plus one field the spec's coverage report needs and the contract implies:
// `inventory` — every file the adapter LOOKED AT, whether or not it produced
// facts. Coverage cannot be honest without the denominator, and only the
// adapter knows what it examined.

import { assertFact, assertGap } from '../../evidence/src/fact.mjs';

/**
 * Run one adapter and enforce the contract on its way out. A sloppy adapter
 * cannot poison the graph: every fact and gap is shape-checked here, and the
 * adapter's id and the scan's revision are stamped rather than trusted.
 *
 * @param {{id: string, scan: (ctx: {repoRoot: string, revision: string}) =>
 *          Promise<{facts: object[], gaps: object[], inventory: string[]}>}} adapter
 * @param {{repoRoot: string, revision: string}} context
 * @returns {Promise<{facts: object[], gaps: object[], inventory: string[]}>}
 */
export async function runAdapter(adapter, { repoRoot, revision }) {
  if (!adapter || typeof adapter.id !== 'string' || typeof adapter.scan !== 'function') {
    throw new TypeError('runAdapter: an adapter is {id, scan(ctx)}');
  }
  if (typeof repoRoot !== 'string' || !repoRoot) throw new TypeError('runAdapter: repoRoot is required');
  const result = await adapter.scan({ repoRoot, revision });
  const facts = (result.facts ?? []).map((fact) => assertFact({ ...fact, revision, adapter: adapter.id }));
  const gaps = (result.gaps ?? []).map((gap) => assertGap({ ...gap, revision, adapter: adapter.id }));
  const inventory = [...new Set(result.inventory ?? [])].sort();
  if (!Array.isArray(result.inventory)) {
    throw new TypeError(`runAdapter: adapter ${adapter.id} returned no inventory; coverage cannot be honest without the denominator`);
  }
  return { facts, gaps, inventory };
}

/** Forward-slash a path so facts are stable across platforms. */
export const posixPath = (value) => value.split('\\').join('/');
