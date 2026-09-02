// Python import adapter. Same contract as the JS one, same rule: NEVER guess.
// An import this cannot resolve becomes a Gap naming the line, not a fact
// pointing somewhere plausible.
//
// WHY IT EXISTS: somebody pointed Mirofy at a 266-file Python repository and
// got two boxes, because the only import adapter read JavaScript. The coverage
// fix made that visible. This makes it unnecessary.
//
// WHAT IT RESOLVES, AND HOW IT DECIDES:
//
//   from .x import y      relative to the importing file's directory
//   from ..pkg import y   relative, one package up
//   import a.b.c          absolute
//   from a.b import c     absolute, and `c` may itself be a module
//
// An absolute import resolves through sys.path at runtime, which is
// configuration this scanner does not have. So resolution is by FILE
// EXISTENCE: a candidate path is accepted only because the file is there. When
// several roots could satisfy one specifier the answer is ambiguous, and an
// ambiguous answer is a Gap -- picking the first would be exactly the guess
// this project refuses.
//
// The standard library is named rather than drawn, the way node builtins are.
// Every Python file imports `os` and `typing`; drawing those would bury the
// architecture in the same noise `package:node:fs` would.
import fs from 'node:fs';
import path from 'node:path';
import { repositoryFiles } from '../files.mjs';

export const PYTHON_EXTENSIONS = Object.freeze(['.py', '.pyi']);

// Top-level names in the Python 3.11 standard library. A name missing from
// this list is not silently lost: it fails to resolve inside the repository
// and is recorded as an external package, which is visible and merely
// imprecise. A name wrongly IN the list would hide a real dependency, so the
// list holds only names that are unambiguously stdlib.
const STDLIB = new Set([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'bisect', 'builtins', 'bz2',
  'calendar', 'cmath', 'cmd', 'code', 'codecs', 'collections', 'colorsys', 'concurrent',
  'configparser', 'contextlib', 'contextvars', 'copy', 'csv', 'ctypes', 'dataclasses',
  'datetime', 'decimal', 'difflib', 'dis', 'doctest', 'email', 'enum', 'errno', 'faulthandler',
  'filecmp', 'fileinput', 'fnmatch', 'fractions', 'functools', 'gc', 'getpass', 'gettext',
  'glob', 'graphlib', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'imaplib',
  'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword', 'linecache',
  'locale', 'logging', 'lzma', 'mailbox', 'marshal', 'math', 'mimetypes', 'mmap',
  'multiprocessing', 'netrc', 'numbers', 'operator', 'os', 'pathlib', 'pickle', 'pkgutil',
  'platform', 'plistlib', 'poplib', 'pprint', 'profile', 'pstats', 'pty', 'queue', 'quopri',
  'random', 're', 'readline', 'reprlib', 'resource', 'runpy', 'sched', 'secrets', 'select',
  'selectors', 'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtplib', 'socket',
  'socketserver', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
  'subprocess', 'symtable', 'sys', 'sysconfig', 'tarfile', 'tempfile', 'termios', 'textwrap',
  'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize', 'tomllib', 'trace',
  'traceback', 'tracemalloc', 'tty', 'types', 'typing', 'unicodedata', 'unittest', 'urllib',
  'uuid', 'venv', 'warnings', 'wave', 'weakref', 'webbrowser', 'wsgiref', 'xml', 'xmlrpc',
  'zipapp', 'zipfile', 'zipimport', 'zlib', 'zoneinfo', '__future__',
]);

const QUOTE = { "'": 1, '"': 1 };

