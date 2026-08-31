// `timeline` — how the system changed, from the history it is already cited to
// (row 6.20).
//
// The obvious implementation is to check out every commit, re-scan, and diff
// the models. It is also the wrong one: it costs an entire scan per commit, it
// needs a clean worktree nobody has, and it answers a question nobody asked --
// most components do not change in most commits.
//
// The model already knows which files each component is cited to. Git already
// knows which commits touched which files. Joining those two answers the real
// question -- when did this part of the system last move, and how often -- at
// the cost of one `git log` per path.
//
// What this therefore reports is CITED-FILE CHURN, and it says so. A commit
// that touched a component's cited file changed something in that file; it did
// not necessarily change the component's shape, its relationships, or its
// meaning. Calling that "the component changed" would be a claim about intent
// that a file path cannot support.
//
// A component with no citations gets no history, and is listed separately
// rather than reported as unchanged. Silence and stability look identical in a
// table, and only one of them is a fact.

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Every path a component cites, deduplicated. */
export function citedPaths(component) {
  const paths = new Set();
  for (const ref of asArray(component?.evidenceRefs)) {
    if (typeof ref === 'string') paths.add(ref);
    else if (ref?.path) paths.add(ref.path);
  }
  for (const source of asArray(component?.sources)) {
    if (source?.path) paths.add(source.path);
  }
  return [...paths];
}

/**
 * Build a timeline from a model and a commit lookup.
 *
 * `commitsFor(path)` is injected rather than called directly so this stays a
 * pure function: the tests drive it with a fixed history instead of a
 * repository, and the CLI passes one that shells out to git.
 *
 * @param {object} options
 * @param {object} options.model
 * @param {(path: string) => Array<{sha: string, date: string, subject: string, author: string}>} options.commitsFor
 * @param {number} [options.limit] most recent commits to keep per component
 * @returns {object}
 */
export function buildTimeline({ model, commitsFor, limit = 5 }) {
  if (typeof commitsFor !== 'function') {
    throw new TypeError('timeline: commitsFor(path) is required');
  }

  const entries = [];
  const uncited = [];

  for (const component of asArray(model.components)) {
    const paths = citedPaths(component);
    if (paths.length === 0) {
      // Not "unchanged" -- unknown. A component authored by hand has no cited
      // file, so history has nothing to say about it, and saying "no changes"
      // would read as stability it has not demonstrated.
      uncited.push({
        id: component.id,
        label: asArray(component.labels)[0] ?? component.id,
        reason: 'no cited source paths, so git history cannot speak to this component',
      });
      continue;
    }

    const byCommit = new Map();
    for (const filePath of paths) {
      for (const commit of commitsFor(filePath) ?? []) {
        if (!byCommit.has(commit.sha)) byCommit.set(commit.sha, { ...commit, paths: new Set() });
        byCommit.get(commit.sha).paths.add(filePath);
      }
    }

    const commits = [...byCommit.values()]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((commit) => ({ ...commit, paths: [...commit.paths] }));

    entries.push({
      id: component.id,
      label: asArray(component.labels)[0] ?? component.id,
      citedPaths: paths,
      commitCount: commits.length,
      lastChanged: commits[0] ?? null,
      commits: commits.slice(0, limit),
    });
  }

  // Most-churned first: the question behind this is usually "what is moving",
  // and a list in model order buries the answer.
  entries.sort((a, b) => b.commitCount - a.commitCount || String(a.id).localeCompare(String(b.id)));

  return {
    schemaVersion: 1,
    measures: 'cited-file churn',
    claim: 'Commits that touched a file this component is cited to. A commit here changed something in '
      + 'that file; it did not necessarily change this component, its relationships, or its meaning.',
    components: entries.length,
    uncitedComponents: uncited.length,
    entries,
    uncited,
  };
}
