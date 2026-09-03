// Rust import adapter. Same contract as the others, same rule: NEVER guess.
//
// WHY IT EXISTS: `.rs` was the largest unread group in the biggest repository
// this tool had been pointed at -- 1,038 files in vercel/next.js, which is a
// whole Rust toolchain sitting inside a TypeScript project and invisible.
//
// WHAT IT RESOLVES, AND HOW IT DECIDES.
//
//   use crate::a::b;      this crate, from its own root
//   use super::x;         the parent module of the importing file
//   use self::x;          the importing file's own module
//   use std::fs;          the standard library, named rather than drawn
//   use serde::Serialize; another crate
//
// A Rust module is a FILE or a DIRECTORY with mod.rs, and `use crate::a::b::C`
// does not say which of a, b or C is the file -- the tail may be a type, a
// function or a nested module inside one. So resolution peels from the right
// until a real file appears, exactly as the Java adapter peels to a declared
// package. It is accepted because the file is there.
//
// CARGO NAMES ARE NOT CODE NAMES. Cargo.toml says `next-build`; the code says
// `next_build`. A workspace member imported by a sibling arrives hyphen-free,
// so the index is keyed on the underscored form -- otherwise every internal
// crate-to-crate edge in every Rust workspace is recorded as a third-party
// dependency.
import fs from 'node:fs';
import path from 'node:path';
import { repositoryFiles } from '../files.mjs';

export const RUST_EXTENSIONS = Object.freeze(['.rs']);

// Shipped with the toolchain. Every crate uses `std`, so drawing it would bury
// the architecture the way node builtins and the Python standard library would.
const TOOLCHAIN = new Set(['std', 'core', 'alloc', 'proc_macro', 'test']);

/**
 * Blank out comments and string literals so neither can produce a fact.
 *
 * Rust block comments NEST: an inner slash-star pair opens a second level, and
 * a scanner that stops at the first close reads the tail as code. A raw
 * string carries its own delimiter, so the hash count has to be matched
 * rather than assumed. Newlines survive exactly, because every fact cites a
 * line.
 *
 * @param {string} source
 */
export function stripNonCode(source) {
  const out = [];
  let depth = 0;      // nested block comments
  let state = 'code'; // code | line | string | raw | char
  let hashes = 0;     // for a raw string's closing delimiter
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code' && depth === 0) {
      if (ch === '/' && next === '/') { state = 'line'; out.push('  '); i += 1; continue; }
      if (ch === '/' && next === '*') { depth = 1; out.push('  '); i += 1; continue; }
      if (ch === 'r' && (next === '"' || next === '#')) {
        let j = i + 1;
        let count = 0;
        while (source[j] === '#') { count += 1; j += 1; }
        if (source[j] === '"') {
          state = 'raw'; hashes = count;
          out.push(' '.repeat(j - i + 1));
          i = j;
          continue;
        }
      }
      if (ch === '"') { state = 'string'; out.push(' '); continue; }
      // A lifetime (`&'a T`) looks like an unterminated char literal, so only a
      // real char literal -- 'x' or '\n' -- opens one.
      if (ch === "'" && (source[i + 2] === "'" || (next === '\\' && source[i + 3] === "'"))) {
        state = 'char'; out.push(' '); continue;
      }
      out.push(ch);
      continue;
    }
    if (depth > 0) {
      if (ch === '/' && next === '*') { depth += 1; out.push('  '); i += 1; continue; }
      if (ch === '*' && next === '/') { depth -= 1; out.push('  '); i += 1; continue; }
      out.push(ch === '\n' ? ch : ' ');
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out.push(ch); continue; }
      out.push(' ');
      continue;
    }
    if (state === 'raw') {
      if (ch === '"') {
        let count = 0;
        while (source[i + 1 + count] === '#') count += 1;
        if (count >= hashes) {
          state = 'code';
          out.push(' '.repeat(1 + hashes));
          i += hashes;
          continue;
        }
      }
      out.push(ch === '\n' ? ch : ' ');
      continue;
    }
    // A plain string or char literal: a backslash escapes the next character.
    if (ch === '\\') { out.push('  '); i += 1; continue; }
    if ((state === 'string' && ch === '"') || (state === 'char' && ch === "'")) {
      state = 'code'; out.push(' '); continue;
    }
    out.push(ch === '\n' ? ch : ' ');
  }
  return out.join('');
}

