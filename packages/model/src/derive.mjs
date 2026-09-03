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

import { builtinModules } from 'node:module';

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

/**
 * Where each source MODULE lives, longest directory first.
 *
 * A repository that declares no workspaces has no `contains-package` facts at
 * all, so every import edge lands as "outside any package" and the model
 * derives nothing. That is most repositories, and it made "point Mirofy at a
 * repository" produce an empty diagram for them -- the tool working exactly as
 * built and being useless.
 *
 * At that granularity the useful unit is the source directory, which is already
 * in the evidence: every dependency fact cites the file it came from. Nothing
 * new is scanned and nothing is guessed -- the directories are read off facts
 * the graph already holds.
 */
export function moduleIndex(facts) {
  const dirs = new Map();
  // Both ENDS of every edge. Taking only the importing file missed any module
  // that is imported and imports nothing itself -- a leaf: constants, types, a
  // pure helper. It never became a component, so the edge pointing at it found
  // no owner and was dropped as "outside any package": a silent omission, which
  // is the one thing this pipeline is built to refuse. The prepublish guard
  // caught it on a two-module repository.
  const consider = (file) => {
    if (!file) return;
    const cut = String(file).lastIndexOf('/');
    // A file at the repository root belongs to no directory, and inventing one
    // for it would be drawing something nobody wrote.
    if (cut === -1) return;
    const dir = String(file).slice(0, cut);
    if (!dirs.has(dir)) dirs.set(dir, file);
  };
  for (const fact of facts) {
    if (fact.predicate !== 'depends-on') continue;
    consider(fact.location?.path);
    // `package:...` targets are the registry, not a directory in this tree.
    if (!String(fact.object ?? '').startsWith('package:')) consider(fact.object);
  }
  return [...dirs.entries()]
    .map(([dir, file]) => ({ name: dir, dir: `${dir}/`, manifest: file }))
    .sort((a, b) => b.dir.length - a.dir.length);
}

/** The package that owns a path, or null when nothing does. */
export function ownerOf(filePath, packages) {
  const text = String(filePath ?? '');
  for (const entry of packages) {
    if (entry.dir && text.startsWith(entry.dir)) return entry;
  }
  return null;
}

const NODE_BUILTINS = new Set(builtinModules);

