// Which gaps are worth asking about, read off the reason the scanner wrote.
//
// A Gap is `{adapter, path, reason, revision}` (packages/evidence/src/fact.mjs).
// The reason is prose, written for a human, and it is the only place the line
// number survives -- `assertGap` keeps no structured location. So this module
// reads the reason back. That is a real coupling to the adapters' wording, and
// it is declared here rather than hidden: the patterns below quote the four
// shapes those adapters actually emit, and `test/gaps.test.mjs` pins each one
// against the literal string its adapter constructs.
//
// Only UNRESOLVED IMPORTS qualify. The distinction that matters:
//
//   computed import specifier at line 169; the target cannot be known
//   statically
//
// is a question -- the scanner read `import(someVar)`, could not resolve it,
// and said so. A reader usually can. That is a judgment worth buying.
//
//   unreadable: EACCES: permission denied
//
// is NOT a question. Nothing was read, so there is nothing to have an opinion
// about, and asking a model to guess the contents of a file it cannot see is
// the exact failure this whole package is built to avoid. It is skipped, and
// counted as skipped.

/**
 * The reason shapes that mean "an import is here and its target is unknown".
 *
 * Each names the adapter file it came from so a wording change can be traced
 * back. `specifier` is captured where the reason carries one; a computed
 * import has none by definition, which is why it is the interesting case.
 *
 * @type {ReadonlyArray<{kind: string, re: RegExp, from: string}>}
 */
const UNRESOLVED = Object.freeze([
  // imports.mjs, python.mjs, go.mjs, java.mjs, kotlin.mjs, rust.mjs. The word
  // "specifier" is present in imports.mjs and absent in the others.
  {
    kind: 'computed',
    re: /^computed import (?:specifier )?at line (\d+); the target cannot be known statically$/,
    from: 'imports.mjs and siblings',
  },
  // imports.mjs. The specifier is JSON.stringify'd into the reason.
  {
    kind: 'unresolved-relative',
    re: /^import of ("(?:[^"\\]|\\.)*") at line (\d+) resolves to no file$/,
    from: 'imports.mjs',
  },
  // python.mjs and siblings, both endings.
  {
    kind: 'unresolved-relative',
    re: /^relative import at line (\d+) (?:climbs above the repository root|resolves to no file in this repository)$/,
    from: 'python.mjs and siblings',
  },
  // java.mjs, kotlin.mjs: names something, but the owning package is unknown.
  {
    kind: 'unresolved-named',
    re: /^import at line (\d+) names (\S+?),/,
    from: 'java.mjs, kotlin.mjs',
  },
]);

/**
 * Read a gap's reason into a structured record, or null when the gap is not an
 * unresolved import.
 *
 * Returning null is the common case and is not a failure: most gaps are
 * unreadable files, YAML this adapter declines to guess at, and compose files
 * with no services. None of those is a question about a relationship.
 *
 * @param {{path?: string, reason?: string, adapter?: string}} gap
 * @returns {{path: string, line: number, kind: string, specifier: string|null, reason: string, adapter: string|null}|null}
 */
export function readGap(gap) {
  const reason = typeof gap?.reason === 'string' ? gap.reason : '';
  const path = typeof gap?.path === 'string' ? gap.path : '';
  if (!reason || !path) return null;

  for (const { kind, re } of UNRESOLVED) {
    const match = re.exec(reason);
    if (!match) continue;

    // The capture groups differ per pattern: some lead with a specifier, some
    // with the line. Taking "the first group that parses as an integer" is
    // what they have in common, and it does not depend on group order.
    const groups = match.slice(1);
    const lineText = groups.find((group) => /^\d+$/.test(group ?? ''));
    const line = Number(lineText);
    if (!Number.isInteger(line) || line < 1) return null;

    const rawSpecifier = groups.find((group) => group !== undefined && !/^\d+$/.test(group));
    return {
      path,
      line,
      kind,
      specifier: rawSpecifier === undefined ? null : unquote(rawSpecifier),
      reason,
      adapter: typeof gap.adapter === 'string' ? gap.adapter : null,
    };
  }
  return null;
}

/**
 * The specifier arrives JSON.stringify'd in one pattern and bare in another.
 * Parsing only when it actually looks like a JSON string keeps a bare
 * `com.example.Thing` untouched.
 *
 * @param {string} text
 * @returns {string}
 */
function unquote(text) {
  if (!text.startsWith('"')) return text;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'string' ? parsed : text;
  } catch {
    return text;
  }
}

/**
 * Every unresolved-import gap in a scan, in the order the scan recorded them.
 *
 * The count of what was skipped comes back too. A run that judged 4 of 300
 * gaps and reported only the 4 would imply it had looked at everything.
 *
 * @param {Array<object>} gaps
 * @returns {{questions: Array<object>, skipped: number}}
 */
export function unresolvedImports(gaps) {
  const questions = [];
  let skipped = 0;
  for (const gap of Array.isArray(gaps) ? gaps : []) {
    const read = readGap(gap);
    if (read) questions.push(read);
    else skipped += 1;
  }
  return { questions, skipped };
}
