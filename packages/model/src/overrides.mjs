// Human overrides (row 1.17). The rule, verbatim from
// 31-V1-ARCHITECTURE.md §3:
//
//   human overrides are recorded as `authored` provenance, never disguised
//   as derived.
//
// The point is not bookkeeping. An override is a person disagreeing with the
// analysis, and if the overridden object keeps saying `statically-derived`
// then a human decision is wearing the authority of machine evidence. So an
// override always re-provenances to `authored`, and what it replaced stays on
// record so the disagreement is inspectable rather than erased.

const AUTHORED = 'authored';
const OVERRIDABLE = ['label', 'kind', 'owner', 'deployment', 'from', 'to'];

/**
 * Apply overrides in place. Returns the model for convenience.
 *
 * An override naming an id the model does not contain THROWS. A typo'd
 * override that quietly does nothing is the failure mode worth preventing:
 * the author believes they corrected the model, the model disagrees, and
 * nothing says so.
 *
 * @param {{components: object[], relationships: object[], boundaries: object[]}} model
 * @param {Array<{id: string, [field: string]: unknown}>} overrides
 */
export function applyOverrides(model, overrides = []) {
  if (!overrides.length) return model;
  const byId = new Map();
  for (const entry of [...model.components, ...model.relationships, ...model.boundaries]) {
    byId.set(entry.id, entry);
  }

  for (const override of overrides) {
    if (!override || typeof override.id !== 'string') {
      throw new TypeError('override: every override must name the id it applies to');
    }
    const target = byId.get(override.id);
    if (!target) {
      throw new RangeError(`override: no model object has id ${JSON.stringify(override.id)}`);
    }

    const previous = {
      previousProvenance: target.provenance,
      previousLabels: [...target.labels],
      fields: {},
    };

    for (const field of OVERRIDABLE) {
      if (!(field in override)) continue;
      if (field === 'label') {
        previous.fields.label = [...target.labels];
        // The override's label leads; the analysed labels stay behind it, so
        // the model still shows what the machine called this thing.
        target.labels = [override.label, ...target.labels.filter((l) => l !== override.label)];
        continue;
      }
      if (field === 'owner' || field === 'deployment') {
        previous.fields[field] = target.metadata?.[field];
        target.metadata = { ...target.metadata, [field]: override[field] };
        continue;
      }
      previous.fields[field] = target[field];
      target[field] = override[field];
    }

    target.provenance = AUTHORED;
    target.overridden = previous;
  }

  return model;
}