/** Classify a dependency target without guessing what it is. */
export function classifyTarget(object) {
  const text = String(object ?? '');
  if (text.startsWith('package:node:')) return { kind: 'node-builtin', name: text.slice('package:'.length) };
  // Python's standard library, for the same reason as node's: every file
  // imports os and typing, and drawing those buries the architecture.
  if (text.startsWith('package:python:')) return { kind: 'node-builtin', name: text.slice('package:'.length) };
  // Go's standard library and the JDK, for the same reason: every file in the
  // language imports some of it, so drawing those edges buries the architecture.
  if (text.startsWith('package:go:')) return { kind: 'node-builtin', name: text.slice('package:'.length) };
  if (text.startsWith('package:jdk:')) return { kind: 'node-builtin', name: text.slice('package:'.length) };
  if (text.startsWith('package:')) {
    const name = text.slice('package:'.length);
    // `import fs from 'fs'` is the same builtin as `import fs from 'node:fs'`,
    // and only the prefixed spelling was recognised. Pointed at shadcn-ui/ui,
    // Mirofy drew `fs`, `path` and `crypto` as architecture components -- while
    // the README promises builtins are "counted and named, not drawn". Both
    // spellings appear in the same evidence graph, so half the builtins were
    // being excluded and half were being drawn.
    //
    // Checked against Node's own list rather than a set maintained here: that
    // list is the authority on what resolves to a builtin, and a hand-written
    // copy goes stale the first time Node adds a module. A bare name that is
    // also a builtin resolves to the builtin in Node too, unless something has
    // gone out of its way to shadow it -- so this matches what actually runs.
    if (NODE_BUILTINS.has(name)) return { kind: 'node-builtin', name };
    return { kind: 'external-package', name };
  }
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
  const declared = packageIndex(facts);
  // One package is the same problem as none: the whole repository collapses to a
  // single node with every edge suppressed as internal. Both fall back to
  // modules. A workspace with two or more packages keeps package granularity,
  // so this repository's own model -- and every golden digest -- is untouched.
  const byModule = declared.length <= 1;
  const packages = byModule ? moduleIndex(facts) : declared;

  /** @type {Map<string, object>} */
  const components = new Map();
  for (const entry of packages) {
    components.set(entry.name, {
      id: entry.name,
      authoredId: false,
      kind: byModule ? 'module' : 'package',
      labels: [byModule
        ? entry.name.slice(entry.name.lastIndexOf('/') + 1)
        : entry.name.replace(/^@[^/]+\//, '')],
      // The evidence is the manifest for a package, and a real file inside it
      // for a module. Either way a component here can be checked, never taken
      // on trust.
      sources: [{ path: entry.manifest }],
      evidenceRefs: [{ path: entry.manifest }],
      // A manifest is configuration; a directory read off import statements is
      // not. Labelling a module config-derived would overstate what is known.
      provenance: byModule ? 'statically-derived' : 'config-derived',
      metadata: byModule ? { modulePath: entry.name } : { packageName: entry.name },
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
      toId = target.name;
      // A sibling workspace package is not a third-party dependency.
      //
      // In a monorepo you import your neighbour BY ITS PACKAGE NAME, which is
      // indistinguishable from an npm specifier until you check the manifests
      // this scan already read. vercel/next.js drew `next`, `@next/env` and
      // `@next/mdx` as dashed third-party boxes -- all three are in its own
      // packages/ directory, and the workspace adapter had already found all
      // twenty of them.
      if (components.has(toId)) {
        // Fall through to the internal branch below: the edge points at the
        // package this repository builds, not at a published copy of it.
      } else {
        if (!includeExternal) continue;
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
      }
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
    // Never overwrite. A workspace package and an import of its name are the
    // same thing, and the map wrote the external over the package -- which is
    // how a repository ended up depending on packages it builds itself.
    if (!components.has(external.id)) components.set(external.id, external);
  }

  // Two boxes reading the same word are worse than one long one.
  //
  // A workspace package drops its npm scope, because a monorepo where every
  // box says `@next/` has spent its width on the part that is the same. An
  // external keeps its full name. So `@shadcn/react` and the `react` on npm
  // both came out as "react" -- two boxes, one word, in the same diagram, and
  // no way for a reader to tell which was theirs.
  //
  // The scope comes back only where it is doing work. Shortening stays the
  // default and the exception is the collision, so the common case is
  // unchanged and the ambiguous one is impossible.
  const byLabel = new Map();
  for (const component of components.values()) {
    const label = component.labels?.[0];
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(component);
  }
  // Lengthened by the SHORTEST suffix that tells them apart, not replaced by
  // the whole id.
  //
  // Falling back to the full id is fine when two names collide and terrible
  // when a hundred do. A Java repository mirrors its package tree under
  // src/main/java and src/test/java, so every package collides with itself and
  // every box became a path: `gson/src/main/java/com/google/gson`, which the
  // renderer then middle-truncates to `gson/src/main/...m/google/gson`. The
  // distinguishing part is one segment; the rest is what they have in common.
  for (const sharing of byLabel.values()) {
    if (sharing.length < 2) continue;
    for (const component of sharing) {
      const segments = String(component.id).split('/');
      let label = component.labels?.[0] ?? component.id;
      for (let take = 2; take <= segments.length; take += 1) {
        label = segments.slice(-take).join('/');
        const clash = sharing.some((other) => other !== component
          && String(other.id).split('/').slice(-take).join('/') === label);
        if (!clash) break;
      }
      // Keep the two segments that carry meaning and elide the shared middle.
      // `main/java/com/google/gson` and `test/java/com/google/gson` differ in
      // one segment five deep; spelling out the four they share to reach it
      // spends the whole box on the part that is the same.
      const parts = label.split('/');
      component.labels = [parts.length > 2
        ? `${parts[0]}/…/${parts[parts.length - 1]}`
        : label];
    }
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
