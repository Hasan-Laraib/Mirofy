// Turning "the scanner could not resolve this import" into something a System
// One model can answer.
//
// Everything here is pure. The file reader arrives as an argument, so the
// candidate set for a given repository is a value that tests can build without
// a disk.
//
// THE STATE IS DELIBERATELY SMALL. TypeSafe publishes a per-version
// "jaggedness" page, and two of jev-1.13's listed defects are "large state
// full of irrelevant detail" and "indirection". Handing over a whole file to
// ask about one line walks into both. So the state carries the cited line, a
// few lines either side, and the two names -- nothing else.
//
// THE QUESTION IS NARROWED ON PURPOSE. The interesting failure is not "is this
// name in the file" (grep already answered that, which is why the name is a
// candidate at all) but "is this name a DEPENDENCY". A name inside a comment,
// a string literal or a doc block is not one. Asking the model to make exactly
// that distinction is asking it for the thing a parser could not do.

/** Lines of context kept either side of the cited line. */
const CONTEXT = 3;

/** Shortest component name worth matching. Two-character names match noise. */
const MIN_TOKEN = 3;

/**
 * The directory a component occupies, for both granularities `derive.mjs`
 * produces: a module component records its directory in metadata, a package
 * component is located by the manifest it was found through.
 *
 * @param {object} component
 * @returns {string|null}
 */
export function componentDir(component) {
  const modulePath = component?.metadata?.modulePath;
  if (typeof modulePath === 'string' && modulePath) return modulePath;
  const manifest = component?.sources?.[0]?.path;
  if (typeof manifest === 'string' && manifest.includes('/')) {
    return manifest.slice(0, manifest.lastIndexOf('/'));
  }
  return null;
}

/**
 * The component that owns a path: the longest directory prefix that matches.
 *
 * Longest-first for the same reason `derive.mjs` sorts that way -- with a
 * shorter prefix checked first, a nested package is attributed to its parent.
 *
 * @param {string} filePath
 * @param {Array<object>} components
 * @returns {object|null}
 */
export function ownerOf(filePath, components) {
  const text = String(filePath ?? '');
  let best = null;
  let bestLength = -1;
  for (const component of components ?? []) {
    const dir = componentDir(component);
    if (!dir) continue;
    if (text === dir || text.startsWith(`${dir}/`)) {
      if (dir.length > bestLength) {
        best = component;
        bestLength = dir.length;
      }
    }
  }
  return best;
}

/**
 * The names a component might be written as in someone else's source: its id,
 * its last path segment, and its label.
 *
 * @param {object} component
 * @returns {string[]}
 */
export function namesOf(component) {
  const names = new Set();
  const id = typeof component?.id === 'string' ? component.id : '';
  if (id) {
    names.add(id);
    names.add(id.slice(id.lastIndexOf('/') + 1));
  }
  const label = component?.labels?.[0];
  if (typeof label === 'string' && label) names.add(label);
  return [...names].filter((name) => name.length >= MIN_TOKEN);
}

/**
 * The lines around the cited one, as the model will see them.
 *
 * @param {string} source
 * @param {number} line 1-based, as the gap reason reports it
 * @returns {{excerpt: string, cited: string|null}}
 */
export function excerptAround(source, line) {
  const lines = String(source ?? '').split(/\r?\n/);
  const index = line - 1;
  if (index < 0 || index >= lines.length) return { excerpt: '', cited: null };
  const start = Math.max(0, index - CONTEXT);
  const end = Math.min(lines.length, index + CONTEXT + 1);
  const excerpt = lines
    .slice(start, end)
    .map((text, offset) => `${start + offset + 1}: ${text}`)
    .join('\n');
  return { excerpt, cited: lines[index] };
}

