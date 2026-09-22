import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectHost, hostOrLocal, HOST_IDS } from './hosts.mjs';
import { throwDiagnosticError } from './diagnostics.mjs';

const FULL_SHA_RE = /^[a-f0-9]{40}$/i;
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;

function evidenceFailure(code, message, { subject = {}, evidence = {}, supportedFixes = [] } = {}) {
  throwDiagnosticError(message, [{
    code,
    severity: 'error',
    message,
    subject: { surface: 'repository-evidence', ...subject },
    evidence,
    supportedFixes,
  }]);
}

/**
 * Is this string shaped like a URL at all?
 *
 * Deliberately permissive: the question is "did the author mean to write a
 * URL", not "is this a forge we know". An unknown forge is handled by falling
 * back to the local adapter; gibberish is rejected here.
 */
function isUrlShaped(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/^(git@|ssh:\/\/)/.test(value.trim())) return true;
  try {
    const parsed = new URL(value.trim());
    return Boolean(parsed.protocol && parsed.hostname);
  } catch {
    return false;
  }
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) evidenceFailure('repository-evidence/git-unavailable', `Could not run Git: ${result.error.message}`, {
    evidence: { reason: result.error.message },
    supportedFixes: ['install Git and ensure it is available on PATH'],
  });
  return result;
}

function gitValue(repoRoot, args, failure) {
  const result = runGit(repoRoot, args);
  if (result.status !== 0) evidenceFailure('repository-evidence/git-command', failure, {
    evidence: { gitArgs: args, exitCode: result.status },
    supportedFixes: ['use the intended local Git repository and verify its origin and revision'],
  });
  return result.stdout.trim();
}

// Kept as a thin wrapper so the origin comparison below reads the same for
// every forge: two remotes match when they resolve to the same host and the
// same slug, whether they were written as https, ssh:// or git@.
/**
 * Are two paths the same directory?
 *
 * Separator- and case-normalised, because the two sides of this comparison
 * come from different sources: one from git, one from the filesystem.
 */
function samePath(left, right) {
  const normalise = (value) => {
    // realpathSync.native() expands Windows 8.3 short names.
    // os.tmpdir() answers C:\Users\RUNNER~1\... on CI while git reports the
    // long C:/Users/runneradmin/... form, and the plain realpathSync leaves
    // the short name intact -- so the same directory compared unequal on all
    // four Windows jobs. Same class of bug as P1a's libuv abort.
    try {
      value = fs.realpathSync.native(String(value));
    } catch {
      // Unreadable is the caller's problem, not this comparison's.
    }
    const resolved = path.resolve(String(value)).split(String.fromCharCode(92)).join('/').replace(/[/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalise(left) === normalise(right);
}

function remoteSlug(value) {
  const host = detectHost(value);
  return host ? `${host.id}:${host.slug}` : null;
}

/**
 * Reduce a remote URL to comparable text when neither side names a known
 * forge: https, ssh:// and git@ spellings of the same self-hosted remote all
 * collapse to "host/path", the way `remoteSlug` already does for a
 * recognised one.
 */
function normalisedRemoteText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const scp = raw.match(/^git@([^:]+):(.+)$/i);
  const withoutScheme = scp ? `${scp[1]}/${scp[2]}` : raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^/@]+@)?/, '');
  return withoutScheme.replace(/\.git\/?$/i, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Is the checkout's real origin the repository the diagram declares?
 *
 * Two recognised hosts match, or don't, by slug: `remoteSlug` already
 * collapses the https/ssh/scp spellings of the same GitHub (etc.) remote.
 * But `remoteSlug` returns null for ANY unrecognised remote -- a self-hosted
 * GitLab, an internal Gitea, an enterprise GitHub -- and `null === null`
 * would make this check pass for two completely unrelated unrecognised
 * remotes, which is worse than not checking at all: it looks like
 * verification happened. When neither side resolves to a known host, fall
 * back to comparing the two remotes as plain, normalised text instead.
 */
function sameRemote(origin, declaredUrl) {
  const originSlug = remoteSlug(origin);
  const declaredSlug = remoteSlug(declaredUrl);
  if (originSlug || declaredSlug) return originSlug === declaredSlug;
  return normalisedRemoteText(origin) === normalisedRemoteText(declaredUrl);
}

function verifiedSourcePath(value, where) {
  const sourcePath = String(value || '');
  if (!sourcePath || sourcePath.startsWith('/') || sourcePath.includes('\\') || CONTROL_CHARACTER_RE.test(sourcePath)) {
    evidenceFailure('repository-evidence/path-invalid', `${where} must be a repo-relative POSIX path.`, {
      subject: { path: where },
      evidence: { authoredPath: sourcePath },
      supportedFixes: ['use a repository-relative path with forward slashes'],
    });
  }
  const segments = sourcePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..') || segments[0] === '.git') {
    evidenceFailure('repository-evidence/path-escape', `${where} must stay inside the repository and may not address .git.`, {
      subject: { path: where },
      evidence: { authoredPath: sourcePath },
      supportedFixes: ['remove empty, dot, parent, or .git path segments'],
    });
  }
  return segments.join('/');
}

