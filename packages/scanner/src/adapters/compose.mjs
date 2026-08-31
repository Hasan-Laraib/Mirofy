// Docker Compose adapter (row 2.12): services, the images they run, the ports
// they publish, and the dependencies they declare between each other.
//
// A compose file is the closest thing most repositories have to a written
// deployment topology, and it is configuration rather than code -- so every
// fact here is `config-derived`. The file says what it says; nothing is
// inferred from it about runtime behaviour.
//
// Compose is YAML, and this repository has zero runtime dependencies, so there
// is no YAML parser to reach for. Rather than pretend otherwise, the parser
// below handles the SUBSET compose files actually use for topology -- nested
// mappings, block sequences, quoted scalars -- and turns anything it does not
// understand into a Gap naming the line. That is the scanner rule applied to
// its own limits: an unparseable construct is reported, never skipped quietly.
//
// What it does NOT do is guess. `depends_on` is a declared dependency and
// becomes a fact. Two services sharing a network are NOT recorded as talking to
// each other, because a shared network is permission, not communication, and a
// diagram that draws the difference wrongly is worse than one that omits it.

import fs from 'node:fs';
import path from 'node:path';
import { posixPath } from '../adapter.mjs';

const COMPOSE_NAMES = [
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
];

/** Strip a trailing comment that is not inside quotes. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

const unquote = (value) => {
  const text = String(value ?? '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
};

/**
 * Parse the subset of YAML compose files use for topology.
 *
 * Returns `{tree, gaps}`. Anything structurally unexpected becomes a gap with
 * its line number rather than being dropped, because a service this silently
 * skipped is a service missing from the diagram with nothing to explain it.
 */
export function parseComposeSubset(text, relPath) {
  /** @type {Array<{path: string, reason: string}>} */
  const gaps = [];
  const root = {};
  // Each frame remembers the key that OPENED it, because a block sequence
  // (`- item`) belongs to that key rather than to the mapping it sits inside.
  // Attaching it to the inner frame instead produces a service whose `ports`
  // is an empty object -- present, plausible, and silently wrong.
  const stack = [{ indent: -1, node: root, ownerNode: null, ownerKey: null }];

  // Split without a regex: an escaped newline in this position has been
  // collapsed into a literal one by tooling twice in this file already.
  const physical = text.split(String.fromCharCode(10));
  for (const [index, rawLine] of physical.entries()) {
    const raw = rawLine.endsWith(String.fromCharCode(13)) ? rawLine.slice(0, -1) : rawLine;
    const line = stripComment(raw);
    if (line.trim() === '' || line.trim() === '---') continue;

    if (/^\s*(&|\*|<<:)/.test(line)) {
      // Anchors, aliases and merge keys change what a document means. Reading
      // past them would produce a confidently wrong topology.
      gaps.push({
        path: relPath,
        reason: `YAML anchor or merge key at line ${index + 1}; this adapter reads a subset and will not guess`,
      });
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (body.startsWith('- ') || body === '-') {
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const frame = stack[stack.length - 1];
      if (!frame.ownerKey || !frame.ownerNode) {
        gaps.push({ path: relPath, reason: `list item at line ${index + 1} has no key to belong to` });
        continue;
      }
      if (!Array.isArray(frame.ownerNode[frame.ownerKey])) frame.ownerNode[frame.ownerKey] = [];
      frame.ownerNode[frame.ownerKey].push(unquote(body.slice(1).trim()));
      continue;
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const frame = stack[stack.length - 1];

    const colon = body.indexOf(':');
    if (colon === -1) {
      gaps.push({ path: relPath, reason: `unreadable line ${index + 1}: ${body.slice(0, 60)}` });
      continue;
    }

    const key = unquote(body.slice(0, colon));
    const value = body.slice(colon + 1).trim();
    if (value === '') {
      const child = {};
      frame.node[key] = child;
      stack.push({ indent, node: child, ownerNode: frame.node, ownerKey: key });
    } else {
      frame.node[key] = unquote(value);
    }
  }
  return { tree: root, gaps };
}

/** Read `services:` out of a parsed tree, tolerating either nesting shape. */
function servicesOf(tree) {
  const services = tree.services;
  if (!services || typeof services !== 'object' || Array.isArray(services)) return {};
  return services;
}

export const composeAdapter = {
  id: 'compose',
  /**
   * @param {{repoRoot: string, revision?: string}} context the adapter
   *   contract's input; the revision is stamped by runAdapter rather than
   *   read here, but it is part of the signature callers pass.
   */
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const inventory = [];

    const found = COMPOSE_NAMES
      .map((name) => ({ name, full: path.join(repoRoot, name) }))
      .filter((candidate) => fs.existsSync(candidate.full));

    for (const { name, full } of found) {
      const rel = posixPath(name);
      inventory.push(rel);

      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch (error) {
        gaps.push({ path: rel, reason: `could not read: ${error.message}` });
        continue;
      }

      const parsed = parseComposeSubset(text, rel);
      gaps.push(...parsed.gaps);
      const services = servicesOf(parsed.tree);

      for (const [serviceName, definition] of Object.entries(services)) {
        if (!definition || typeof definition !== 'object') continue;
        const body = definition;

        if (typeof body.image === 'string' && body.image) {
          facts.push({
            subject: serviceName,
            predicate: 'runs-image',
            object: body.image,
            provenance: 'config-derived',
            location: { path: rel },
          });
        }
        if (body.build) {
          facts.push({
            subject: serviceName,
            predicate: 'builds-from',
            object: typeof body.build === 'string' ? body.build : (body.build.context ?? '.'),
            provenance: 'config-derived',
            location: { path: rel },
          });
        }
        for (const port of Array.isArray(body.ports) ? body.ports : []) {
          facts.push({
            subject: serviceName,
            predicate: 'publishes-port',
            object: String(port),
            provenance: 'config-derived',
            location: { path: rel },
          });
        }
        for (const dependency of Array.isArray(body.depends_on) ? body.depends_on : []) {
          facts.push({
            subject: serviceName,
            predicate: 'depends-on',
            object: String(dependency),
            provenance: 'config-derived',
            location: { path: rel },
          });
        }
      }

      if (Object.keys(services).length === 0) {
        gaps.push({ path: rel, reason: 'no services could be read from this compose file' });
      }
    }

    return { facts, gaps, inventory };
  },
};