/**
 * Blank out comments and string bodies, preserving newlines so line numbers
 * survive.
 *
 * Necessary for the same reason as the JavaScript one, and harder: a Python
 * docstring is a triple-quoted string that very often CONTAINS example import
 * statements. Reading those as facts would put edges in the diagram that the
 * code does not have -- an invented dependency, sourced to a line that is
 * prose.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripNonCode(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const three = source.slice(i, i + 3);
    if (three === '"""' || three === "'''") {
      const close = source.indexOf(three, i + 3);
      const end = close === -1 ? n : close + 3;
      // Keep the newlines: every later line number depends on them.
      for (let k = i; k < end; k += 1) out += source[k] === '\n' ? '\n' : ' ';
      i = end;
      continue;
    }
    if (QUOTE[ch]) {
      let k = i + 1;
      while (k < n && source[k] !== ch && source[k] !== '\n') {
        k += source[k] === '\\' ? 2 : 1;
      }
      out += ' '.repeat(Math.max(1, Math.min(k, n) - i + 1));
      i = Math.min(k + 1, n);
      continue;
    }
    if (ch === '#') {
      while (i < n && source[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Every module path a dotted name could name, in the given root. */
function candidatesFor(dotted, root) {
  const rel = dotted.split('.').join('/');
  const base = root ? `${root}/${rel}` : rel;
  return [`${base}.py`, `${base}/__init__.py`, `${base}.pyi`];
}

/**
 * Resolve an absolute dotted import inside the repository.
 *
 * Tried against the repository root and each directory that looks like a source
 * root -- a directory holding a package, which is what a project puts on
 * sys.path. Existence decides. Two roots that both satisfy it is ambiguity, and
 * ambiguity is reported rather than resolved.
 *
 * @returns {{path: string} | {ambiguous: string[]} | null}
 */
function resolveAbsolute(dotted, files, roots) {
  const hits = [];
  for (const root of roots) {
    for (const candidate of candidatesFor(dotted, root)) {
      if (files.has(candidate) && !hits.includes(candidate)) hits.push(candidate);
    }
  }
  if (hits.length === 1) return { path: hits[0] };
  if (hits.length > 1) return { ambiguous: hits };
  return null;
}

/** Resolve `from ...x import y` against the importing file's own directory. */
function resolveRelative(dots, dotted, fromFile, files) {
  const parts = fromFile.split('/');
  parts.pop();
  // One dot is "this package"; each extra dot climbs one more.
  for (let step = 1; step < dots; step += 1) {
    if (!parts.length) return { tooHigh: true };
    parts.pop();
  }
  const base = parts.join('/');
  if (!dotted) {
    const init = base ? `${base}/__init__.py` : '__init__.py';
    return files.has(init) ? { path: init } : null;
  }
  for (const candidate of candidatesFor(dotted, base)) {
    if (files.has(candidate)) return { path: candidate };
  }
  return null;
}

/** The names in `from X import a, b` that are themselves modules under X. */
function importedNames(clause) {
  return clause.replace(/[()]/g, '').split(',')
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter((name) => name && name !== '*');
}

/** Relative form of the same question: which imported names are modules. */
function importedModules(clause, fromFile, dots, dotted, files) {
  const hits = [];
  for (const name of importedNames(clause)) {
    const deeper = resolveRelative(dots, dotted ? `${dotted}.${name}` : name, fromFile, files);
    if (deeper && 'path' in deeper) hits.push(deeper.path);
  }
  return hits;
}

