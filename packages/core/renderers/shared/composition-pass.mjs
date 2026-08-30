// The shared composition pass (row 4.11): one declared table of which
// composition gates apply to which diagram type, and why any is exempt.
//
// The drift this ends was real and already present. Four renderers called
// all seven composition gates; `sequence` called six, silently missing
// `cleanEndpointSideProblems`. Nothing recorded whether that was a decision
// or an oversight, and nothing would have noticed a second one.
//
// So the table below is the source of truth, and composition-pass.test.mjs
// checks the renderers against it. A gate dropped from a renderer now fails
// the build; a gate that genuinely does not apply must be declared here WITH
// A REASON, which is the difference between an exemption and a gap.

/** Every composition gate, by the exported name each renderer calls. */
export const COMPOSITION_GATES = Object.freeze([
  'cleanEndpointSideProblems',
  'cleanFlowProblems',
  'cleanCrossingProblems',
  'cleanAmbiguousCorridorProblems',
  'cleanBorderRunProblems',
  'cleanRouteRhythmProblems',
  'cleanLabelRouteClearanceProblems',
]);

/** The five diagram types that render. */
export const DIAGRAM_TYPES = Object.freeze([
  'architecture',
  'dataflow',
  'lifecycle',
  'sequence',
  'workflow',
]);

/**
 * Declared exemptions: `diagramType -> { gate: reason }`.
 *
 * A reason is required, not decorative. "This gate does not apply" is a
 * claim about the diagram's geometry, and writing it down is what separates
 * a considered exemption from a gate someone forgot to wire up.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const COMPOSITION_EXEMPTIONS = Object.freeze({
  sequence: Object.freeze({
    cleanEndpointSideProblems:
      'Sequence messages run horizontally between fixed lifelines at an authored `y`. '
      + 'There is no fromSide/toSide to honour -- the schema has no such field and the '
      + 'renderer never reads one -- so the gate would have nothing to check.',
  }),
});

/**
 * The gates a given diagram type is expected to run.
 *
 * @param {string} diagramType
 * @returns {string[]}
 */
export function expectedGates(diagramType) {
  const exempt = COMPOSITION_EXEMPTIONS[diagramType] ?? {};
  return COMPOSITION_GATES.filter((gate) => !(gate in exempt));
}

/**
 * Why a gate is exempt for a diagram type, or null when it is not exempt.
 *
 * @param {string} diagramType
 * @param {string} gate
 * @returns {string|null}
 */
export function exemptionReason(diagramType, gate) {
  return COMPOSITION_EXEMPTIONS[diagramType]?.[gate] ?? null;
}
