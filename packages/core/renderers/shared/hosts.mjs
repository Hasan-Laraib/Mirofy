// Host adapters for repository evidence: which forge a repository URL points
// at, what its canonical owner/name slug is, and how it addresses a line range
// in a file at a revision.
//
// Verification itself was never host-bound -- it runs `git` against a real
// checkout, and git does not care where the remote lives. Four things were:
// the slug regex, an outright rejection of anything not on github.com, the
// blob-URL builder, and the viewer's repository link. All four now go through
// this module.
//
// The line-range fragment is where forges genuinely disagree, and getting one
// wrong is the worst failure available here: it produces a confident,
// clickable link to nothing. Evidence that points somewhere wrong is worse
// than evidence that admits it cannot link -- so an unrecognised host is
// REFUSED by name rather than guessed at with a plausible-looking template.

const strip = (value) => String(value || '').trim().replace(/\.git\/?$/i, '').replace(/\/+$/, '');

// Each forge accepts https, ssh:// and scp-style git@ remotes for the same
// repository; an author may legitimately paste any of them.
function matchers(domain) {
  const d = domain.replace(/\./g, '\\.');
  return [
    new RegExp(`^https://${d}/(.+)$`, 'i'),
    new RegExp(`^ssh://git@${d}/(.+)$`, 'i'),
    new RegExp(`^git@${d}:(.+)$`, 'i'),
  ];
}

function twoSegmentSlug(rest) {
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`.toLowerCase();
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/**
 * One adapter per forge. `web` is the canonical https base for the repository,
 * rebuilt from the slug so that an ssh remote still yields a browsable link.
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   domain: string,
 *   slugOf: (rest: string) => string | null,
 *   blob: (web: string, revision: string, path: string, line?: number, endLine?: number) => string,
 *   tree: (web: string, revision: string) => string,
 * }>}
 */
export const HOSTS = Object.freeze([
  {
    id: 'github',
    domain: 'github.com',
    slugOf: twoSegmentSlug,
    blob: (web, revision, path, line, endLine) =>
      `${web}/blob/${revision}/${encodePath(path)}`
      + (line ? `#L${line}${endLine && endLine !== line ? `-L${endLine}` : ''}` : ''),
    tree: (web, revision) => `${web}/tree/${revision}`,
  },
  {
    id: 'gitlab',
    domain: 'gitlab.com',
    slugOf: twoSegmentSlug,
    // GitLab's second line number carries no "L" prefix: #L4-9, not #L4-L9.
    blob: (web, revision, path, line, endLine) =>
      `${web}/-/blob/${revision}/${encodePath(path)}`
      + (line ? `#L${line}${endLine && endLine !== line ? `-${endLine}` : ''}` : ''),
    tree: (web, revision) => `${web}/-/tree/${revision}`,
  },
  {
    id: 'bitbucket',
    domain: 'bitbucket.org',
    slugOf: twoSegmentSlug,
    blob: (web, revision, path, line, endLine) =>
      `${web}/src/${revision}/${encodePath(path)}`
      + (line ? `#lines-${line}${endLine && endLine !== line ? `:${endLine}` : ''}` : ''),
    tree: (web, revision) => `${web}/src/${revision}`,
  },
  {
    id: 'gitea',
    domain: 'gitea.com',
    slugOf: twoSegmentSlug,
    blob: (web, revision, path, line, endLine) =>
      `${web}/src/commit/${revision}/${encodePath(path)}`
      + (line ? `#L${line}${endLine && endLine !== line ? `-L${endLine}` : ''}` : ''),
    tree: (web, revision) => `${web}/src/commit/${revision}`,
  },
  {
    id: 'gitee',
    domain: 'gitee.com',
    slugOf: twoSegmentSlug,
    blob: (web, revision, path, line, endLine) =>
      `${web}/src/commit/${revision}/${encodePath(path)}`
      + (line ? `#L${line}${endLine && endLine !== line ? `-L${endLine}` : ''}` : ''),
    tree: (web, revision) => `${web}/src/commit/${revision}`,
  },
  {
    id: 'azure-devops',
    domain: 'dev.azure.com',
    // Azure paths are organisation/project/_git/repository -- four segments,
    // not two, and the _git marker is load-bearing rather than decorative.
    slugOf: (rest) => {
      const parts = rest.split('/').filter(Boolean);
      const gitIndex = parts.indexOf('_git');
      if (gitIndex < 1 || gitIndex === parts.length - 1) return null;
      return parts.slice(0, gitIndex + 2).join('/').toLowerCase();
    },
    // Azure addresses files by query string, not by path, and percent-encodes
    // the separators inside `path`.
    blob: (web, revision, path, line, endLine) =>
      `${web}?path=${encodeURIComponent(path)}&version=GC${revision}`
      + (line ? `&line=${line}${endLine && endLine !== line ? `&lineEnd=${endLine}` : ''}` : ''),
    tree: (web, revision) => `${web}?version=GC${revision}`,
  },
]);

/**
 * Identify the forge behind a repository URL.
 *
 * Returns null rather than guessing. A caller that wants to fail should fail
 * with the supported list in hand (see HOSTS), because an author cannot guess
 * which forges are understood from a rejection that does not say.
 *
 * @param {string} url
 * @returns {{ id: string, slug: string, web: string,
 *             blobUrl: (revision: string, path: string, line?: number, endLine?: number) => string,
 *             treeUrl: (revision: string) => string } | null}
 */
export function detectHost(url) {
  const raw = strip(url);
  if (!raw) return null;
  for (const host of HOSTS) {
    for (const matcher of matchers(host.domain)) {
      const match = raw.match(matcher);
      if (!match) continue;
      const slug = host.slugOf(match[1]);
      if (!slug) continue;
      const web = `https://${host.domain}/${slug}`;
      return {
        id: host.id,
        slug,
        web,
        blobUrl: (revision, path, line, endLine) => host.blob(web, revision, path, line, endLine),
        treeUrl: (revision) => host.tree(web, revision),
      };
    }
  }
  return null;
}

/** The supported forge ids, for diagnostics that must name them. */
export const HOST_IDS = Object.freeze(HOSTS.map((host) => host.id));
