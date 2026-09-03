// Go import adapter. Same contract as the others, same rule: NEVER guess.
//
// WHY IT EXISTS: pointed at a Go repository, Mirofy drew nothing and said so.
// That is the honest answer and not a useful one, and `.rs`, `.go` and `.java`
// were the largest unread groups in every real repository this was run against
// -- 1,037 Rust files in vercel/next.js alone.
//
// WHAT IT RESOLVES, AND HOW IT DECIDES. Go is unusually kind here, because the
// resolution rule is written down in the repository rather than inferred:
//
//   module github.com/user/repo     go.mod says what this module is called
//   import "github.com/user/repo/x" starts with that -> the directory x/
//   import "fmt", "net/http"        no dot in the first segment -> stdlib
//   import "github.com/other/lib"   anything else -> a third-party module
//
// The dot rule is not a heuristic. It is how the toolchain itself decides:
// a first path segment containing a dot is a domain, and a domain means a
// module fetched from somewhere. `fmt` and `net/http` cannot be fetched.
//
// A package in Go is a DIRECTORY, so an internal import resolves to the
// directory it names, and only because that directory is there and holds Go
// files. An import that starts with this module's path and names a directory
// which does not exist is a Gap -- generated code, a build tag, a stale path.
// Recording it as a third-party module would be the guess this refuses.
import fs from 'node:fs';
import path from 'node:path';
import { repositoryFiles } from '../files.mjs';

export const GO_EXTENSIONS = Object.freeze(['.go']);

/**
 * Blank out comments so an import inside one is not a fact.
 *
 * Import paths are string literals, so the strings have to survive while the
 * comments do not -- and a `//` inside a string is not a comment. The scan is
 * therefore character-by-character with three states rather than a regular
 * expression, which cannot tell those apart.
 *
 * Newlines are preserved exactly, because every fact cites a line number and a
 * blanking pass that loses one moves every citation after it.
 *
 * @param {string} source
 */
export function stripComments(source) {
  const out = [];
  let state = 'code'; // code | line-comment | block-comment | quote | raw | rune
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line-comment'; out.push('  '); i += 1; continue; }
      if (ch === '/' && next === '*') { state = 'block-comment'; out.push('  '); i += 1; continue; }
      if (ch === '"') state = 'quote';
      else if (ch === '`') state = 'raw';
      else if (ch === "'") state = 'rune';
      out.push(ch);
      continue;
    }
    if (state === 'line-comment') {
      if (ch === '\n') { state = 'code'; out.push(ch); continue; }
      out.push(' ');
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') { state = 'code'; out.push('  '); i += 1; continue; }
      out.push(ch === '\n' ? ch : ' ');
      continue;
    }
    // Inside a literal. Backslash escapes the next character, except in a raw
    // string, where Go treats a backslash as an ordinary byte.
    if (state !== 'raw' && ch === '\\') { out.push(ch, next ?? ''); i += 1; continue; }
    if ((state === 'quote' && ch === '"') || (state === 'raw' && ch === '`')
      || (state === 'rune' && ch === "'")) state = 'code';
    out.push(ch);
  }
  return out.join('');
}

/**
 * The module path this repository declares, from the nearest go.mod.
 *
 * Read rather than assumed: without it there is no way to tell an import of
 * this repository's own package from an import of somebody else's, and
 * guessing from the directory name would be wrong for every module whose path
 * does not match its folder -- which is most of them.
 *
 * @param {string} repoRoot
 * @param {string[]} files
 * @returns {{module: string, dir: string, manifest: string}[]}
 */
export function goModules(repoRoot, files) {
  const modules = [];
  for (const rel of files) {
    if (path.basename(rel) !== 'go.mod') continue;
    let text;
    try {
      text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      continue; // unreadable manifest: the files it governs become gaps below
    }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*module\s+(\S+)/);
      if (!match) continue;
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      modules.push({ module: match[1], dir, manifest: rel });
      break;
    }
  }
  // Longest module path first, so a nested module wins over the one containing
  // it -- the same rule package ownership uses everywhere else in this scanner.
  return modules.sort((left, right) => right.module.length - left.module.length);
}

/** Is `specifier` in the standard library? */
export function isStdlib(specifier) {
  const first = String(specifier).split('/')[0];
  return first.length > 0 && !first.includes('.');
}

const IMPORT_ONE = /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/;
const IMPORT_OPEN = /^\s*import\s*\(\s*$/;
const IMPORT_IN_BLOCK = /^\s*(?:[\w.]+\s+)?"([^"]+)"/;

export const goAdapter = {
  id: 'go',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const all = repositoryFiles(repoRoot);
    const inventory = all.filter((file) => GO_EXTENSIONS.includes(path.extname(file)));
    if (!inventory.length) return { facts, gaps, inventory };

    const modules = goModules(repoRoot, all);
    // Directories that actually hold Go files. An internal import is accepted
    // because one of these is there, never because the path looked right.
    const packageDirs = new Set(inventory.map(
      (file) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')
    ));

    for (const rel of inventory) {
      let source;
      try {
        source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      } catch (error) {
        gaps.push({ path: rel, reason: `could not be read: ${error.message}` });
        continue;
      }
      // CRLF as well as LF: a Windows checkout is not a different language,
      // and reading zero imports from one while reporting no gaps is the
      // quietest way this scanner can be wrong.
      const lines = stripComments(source).split(/\r?\n/);

      let inBlock = false;
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (inBlock && /^\s*\)/.test(line)) { inBlock = false; return; }
        if (IMPORT_OPEN.test(line)) { inBlock = true; return; }
        const match = inBlock ? line.match(IMPORT_IN_BLOCK) : line.match(IMPORT_ONE);
        if (!match) return;
        const specifier = match[1];
        if (!specifier) return;

        const record = (object) => facts.push({
          subject: rel,
          predicate: 'depends-on',
          object,
          provenance: 'statically-derived',
          location: { path: rel, lines: [lineNumber, lineNumber] },
        });

        if (isStdlib(specifier)) { record(`package:go:${specifier}`); return; }

        const owner = modules.find((entry) => specifier === entry.module
          || specifier.startsWith(`${entry.module}/`));
        if (!owner) { record(`package:${specifier}`); return; }

        // Inside this module. The import names a directory relative to the
        // module's own root, which is not always the repository root.
        const within = specifier === owner.module ? '' : specifier.slice(owner.module.length + 1);
        const target = [owner.dir, within].filter(Boolean).join('/');
        if (!packageDirs.has(target)) {
          gaps.push({
            path: rel,
            reason: `import at line ${lineNumber} names ${specifier}, which is inside `
              + `module ${owner.module} but has no Go files at ${target || '.'}`,
          });
          return;
        }
        // The directory is the package. Cited to a real file in it, so the
        // fact points at something a reader can open.
        const file = inventory.find((candidate) => candidate.startsWith(target ? `${target}/` : '')
          && !candidate.slice(target ? target.length + 1 : 0).includes('/'));
        record(file ?? target);
      });
    }

    return { facts, gaps, inventory };
  },
};