// The forge decides how a line range is addressed, and they genuinely
// disagree: GitLab omits the second "L", Bitbucket uses #lines-a:b, Azure
// uses query parameters. Building this shape here would mean one template
// for six forges.
function sourceHref(host, revision, source) {
  return host.blobUrl(revision, source.path, source.line, source.endLine);
}

function sourceLineCount(content) {
  if (!content.length) return 0;
  const lines = content.split(/\r\n|\n|\r/);
  return lines.length - (/(?:\r\n|\n|\r)$/.test(content) ? 1 : 0);
}

// The relationship array each diagram type calls its edges. These are the
// arrays that gained `sources` alongside architecture components, so evidence
// resolution has to walk them too -- a `sources` entry the schema accepts and
// resolution never reads is evidence that vanishes silently, which is the one
// failure mode this module exists to prevent.
const RELATIONSHIP_ARRAY = {
  architecture: 'connections',
  dataflow: 'flows',
  lifecycle: 'transitions',
  sequence: 'messages',
  workflow: 'edges',
};

// The single source of truth for "which diagram types can carry evidence".
// The CLI's --repo-root guard reads this rather than keeping its own list, so
// a sixth diagram type added without evidence support is rejected loudly
// instead of silently ignoring the flag.
export function supportsRepositoryEvidence(diagramType) {
  return Boolean(RELATIONSHIP_ARRAY[diagramType]);
}

function carriesSources(list) {
  return Array.isArray(list) && list.some((entry) => Array.isArray(entry?.sources) && entry.sources.length);
}

export function hasRepositoryEvidence(diagramType, diagram) {
  if (!RELATIONSHIP_ARRAY[diagramType]) return false;
  if (diagram?.meta?.repository || diagram?.meta?.repositories) return true;
  return carriesSources(diagram?.components) || carriesSources(diagram?.[RELATIONSHIP_ARRAY[diagramType]]);
}

/**
 * The repositories a document declares, as `id -> {id, url, revision}`.
 *
 * Two forms, and never both. `meta.repository` is the single-repository form
 * every document written before multi-repo support uses, and it keeps working
 * exactly as it did -- a migration nobody asked for is a bug. Its sources
 * carry no `repository` field, so they resolve against the one repository
 * under the reserved id below.
 *
 * `meta.repositories` names several. Declaring both is refused rather than
 * silently preferring one, because whichever a reader assumed would be right
 * half the time.
 */
const SINGLE = '';

function declaredRepositories(diagram) {
  const single = diagram.meta?.repository;
  const many = diagram.meta?.repositories;
  if (single && many) {
    evidenceFailure('repository-evidence/repository-form-ambiguous',
      'Declare either /meta/repository or /meta/repositories, not both.', {
        subject: { path: '/meta' },
        supportedFixes: ['remove /meta/repository and keep /meta/repositories, or the other way round'],
      });
  }
  if (many) return new Map(many.map((entry) => [entry.id, { ...entry }]));
  if (single) return new Map([[SINGLE, { id: SINGLE, ...single }]]);
  evidenceFailure('repository-evidence/repository-required',
    'Repository evidence requires /meta/repository or /meta/repositories.', {
      subject: { path: '/meta/repository' },
      supportedFixes: ['add the pinned public repository metadata or remove component sources'],
    });
  return new Map();
}

