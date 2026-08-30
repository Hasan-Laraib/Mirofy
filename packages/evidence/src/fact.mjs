// The Fact and Gap shapes, verbatim from 31-V1-ARCHITECTURE.md §3:
//
//   Fact — {subject, predicate, object, provenance, location{path,lines},
//           revision, adapter}
//   Gap  — what an adapter could not analyse and why.
//
// A Gap is not an error state. The scanner rule is "NEVER guess. An
// unanalysable file is a Gap, not an omission" — so a Gap is the honest
// record that analysis stopped, carrying enough to point a human at the spot.

const FULL_SHA_RE = /^[a-f0-9]{40}$/i;

/**
 * The provenance classes a scanner may claim, a strict subset of the
 * published six (packages/core/renderers/shared/evidence-provenance.mjs).
 *
 * `authored` from a scanner would be a lie about a human; `inferred` would be
 * a guess dressed as a finding, which is the one thing the scanner rule
 * forbids; `runtime-observed` requires having run the system, which no static
 * adapter has; `source-backed` is the *resolution* of supplied evidence, not
 * a discovery. That leaves the two that describe machine analysis.
 *
 * @type {ReadonlyArray<string>}
 */
export const FACT_PROVENANCE = Object.freeze(['statically-derived', 'config-derived']);

function fail(field, detail) {
  throw new TypeError(`invalid fact: ${field} ${detail}`);
}

/**
 * Validate a fact's shape. Throws naming the offending field; returns a
 * plain, defensively-copied fact object on success.
 *
 * @param {object} fact
 */
export function assertFact(fact) {
  if (!fact || typeof fact !== 'object') fail('fact', 'must be an object');
  const { subject, predicate, object, provenance, location, revision, adapter } = fact;
  if (typeof subject !== 'string' || !subject.trim()) fail('subject', 'must be a non-empty string');
  if (typeof predicate !== 'string' || !predicate.trim()) fail('predicate', 'must be a non-empty string');
  if (typeof object !== 'string' || !object.trim()) fail('object', 'must be a non-empty string');
  if (!FACT_PROVENANCE.includes(provenance)) {
    fail('provenance', `must be one of ${FACT_PROVENANCE.join(', ')} (a scanner reports machine analysis, nothing else)`);
  }
  if (!location || typeof location !== 'object' || typeof location.path !== 'string' || !location.path.trim()) {
    fail('location', 'must carry a path (and optionally lines [start, end])');
  }
  if (location.lines !== undefined) {
    const ok = Array.isArray(location.lines)
      && location.lines.length === 2
      && location.lines.every((n) => Number.isInteger(n) && n >= 1)
      && location.lines[0] <= location.lines[1];
    if (!ok) fail('location', 'lines must be [start, end] with 1 <= start <= end');
  }
  if (typeof revision !== 'string' || !FULL_SHA_RE.test(revision)) {
    fail('revision', 'must be a full 40-character commit SHA');
  }
  if (typeof adapter !== 'string' || !adapter.trim()) fail('adapter', 'must name the adapter that produced this fact');

  return {
    subject: subject.trim(),
    predicate: predicate.trim(),
    object: object.trim(),
    provenance,
    location: {
      path: location.path,
      ...(location.lines ? { lines: [location.lines[0], location.lines[1]] } : {}),
    },
    revision: revision.toLowerCase(),
    adapter: adapter.trim(),
  };
}

/**
 * Validate a gap's shape: which adapter, which path, why, at which revision.
 *
 * @param {object} gap
 */
export function assertGap(gap) {
  if (!gap || typeof gap !== 'object') throw new TypeError('invalid gap: must be an object');
  const { adapter, path, reason, revision } = gap;
  if (typeof adapter !== 'string' || !adapter.trim()) throw new TypeError('invalid gap: adapter must name the adapter');
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('invalid gap: path must name what could not be analysed');
  if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('invalid gap: reason must say why analysis stopped');
  if (typeof revision !== 'string' || !FULL_SHA_RE.test(revision)) {
    throw new TypeError('invalid gap: revision must be a full 40-character commit SHA');
  }
  return { adapter: adapter.trim(), path: path.trim(), reason: reason.trim(), revision: revision.toLowerCase() };
}
