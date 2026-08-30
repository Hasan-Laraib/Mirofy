// The evidence graph. Contract, verbatim from 31-V1-ARCHITECTURE.md §3:
//
//   input:   Fact[] from any adapter
//   output:  queryable graph; facts by subject/predicate/provenance
//   rule:    append-only per revision. A fact is never edited, only superseded.
//
// Append-only is enforced structurally rather than by convention: there is no
// update or delete method to misuse, stored facts are frozen copies of the
// caller's input (so mutating either side after the fact reaches nothing),
// and supersede() marks the old fact rather than touching its content. The
// tests exercise every observable route to mutation and expect a dead end.

import { assertFact, assertGap } from './fact.mjs';

export class EvidenceGraph {
  /** @type {Map<string, object>} insertion-ordered id → frozen fact */
  #facts = new Map();
  /** @type {Array<object>} frozen gaps, in arrival order */
  #gaps = [];
  #sequence = 0;

  #nextId() {
    this.#sequence += 1;
    return `f${this.#sequence}`;
  }

  /**
   * Append a fact. Returns its id. The stored fact is a frozen copy — the
   * caller's object stays the caller's.
   *
   * @param {object} fact
   * @returns {string}
   */
  append(fact) {
    const clean = assertFact(fact);
    const id = this.#nextId();
    const stored = Object.freeze({
      id,
      ...clean,
      location: Object.freeze({ ...clean.location, ...(clean.location.lines ? { lines: Object.freeze([...clean.location.lines]) } : {}) }),
      supersededBy: null,
    });
    this.#facts.set(id, stored);
    return id;
  }

  /**
   * Replace a fact without editing it: the old fact survives, marked with the
   * id that superseded it, and drops out of current-facts queries.
   *
   * @param {string} oldId
   * @param {object} fact
   * @returns {string} the replacement's id
   */
  supersede(oldId, fact) {
    const old = this.#facts.get(oldId);
    if (!old) throw new RangeError(`supersede: no fact with id ${JSON.stringify(oldId)}`);
    if (old.supersededBy) throw new RangeError(`supersede: fact ${oldId} is already superseded by ${old.supersededBy}`);
    const replacement = this.append(fact);
    // The one sanctioned transition: a frozen fact is re-stored with its
    // supersededBy filled in. Content fields never change.
    this.#facts.set(oldId, Object.freeze({ ...old, supersededBy: replacement }));
    return replacement;
  }

  /**
   * Query facts. Every filter is optional; every combination is total — an
   * empty answer is an empty array, never a throw. Superseded facts are
   * excluded unless asked for.
   *
   * @param {{subject?: string, predicate?: string, object?: string,
   *          provenance?: string, adapter?: string, revision?: string,
   *          includeSuperseded?: boolean}} [filter]
   * @returns {Array<object>}
   */
  facts(filter = {}) {
    const out = [];
    for (const fact of this.#facts.values()) {
      if (!filter.includeSuperseded && fact.supersededBy) continue;
      if (filter.subject !== undefined && fact.subject !== filter.subject) continue;
      if (filter.predicate !== undefined && fact.predicate !== filter.predicate) continue;
      if (filter.object !== undefined && fact.object !== filter.object) continue;
      if (filter.provenance !== undefined && fact.provenance !== filter.provenance) continue;
      if (filter.adapter !== undefined && fact.adapter !== filter.adapter) continue;
      if (filter.revision !== undefined && fact.revision !== filter.revision) continue;
      out.push(fact);
    }
    return out;
  }

  /** @param {object} gap */
  addGap(gap) {
    this.#gaps.push(Object.freeze(assertGap(gap)));
  }

  /** @returns {Array<object>} */
  gaps() {
    return [...this.#gaps];
  }

  toJSON() {
    return {
      schemaVersion: 1,
      facts: [...this.#facts.values()],
      gaps: this.gaps(),
    };
  }

  /**
   * Rebuild a graph from toJSON() output. Ids are preserved, so references
   * (supersededBy, coverage citations) stay valid across the round-trip.
   *
   * @param {{schemaVersion: number, facts: Array<object>, gaps: Array<object>}} data
   */
  static fromJSON(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.facts) || !Array.isArray(data.gaps)) {
      throw new TypeError('EvidenceGraph.fromJSON: not a schemaVersion-1 graph');
    }
    const graph = new EvidenceGraph();
    // Two passes so supersededBy can point forward as well as back.
    const ids = new Map();
    for (const fact of data.facts) {
      ids.set(fact.id, graph.append(fact));
    }
    for (const fact of data.facts) {
      if (!fact.supersededBy) continue;
      const oldId = ids.get(fact.id);
      const newId = ids.get(fact.supersededBy);
      const old = graph.#facts.get(oldId);
      graph.#facts.set(oldId, Object.freeze({ ...old, supersededBy: newId }));
    }
    for (const gap of data.gaps) graph.addGap(gap);
    return graph;
  }
}