const IMPORT_LINE = /^[ \t]*import[ \t]+(.+)$/;
const FROM_LINE = /^[ \t]*from[ \t]+(\.*)([A-Za-z_][\w.]*)?[ \t]+import[ \t]+(.+)$/;
// A specifier that only exists at runtime. Named as a gap with its line, never
// resolved to something that looked close.
const COMPUTED = /\b(?:importlib\s*\.\s*import_module|__import__)\s*\(/;

export const pythonAdapter = {
  id: 'python',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const all = repositoryFiles(repoRoot);
    const files = new Set(all);
    const inventory = all.filter((file) => PYTHON_EXTENSIONS.includes(path.extname(file)));
    if (!inventory.length) return { facts, gaps, inventory };

    // Source roots: the repository itself, plus any directory that directly
    // contains a package or module. That is what a project actually puts on
    // sys.path -- `src/` being the common case -- and each one is a directory
    // that exists, not a convention assumed.
    const roots = new Set(['']);
    for (const file of inventory) {
      const segments = file.split('/');
      for (let depth = 1; depth < segments.length; depth += 1) {
        const dir = segments.slice(0, depth).join('/');
        if (files.has(`${dir}/__init__.py`)) continue; // inside a package, not a root
        roots.add(dir);
      }
    }

    for (const rel of inventory) {
      let source;
      try {
        source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      } catch (error) {
        gaps.push({ path: rel, reason: `could not be read: ${error.message}` });
        continue;
      }
      const code = stripNonCode(source);
      // Split on CRLF as well as LF. JavaScript's `.` does not match a carriage
      // return -- it counts as a line terminator -- so `(.+)$` fails on every line
      // of a CRLF checkout. This adapter read 8 of 264 files on a Windows clone
      // and reported no gaps at all: silent, and total.
      const lines = code.split(/\r?\n/);

      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const record = (object) => facts.push({
          subject: rel,
          predicate: 'depends-on',
          object,
          provenance: 'statically-derived',
          location: { path: rel, lines: [lineNumber, lineNumber] },
        });

        if (COMPUTED.test(line)) {
          gaps.push({
            path: rel,
            reason: `computed import at line ${lineNumber}; the target cannot be known statically`,
          });
          return;
        }

        const from = line.match(FROM_LINE);
        if (from) {
          const [, dots, dotted, imported] = from;
          if (dots.length > 0) {
            const resolved = resolveRelative(dots.length, dotted ?? '', rel, files);
            if (resolved && 'tooHigh' in resolved) {
              gaps.push({
                path: rel,
                reason: `relative import at line ${lineNumber} climbs above the repository root`,
              });
              return;
            }
            if (resolved) {
              // `from .llm import client` where llm/client.py exists is an edge
              // to that module, not to the package's __init__. The absolute
              // branch already preferred the deeper target; the relative branch
              // did not, so a relative import of a sibling module pointed at
              // its package instead -- true, and one level less specific than
              // the code actually is.
              const deeper = importedModules(imported, rel, dots.length, dotted ?? '', files);
              if (deeper.length) { for (const hit of deeper) record(hit); return; }
              record(resolved.path);
              return;
            }
            gaps.push({
              path: rel,
              reason: `relative import at line ${lineNumber} resolves to no file in this repository`,
            });
            return;
          }
          if (!dotted) return;
          const top = dotted.split('.')[0];
          const inside = resolveAbsolute(dotted, files, roots);
          if (inside && 'ambiguous' in inside) {
            gaps.push({
              path: rel,
              reason: `import at line ${lineNumber} matches ${inside.ambiguous.length} files `
                + `(${inside.ambiguous.join(', ')}); which one depends on sys.path, which is not in the source`,
            });
            return;
          }
          if (inside && 'path' in inside) {
            // `from pkg import thing` where `thing` is itself a module: prefer
            // the more specific target, because that is the edge the code has.
            let recorded = false;
            for (const name of importedNames(imported)) {
              const deeper = resolveAbsolute(`${dotted}.${name}`, files, roots);
              if (deeper && 'path' in deeper) { record(deeper.path); recorded = true; }
            }
            if (!recorded) record(inside.path);
            return;
          }
          record(STDLIB.has(top) ? `package:python:${top}` : `package:${top}`);
          return;
        }

        const plain = line.match(IMPORT_LINE);
        if (plain) {
          for (const clause of plain[1].split(',')) {
            const dotted = clause.trim().split(/\s+as\s+/)[0].trim();
            if (!dotted || !/^[A-Za-z_][\w.]*$/.test(dotted)) continue;
            const inside = resolveAbsolute(dotted, files, roots);
            if (inside && 'ambiguous' in inside) {
              gaps.push({
                path: rel,
                reason: `import at line ${lineNumber} matches ${inside.ambiguous.length} files `
                  + `(${inside.ambiguous.join(', ')}); which one depends on sys.path, which is not in the source`,
              });
              continue;
            }
            if (inside && 'path' in inside) { record(inside.path); continue; }
            const top = dotted.split('.')[0];
            record(STDLIB.has(top) ? `package:python:${top}` : `package:${top}`);
          }
        }
      });
    }

    return { facts, gaps, inventory };
  },
};