/**
 * Candidate relationships, one per (unresolved import, plausibly-named
 * component) pair.
 *
 * A candidate is not a claim. It is a pair worth ASKING about, and it exists
 * only because the scanner recorded a gap at that exact line and the candidate's
 * name occurs in that exact file. Nothing here invents a pair.
 *
 * @param {object} input
 * @param {Array<object>} input.questions from `unresolvedImports`
 * @param {Array<object>} input.components model components
 * @param {Array<object>} [input.relationships] existing edges, to avoid re-asking
 * @param {(path: string) => string|null} input.readFile
 * @returns {{candidates: Array<object>, unread: number}}
 */
export function buildCandidates({ questions, components, relationships = [], readFile }) {
  const known = new Set(
    (relationships ?? [])
      .filter((edge) => edge && edge.from && edge.to)
      .map((edge) => `${edge.from} -> ${edge.to}`),
  );

  const candidates = [];
  // A pair is asked about ONCE, however many gapped lines suggest it. Pointed
  // at this repository, one dispatcher with three computed imports made
  // `mirofy-cli -> @mirofy/evidence` a candidate three times -- three paid
  // calls to learn one thing, and three identical judgments of which
  // `annotate` would have drawn one anyway. The first citation is kept, so the
  // edge still points at a real line.
  const asked = new Set();
  let unread = 0;

  for (const question of questions ?? []) {
    const source = readFile(question.path);
    if (typeof source !== 'string') {
      // The scan read this file; this process could not. That is a fact about
      // this run, not about the repository, and it is counted rather than
      // quietly dropped.
      unread += 1;
      continue;
    }

    const owner = ownerOf(question.path, components);
    if (!owner) continue;

    const { excerpt, cited } = excerptAround(source, question.line);
    if (!cited) continue;

    for (const component of components ?? []) {
      if (component.id === owner.id) continue;
      const key = `${owner.id} -> ${component.id}`;
      // An edge the scanner already proved needs no opinion. Re-asking would
      // add a faded guess beside a solid fact about the same pair.
      if (known.has(key)) continue;
      if (asked.has(key)) continue;

      const matched = namesOf(component).find((name) => source.includes(name));
      if (!matched) continue;
      asked.add(key);

      candidates.push({
        from: owner.id,
        to: component.id,
        fromLabel: owner.labels?.[0] ?? owner.id,
        toLabel: component.labels?.[0] ?? component.id,
        matched,
        gap: question,
        state: {
          file: question.path,
          line: question.line,
          scanner_note: question.reason,
          excerpt,
          importing_component: owner.labels?.[0] ?? owner.id,
          candidate_component: component.labels?.[0] ?? component.id,
          candidate_named_in_file_as: matched,
        },
      });
    }
  }

  return { candidates, unread };
}

/**
 * The `noul` question for a candidate.
 *
 * `noul` and nothing else. The other two primitives return a `confidence`
 * field, and TypeSafe documents that field only as a normalised spread of the
 * probability distribution -- the AI SDK docs go further and say it "is not
 * the selected option's probability or a portable confidence measure". A noul
 * answer carries no `confidence` at all; it carries a probability, which is
 * the number this package actually wants and the only one it can honestly
 * print.
 *
 * `criteria` is optional on a noul and is supplied here because the true/false
 * split is the whole point: a name in a comment is not a dependency.
 *
 * @param {object} candidate
 * @returns {{type: 'noul', instructions: string, criteria: {true: string, false: string}}}
 */
export function noulFor(candidate) {
  return {
    type: 'noul',
    instructions:
      `A static scanner read ${candidate.state.file} and could not resolve the import at line `
      + `${candidate.state.line}. Judge whether that unresolved import refers to the component `
      + `"${candidate.toLabel}".`,
    criteria: {
      true: `The unresolved import at line ${candidate.state.line} loads "${candidate.toLabel}" as code at run time.`,
      false:
        `It refers to something else, or "${candidate.toLabel}" appears only in a comment, a string `
        + 'that is not a module path, documentation, or an unrelated identifier that happens to share the name.',
    },
  };
}
