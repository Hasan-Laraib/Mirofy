// Deriving a system model from the evidence graph (row 1.19).
//
// Until now the model was built only from AUTHORED documents, and the graph was
// used solely to attach citations to names that already matched. That meant the
// headline claim -- point it at a repository and it builds a model of the
// system -- was not what happened: someone still had to write the diagram, and
// 987 scanned facts about this repository joined to nothing.
//
// This closes that. Components and relationships come out of the facts, so the
// model describes the code rather than describing a description of it.
//
// Three rules keep it honest.
//
// NOTHING IS INVENTED. A component is a package the scanner actually found a
// manifest for. A relationship is an import the scanner actually read, and it
// carries the file and line that produced it. There is no inference step where
// a plausible edge could appear.
//
// A COMPONENT'S KIND IS `package`, not a guess. The scanner knows a manifest
// exists; it does not know whether something is a "backend" or a "database",
// and labelling it would be dressing a guess as a fact. A human override can
// say so later -- that is what overrides are for.
//
// WHAT IS NOT MODELLED IS REPORTED. 769 of this repository's 974 dependency
// facts point at Node builtins, and drawing an edge to `node:fs` from every
// package would bury the architecture in noise. Leaving them out is a
// modelling decision, so it comes back in the receipt with its reason rather
// than vanishing.

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Facts, whether given a raw graph object or an EvidenceGraph instance. */
function factsOf(graph) {
  if (!graph) return [];
  if (typeof graph.facts === 'function') return graph.facts({});
  return asArray(graph.facts);
}

/**
 * Where each package lives, longest directory first.
 *
 * Longest-first matters: `packages/core/test/x.mjs` must resolve to
 * `packages/core`, and with a shorter prefix checked first a nested package
 * would be attributed to its parent.
 */
export function packageIndex(facts) {
  const packages = [];
  for (const fact of facts) {
    if (fact.predicate !== 'contains-package') continue;
    const manifest = fact.location?.path ?? null;
    if (!manifest) continue;
    const dir = manifest.replace(/package\.json$/, '');
    packages.push({ name: String(fact.object), dir, manifest });
  }
  packages.sort((a, b) => b.dir.length - a.dir.length);
  return packages;
}

/** The package that owns a path, or null when nothing does. */
export function ownerOf(filePath, packages) {
  const text = String(filePath ?? '');
  for (const entry of packages) {
    if (entry.dir && text.startsWith(entry.dir)) return entry;
  }
  return null;
}

/** Classify a dependency target without guessing what it is. */
export function classifyTarget(object) {
  const text = String(object ?? '');
  if (text.startsWith('package:node:')) return { kind: 'node-builtin', name: text.slice('package:'.length) };
  if (text.startsWith('package:')) return { kind: 'external-package', name: text.slice('package:'.length) };
  return { kind: 'path', name: text };
}

/**
 * Build components and relationships from an evidence graph.
 *
 * @param {object} graph an evidence graph, raw or EvidenceGraph
 * @param {{includeExternal?: boolean}} [options]
 * @returns {{components: object[], relationships: object[], notModelled: object[]}}
 */
export function deriveFromGraph(graph, { includeExternal = true } = {}) {
  const facts = factsOf(graph);
  const packages = packageIndex(facts);

  /** @type {Map<string, object>} */
  const components = new Map();
  for (const entry of packages) {
    components.set(entry.name, {
      id: entry.name,
      authoredId: false,
      kind: 'package',
      labels: [entry.name.replace(/^@[^/]+\//, '')],
      // The manifest IS the evidence. A component here can always be checked.
      sources: [{ path: entry.manifest }],
      evidenceRefs: [{ path: entry.manifest }],
      provenance: 'config-derived',
      metadata: { packageName: entry.name },
    });
  }

  /** @type {Map<string, object>} */
  const edges = new Map();
  const externals = new Map();
  let nodeBuiltins = 0;
  let unowned = 0;
  let internal = 0;

  for (const fact of facts) {
    if (fact.predicate !== 'depends-on') continue;
    const from = ownerOf(fact.location?.path ?? fact.subject, packages);
    if (!from) { unowned += 1; continue; }

    const target = classifyTarget(fact.object);
    if (target.kind === 'node-builtin') { nodeBuiltins += 1; continue; }

    let toId = null;
    if (target.kind === 'external-package') {
      if (!includeExternal) continue;
      toId = target.name;
      if (!externals.has(toId)) {
        externals.set(toId, {
          id: toId,
          authoredId: false,
          kind: 'external',
          labels: [toId],
          sources: [],
          evidenceRefs: [],
          provenance: 'statically-derived',
          metadata: { external: true },
        });
      }
      externals.get(toId).evidenceRefs.push({ path: fact.location?.path, lines: fact.location?.lines });
    } else {
      const owner = ownerOf(target.name, packages);
      if (!owner) { unowned += 1; continue; }
      // A package importing its own files is not an architecture edge; it is
      // the inside of one component.
      if (owner.name === from.name) { internal += 1; continue; }
      toId = owner.name;
    }

    const key = `${from.name} -> ${toId}`;
    if (!edges.has(key)) {
      edges.set(key, {
        id: `derived-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`,
        authoredId: false,
        kind: 'relationship',
        from: from.name,
        to: toId,
        labels: ['imports'],
        sources: [],
        evidenceRefs: [],
        provenance: 'statically-derived',
        metadata: { importCount: 0 },
      });
    }
    const edge = edges.get(key);
    edge.metadata.importCount += 1;
    // Every citing line, so a reader can check any edge rather than trust it.
    edge.evidenceRefs.push({ path: fact.location?.path, lines: fact.location?.lines });
    if (!edge.sources.some((source) => source.path === fact.location?.path)) {
      edge.sources.push({ path: fact.location?.path, line: fact.location?.lines?.[0] });
    }
  }

  for (const external of externals.values()) {
    external.sources = external.evidenceRefs
      .filter((ref, index, all) => all.findIndex((other) => other.path === ref.path) === index)
      .map((ref) => ({ path: ref.path, line: ref.lines?.[0] }));
    components.set(external.id, external);
  }

  const notModelled = [];
  if (nodeBuiltins > 0) {
    notModelled.push({
      what: 'Node builtin imports',
      count: nodeBuiltins,
      reason: 'Every package imports node:fs and node:path. Drawing those edges would bury the '
        + 'architecture in noise, so they are counted here rather than represented.',
    });
  }
  if (internal > 0) {
    notModelled.push({
      what: 'imports within one package',
      count: internal,
      reason: 'A package importing its own files is the inside of a component, not an edge between two.',
    });
  }
  if (unowned > 0) {
    notModelled.push({
      what: 'dependencies outside any package',
      count: unowned,
      reason: 'The importing or imported file sits under no manifest the scanner found, so there is '
        + 'no component to attach the edge to.',
    });
  }

  return {
    components: [...components.values()],
    relationships: [...edges.values()],
    notModelled,
  };
}
