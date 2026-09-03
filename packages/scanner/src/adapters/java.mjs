// Java import adapter. Same contract as the others, same rule: NEVER guess.
//
// WHY IT EXISTS: `spring-projects/spring-boot` has 81,000 stars and Mirofy drew
// nothing from it. That was the honest answer and not a useful one.
//
// WHAT IT RESOLVES, AND HOW IT DECIDES. Java states both halves in the source,
// which is what makes this resolvable without a build system:
//
//   package com.acme.store;        every file declares the package it is in
//   import com.acme.store.Thing;   an import names a package and a type
//
// So the index is built from what the repository DECLARES, not from directory
// layout. Maven and Gradle conventionally put `com.acme.store` under
// `src/main/java/com/acme/store`, and conventionally is not always: generated
// sources, multi-module builds and `src/test/java` all break the mapping. The
// declarations do not break, because they are the thing the compiler reads.
//
// An import whose package is declared in this repository is internal, and
// resolves to the file that declares the type where one exists. Anything else
// came from a dependency.
//
// THE ONE PLACE THIS GROUPS RATHER THAN RESOLVES. A third-party import names a
// package, not an artifact: `org.springframework.boot.SpringApplication` says
// nothing about which jar it came from, and only the build file knows. Drawing
// one box per imported package would put forty Spring boxes on the canvas, so
// external packages are grouped at three segments -- `org.springframework.boot`,
// `com.fasterxml.jackson`, `org.apache.commons`. That is a naming convention
// for the box, stated here, and not a claim about artifact identity.
import fs from 'node:fs';
import path from 'node:path';
import { repositoryFiles } from '../files.mjs';

export const JAVA_EXTENSIONS = Object.freeze(['.java']);

// Shipped with every JDK, so an import of one says nothing about what this
// system depends on -- the same reason node builtins and the Python standard
// library are named rather than drawn.
const JDK_PREFIXES = ['java.', 'javax.', 'jdk.', 'sun.', 'com.sun.', 'org.w3c.dom.', 'org.xml.sax.'];

/** How many segments an external package name is grouped to. */
const EXTERNAL_SEGMENTS = 3;

/**
 * Blank out comments and string literals so neither can produce a fact.
 *
 * Unlike Go, nothing in a Java import is a string, so literals are blanked
 * wholesale -- a line of Java containing `"import com.ghost.Thing;"` is data,
 * not a dependency. Newlines survive exactly, because every fact cites a line.
 *
 * @param {string} source
 */
export function stripNonCode(source) {
  const out = [];
  let state = 'code'; // code | line-comment | block-comment | string | char
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line-comment'; out.push('  '); i += 1; continue; }
      if (ch === '/' && next === '*') { state = 'block-comment'; out.push('  '); i += 1; continue; }
      if (ch === '"') { state = 'string'; out.push(' '); continue; }
      if (ch === "'") { state = 'char'; out.push(' '); continue; }
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
    // Inside a literal: blanked, but a backslash still escapes the next
    // character, or a string ending in an escaped quote would swallow the code
    // after it.
    if (ch === '\\') { out.push('  '); i += 1; continue; }
    if ((state === 'string' && ch === '"') || (state === 'char' && ch === "'")) {
      state = 'code'; out.push(' '); continue;
    }
    out.push(ch === '\n' ? ch : ' ');
  }
  return out.join('');
}

/** The package a Java file declares, or null when it declares none. */
export function declaredPackage(code) {
  for (const line of code.split(/\r?\n/)) {
    const match = line.match(/^\s*package\s+([\w.]+)\s*;/);
    if (match) return match[1];
  }
  return null;
}

/** Group a third-party package name to a stable, readable box name. */
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

export function externalName(imported) {
  const segments = String(imported).split('.');
  // Drop the trailing type name so the box is a package rather than a class.
  // Java types are conventionally capitalised; a lowercase tail is already a
  // package, and a wildcard import has no type at all.
  // Every trailing type segment, not just one: a nested type puts two or more
  // in a row, as in `com.google.gson.ReflectionAccessFilter.FilterResult`.
  while (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last !== '*' && !/^[A-Z]/.test(last)) break;
    segments.pop();
  }
  return segments.slice(0, EXTERNAL_SEGMENTS).join('.');
}

/** Is this import shipped with the JDK? */
export function isJdk(imported) {
  return JDK_PREFIXES.some((prefix) => String(imported).startsWith(prefix));
}

const IMPORT_LINE = /^\s*import\s+(static\s+)?([\w.]+(?:\.\*)?)\s*;/;