/**
 * Roots, as `id -> path`. `--repo-root <path>` is the single-repository form;
 * `--repo-root <id>=<path>`, repeatable, names one per repository.
 */
export function parseRepoRoots(input) {
  if (!input) return new Map();
  // A string may carry several roots, newline-separated, because that is how
  // they cross the process boundary from the CLI into the renderer.
  const values = Array.isArray(input) ? input : String(input).split(String.fromCharCode(10)).filter(Boolean);
  const roots = new Map();
  for (const value of values) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/.exec(String(value));
    if (match) roots.set(match[1], match[2]);
    else roots.set(SINGLE, String(value));
  }
  return roots;
}

/** Verify one repository's checkout and return everything a citation needs. */
function prepareRepository(entry, rootPath, declaredIds) {
  const where = entry.id === SINGLE ? '/meta/repository' : `/meta/repositories/${entry.id}`;
  if (!FULL_SHA_RE.test(entry.revision || '')) {
    evidenceFailure('repository-evidence/revision-invalid', `${where}/revision must be a full 40-character commit SHA.`, {
      subject: { path: `${where}/revision` },
      evidence: { revision: entry.revision },
      supportedFixes: ['pin one full 40-character commit SHA'],
    });
  }
  // A value that is not a URL at all is an authoring mistake, and still fails.
  // A well-formed URL on a forge we do not recognise -- a self-hosted GitLab,
  // an internal Gitea, an enterprise GitHub -- is a property of the repository
  // rather than a mistake: the evidence survives, the link does not. See the
  // design note in hosts.mjs.
  //
  // A repository with NO url is a different case, and is NOT supported: the
  // `entry.url &&` guard below is a shape check on a URL that is present, not
  // permission to omit one. Omitting it still fails a few lines down, at the
  // origin-remote-required check or at origin-mismatch, and the published
  // schema requires /meta/repository/url before either is reached. Relaxing
  // that is a public-contract change deferred to its own plan.
  if (entry.url && !isUrlShaped(entry.url)) {
    evidenceFailure('repository-evidence/url-invalid', `${where}/url must be a repository URL (supported hosts: ${HOST_IDS.join(', ')}).`, {
      subject: { path: `${where}/url` },
      evidence: { repositoryUrl: entry.url, supportedHosts: HOST_IDS },
      supportedFixes: [`use a canonical repository URL on one of: ${HOST_IDS.join(', ')}`],
    });
  }
  const host = hostOrLocal(entry.url);
  if (!rootPath) {
    // Naming WHICH repository is missing, and what was declared: with several
    // in play, "pass --repo-root" alone leaves the author guessing.
    const flag = entry.id === SINGLE ? '--repo-root <repository>' : `--repo-root ${entry.id}=<path>`;
    evidenceFailure('repository-evidence/root-required',
      `This diagram declares source evidence in repository ${JSON.stringify(entry.id || entry.url)}. Pass ${flag} so Mirofy can verify it before rendering.`, {
        subject: { path: where },
        evidence: { declaredRepositories: declaredIds },
        supportedFixes: [`pass ${flag} with the matching local Git checkout`],
      });
  }

  const requestedRoot = path.resolve(rootPath);
  let realRoot;
  try {
    realRoot = fs.realpathSync(requestedRoot);
  } catch (error) {
    evidenceFailure('repository-evidence/root-unreadable', `Could not resolve evidence repository root "${requestedRoot}": ${error.message}`, {
      subject: { repoRoot: requestedRoot },
      evidence: { reason: error.message },
      supportedFixes: ['pass one readable local repository directory'],
    });
  }
  const gitRoot = gitValue(realRoot, ['rev-parse', '--show-toplevel'], `Evidence root "${realRoot}" is not a Git repository.`);
  // Compared as NORMALISED paths, not as strings. On Windows `git rev-parse
  // --show-toplevel` answers with forward slashes (C:/Users/...) while
  // fs.realpathSync answers with backslashes, and the drive letter's case can
  // differ too -- so an identical directory failed this check on all four
  // Windows CI jobs while passing on Linux and macOS.
  if (!samePath(fs.realpathSync(gitRoot), realRoot)) {
    evidenceFailure('repository-evidence/root-not-top-level', `Evidence root must be the Git top-level directory: ${gitRoot}`, {
      subject: { repoRoot: realRoot },
      evidence: { gitTopLevel: gitRoot },
      supportedFixes: [`pass --repo-root ${gitRoot}`],
    });
  }
  const origin = gitValue(realRoot, ['remote', 'get-url', 'origin'], 'Evidence repository must have an origin remote.');
  if (!sameRemote(origin, entry.url)) {
    evidenceFailure('repository-evidence/origin-mismatch', `Evidence repository origin ${JSON.stringify(origin)} does not match ${JSON.stringify(entry.url)}.`, {
      subject: { repoRoot: realRoot },
      evidence: { localOrigin: origin, authoredRepository: entry.url },
      supportedFixes: ['use the matching local checkout or correct the authored repository URL'],
    });
  }
  const revision = entry.revision.toLowerCase();
  const commit = runGit(realRoot, ['cat-file', '-e', `${revision}^{commit}`]);
  if (commit.status !== 0) {
    evidenceFailure('repository-evidence/revision-unavailable', `Evidence revision ${revision} is not available in the local repository.`, {
      subject: { repoRoot: realRoot },
      evidence: { revision },
      supportedFixes: ['fetch the pinned commit or pin an available full commit SHA'],
    });
  }
  return {
    id: entry.id,
    realRoot,
    revision,
    host,
    // `host.web` is the canonical forge URL a recognised adapter derived from
    // the declared one, and stays the value for every hosted repository. The
    // local adapter has none, so the declared URL stands in: it is the honest
    // answer, and `host: 'local'` alongside it already tells a consumer this
    // is not a canonical forge URL. Null only for a shape nothing produces
    // today -- a local repository whose entry declared no URL at all, which
    // the origin checks below still refuse.
    url: host.web ?? entry.url ?? null,
  };
}

