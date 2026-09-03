// What a JVM repository declares, across BOTH of its languages.
//
// WHY THIS IS SHARED. Java and Kotlin compile to one namespace and import each
// other freely: a Kotlin file writes `import org.springframework.boot.Banner`
// and Banner is a .java file two directories away. An adapter that indexes only
// its own extension cannot see that, and the import lands in the worst possible
// bucket -- the package IS declared here, so the type looks missing, and a real
// edge is reported as a gap.
//
// spring-projects/spring-boot produced 112 of those: every one a Kotlin file
// importing a Java type from spring-boot itself.
//
// Each adapter still owns its own INVENTORY -- the Java adapter reports on
// .java files and the Kotlin adapter on .kt -- because coverage has to say
// which files each one actually examined. Only the declaration index is shared.
import fs from 'node:fs';
import path from 'node:path';
import { stripNonCode as stripJava } from './adapters/java.mjs';
import { stripNonCode as stripKotlin } from './adapters/kotlin.mjs';

// Each language blanked by its own rules. Java block comments do not nest
// and Kotlin's do; Kotlin has triple-quoted raw strings and Java does not.
// Running one over the other loses a package line often enough to matter.
//
// The import is circular -- each adapter uses this index -- and works because
// both strippers are hoisted function declarations rather than consts.
const STRIP = { '.java': stripJava, '.kt': stripKotlin, '.kts': stripKotlin };

/**
 * Top-level type declarations in a Kotlin file.
 *
 * Read from the declarations because a Kotlin file need not be named after the
 * type it holds and may declare several -- the one assumption Java allows and
 * Kotlin does not.
 */
const KOTLIN_DECLARATION = /^\s*(?:@\w+\s+)*(?:public\s+|internal\s+|private\s+|abstract\s+|open\s+|sealed\s+|data\s+|value\s+|inner\s+|annotation\s+|enum\s+)*(?:class|interface|object|typealias)\s+([A-Za-z_]\w*)/;

const PACKAGE_LINE = /^\s*package\s+([\w.]+)\s*;?\s*$/;

/**
 * Build the declaration index for a JVM repository.
 *
 * @param {string} repoRoot
 * @param {string[]} files every repository file, already walked
 * @returns {{declaredIn: Map<string, string[]>, typeAt: Map<string, string>,
 *            unreadable: {path: string, reason: string}[]}}
 */
export function jvmDeclarations(repoRoot, files) {
  const declaredIn = new Map();
  const typeAt = new Map();
  const unreadable = [];
  for (const rel of files) {
    const ext = path.extname(rel);
    if (ext !== '.java' && ext !== '.kt' && ext !== '.kts') continue;
    let source;
    try {
      source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch (error) {
      unreadable.push({ path: rel, reason: `could not be read: ${error.message}` });
      continue;
    }
    const code = STRIP[ext](source);
    let declared = null;
    for (const line of code.split(/\r?\n/)) {
      const match = line.match(PACKAGE_LINE);
      if (match) { declared = match[1]; break; }
    }
    if (!declared) continue; // the default package: legal, and names nothing
    if (!declaredIn.has(declared)) declaredIn.set(declared, []);
    declaredIn.get(declared).push(rel);

    if (ext === '.java') {
      // The compiler requires a public type to match its file name.
      typeAt.set(`${declared}.${path.basename(rel, '.java')}`, rel);
      continue;
    }
    for (const line of code.split(/\r?\n/)) {
      const match = line.match(KOTLIN_DECLARATION);
      if (match) typeAt.set(`${declared}.${match[1]}`, rel);
    }
  }
  // Deterministic: a package's files in path order, so "any file in the
  // package" is the same file on every run.
  for (const list of declaredIn.values()) list.sort();
  return { declaredIn, typeAt, unreadable };
}