/** Cargo writes `next-build`; code writes `next_build`. */
export const crateName = (name) => String(name).split('-').join('_');

/**
 * Every crate this repository builds: its code name and where its sources are.
 *
 * Read from Cargo.toml rather than assumed from directory names, because a
 * crate's package name and its folder routinely differ.
 *
 * @param {string} repoRoot
 * @param {string[]} files
 */
export function cargoCrates(repoRoot, files) {
  const crates = [];
  for (const rel of files) {
    if (path.basename(rel) !== 'Cargo.toml') continue;
    let text;
    try {
      text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      continue; // unreadable manifest: its files still enter the inventory
    }
    // Only the [package] section's name. A [workspace] table has members but no
    // name of its own, and `name` under [dependencies.foo] is a different key.
    let section = '';
    let name = null;
    // WHERE THE SOURCES ARE, when the manifest says so. `src/` is only the
    // default: `[lib] path = "lib.rs"` puts them in the crate directory itself,
    // and denoland/deno does exactly that for its main crate and several more.
    // Assuming `src/` produced 3,896 gaps -- 27% of every fact in the
    // repository -- against directories that were never there.
    const declared = [];
    for (const line of text.split(/\r?\n/)) {
      const header = line.match(/^\s*\[+([^\]]+)\]+/);
      if (header) { section = header[1].trim(); continue; }
      if (section === 'package') {
        const match = line.match(/^\s*name\s*=\s*"([^"]+)"/);
        if (match && !name) name = match[1];
        continue;
      }
      if (section !== 'lib' && section !== 'bin') continue;
      const target = line.match(/^\s*path\s*=\s*"([^"]+)"/);
      if (target && !declared.includes(target[1])) declared.push(target[1]);
    }
    if (!name) continue;
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    crates.push({ name: crateName(name), dir, manifest: rel, declared });
  }
  return crates.sort((left, right) => right.dir.length - left.dir.length);
}

/**
 * Where a Rust target's modules are rooted.
 *
 * A crate's library lives under `src`, but Cargo compiles every direct child
 * of `tests`, `benches` and `examples` as its OWN crate. In one of those,
 * `crate::util` means a module beside the test file -- `tests/util.rs` -- and
 * not `src/util.rs`, which is usually a different thing or nothing at all.
 *
 * vercel/next.js produced 34 gaps against exactly this: integration tests
 * saying `crate::util` with `tests/util.rs` sitting next to them.
 *
 * @param {string} rel file path relative to the repository
 * @param {string} crateDir the crate's directory
 */
export function targetOf(rel, crateDir, declared = []) {
  const prefix = crateDir ? `${crateDir}/` : '';
  const inside = crateDir ? rel.slice(crateDir.length + 1) : rel;
  for (const dir of ['tests', 'benches', 'examples']) {
    if (!inside.startsWith(`${dir}/`)) continue;
    return { base: `${prefix}${dir}`, roots: [] };
  }
  // A declared `path` is relative to the crate directory, so `lib.rs` means
  // the crate directory IS the source root. Anything under a subdirectory --
  // the ordinary `src/lib.rs` -- names that subdirectory instead.
  const fromManifest = declared.filter((p) => !p.includes('/'));
  if (fromManifest.length) return { base: crateDir, roots: fromManifest };
  const nested = declared.find((p) => p.includes('/'));
  if (nested) {
    const dir = nested.slice(0, nested.lastIndexOf('/'));
    return { base: `${prefix}${dir}`, roots: [nested.slice(dir.length + 1)] };
  }
  return { base: `${prefix}src`, roots: ['lib.rs', 'main.rs'] };
}

/**
 * The module path of a source file, relative to its target root.
 *
 * `src/a/b.rs` is `a::b`; `src/a/mod.rs` is `a`; `src/lib.rs` is the root.
 *
 * @param {string} rel file path relative to the repository
 * @param {string} base the target root, from targetOf
 */
