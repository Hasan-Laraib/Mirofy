// Kotlin import adapter. Same contract as the others, same rule: NEVER guess.
//
// WHY IT EXISTS: spring-projects/spring-boot has 437 Kotlin files, and the
// coverage report named every one of them as unread while the Java adapter
// read the other 8,328.
//
// WHAT IT RESOLVES. Like Java, Kotlin states both halves in the source, so the
// index is built from what files DECLARE rather than from directory layout:
//
//   package com.acme.store        the package this file is in
//   import com.acme.store.Thing   a type in that package
//   import com.acme.store.helper  a TOP-LEVEL function, which Java has no idea about
//
// TWO THINGS ARE NOT LIKE JAVA, and both matter.
//
// A Kotlin file does NOT have to be named after the type it declares, and may
// declare several. So the type index is built by reading the declarations --
// `class`, `object`, `interface`, `enum class`, `typealias` -- rather than from
// the file name, which is what the Java adapter can rely on and this one cannot.
//
// And an import may name a top-level function or property, which is a lowercase
// tail where Java would only ever have a type. That collides with the rule that
// keeps another library's package from being mistaken for ours: a lowercase
// segment usually means "this is a deeper package, not a type". Here it means
// that only when the segment is not the LAST one -- `a.b.c.helper` is a
// function in package a.b.c, while `a.b.truth.Truth` is a type in a package
// this repository does not declare.
import fs from 'node:fs';
import path from 'node:path';
import { repositoryFiles } from '../files.mjs';
import { jvmDeclarations } from '../jvm-index.mjs';

export const KOTLIN_EXTENSIONS = Object.freeze(['.kt', '.kts']);

// Shipped with the language or the JVM, so an import of one says nothing about
// what this system depends on.
const BUILTIN_PREFIXES = [
  'kotlin.', 'kotlinx.', 'java.', 'javax.', 'jdk.', 'sun.', 'com.sun.',
];

/** How many segments an external package name is grouped to. */
const EXTERNAL_SEGMENTS = 3;

/**
 * Blank out comments and string literals so neither can produce a fact.
 *
 * Kotlin block comments nest, as Rust's do. Triple-quoted raw strings run
 * across lines and contain anything at all. Newlines survive exactly, because
 * every fact cites a line.
 *
 * @param {string} source
 */
export function stripNonCode(source) {
  const out = [];
  let depth = 0;
  let state = 'code'; // code | line | string | raw | char
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code' && depth === 0) {
      if (ch === '/' && next === '/') { state = 'line'; out.push('  '); i += 1; continue; }
      if (ch === '/' && next === '*') { depth = 1; out.push('  '); i += 1; continue; }
      if (ch === '"' && next === '"' && source[i + 2] === '"') {
        state = 'raw'; out.push('   '); i += 2; continue;
      }
      if (ch === '"') { state = 'string'; out.push(' '); continue; }
      if (ch === "'") { state = 'char'; out.push(' '); continue; }
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
      if (ch === '"' && next === '"' && source[i + 2] === '"') {
        state = 'code'; out.push('   '); i += 2; continue;
      }
      out.push(ch === '\n' ? ch : ' ');
      continue;
    }
    if (ch === '\\') { out.push('  '); i += 1; continue; }
    if ((state === 'string' && ch === '"') || (state === 'char' && ch === "'")) {
      state = 'code'; out.push(' '); continue;
    }
    out.push(ch === '\n' ? ch : ' ');
  }
  return out.join('');
}

/** The package a Kotlin file declares. The semicolon is optional. */
export function declaredPackage(code) {
  for (const line of code.split(/\r?\n/)) {
    const match = line.match(/^\s*package\s+([\w.]+)\s*;?\s*$/);
    if (match) return match[1];
  }
  return null;
}

// Every modifier Kotlin allows before a declaration, `fun` included.
//
// `fun interface Dns { }` is a SAM interface and ordinary Kotlin. Leaving
// `fun` out of the list meant okhttp3.Dns, okhttp3.Interceptor and
// leakcanary's EventListener were not in the type index at all -- 35 of
// okhttp's 109 gaps and 27 of leakcanary's 134, against types declared in
// the very repositories importing them.
const DECLARATION = /^\s*(?:@\w+\s+)*(?:(?:public|private|protected|internal|abstract|final|open|sealed|data|value|inner|annotation|enum|fun|expect|actual|external|inline|companion)\s+)*(?:class|interface|object|typealias)\s+([A-Za-z_]\w*)/;

/**
 * Every type a Kotlin file declares at the top level.
 *
 * Read from the declarations, because a Kotlin file need not be named after
 * the type it holds and may declare several -- the one assumption the Java
 * adapter is allowed to make and this one is not.
 *
 * @param {string} code
 */
export function declaredTypes(code) {
  const names = [];
  for (const line of code.split(/\r?\n/)) {
    const match = line.match(DECLARATION);
    if (match) names.push(match[1]);
  }
  return names;
}

/** Group a third-party package name to a stable, readable box name. */
export function externalName(imported) {
  const segments = String(imported).split('.');
  while (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last !== '*' && !/^[A-Z]/.test(last)) break;
    segments.pop();
  }
  return segments.slice(0, EXTERNAL_SEGMENTS).join('.');
}

