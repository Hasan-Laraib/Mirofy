import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectHost, HOST_IDS } from './hosts.mjs';
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
function remoteSlug(value) {
  const host = detectHost(value);
  return host ? `${host.id}:${host.slug}` : null;
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
  if (diagram?.meta?.repository) return true;
  return carriesSources(diagram?.components) || carriesSources(diagram?.[RELATIONSHIP_ARRAY[diagramType]]);
}

export function verifyRepositoryEvidence(diagramType, diagram, repoRootInput) {
  if (!hasRepositoryEvidence(diagramType, diagram)) return null;
  const repository = diagram.meta?.repository;
  if (!repository) evidenceFailure('repository-evidence/repository-required', 'Repository evidence requires /meta/repository.', {
    subject: { path: '/meta/repository' },
    supportedFixes: ['add the pinned public repository metadata or remove component sources'],
  });
  if (!FULL_SHA_RE.test(repository.revision || '')) {
    evidenceFailure('repository-evidence/revision-invalid', '/meta/repository/revision must be a full 40-character commit SHA.', {
      subject: { path: '/meta/repository/revision' },
      evidence: { revision: repository.revision },
      supportedFixes: ['pin one full 40-character commit SHA'],
    });
  }
  const authoredHost = detectHost(repository.url);
  if (!authoredHost) {
    // Named alternatives, not a bare refusal: an author cannot guess which
    // forges are understood, and a wrong guess here yields a confident link
    // to nothing -- the one thing evidence must never produce.
    evidenceFailure('repository-evidence/url-invalid', `/meta/repository/url must be a public repository URL on a supported host (${HOST_IDS.join(', ')}).`, {
      subject: { path: '/meta/repository/url' },
      evidence: { repositoryUrl: repository.url, supportedHosts: HOST_IDS },
      supportedFixes: [`use a canonical public repository URL on one of: ${HOST_IDS.join(', ')}`],
    });
  }
  const authoredSlug = remoteSlug(repository.url);
  if (!repoRootInput) {
    evidenceFailure('repository-evidence/root-required', 'This diagram declares source evidence. Pass --repo-root <repository> so Mirofy can verify it before rendering.', {
      subject: { path: '/meta/repository' },
      supportedFixes: ['pass --repo-root with the matching local Git checkout'],
    });
  }

  const requestedRoot = path.resolve(repoRootInput);
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
  if (fs.realpathSync(gitRoot) !== realRoot) {
    evidenceFailure('repository-evidence/root-not-top-level', `Evidence root must be the Git top-level directory: ${gitRoot}`, {
      subject: { repoRoot: realRoot },
      evidence: { gitTopLevel: gitRoot },
      supportedFixes: [`pass --repo-root ${gitRoot}`],
    });
  }
  const origin = gitValue(realRoot, ['remote', 'get-url', 'origin'], 'Evidence repository must have an origin remote.');
  if (remoteSlug(origin) !== authoredSlug) {
    evidenceFailure('repository-evidence/origin-mismatch', `Evidence repository origin ${JSON.stringify(origin)} does not match ${JSON.stringify(repository.url)}.`, {
      subject: { repoRoot: realRoot },
      evidence: { localOrigin: origin, authoredRepository: repository.url },
      supportedFixes: ['use the matching local checkout or correct the authored repository URL'],
    });
  }

  const revision = repository.revision.toLowerCase();
  const commit = runGit(realRoot, ['cat-file', '-e', `${revision}^{commit}`]);
  if (commit.status !== 0) {
    evidenceFailure('repository-evidence/revision-unavailable', `Evidence revision ${revision} is not available in the local repository.`, {
      subject: { repoRoot: realRoot },
      evidence: { revision },
      supportedFixes: ['fetch the pinned commit or pin an available full commit SHA'],
    });
  }

  const repoUrl = repository.url.replace(/\.git\/?$/i, '').replace(/\/$/, '');

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
        const content = runGit(realRoot, ['show', object]);
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
      verified.push({ ...source, href: sourceHref(authoredHost, revision, source) });
    }
    return verified;
  }

  const nodes = Object.create(null);
  const edges = Object.create(null);
  let referenceCount = 0;

  const components = Array.isArray(diagram.components) ? diagram.components : [];
  for (const [componentIndex, component] of components.entries()) {
    if (!Array.isArray(component.sources) || component.sources.length === 0) continue;
    const verified = verifySources(component.sources, `/components/${componentIndex}/sources`, { componentId: component.id });
    referenceCount += verified.length;
    nodes[component.id] = verified;
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
    evidenceFailure('repository-evidence/source-required', '/meta/repository requires at least one verified source reference.', {
      subject: { path: '/meta/repository' },
      supportedFixes: ['add at least one verified component or relationship source, or remove repository metadata'],
    });
  }

  return {
    schemaVersion: 1,
    verified: true,
    repository: {
      url: repoUrl,
      revision,
      shortRevision: revision.slice(0, 7),
      // Built here, by the host adapter, rather than in the viewer. The viewer
      // used to append "/tree/<revision>" and strip a github.com prefix, which
      // is right for exactly one forge and a broken link plus a full-URL slug
      // on every other.
      host: authoredHost.id,
      slug: authoredHost.slug,
      treeUrl: authoredHost.treeUrl(revision),
    },
    referenceCount,
    nodes,
    edges,
  };
}
