// Graph queries over the system model (rows 6.19, and the engine row 6.18
// serves over MCP).
//
// The questions are the ones people actually ask about a system they did not
// write: what calls this, what breaks if I change it, what touches the payment
// data, is anything here unreachable.
//
// A search tool answers those by pattern-matching text and hoping. This
// answers them from the model built out of the evidence graph, which means
// every answer can carry the citations it came from -- and, more importantly,
// can say where it is BLIND.
//
// That second half is the whole point and it is what makes these answers safe
// to act on. "Nothing calls PaymentService" is a useful answer if the scan
// read every file, and a dangerous one if six files failed to parse. So every
// result carries an `incompleteness` block naming the gaps that could change
// it. No query here ever returns a bare list.
//
// Nothing is inferred that the model does not state. If a relationship is not
// in the model, this does not guess that it might exist; it reports the gaps
// that could be hiding one.

/** The verbs `explain` understands. */
export const VERBS = Object.freeze([
  'callers', 'dependencies', 'impact', 'upstream', 'path', 'find', 'orphans', 'gaps', 'summary',
]);

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Index a model once; every verb reads this rather than re-scanning. */
export function indexModel(model) {
  const components = new Map();
  for (const component of asArray(model.components)) components.set(component.id, component);

  /** @type {Map<string, Array<object>>} */
  const outgoing = new Map();
  /** @type {Map<string, Array<object>>} */
  const incoming = new Map();
  for (const relationship of asArray(model.relationships)) {
    if (!outgoing.has(relationship.from)) outgoing.set(relationship.from, []);
    if (!incoming.has(relationship.to)) incoming.set(relationship.to, []);
    outgoing.get(relationship.from).push(relationship);
    incoming.get(relationship.to).push(relationship);
  }
  return { model, components, outgoing, incoming };
}

/**
 * What this answer could be wrong about.
 *
 * Built from the evidence graph's gaps, not invented. A gap is a file the
 * scanner could not analyse; any relationship inside it is invisible to every
 * query here, so an answer that omits it is incomplete rather than negative.
 *
 * When there are no gaps this says so explicitly rather than staying silent --
 * "complete" is information, and a missing field reads as an oversight.
 */
export function incompletenessFor(graph, { relevantPaths = null } = {}) {
  const gaps = asArray(graph?.gaps);
  // A gap records its path at the top level; `location` is the fact shape, not
  // the gap shape. Reading the wrong one made every gap report a null path,
  // which is a report nobody can act on.
  const gapPath = (gap) => gap.path ?? gap.location?.path ?? null;
  const relevant = relevantPaths
    ? gaps.filter((gap) => relevantPaths.some((prefix) => String(gapPath(gap) || '').includes(prefix)))
    : gaps;

  if (relevant.length === 0) {
    return {
      complete: true,
      gaps: [],
      note: 'The evidence graph reports no unanalysed files, so this answer covers everything scanned.',
    };
  }
  return {
    complete: false,
    gaps: relevant.map((gap) => ({
      path: gapPath(gap),
      adapter: gap.adapter ?? null,
      reason: gap.reason ?? gap.message ?? 'unanalysable',
    })),
    note: `${relevant.length} file(s) could not be analysed. A relationship inside one of them would `
      + 'not appear in this answer, so treat an empty or short result as "not found", never as "does not exist".',
  };
}

/** Everything a component cites, flattened for a receipt. */
function evidenceOf(component) {
  return [
    ...asArray(component?.evidenceRefs),
    ...asArray(component?.sources).map((source) => ({
      document: source.document ?? null,
      diagramType: source.diagramType ?? null,
      path: source.path ?? null,
    })),
  ];
}

function describe(component) {
  if (!component) return null;
  return {
    id: component.id,
    kind: component.kind ?? null,
    label: asArray(component.labels)[0] ?? component.id,
    provenance: component.provenance ?? null,
    evidence: evidenceOf(component),
  };
}

/** Walk the graph one direction, recording the hop count that found each node. */
function traverse(index, start, direction, maxDepth) {
  const edges = direction === 'downstream' ? index.outgoing : index.incoming;
  const step = direction === 'downstream' ? ((r) => r.to) : ((r) => r.from);
  const seen = new Map([[start, 0]]);
  const order = [];
  let frontier = [start];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next = [];
    for (const id of frontier) {
      for (const relationship of edges.get(id) || []) {
        const other = step(relationship);
        if (seen.has(other)) continue;
        seen.set(other, depth);
        order.push({ id: other, depth, via: relationship.id ?? null, from: relationship.from, to: relationship.to });
        next.push(other);
      }
    }
    frontier = next;
  }
  return order;
}

/**
 * Answer one question about a model.
 *
 * @param {object} options
 * @param {object} options.model
 * @param {object|null} [options.graph] the evidence graph, for the gap report
 * @param {string} options.verb
 * @param {string[]} [options.args]
 * @param {number} [options.depth]
 * @returns {object} an answer, always with an `incompleteness` block
 */