/** The package an import names, with every trailing type segment removed. */
export function externalPackage(imported) {
  const segments = String(imported).split('.');
  while (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last !== '*' && !/^[A-Z]/.test(last)) break;
    segments.pop();
  }
  return segments.join('.');
}

/** Is this import shipped with Kotlin or the JVM? */
export function isBuiltin(imported) {
  return BUILTIN_PREFIXES.some((prefix) => String(imported).startsWith(prefix));
}

/**
 * Does this name look like a TYPE rather than a top-level constant?
 *
 * Both start with a capital. A Kotlin type is PascalCase (`Dns`,
 * `EventListener`) and a top-level constant is SCREAMING_SNAKE (`USER_AGENT`,
 * `TYPE_A`, `UTC`) -- and okhttp imports plenty of the latter, which were
 * looked up in the type index, not found, and reported as gaps.
 *
 * A type genuinely named `URL` is read as a constant and resolves to its
 * package rather than its file. That is a less precise citation, not a wrong
 * component, which is the right way round for a rule that has to guess.
 *
 * @param {string} name
 */
export function looksLikeType(name) {
  const text = String(name);
  return /^[A-Z]/.test(text) && !/^[A-Z0-9_]+$/.test(text);
}

const IMPORT_LINE = /^\s*import\s+([\w.]+(?:\.\*)?)(?:\s+as\s+\w+)?\s*;?\s*$/;

export const kotlinAdapter = {
  id: 'kotlin',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const all = repositoryFiles(repoRoot);
    const inventory = all.filter((file) => KOTLIN_EXTENSIONS.includes(path.extname(file)));
    if (!inventory.length) return { facts, gaps, inventory };

    // Across BOTH JVM languages: a Kotlin file importing a Java type from the
    // same repository is a real edge, and an index of .kt alone reports it as
    // a missing type. spring-boot produced 112 of exactly that.
    const { declaredIn, typeAt, unreadable } = jvmDeclarations(repoRoot, all);
    gaps.push(...unreadable.filter((entry) => KOTLIN_EXTENSIONS.includes(path.extname(entry.path))));
    const sources = new Map();
    for (const rel of inventory) {
      let source;
      try {
        source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      } catch (error) {
        gaps.push({ path: rel, reason: `could not be read: ${error.message}` });
        continue;
      }
      const code = stripNonCode(source);
      sources.set(rel, code);
    }

    for (const rel of inventory) {
      const code = sources.get(rel);
      if (code === undefined) continue;
      const lines = code.split(/\r?\n/);

      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const match = line.match(IMPORT_LINE);
        if (!match) return;
        const imported = match[1];

        const record = (object) => facts.push({
          subject: rel,
          predicate: 'depends-on',
          object,
          provenance: 'statically-derived',
          location: { path: rel, lines: [lineNumber, lineNumber] },
        });

        if (isBuiltin(imported)) {
          record(`package:kotlin:${imported.split('.').slice(0, 2).join('.')}`);
          return;
        }

        const wildcard = imported.endsWith('.*');
        const named = wildcard ? imported.slice(0, -2) : imported;
        const parts = named.split('.');

        // Peel until what remains is a package this repository declares, and
        // the segment after it is either a TYPE or the last thing named.
        //
        // A lowercase tail is a top-level function or property, which Kotlin
        // has and Java does not. A lowercase segment in the MIDDLE is a deeper
        // package -- which is what keeps another library sharing our prefix
        // from being mistaken for ours, as Truth was for guava.
        let asPackage = wildcard ? named : parts.slice(0, -1).join('.');
        let outermost = named;
        if (!wildcard) {
          for (let cut = parts.length - 1; cut >= 1; cut -= 1) {
            const candidate = parts.slice(0, cut).join('.');
            if (!declaredIn.has(candidate)) continue;
            const after = parts[cut];
            // A lowercase segment here is a deeper package, which is what keeps
            // another library sharing our prefix from being mistaken for ours.
            // A lowercase TAIL -- a top-level function -- needs no peel at all:
            // the default package below already names it, which is why removing
            // this branch changes no test and it is therefore not written.
            if (!looksLikeType(after)) continue;
            asPackage = candidate;
            outermost = parts.slice(0, cut + 1).join('.');
            break;
          }
        }

        const exact = wildcard ? undefined : typeAt.get(outermost);
        if (exact) {
          if (exact === rel) return; // its own type: the inside of one component
          record(exact);
          return;
        }
        if (declaredIn.has(asPackage)) {
          const owner = declaredIn.get(asPackage).filter((file) => file !== rel);
          if (!owner.length) return;
          // A top-level function, or a wildcard: the package is the target, and
          // any file declaring it is a citation a reader can open.
          if (wildcard || !looksLikeType(parts[parts.length - 1])) {
            record(owner[0]);
            return;
          }
          gaps.push({
            path: rel,
            reason: `import at line ${lineNumber} names ${imported}, and package `
              + `${asPackage} is declared in this repository but that type is not`,
          });
          return;
        }
        let external = externalName(named);
        if (declaredIn.has(external)) external = externalPackage(named);
        record(`package:${external}`);
      });
    }

    return { facts, gaps, inventory };
  },
};