export function verifyRepositoryEvidence(diagramType, diagram, repoRootInput) {
  if (!hasRepositoryEvidence(diagramType, diagram)) return null;

  const declared = declaredRepositories(diagram);
  const declaredIds = [...declared.keys()];
  const roots = parseRepoRoots(repoRootInput);

  // Every declared repository is prepared up front, so a missing checkout is
  // reported before any citation is read rather than at whichever source
  // happened to reference it first.
  const repositories = new Map();
  for (const [id, entry] of declared) {
    repositories.set(id, prepareRepository(entry, roots.get(id), declaredIds));
  }

  /** The repository a source belongs to, refusing an undeclared name. */
  function repositoryFor(source, pointer) {
    const requested = typeof source.repository === 'string' ? source.repository : null;
    if (requested === null) {
      if (repositories.has(SINGLE)) return repositories.get(SINGLE);
      // With several declared, an unlabelled citation is ambiguous. Guessing
      // would attach evidence to whichever repository happened to be first.
      evidenceFailure('repository-evidence/repository-unspecified',
        `${pointer} does not say which repository it is in, and this diagram declares several (${declaredIds.join(', ')}).`, {
          subject: { path: pointer },
          evidence: { declaredRepositories: declaredIds },
          supportedFixes: [`set ${pointer}/repository to one of: ${declaredIds.join(', ')}`],
        });
    }
    const found = repositories.get(requested);
    if (!found) {
      evidenceFailure('repository-evidence/repository-unknown',
        `${pointer}/repository is ${JSON.stringify(requested)}, which this diagram does not declare. Declared: ${declaredIds.join(', ')}.`, {
          subject: { path: `${pointer}/repository` },
          evidence: { requested, declaredRepositories: declaredIds },
          supportedFixes: [`use one of the declared repositories: ${declaredIds.join(', ')}`],
        });
    }
    return found;
  }

  // One verification path for components and relationships alike. The JSON
  // pointer differs (/components/... vs /connections/..., /flows/..., and so
  // on) because an author fixing an error must be sent to the place in THEIR
  // document where the mistake is; the failure codes do not differ, because
  // they are a diagnostic contract consumers already match on.
  function verifySources(authoredSources, pointerBase, subjectExtra) {
    const verified = [];
    for (const [sourceIndex, authored] of authoredSources.entries()) {
      const pointer = `${pointerBase}/${sourceIndex}`;
      const where = `${pointer}/path`;
      // Which repository this citation is in decides the checkout it is
      // verified against AND the link it produces. Verifying against "a"
      // repository rather than the right one is how a path that exists in a
      // sibling repo passes as evidence for this one.
      const repo = repositoryFor(authored, pointer);
      const { realRoot, revision } = repo;
      const source = {
        path: verifiedSourcePath(authored.path, where),
        ...(authored.line ? { line: authored.line } : {}),
        ...(authored.end_line ? { endLine: authored.end_line } : {}),
        ...(authored.label ? { label: authored.label } : {}),
      };
      if (source.endLine && !source.line) {
        evidenceFailure('repository-evidence/line-required', `${pointer}/end_line requires line.`, {
          subject: { path: `${pointer}/end_line`, ...subjectExtra },
          supportedFixes: ['add line or remove end_line'],
        });
      }
      if (source.endLine && source.endLine < source.line) {
        evidenceFailure('repository-evidence/line-range-invalid', `${pointer}/end_line must be greater than or equal to line.`, {
          subject: { path: pointer, ...subjectExtra },
          evidence: { line: source.line, endLine: source.endLine },
          supportedFixes: ['use an end_line greater than or equal to line'],
        });
      }
      const object = `${revision}:${source.path}`;
      const type = runGit(realRoot, ['cat-file', '-t', object]);
      if (type.status !== 0 || type.stdout.trim() !== 'blob') {
        evidenceFailure('repository-evidence/file-missing', `${where} does not identify a file at revision ${revision}.`, {
          subject: { path: where, ...subjectExtra },
          evidence: { sourcePath: source.path, revision },
          supportedFixes: ['use a file path that exists at the pinned revision'],
        });
      }
      if (source.line) {
        // `cat-file -p`, not `show`. Given <rev>:<path>, git show stats the
        // path in the working tree before deciding it is an object, and on
        // Windows a long enough one fails there with "Filename too long"
        // while cat-file reads the same blob without complaint. Found on
        // fastapi/fastapi, whose deepest test fixture is 222 characters from
        // this checkout root -- every citation into a deeply nested file in a
        // deeply cloned repository was unverifiable, and the render refused a
        // document over a file that was sitting right there.
        const content = runGit(realRoot, ['cat-file', '-p', object]);
        if (content.status !== 0) evidenceFailure('repository-evidence/file-unreadable', `${where} could not be read at revision ${revision}.`, {
          subject: { path: where, ...subjectExtra },
          evidence: { sourcePath: source.path, revision },
          supportedFixes: ['verify the pinned blob is readable in the local checkout'],
        });
        const lineCount = sourceLineCount(content.stdout);
        const requestedLine = source.endLine || source.line;
        if (requestedLine > lineCount) {
          evidenceFailure('repository-evidence/line-out-of-range', `${pointer} requests line ${requestedLine}, but ${source.path} has ${lineCount} lines at revision ${revision}.`, {
            subject: { path: pointer, ...subjectExtra },
            evidence: { sourcePath: source.path, requestedLine, lineCount, revision },
            supportedFixes: ['use a line range that exists at the pinned revision'],
          });
        }
      }
      verified.push({
        ...source,
        ...(repo.id ? { repository: repo.id } : {}),
        href: sourceHref(repo.host, revision, source),
      });
    }
    return verified;
  }

  const nodes = Object.create(null);
  const edges = Object.create(null);
  // How many citations a subject really has, when that is more than the few
  // the document carries. Kept beside `nodes` rather than inside it: the
  // array shape there is what every existing consumer reads.
  const sourceTotals = Object.create(null);
  let referenceCount = 0;

  const components = Array.isArray(diagram.components) ? diagram.components : [];
  for (const [componentIndex, component] of components.entries()) {
    if (!Array.isArray(component.sources) || component.sources.length === 0) continue;
    const verified = verifySources(component.sources, `/components/${componentIndex}/sources`, { componentId: component.id });
    referenceCount += verified.length;
    nodes[component.id] = verified;
    if (Number.isInteger(component.source_count) && component.source_count > verified.length) {
      sourceTotals[component.id] = component.source_count;
    }
  }

  // Relationships are keyed by their array index, which is exactly what the
  // renderers already emit as data-edge-key (focusEdgeAttrs's fourth
  // argument). Keying by `id` would cover only the edges that happen to
  // declare one -- most authored relationships do not.
  const relationshipArray = RELATIONSHIP_ARRAY[diagramType];
  const relationships = Array.isArray(diagram[relationshipArray]) ? diagram[relationshipArray] : [];
  for (const [relationshipIndex, relationship] of relationships.entries()) {
    if (!Array.isArray(relationship.sources) || relationship.sources.length === 0) continue;
    const verified = verifySources(
      relationship.sources,
      `/${relationshipArray}/${relationshipIndex}/sources`,
      { relationshipId: relationship.id ?? `${relationship.from}->${relationship.to}` },
    );
    referenceCount += verified.length;
    edges[String(relationshipIndex)] = verified;
  }

  if (referenceCount === 0) {
    evidenceFailure('repository-evidence/source-required', 'The declared repository metadata requires at least one verified source reference.', {
      subject: { path: '/meta/repository' },
      supportedFixes: ['add at least one verified component or relationship source, or remove repository metadata'],
    });
  }

  // Repositories that fell back to the local adapter get one entry each here,
  // regardless of how many sources cite them: this reports "this repository
  // cannot be linked", not "this citation cannot be linked". `declaredUrl` is
  // read from `declared` rather than from the prepared entry so that it is
  // unambiguously what the document authored, whatever the prepared entry's
  // `url` resolves to: a consumer reading a limitation is diagnosing the
  // authored value -- a mistyped `guthub.com`, say -- and must not be handed
  // something the resolver derived.
  const limitations = [...repositories.values()]
    .filter((entry) => entry.host.id === 'local')
    .map((entry) => ({
      // The single-repository form's reserved id is '' -- naming nothing --
      // so it falls back to the verified checkout path, which still answers
      // "which repository is this" when the document names none.
      repository: entry.id || entry.realRoot,
      reason: 'no recognised remote host; source locations are cited by path and '
        + 'revision but cannot be linked',
      declaredUrl: declared.get(entry.id)?.url || null,
    }));

  const first = repositories.get(SINGLE) ?? [...repositories.values()][0];
  return {
    schemaVersion: 1,
    verified: true,
    // The single-repository shape is preserved so the viewer and every
    // consumer written against it keep working; `repositories` is additive.
    repository: {
      url: first.url,
      revision: first.revision,
      shortRevision: first.revision.slice(0, 7),
      host: first.host.id,
      slug: first.host.slug,
      treeUrl: first.host.treeUrl(first.revision),
    },
    repositories: [...repositories.values()].map((entry) => ({
      id: entry.id,
      url: entry.url,
      revision: entry.revision,
      shortRevision: entry.revision.slice(0, 7),
      host: entry.host.id,
      slug: entry.host.slug,
      treeUrl: entry.host.treeUrl(entry.revision),
    })),
    referenceCount,
    nodes,
    edges,
    sourceTotals,
    ...(limitations.length ? { limitations } : {}),
  };
}
