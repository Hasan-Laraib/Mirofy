// The six-class evidence provenance vocabulary: what kind of knowledge stands
// behind a node or a relationship.
//
// THREE NAMING COLLISIONS live in this repository. Grep with them in mind
// before you add anything here.
//
//   1. `authored` -- used throughout the renderers, bin/ and the viewer to
//      mean "the human wrote this GEOMETRY": authoredToSide, authoredPath,
//      authoredField, authoredStep, authoredSlug. That is a statement about
//      layout, not about evidence. The class below is a different `authored`.
//
//   2. `inferred` -- geometry.mjs (around lines 264-294) uses it for "we
//      guessed which side an edge attaches to". Also layout, not evidence.
//
//   3. `provenance` itself already means two other things here, and this is
//      the largest collision:
//        - ASSET provenance: brand-marks.mjs, generated-brand-marks.mjs and
//          references/brand-marks.md record where a brand logo came from
//          (source URL + SHA-256, across 107 marks). Most occurrences of the
//          word in this repository are these.
//        - DOCUMENT provenance: architecture-delta.mjs computes
//          provenanceChanged, meaning the repository metadata differs between
//          base and head.
//
// None of those may be renamed -- all are load-bearing and widely
// referenced -- and neither is evidence provenance. That is why this module
// is evidence-provenance.mjs rather than provenance.mjs, and why every class
// name is exported rather than written inline: a reader must be able to tell
// which `inferred` they are looking at from the surrounding token alone.
//
// The DOM carrier is the data attribute of the same name as this
// vocabulary, which is free of all three collisions above. It is spelled
// out where it is actually emitted, in the renderers -- not here. Row
// 5.17's contract gate scans these files as raw text, comments included,
// so naming an attribute in a comment beside code that does not emit it
// reads to that gate as an emission nothing consumes.

/**
 * The six classes, in the order the specification publishes them
 * (docs/analysis/36-VISUAL-SYSTEM.md V4, docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md row 2.5).
 *
 * This order is the DISPLAY order for the legend and the Passport. It is NOT
 * a confidence ranking, and it must not be re-sorted into one: `authored`
 * leads the list but is the weakest claim of the six -- it is what a subject
 * resolves to when no evidence of any kind was supplied (see
 * resolveProvenance below). Sorting this array by "strength" would silently
 * change the legend's reading order and the Passport's grouping.
 *
 * @type {ReadonlyArray<string>}
 */
export const PROVENANCE_CLASSES = Object.freeze([
  'authored',
  'source-backed',
  'statically-derived',
  'config-derived',
  'runtime-observed',
  'inferred',
]);

/** The class a subject carrying verified repository evidence resolves to. */
export const SOURCE_BACKED = 'source-backed';

/**
 * The class a subject resolves to when it claims nothing and carries nothing.
 * Truthful rather than flattering: a hand-written document IS authored, and
 * saying so is more honest than leaving the field blank or inventing a
 * stronger class for it.
 */
export const AUTHORED = 'authored';

/**
 * A type predicate, not a plain boolean: callers narrow `unknown` with it,
 * so `resolveProvenance` can return `subject.provenance` directly.
 * @type {(value: unknown) => value is string}
 */
export function isProvenanceClass(value) {
  return typeof value === 'string' && PROVENANCE_CLASSES.includes(value);
}

/**
 * Resolve the provenance class of a component or relationship.
 *
 * The rules, in order:
 *   1. An explicit, valid `provenance` on the subject wins. The author said
 *      what this is; nothing here second-guesses that.
 *   2. Otherwise, a subject carrying `sources` resolves to `source-backed`.
 *      Evidence that was supplied and verified should not need to be
 *      re-declared in a second field to be visible.
 *   3. Otherwise the fallback, `authored`.
 *
 * An explicit value that is NOT one of the six is deliberately not honoured
 * here -- schema validation rejects it long before this runs, and silently
 * accepting it downstream would let an unknown class reach the renderer and
 * paint nothing at all.
 *
 * @param {{ provenance?: unknown, sources?: unknown }} subject
 * @param {string} [fallback]
 * @returns {string}
 */
export function resolveProvenance(subject, fallback = AUTHORED) {
  if (subject && isProvenanceClass(subject.provenance)) return subject.provenance;
  if (subject && Array.isArray(subject.sources) && subject.sources.length > 0) return SOURCE_BACKED;
  return isProvenanceClass(fallback) ? fallback : AUTHORED;
}
