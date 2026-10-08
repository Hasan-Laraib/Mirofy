// Judgments into a model, and nothing else into it.
//
// WHY THIS NEEDS NO SCHEMA CHANGE. Every object in packages/core/schemas/ sets
// `additionalProperties: false`, so a new `confidence` field on a connection
// would mean editing core -- which trips scripts/check-core-drift.mjs and
// forces a manifest re-baseline for what is, from core's point of view, no
// change at all.
//
// It is not needed. packages/compile/src/compile.mjs already does this:
//
//     label: relationship.labels?.[0] ?? null,
//     provenance: relationship.provenance,
//
// -- both passed through verbatim. And the viewer already paints the result:
//
//     [data-provenance="inferred"] { stroke-dasharray: 3 5; opacity: 0.55; }
//
// So a relationship carrying `provenance: 'inferred'` and a label renders as a
// faded dashed edge through the existing pipeline, with nothing in core,
// compile, layout, the renderers or the viewer changed.
//
// WHY `inferred` IS THE RIGHT CLASS AND NOT AN ABUSE OF ONE. It is the sixth
// of the six published classes, it is in the schema enum, and no production
// code path emits it -- because packages/evidence/src/fact.mjs forbids a
// SCANNER from emitting it: "a guess dressed as a finding, which is the one
// thing the scanner rule forbids". That rule is about scanners. This is not a
// scanner, it does not pretend a guess is a finding, and it prints the
// probability on the edge.

/** Judgments at or above this probability are drawn. */
export const DEFAULT_MIN = 0.5;

/**
 * How a judged edge reads.
 *
 * "p" is a probability, which is exactly what a `noul` answer returns. The
 * word "confidence" is never used: TypeSafe documents that field only as a
 * normalised spread of the distribution, and printing it as a likelihood of
 * being right would be the kind of flattering number this repository exists to
 * refuse.
 *
 * @param {number} probability
 * @returns {string}
 */
export function labelFor(probability) {
  return `may import · p ${probability.toFixed(2)}`;
}

/**
 * A stable id for a judged edge, distinct from the `derived-` ids
 * packages/model/src/derive.mjs mints, so the two can never collide or be
 * mistaken for one another in a diff.
 *
 * @param {string} from @param {string} to
 */
export function judgedId(from, to) {
  return `judged-${`${from} -> ${to}`.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

/**
 * Add accepted judgments to a model as `inferred` relationships.
 *
 * PURE. The input model is not mutated; a new one comes back. A function that
 * edited the caller's model in place would make "the judged model" and "the
 * model" the same object, and the un-judged model is the one every other
 * command in this repository is entitled to.
 *
 * @param {object} model
 * @param {Array<object>} judgments
 * @param {{min?: number}} [options]
 * @returns {{model: object, drawn: Array<object>, withheld: Array<object>}}
 */
export function annotate(model, judgments, { min = DEFAULT_MIN } = {}) {
  const existing = Array.isArray(model?.relationships) ? model.relationships : [];
  const known = new Set(existing.filter((edge) => edge?.from && edge?.to).map((edge) => `${edge.from} -> ${edge.to}`));

  const drawn = [];
  const withheld = [];
  const added = [];

  for (const judgment of Array.isArray(judgments) ? judgments : []) {
    if (!(typeof judgment?.probability === 'number')) {
      withheld.push({ ...judgment, withheld_because: 'no probability' });
      continue;
    }
    if (judgment.probability < min) {
      // Recorded, not drawn. "We asked and it said probably not" is a finding,
      // and dropping it would leave the file implying we never asked.
      withheld.push({ ...judgment, withheld_because: `below --min ${min}` });
      continue;
    }
    if (!judgment.gap || typeof judgment.gap.path !== 'string') {
      // An edge with nowhere to point is the one thing this repository will
      // not draw. Every other relationship in a model carries the file it came
      // from; a judged one carries the file the scanner gave up in. Without
      // that there is no citation, so there is no edge -- and refusing here is
      // better than the TypeError this used to be.
      withheld.push({ ...judgment, withheld_because: 'no gap citation' });
      continue;
    }
    const key = `${judgment.from} -> ${judgment.to}`;
    if (known.has(key)) {
      withheld.push({ ...judgment, withheld_because: 'the scanner already proved this edge' });
      continue;
    }
    known.add(key);

    added.push({
      id: judgedId(judgment.from, judgment.to),
      authoredId: false,
      kind: 'relationship',
      from: judgment.from,
      to: judgment.to,
      labels: [labelFor(judgment.probability)],
      // The citation is the GAP -- the place the scanner said it could not
      // see. That is a real location a reader can open, and it is the honest
      // evidence for this edge: not proof of the edge, but proof of the
      // question.
      sources: [{ path: judgment.gap.path, line: judgment.gap.line }],
      evidenceRefs: [{ path: judgment.gap.path, lines: [judgment.gap.line, judgment.gap.line] }],
      provenance: 'inferred',
      metadata: {
        judged: true,
        probability: judgment.probability,
        model: judgment.asked?.model ?? null,
        request_id: judgment.asked?.request_id ?? null,
        state_sha256: judgment.asked?.state_sha256 ?? null,
      },
    });
    drawn.push(judgment);
  }

  return {
    model: { ...model, relationships: [...existing, ...added] },
    drawn,
    withheld,
  };
}