export function explain({ model, graph = null, verb, args = [], depth = 3 }) {
  if (!VERBS.includes(verb)) {
    throw new TypeError(`explain: unknown verb ${JSON.stringify(verb)}; expected one of ${VERBS.join(', ')}`);
  }
  const index = indexModel(model);
  const incompleteness = incompletenessFor(graph);
  const base = { verb, args, incompleteness };

  /** Refuse an unknown id rather than answering "nothing" about it. */
  const require1 = () => {
    const id = args[0];
    if (!id) throw new TypeError(`explain: ${verb} needs a component id`);
    if (!index.components.has(id)) {
      // "Nothing calls typo-service" is a true statement and a useless one.
      const known = [...index.components.keys()].filter((k) => k.includes(id) || id.includes(k)).slice(0, 5);
      throw new TypeError(`explain: no component ${JSON.stringify(id)} in the model.`
        + (known.length ? ` Did you mean: ${known.join(', ')}?` : ''));
    }
    return id;
  };

  switch (verb) {
    case 'callers': {
      const id = require1();
      const results = (index.incoming.get(id) || []).map((relationship) => ({
        ...describe(index.components.get(relationship.from)),
        via: relationship.id ?? null,
        label: asArray(relationship.labels)[0] ?? describe(index.components.get(relationship.from))?.label,
      }));
      return { ...base, subject: describe(index.components.get(id)), count: results.length, results };
    }
    case 'dependencies': {
      const id = require1();
      const results = (index.outgoing.get(id) || []).map((relationship) => ({
        ...describe(index.components.get(relationship.to)),
        via: relationship.id ?? null,
      }));
      return { ...base, subject: describe(index.components.get(id)), count: results.length, results };
    }
    case 'impact': {
      // "What changes if I modify this" is the downstream set. It is stated as
      // reachability, never as risk: this says what is CONNECTED, and whether
      // a change actually breaks any of it is a judgement the model cannot
      // make and will not pretend to.
      const id = require1();
      const reached = traverse(index, id, 'downstream', depth);
      return {
        ...base,
        subject: describe(index.components.get(id)),
        depth,
        count: reached.length,
        results: reached.map((hop) => ({ ...describe(index.components.get(hop.id)), depth: hop.depth })),
        claim: 'Reachability in the authored model. Not a claim about runtime behaviour, blast radius or breakage.',
      };
    }
    case 'upstream': {
      const id = require1();
      const reached = traverse(index, id, 'upstream', depth);
      return {
        ...base,
        subject: describe(index.components.get(id)),
        depth,
        count: reached.length,
        results: reached.map((hop) => ({ ...describe(index.components.get(hop.id)), depth: hop.depth })),
      };
    }
    case 'path': {
      const [from, to] = args;
      if (!from || !to) throw new TypeError('explain: path needs two component ids');
      for (const id of [from, to]) {
        if (!index.components.has(id)) throw new TypeError(`explain: no component ${JSON.stringify(id)} in the model`);
      }
      const previous = new Map([[from, null]]);
      const queue = [from];
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === to) break;
        for (const relationship of index.outgoing.get(current) || []) {
          if (previous.has(relationship.to)) continue;
          previous.set(relationship.to, current);
          queue.push(relationship.to);
        }
      }
      if (!previous.has(to)) {
        return {
          ...base,
          found: false,
          results: [],
          claim: 'No directed path exists in the authored model. With gaps present this means "none recorded", not "none exists".',
        };
      }
      const chain = [];
      for (let step = to; step !== null; step = previous.get(step)) chain.unshift(step);
      return { ...base, found: true, hops: chain.length - 1, results: chain.map((id) => describe(index.components.get(id))) };
    }
    case 'find': {
      const term = String(args[0] ?? '').toLowerCase();
      if (!term) throw new TypeError('explain: find needs a search term');
      const results = [...index.components.values()].filter((component) => {
        const haystack = [
          component.id,
          ...asArray(component.labels),
          ...Object.values(component.metadata ?? {}).map((v) => String(v)),
          component.kind ?? '',
        ].join(' ').toLowerCase();
        return haystack.includes(term);
      }).map(describe);
      return { ...base, term, count: results.length, results };
    }
    case 'orphans': {
      const results = [...index.components.values()]
        .filter((c) => (index.incoming.get(c.id) || []).length === 0 && (index.outgoing.get(c.id) || []).length === 0)
        .map(describe);
      return { ...base, count: results.length, results };
    }
    case 'gaps': {
      const gaps = asArray(graph?.gaps);
      return { ...base, count: gaps.length, results: gaps };
    }
    case 'summary':
    default: {
      return {
        ...base,
        components: index.components.size,
        relationships: asArray(model.relationships).length,
        boundaries: asArray(model.boundaries).length,
        provenance: model.provenanceSummary ?? {},
      };
    }
  }
}
