// Workspace topology adapter (row 2.9): package.json workspaces and the
// dependency edges between the packages they declare. Everything here is
// config-derived — a manifest is configuration, not code.
//
// One malformed manifest never aborts the scan: it becomes a Gap naming the
// parse error, and every other package is still analysed. Aborting would turn
// one bad file into a silent omission of everything else, which is the exact
// failure the scanner rule exists to prevent.

import fs from 'node:fs';
import path from 'node:path';
import { posixPath } from '../adapter.mjs';

function readJson(root, rel, gaps) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (error) {
    gaps.push({ path: rel, reason: `could not parse as JSON: ${error.message}` });
    return null;
  }
}

// Minimal glob for the one shape workspaces actually use: a literal prefix
// plus `*` matching one directory level. Anything fancier is a Gap, not a
// half-implemented matcher quietly missing packages.
function expandWorkspacePattern(root, pattern, gaps) {
  if (!pattern.includes('*')) {
    return fs.existsSync(path.join(root, pattern, 'package.json')) ? [pattern] : [];
  }
  const starIndex = pattern.indexOf('*');
  if (pattern.indexOf('*', starIndex + 1) !== -1 || pattern.slice(starIndex + 1).includes('/')) {
    gaps.push({
      path: 'package.json',
      reason: `workspace pattern ${JSON.stringify(pattern)} is more complex than <dir>/*; not expanded rather than half-matched`,
    });
    return [];
  }
  const base = pattern.slice(0, starIndex).replace(/\/$/, '');
  const dir = path.join(root, base);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => posixPath(path.join(base, entry.name)))
    .filter((rel) => fs.existsSync(path.join(root, rel, 'package.json')));
}

export const workspaceAdapter = {
  id: 'workspace',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const inventory = [];

    const rootManifestRel = 'package.json';
    if (!fs.existsSync(path.join(repoRoot, rootManifestRel))) {
      return { facts, gaps, inventory };
    }
    inventory.push(rootManifestRel);
    const rootManifest = readJson(repoRoot, rootManifestRel, gaps);
    if (!rootManifest) return { facts, gaps, inventory };

    const patterns = Array.isArray(rootManifest.workspaces)
      ? rootManifest.workspaces
      : Array.isArray(rootManifest.workspaces?.packages) ? rootManifest.workspaces.packages : [];

    const packages = new Map(); // name -> {rel, manifest}
    for (const pattern of patterns) {
      for (const rel of expandWorkspacePattern(repoRoot, pattern, gaps)) {
        const manifestRel = posixPath(path.join(rel, 'package.json'));
        inventory.push(manifestRel);
        const manifest = readJson(repoRoot, manifestRel, gaps);
        if (!manifest) continue;
        const name = typeof manifest.name === 'string' && manifest.name ? manifest.name : rel;
        packages.set(name, { rel: manifestRel, manifest });
        facts.push({
          subject: rootManifest.name || 'workspace-root',
          predicate: 'contains-package',
          object: name,
          provenance: 'config-derived',
          location: { path: manifestRel },
        });
      }
    }

    // Dependency edges between workspace packages only. A dependency on an
    // external package is a fact about the registry, not about this
    // repository's topology.
    for (const [name, { rel, manifest }] of packages) {
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const dep of Object.keys(manifest[field] ?? {})) {
          if (!packages.has(dep)) continue;
          facts.push({
            subject: name,
            predicate: 'depends-on',
            object: dep,
            provenance: 'config-derived',
            location: { path: rel },
          });
        }
      }
    }

    return { facts, gaps, inventory };
  },
};
