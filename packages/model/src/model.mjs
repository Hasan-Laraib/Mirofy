// The system model (row 1.14). Contract, from 31-V1-ARCHITECTURE.md §3:
//
//   input:   evidence graph + optional human overrides
//   output:  Component[] Relationship[] Boundary[] — each with
//            evidenceRefs[] + provenance
//   rule:    human overrides are recorded as `authored` provenance, never
//            disguised as derived.
//
// One inventory; diagrams become views of it. The same component described by
// two documents is ONE model component carrying both documents' evidence --
// and both documents' labels, because a merge that keeps only the last label
// seen is a silent overwrite dressed as consolidation.

import { assignIds } from './ids.mjs';
import { applyOverrides } from './overrides.mjs';

const AUTHORED = 'authored';

function mergeInto(map, id, seed) {
  if (!map.has(id)) {
    map.set(id, {
      id,
      authoredId: seed.authoredId,
      kind: seed.kind,
      labels: [],
      sources: [],
      evidenceRefs: [],
      provenance: AUTHORED,
      metadata: {},
    });
  }
  return map.get(id);
}

function addLabel(entry, label) {
  if (typeof label === 'string' && label.trim() && !entry.labels.includes(label)) entry.labels.push(label);
}

/**
 * Facts whose subject or object names this object, so the model can cite the
 * evidence rather than merely claim a class.
 */
function factsFor(graph, id, labels) {
  if (!graph) return [];
  const names = new Set([id, ...labels]);
  return graph.facts({}).filter((fact) => names.has(fact.subject) || names.has(fact.object));
}

/**
 * Resolve provenance from cited evidence. With no evidence at all the answer
 * is `authored`: a hand-written document IS authored, and saying so is more
 * truthful than inventing a stronger class for it.
 */
function provenanceFrom(facts) {
  if (!facts.length) return AUTHORED;
  // Several facts may disagree; the strongest CLAIM about machine analysis
  // wins, and statically-derived outranks config-derived because code is a
  // more direct statement than configuration about it.
  if (facts.some((fact) => fact.provenance === 'statically-derived')) return 'statically-derived';
  return facts[0].provenance;
}

/**
 * @param {{documents?: object[], graph?: object|null, overrides?: object[]}} [input]
 * @returns {{schemaVersion: number, components: object[], relationships: object[],
 *            boundaries: object[], provenanceSummary: Record<string, number>}}
 */
export function buildModel({ documents = [], graph = null, overrides = [] } = {}) {
  const components = new Map();
  const relationships = new Map();
  const boundaries = new Map();

  for (const document of documents) {
    const assigned = assignIds(document);
    const title = document?.meta?.title ?? null;

    for (const component of assigned.components) {
      const entry = mergeInto(components, component.id, { ...component, kind: component.type ?? 'component' });
      addLabel(entry, component.label);
      entry.sources.push({ document: title, diagramType: document?.diagram_type ?? null });
      // First-class engineering metadata (row 1.15) travels into the model.
      if (component.owner) entry.metadata.owner = component.owner;
      if (component.deployment) entry.metadata.deployment = component.deployment;
    }

    for (const boundary of assigned.boundaries) {
      const entry = mergeInto(boundaries, boundary.id, { ...boundary, kind: boundary.kind ?? 'boundary' });
      addLabel(entry, boundary.label);
      entry.sources.push({ document: title, diagramType: document?.diagram_type ?? null });
      entry.wraps = [...new Set([...(entry.wraps ?? []), ...(boundary.wraps ?? [])])];
    }

    for (const relationship of assigned.relationships) {
      const entry = mergeInto(relationships, relationship.id, { ...relationship, kind: 'relationship' });
      addLabel(entry, relationship.label);
      entry.from = relationship.from;
      entry.to = relationship.to;
      entry.sources.push({ document: title, diagramType: document?.diagram_type ?? null });
    }
  }

  for (const map of [components, relationships, boundaries]) {
    for (const entry of map.values()) {
      const facts = factsFor(graph, entry.id, entry.labels);
      entry.evidenceRefs = facts.map((fact) => fact.id);
      entry.provenance = provenanceFrom(facts);
    }
  }

  const model = {
    schemaVersion: 1,
    components: [...components.values()],
    relationships: [...relationships.values()],
    boundaries: [...boundaries.values()],
    provenanceSummary: {},
  };

  applyOverrides(model, overrides);

  for (const entry of [...model.components, ...model.relationships, ...model.boundaries]) {
    model.provenanceSummary[entry.provenance] = (model.provenanceSummary[entry.provenance] ?? 0) + 1;
  }

  return model;
}
