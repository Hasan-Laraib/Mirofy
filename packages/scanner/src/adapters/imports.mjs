// TS/JS import adapter (row 2.8): the module dependency graph, from real
// source, statically derived.
//
// This is a tokenizer-level extractor, not a parser — deliberately. Row 6.9
// forbids runtime dependencies, and a hand-rolled full parser would be a
// larger liability than the honesty rule allows. The line is drawn exactly
// where the scanner rule draws it:
//
//   - an import whose specifier is a string literal is a fact;
//   - an import whose specifier is computed is a Gap with the line;
//   - a literal specifier that resolves to no file is a Gap, never a
//     fabricated path;
//   - text inside comments and string literals is stripped before matching,
//     so a commented-out import is nothing at all.
//
// What it deliberately does not attempt: JSX-specific syntax, decorators,
// or TypeScript type-only re-export edge cases beyond `export ... from`.
// Files this extractor cannot read at all become Gaps.

import fs from 'node:fs';
import path from 'node:path';
import { posixPath } from '../adapter.mjs';

export const SOURCE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'preview', 'scan']);

function* walk(root, rel = '') {
  const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(root, posixPath(path.join(rel, entry.name)));
    } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      yield posixPath(path.join(rel, entry.name));
    }
  }
}

// Blank out comments and string bodies, preserving newlines so line numbers
// survive, and preserving the QUOTES of plain strings so import specifiers
// remain findable. An import statement's own specifier is re-read from the
// original line; this pass only decides which lines are code at all.
export function stripNonCode(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let mode = 'code'; // code | line-comment | block-comment | single | double | template
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') { mode = 'line-comment'; out += '  '; i += 2; continue; }
      if (ch === '/' && next === '*') { mode = 'block-comment'; out += '  '; i += 2; continue; }
      if (ch === "'") { mode = 'single'; out += ch; i += 1; continue; }
      if (ch === '"') { mode = 'double'; out += ch; i += 1; continue; }
      if (ch === '`') { mode = 'template'; out += ch; i += 1; continue; }
      out += ch; i += 1; continue;
    }
    if (mode === 'line-comment') {
      if (ch === '\n') { mode = 'code'; out += ch; } else out += ' ';
      i += 1; continue;
    }
    if (mode === 'block-comment') {
      if (ch === '*' && next === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += ch === '\n' ? '\n' : ' ';
      i += 1; continue;
    }
    // string modes: body is blanked, closing quote kept, escapes honoured
    const closer = mode === 'single' ? "'" : mode === 'double' ? '"' : '`';
    if (ch === '\\') { out += '  '; i += 2; continue; }
    if (ch === closer) { mode = 'code'; out += ch; i += 1; continue; }
    out += ch === '\n' ? '\n' : ' ';
    i += 1;
  }
  return out;
}

const STATIC_IMPORT_RE = /\b(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])/g;
const BARE_IMPORT_RE = /\bimport\s*(['"])/g; // import './side-effect.js'
const CALL_IMPORT_RE = /\b(?:require|import)\s*\(\s*(['"]?)/g;

function specifierAt(originalLine, quoteIndexInLine, quote) {
  const start = quoteIndexInLine + 1;
  const end = originalLine.indexOf(quote, start);
  if (end === -1) return null;
  return originalLine.slice(start, end);
}

function resolveRelative(repoRoot, fromRel, specifier) {
  const base = posixPath(path.join(path.dirname(fromRel), specifier));
  const candidates = [base, ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => posixPath(path.join(base, 'index' + ext)))];
  for (const candidate of candidates) {
    const full = path.join(repoRoot, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return posixPath(candidate);
  }
  // TS convention: `./x.js` in source may mean `./x.ts` on disk.
  if (/\.(m|c)?js$/.test(base)) {
    const tsBase = base.replace(/\.(m|c)?js$/, (m) => ({ '.js': '.ts', '.mjs': '.mts', '.cjs': '.cts' }[m]));
    const full = path.join(repoRoot, tsBase);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return tsBase;
  }
  return null;
}

export const importsAdapter = {
  id: 'imports',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const inventory = [];

    for (const rel of walk(repoRoot)) {
      inventory.push(rel);
      let source;
      try {
        source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      } catch (error) {
        gaps.push({ path: rel, reason: `unreadable: ${error.message}` });
        continue;
      }

      const code = stripNonCode(source);
      const codeLines = code.split('\n');
      const originalLines = source.split('\n');
      const seen = new Set();

      for (const [lineIndex, codeLine] of codeLines.entries()) {
        const originalLine = originalLines[lineIndex] ?? '';
        const lineNo = lineIndex + 1;

        const record = (specifier) => {
          if (specifier.startsWith('.')) {
            const resolved = resolveRelative(repoRoot, rel, specifier);
            if (!resolved) {
              gaps.push({ path: rel, reason: `import of ${JSON.stringify(specifier)} at line ${lineNo} resolves to no file` });
              return;
            }
            if (seen.has(resolved)) return;
            seen.add(resolved);
            facts.push({
              subject: rel, predicate: 'depends-on', object: resolved,
              provenance: 'statically-derived', location: { path: rel, lines: [lineNo, lineNo] },
            });
            return;
          }
          const object = `package:${specifier}`;
          if (seen.has(object)) return;
          seen.add(object);
          facts.push({
            subject: rel, predicate: 'depends-on', object,
            provenance: 'statically-derived', location: { path: rel, lines: [lineNo, lineNo] },
          });
        };

        for (const re of [STATIC_IMPORT_RE, BARE_IMPORT_RE]) {
          re.lastIndex = 0;
          let match;
          while ((match = re.exec(codeLine)) !== null) {
            const specifier = specifierAt(originalLine, match.index + match[0].length - 1, match[1]);
            if (specifier !== null) record(specifier);
          }
        }

        CALL_IMPORT_RE.lastIndex = 0;
        let call;
        while ((call = CALL_IMPORT_RE.exec(codeLine)) !== null) {
          if (!call[1]) {
            // require(x) / import(prefix + name): a computed specifier.
            gaps.push({ path: rel, reason: `computed import specifier at line ${lineNo}; the target cannot be known statically` });
            continue;
          }
          const quoteIndex = call.index + call[0].length - 1;
          const specifier = specifierAt(originalLine, quoteIndex, call[1]);
          if (specifier === null) continue;
          // A literal specifier concatenated with more expression is computed
          // too: `import('./mods/' + name)` has a literal start and no literal
          // whole.
          const after = codeLine.slice(quoteIndex + 1 + specifier.length + 1).trimStart();
          if (!after.startsWith(')')) {
            gaps.push({ path: rel, reason: `computed import specifier at line ${lineNo}; the target cannot be known statically` });
            continue;
          }
          record(specifier);
        }
      }
    }

    return { facts, gaps, inventory };
  },
};