export function moduleOf(rel, base) {
  let inside = base && rel.startsWith(`${base}/`) ? rel.slice(base.length + 1) : rel;
  inside = inside.replace(/.rs$/, '');
  const segments = inside.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last === 'mod' || last === 'lib' || last === 'main') segments.pop();
  return segments;
}

const USE_LINE = /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+(.+?)\s*;/;

/** Expand one level of `a::{b, c}` into `a::b`, `a::c`. */
export function expandUse(clause) {
  const open = clause.indexOf('{');
  if (open < 0) return [clause];
  const close = clause.lastIndexOf('}');
  if (close < open) return [clause];
  const base = clause.slice(0, open).replace(/::$/, '');
  const inner = clause.slice(open + 1, close);
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter((part) => part && part !== 'self')
    .map((part) => (base ? `${base}::${part}` : part));
}

export const rustAdapter = {
  id: 'rust',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const all = repositoryFiles(repoRoot);
    const files = new Set(all);
    const inventory = all.filter((file) => RUST_EXTENSIONS.includes(path.extname(file)));
    if (!inventory.length) return { facts, gaps, inventory };

    const crates = cargoCrates(repoRoot, all);
    const byName = new Map(crates.map((crate) => [crate.name, crate]));
    /** The crate a file belongs to: the nearest manifest above it. */
    const crateOf = (rel) => crates.find((crate) => (crate.dir === '' && !rel.includes('/'))
      || (crate.dir !== '' && rel.startsWith(`${crate.dir}/`))
      || crate.dir === '') ?? null;

    /**
     * A module path inside `crate`, peeled from the right until a file exists.
     * The tail of a `use` may be a type or a function rather than a module, and
     * nothing in the specifier says which.
     */
    // Which modules a file declares INLINE, read on demand and remembered.
    //
    // `pub(crate) mod sys { ... }` in a crate root means `crate::sys::CliSys`
    // lives in that same file, and no `sys.rs` exists anywhere. denoland/deno
    // does this and the peel below cannot see it: it looks for files, and this
    // module is not one.
    const inlineCache = new Map();
    function inlineModsOf(file) {
      if (inlineCache.has(file)) return inlineCache.get(file);
      const names = new Set();
      try {
        const code = stripNonCode(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
        for (const line of code.split(/\r?\n/)) {
          const match = line.match(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*{/);
          if (match) names.add(match[1]);
        }
      } catch {
        // Unreadable here is reported where the file is scanned.
      }
      inlineCache.set(file, names);
      return names;
    }

    function resolveModule(base, roots, segments) {
      // The crate root is only an answer for `use crate::Item` -- one name,
      // which is an item declared in lib.rs. For anything deeper some file has
      // to match a prefix, or the module genuinely is not there.
      //
      // Without that floor the peel runs all the way down and src/lib.rs
      // always exists, so `use crate::missing::Thing` resolved to the crate
      // root -- frequently the importing file itself, recorded as depending on
      // itself instead of reported as the gap it is.
      const floor = segments.length > 1 ? 1 : 0;
      for (let take = segments.length; take >= floor; take -= 1) {
        const prefix = segments.slice(0, take);
        const joined = prefix.length ? `${base}/${prefix.join('/')}` : base;
        for (const candidate of prefix.length
          ? [`${joined}.rs`, `${joined}/mod.rs`]
          : roots.map((root) => `${base}/${root}`)) {
          if (files.has(candidate)) return candidate;
        }
      }
      // The peel found no file. Before calling it a gap, ask the deepest
      // ancestor that DOES exist whether it declares the next name inline.
      for (let take = segments.length - 1; take >= 0; take -= 1) {
        const prefix = segments.slice(0, take);
        const joined = prefix.length ? `${base}/${prefix.join('/')}` : base;
        const candidates = prefix.length
          ? [`${joined}.rs`, `${joined}/mod.rs`]
          : roots.map((root) => `${base}/${root}`);
        // EVERY candidate at this level, not just the first that exists. A
        // crate with both a bin and a lib has two roots, and deno declares the
        // bin first while the inline `mod sys` is in the lib -- checking only
        // the first left 43 of its uses unresolved.
        let found = null;
        let sawFile = false;
        for (const candidate of candidates) {
          if (!files.has(candidate)) continue;
          sawFile = true;
          if (inlineModsOf(candidate).has(segments[take])) { found = candidate; break; }
        }
        if (found) return found;
        if (sawFile) break;
      }
      return null;
    }

    for (const rel of inventory) {
      let source;
      try {
        source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      } catch (error) {
        gaps.push({ path: rel, reason: `could not be read: ${error.message}` });
        continue;
      }
      const owner = crateOf(rel);
      const target = owner ? targetOf(rel, owner.dir, owner.declared) : null;
      const here = target ? moduleOf(rel, target.base) : [];
      const lines = stripNonCode(source).split(/\r?\n/);

      // Inline modules change what `super` means.
      //
      // `#[cfg(test)] mod tests { use super::*; }` is the commonest shape in
      // Rust, and `super` there is the FILE, not the file's parent. Resolving
      // it as the parent walked all the way up and recorded an edge to lib.rs
      // -- a wrong answer rather than a gap, which is worse.
      //
      // Brace depth is enough to know we are inside one. WHICH one does not
      // matter: everything a `super` reaches from in here is this same file.
      let braces = 0;
      const inlineAt = [];

      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const inlineDepth = inlineAt.length;
        const declares = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*{/.test(line);
        for (const ch of line) {
          if (ch === '{') braces += 1;
          if (ch === '}') {
            braces -= 1;
            while (inlineAt.length && inlineAt[inlineAt.length - 1] > braces) inlineAt.pop();
          }
        }
        if (declares) inlineAt.push(braces);
        const match = line.match(USE_LINE);
        if (!match) return;

        const record = (object) => facts.push({
          subject: rel,
          predicate: 'depends-on',
          object,
          provenance: 'statically-derived',
          location: { path: rel, lines: [lineNumber, lineNumber] },
        });

        for (const clause of expandUse(match[1])) {
          const segments = clause.split('::').map((s) => s.trim()).filter(Boolean);
          if (!segments.length) continue;
          const head = segments[0];

          if (TOOLCHAIN.has(head)) { record(`package:rust:${head}`); continue; }
          if (!owner) { record(`package:${head}`); continue; }

          let want = null;
          if (head === 'crate') want = segments.slice(1);
          else if (head === 'self') want = [...here, ...segments.slice(1)];
          else if (head === 'super') {
            let up = 0;
            while (segments[up] === 'super') up += 1;
              // Inside an inline module, `super` climbs back to this file.
              // That is the inside of one component: not an edge, not a gap.
              if (up <= inlineDepth) continue;
              if (up - inlineDepth > here.length) {
              gaps.push({
                path: rel,
                reason: `use at line ${lineNumber} climbs ${up} module(s) above `
                  + `${here.join('::') || 'the crate root'}, which is the top of this crate`,
              });
              continue;
            }
              want = [...here.slice(0, here.length - (up - inlineDepth)), ...segments.slice(up)];
          }

          if (want) {
            const file = resolveModule(target.base, target.roots, want);
            if (file) { record(file); continue; }
            gaps.push({
              path: rel,
              reason: `use at line ${lineNumber} names ${clause}, which is inside `
                + `crate ${owner.name} but matches no file under `
                  + `${target.base}`,
            });
            continue;
          }

          // Another crate. A workspace member is this repository's own code;
          // anything else came from the registry.
          const sibling = byName.get(crateName(head));
          if (sibling && sibling !== owner) {
            const siblingTarget = targetOf(`${sibling.dir}/x.rs`, sibling.dir, sibling.declared);
            const file = resolveModule(siblingTarget.base, siblingTarget.roots, segments.slice(1));
            record(file ?? `package:${crateName(head)}`);
            continue;
          }
          record(`package:${crateName(head)}`);
        }
      });
    }

    return { facts, gaps, inventory };
  },
};
