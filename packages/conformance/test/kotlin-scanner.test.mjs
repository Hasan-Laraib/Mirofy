// The Kotlin import adapter (row 2.21, sixth language).
//
// Same two halves as every other adapter test: the facts it must find, and the
// Gap it must record where analysis honestly stops.
//
// It exists because spring-projects/spring-boot has 437 Kotlin files, and the
// coverage report named every one of them as unread while the Java adapter read
// the other 8,328.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  kotlinAdapter, stripNonCode, declaredTypes, declaredPackage, isBuiltin,
} from '../../scanner/src/adapters/kotlin.mjs';
import { runAdapter } from '../../scanner/src/adapter.mjs';

const REVISION = 'a'.repeat(40);
const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
const Q3 = '"'.repeat(3);

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-kotlin-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('[2.21] a type is found by its DECLARATION, not by the file name', async () => {
  // The one assumption the Java adapter is allowed to make and this one is not:
  // a Kotlin file need not be named after the type it holds, and may declare
  // several. `Widgets.kt` below declares `Store` and `Cache`, and neither is
  // findable from the file name.
  const repoRoot = makeRepo({
    'lib/Widgets.kt': [
      'package com.acme.store',
      '',
      'class Store',
      'data class Cache(val n: Int)',
      '',
    ].join(NL),
    'app/App.kt': [
      'package com.acme',
      '',
      'import com.acme.store.Store',
      'import com.acme.store.Cache',
      '',
      'class App',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual([...new Set(facts.map((fact) => fact.object))], ['lib/Widgets.kt'],
    'both types resolve to the file that declares them');
  assert.deepEqual(facts[0].location.lines, [3, 3]);
  for (const fact of facts) assert.equal(fact.provenance, 'statically-derived');
});

test('[2.21] declaredTypes reads the shapes Kotlin actually uses', () => {
  const code = [
    'package p',
    'class A',
    'data class B(val x: Int)',
    'sealed class C',
    'enum class D { ONE }',
    'annotation class E',
    'object F',
    'interface G',
    'typealias H = String',
    'internal open class I',
    '  class NotTopLevel',
    'fun notAType() {}',
  ].join(NL);
  const found = declaredTypes(code);
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
    assert.ok(found.includes(name), `${name} should be a declared type: ${found.join(', ')}`);
  }
  assert.ok(!found.includes('notAType'), 'a function is not a type');
});

test('[2.21] the package declaration does not need a semicolon', () => {
  assert.equal(declaredPackage('package com.acme' + NL), 'com.acme');
  assert.equal(declaredPackage('package com.acme;' + NL), 'com.acme');
  assert.equal(declaredPackage('class A' + NL), null);
});

test('[2.21] Kotlin and the JVM are named rather than drawn', async () => {
  for (const inside of ['kotlin.collections.List', 'kotlinx.coroutines.launch', 'java.util.List']) {
    assert.equal(isBuiltin(inside), true, `${inside} ships with the language or the JVM`);
  }
  assert.equal(isBuiltin('org.springframework.boot.SpringApplication'), false);
  const repoRoot = makeRepo({
    'App.kt': [
      'package com.acme',
      '',
      'import kotlin.collections.List',
      'import kotlinx.coroutines.launch',
      'import org.springframework.boot.SpringApplication',
      '',
      'class App',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['package:kotlin:kotlin.collections', 'package:kotlin:kotlinx.coroutines',
      'package:org.springframework.boot']);
});

test('[2.21] a top-level function import resolves to its package', async () => {
  // Kotlin has top-level functions and Java does not, so a LOWERCASE tail is an
  // ordinary import here. Rejecting it would lose every utility import in every
  // Kotlin codebase.
  const repoRoot = makeRepo({
    'util/Helpers.kt': ['package com.acme.util', '', 'fun helper() {}', ''].join(NL),
    'App.kt': ['package com.acme', '', 'import com.acme.util.helper', '', 'class App', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['util/Helpers.kt']);
});

test('[2.21] but a lowercase segment in the MIDDLE is still somebody else', async () => {
  // The rule that keeps another library sharing our prefix from being mistaken
  // for ours -- Truth, for guava -- has to survive the top-level-function rule.
  // `com.acme.truth.Truth` is a type in a package this repository does not
  // declare, even though it declares `com.acme`.
  const repoRoot = makeRepo({
    'App.kt': [
      'package com.acme',
      '',
      'import com.acme.truth.Truth',
      '',
      'class App',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [],
    `a different library sharing our prefix is not an unresolved import of ours: `
    + `${JSON.stringify(gaps)}`);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:com.acme.truth']);
});

test('[2.21] an import inside a comment or a raw string is not a fact', async () => {
  // Kotlin block comments nest, and a triple-quoted string runs across lines
  // and holds anything at all.
  const repoRoot = makeRepo({
    'App.kt': [
      'package com.acme',
      '',
      '/*',
      'import com.ghost.One',
      '/* nested */',
      'import com.ghost.Two',
      '*/',
      'import org.real.Thing',
      '',
      'val path = ' + Q3 + 'C:\\' + Q3,
      'val sql = ' + Q3,
      'import com.ghost.Three',
      Q3,
      '',
      'class App',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:org.real'],
    'only the real import survives; three commented or quoted ones are not code');
  assert.deepEqual(facts[0].location.lines, [8, 8],
    'and the line number survives the blanking');
});

test('[2.21] a Kotlin file importing a Java type in the same repository is an edge', async () => {
  // Java and Kotlin compile to one namespace and import each other freely. An
  // index of .kt alone cannot see the Java side, and the import lands in the
  // worst bucket available: the package IS declared here, so the type looks
  // missing, and a real edge is reported as a gap.
  //
  // spring-projects/spring-boot produced 112 of those -- every one a Kotlin
  // file importing a Java type from spring-boot itself. Both adapters read one
  // shared declaration index now, while each keeps its own inventory, because
  // coverage still has to say which files each one examined.
  const repoRoot = makeRepo({
    'java/Banner.java': ['package com.acme.boot;', '', 'public class Banner {}', ''].join(NL),
    'kt/App.kt': ['package com.acme.app', '', 'import com.acme.boot.Banner', '', 'class App', ''].join(NL),
  });
  const { facts, gaps, inventory } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [],
    `a Java type in this repository is not a missing type: ${JSON.stringify(gaps)}`);
  assert.deepEqual(facts.map((fact) => fact.object), ['java/Banner.java']);
  assert.deepEqual(inventory, ['kt/App.kt'],
    'and the Kotlin adapter still reports only the files it examined');
});


test('[2.21] stripNonCode keeps every newline', () => {
  const source = ['a', '// gone', '/* also', 'gone */', 'val s = "x"', ''].join(NL);
  const stripped = stripNonCode(source);
  assert.equal(stripped.split(NL).length, source.split(NL).length,
    'a blanking pass that loses a newline moves every citation after it');
});

test('[2.21] an aliased import is the same import', async () => {
  const repoRoot = makeRepo({
    'lib/S.kt': ['package com.acme.store', '', 'class Store', ''].join(NL),
    'App.kt': ['package com.acme', '', 'import com.acme.store.Store as S', '', 'class App', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['lib/S.kt'],
    '`as S` does not change what is imported');
});

test('[2.21] a CRLF checkout is read, not silently skipped', async () => {
  const repoRoot = makeRepo({
    'App.kt': ['package com.acme', '', 'import org.real.Thing', '', 'class App', ''].join(CRLF),
  });
  const { facts, gaps } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:org.real']);
  assert.deepEqual(facts[0].location.lines, [3, 3]);
});

test('[2.21] a type missing from a package this repository declares is a Gap', async () => {
  const repoRoot = makeRepo({
    'lib/S.kt': ['package com.acme.store', '', 'class Store', ''].join(NL),
    'App.kt': ['package com.acme', '', 'import com.acme.store.Generated', '', 'class App', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts, []);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].reason, /but that type is not/);
});

test('[2.21] .kts build scripts are read too, and ignored files are not', async () => {
  const repoRoot = makeRepo({
    '.gitignore': 'build/out/' + NL,
    'build.gradle.kts': ['import org.real.Plugin', ''].join(NL),
    'build/out/Gen.kt': ['package com.acme.gen', '', 'import com.ghost.Thing', ''].join(NL),
  });
  const { facts, inventory } = await runAdapter(kotlinAdapter, { repoRoot, revision: REVISION });
  assert.ok(inventory.includes('build.gradle.kts'), 'a Kotlin build script is Kotlin');
  assert.ok(!inventory.includes('build/out/Gen.kt'), 'and generated output is not read');
  assert.ok(facts.some((fact) => fact.object === 'package:org.real'));
});