export const javaAdapter = {
  id: 'java',
  async scan({ repoRoot }) {
    const facts = [];
    const gaps = [];
    const all = repositoryFiles(repoRoot);
    const inventory = all.filter((file) => JAVA_EXTENSIONS.includes(path.extname(file)));
    if (!inventory.length) return { facts, gaps, inventory };

    // Pass one: what this repository declares. Built from `package` statements
    // rather than from directory layout, because the declaration is what the
    // compiler reads and the layout is only a convention.
    const declaredIn = new Map(); // package -> [file, ...]
    const typeAt = new Map();     // package.Type -> file
    const sources = new Map();    // file -> stripped source
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
      const declared = declaredPackage(code);
      if (!declared) continue; // the default package: legal, and names nothing
      if (!declaredIn.has(declared)) declaredIn.set(declared, []);
      declaredIn.get(declared).push(rel);
      // A file named Thing.java declares the public type Thing. That is not a
      // convention -- the compiler requires it of every public type.
      const base = path.basename(rel, '.java');
      typeAt.set(`${declared}.${base}`, rel);
    }

    for (const rel of inventory) {
      const code = sources.get(rel);
      if (code === undefined) continue;
      const lines = code.split(/\r?\n/);

      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const match = line.match(IMPORT_LINE);
        if (!match) return;
        const isStatic = Boolean(match[1]);
        const imported = match[2];

        const record = (object) => facts.push({
          subject: rel,
          predicate: 'depends-on',
          object,
          provenance: 'statically-derived',
          location: { path: rel, lines: [lineNumber, lineNumber] },
        });

        if (isJdk(imported)) { record(`package:jdk:${imported.split('.').slice(0, 2).join('.')}`); return; }

        // Four shapes, and the static ones carry an extra segment:
        //
        //   import a.b.C;            type a.b.C     package a.b
        //   import a.b.*;            (no type)      package a.b
        //   import static a.b.C.m;   type a.b.C     package a.b
        //   import static a.b.C.*;   type a.b.C     package a.b
        //
        // Treating the static member as the type name put the package one
        // segment too deep, so `import static com.google.gson.GsonBuilder.x`
        // looked for a package called com.google.gson.GsonBuilder, failed, and
        // recorded a third-party `com.google.gson`. In gson's own repository.
        // 106 facts said google/gson depends on a published copy of itself.
        const wildcard = imported.endsWith('.*');
        let named = wildcard ? imported.slice(0, -2) : imported;
        if (isStatic && !wildcard) named = named.slice(0, named.lastIndexOf('.'));
        // After that, `named` is a type for every shape except a plain
        // wildcard, which names a package outright.
        const namesType = isStatic || !wildcard;

        // Peel from the right until what remains is a package this repository
        // declares. One peel is not enough: a NESTED type puts two or more
        // capitalised segments in a row, and
        // `com.google.gson.ReflectionAccessFilter.FilterResult` then looked for
        // a package called com.google.gson.ReflectionAccessFilter, failed, and
        // recorded a third-party com.google.gson. In gson.
        //
        // Peeling stops at a DECLARED package rather than at a capitalisation
        // rule, so it rests on what the repository says about itself.
        const parts = named.split('.');
        let asPackage = namesType ? parts.slice(0, -1).join('.') : named;
        let outermost = named;
        if (namesType) {
          for (let cut = parts.length - 1; cut >= 1; cut -= 1) {
            const candidate = parts.slice(0, cut).join('.');
            if (!declaredIn.has(candidate)) continue;
            // And the segment after it has to look like a TYPE. A package
            // segment is lowercase by universal convention, so a lowercase one
            // here means the candidate is a PREFIX of somebody else's package,
            // not the package this import is in.
            //
            // google/guava declares com.google.common, and Truth -- a separate
            // library -- lives in com.google.common.truth. Peeling on the
            // declaration alone matched guava for every Truth import and
            // reported 834 gaps against a library guava merely shares a prefix
            // with. Declaration says the package is ours; capitalisation says
            // the next thing is a type rather than a deeper package. Neither
            // is sufficient alone, which two planted regressions confirm.
            if (!/^[A-Z]/.test(parts[cut] ?? '')) continue;
            asPackage = candidate;
            outermost = parts.slice(0, cut + 1).join('.');
            break;
          }
        }

        const exact = namesType ? typeAt.get(outermost) : undefined;
        if (exact) {
          // A file importing a nested type of ITSELF is the inside of one
          // component, not an edge and not a gap. Java requires the import for
          // a statically imported nested enum constant even within the same
          // file, so this is ordinary rather than exotic: every one of the 137
          // gaps left on spring-boot and all 34 on guava were this.
          if (exact === rel) return;
          record(exact);
          return;
        }
        if (declaredIn.has(asPackage)) {
          const owner = declaredIn.get(asPackage).filter((file) => file !== rel);
          if (!owner.length) return; // a type importing its own file is not an edge
          if (wildcard) { record(owner[0]); return; }
          // The package is ours and the type is not in it. Generated sources
          // and build-time classes do that, and calling it a dependency on a
          // published copy of ourselves would be a guess -- so it is a gap.
          gaps.push({
            path: rel,
            reason: `import at line ${lineNumber} names ${imported}, and package `
              + `${asPackage} is declared in this repository but that type is not`,
          });
          return;
        }
        // Grouped at three segments for readability, but never to a name this
        // repository itself declares. guava IS com.google.common, and Truth
        // lives in com.google.common.truth -- capping that to three segments
        // would put a dependency box on the canvas named after guava.
        let external = externalName(named);
        if (declaredIn.has(external)) external = externalPackage(named);
        record(`package:${external}`);
      });
    }

    return { facts, gaps, inventory };
  },
};
