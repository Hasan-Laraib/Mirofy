// The Java import adapter (row 2.19, fourth language).
//
// Same two halves as every other adapter test: the facts it must find, and the
// Gap it must record where analysis honestly stops.
//
// It exists because spring-projects/spring-boot has 81,000 stars and Mirofy
// drew nothing from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { javaAdapter, stripNonCode, externalName, isJdk } from '../../scanner/src/adapters/java.mjs';
import { runAdapter } from '../../scanner/src/adapter.mjs';

const REVISION = 'e'.repeat(40);
const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-java-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

const file = (pkg, type, imports = []) => [
  `package ${pkg};`,
  '',
  ...imports.map((i) => `import ${i};`),
  '',
  `public class ${type} {}`,
  '',
].join(NL);

test('[2.19] the index is built from what files DECLARE, not from directory layout', async () => {
  // Maven puts `com.acme.store` under src/main/java/com/acme/store, and
  // conventionally is not always: generated sources, multi-module builds and
  // src/test/java all break the mapping. The `package` statement does not
  // break, because it is what the compiler reads.
  //
  // So this fixture puts the package somewhere the convention would not.
  const repoRoot = makeRepo({
    'weird/place/Store.java': file('com.acme.store', 'Store'),
    'src/main/java/com/acme/App.java': file('com.acme', 'App', ['com.acme.store.Store']),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['weird/place/Store.java'],
    'the declaration is authoritative, wherever the file happens to sit');
  assert.deepEqual(facts[0].location.lines, [3, 3]);
  assert.equal(facts[0].provenance, 'statically-derived');
});

test('[2.19] the JDK is named rather than drawn', async () => {
  // Every Java file imports java.util. Drawing those would bury the
  // architecture, the same way node builtins and the Python standard library
  // would.
  for (const inside of ['java.util.List', 'javax.sql.DataSource', 'jdk.jfr.Event']) {
    assert.equal(isJdk(inside), true, `${inside} ships with the JDK`);
  }
  for (const outside of ['org.springframework.boot.SpringApplication', 'com.google.common.collect.ImmutableList']) {
    assert.equal(isJdk(outside), false, `${outside} comes from a dependency`);
  }
  const repoRoot = makeRepo({
    'App.java': file('com.acme', 'App', ['java.util.List', 'org.junit.jupiter.api.Test']),
  });
  const { facts } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['package:jdk:java.util', 'package:org.junit.jupiter']);
});

test('[2.19] a third-party import is grouped to a readable package, not a class', () => {
  // Stated as a naming convention rather than a claim: an import names a
  // package, and only the build file knows which artifact shipped it.
  assert.equal(externalName('org.springframework.boot.SpringApplication'), 'org.springframework.boot');
  assert.equal(externalName('com.fasterxml.jackson.databind.ObjectMapper'), 'com.fasterxml.jackson');
  assert.equal(externalName('org.apache.commons.lang3.StringUtils'), 'org.apache.commons');
  // A wildcard has no type to drop.
  assert.equal(externalName('org.junit.jupiter.api.*'), 'org.junit.jupiter');
  // A lowercase tail is already a package, so nothing is dropped.
  assert.equal(externalName('io.netty.buffer'), 'io.netty.buffer');
});

test('[2.19] an import inside a comment or a string is not a fact', async () => {
  const repoRoot = makeRepo({
    'App.java': [
      'package com.acme;',
      '',
      '// import com.ghost.One;',
      '/*',
      'import com.ghost.Two;',
      '*/',
      'import org.real.Thing;',
      '',
      'public class App {',
      '  String s = "import com.ghost.Three;";',
      '}',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:org.real'],
    'only the real import survives; the comment and the string are data');
  assert.deepEqual(facts[0].location.lines, [7, 7],
    'and the line number survives the blanking');
});

test('[2.19] stripNonCode keeps every newline', () => {
  const source = ['a;', '// gone', '/* also', 'gone */', 'String s = "x";', ''].join(NL);
  const stripped = stripNonCode(source);
  assert.equal(stripped.split(NL).length, source.split(NL).length,
    'a blanking pass that loses a newline moves every citation after it');
  assert.ok(!stripped.includes('gone'), 'comment text must not survive to be matched');
});

test('[2.19] a string ending in an escaped quote does not swallow the code after it', async () => {
  // The classic blanking bug: treat the escaped quote as the closing one and
  // everything to the next quote is read as code -- or, worse, everything
  // after it is read as string and the imports below vanish.
  const repoRoot = makeRepo({
    'App.java': [
      'package com.acme;',
      '',
      'import org.real.Thing;',
      '',
      'public class App {',
      '  String quote = "he said ' + String.fromCharCode(92) + '"hello' + String.fromCharCode(92) + '"";',
      '}',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:org.real']);
});

test('[2.19] static and wildcard imports are read', async () => {
  const repoRoot = makeRepo({
    'store/Store.java': file('com.acme.store', 'Store'),
    'App.java': [
      'package com.acme;',
      '',
      'import static org.junit.jupiter.api.Assertions.assertEquals;',
      'import com.acme.store.*;',
      '',
      'public class App {}',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['package:org.junit.jupiter', 'store/Store.java']);
});

test('[2.19] a static import of our own type is ours, not a dependency', async () => {
  // A static import carries an extra segment: the MEMBER. Treating it as the
  // type name puts the package one segment too deep, so
  // `import static com.acme.store.Store.helper` looks for a package called
  // com.acme.store.Store, fails to find it, and records a third-party
  // `com.acme.store` -- a dependency on a published copy of ourselves.
  //
  // Found on google/gson, where 106 facts said gson depends on com.google.gson.
  // The earlier tests here all used plain imports, so none of them could see it.
  const repoRoot = makeRepo({
    'store/Store.java': file('com.acme.store', 'Store'),
    'App.java': [
      'package com.acme;',
      '',
      'import static com.acme.store.Store.helper;',
      'import static org.junit.Assert.assertThrows;',
      '',
      'public class App {}',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['package:org.junit', 'store/Store.java'],
    'ours resolves to the file; theirs groups to the package, not to the class');
});

test('[2.19] a nested type resolves to the file that holds it', async () => {
  // `com.acme.store.Store.Builder` is a class inside a class, so TWO
  // capitalised segments trail the package. Peeling one left a search for a
  // package called com.acme.store.Store, which fails -- and the import then
  // recorded a third-party `com.acme.store`.
  //
  // Found on google/gson: 84 facts said gson depends on com.google.gson after
  // the static-import fix had already removed the other 22. Peeling stops at a
  // DECLARED package rather than at a capitalisation rule, so it rests on what
  // the repository says about itself rather than on Java naming convention.
  const repoRoot = makeRepo({
    'store/Store.java': file('com.acme.store', 'Store'),
    'App.java': file('com.acme', 'App', [
      'com.acme.store.Store.Builder',
      'com.acme.store.Store.Builder.Step',
    ]),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [], `a nested type of a type we have is not a gap: ${JSON.stringify(gaps)}`);
  assert.deepEqual([...new Set(facts.map((fact) => fact.object))], ['store/Store.java'],
    'however deeply nested, the edge points at the file that declares the outer type');
});

test('[2.19] a file importing its own nested type is neither an edge nor a Gap', async () => {
  // Java requires the import for a statically imported nested enum constant
  // even inside the same file, so this is ordinary rather than exotic.
  //
  // It is the inside of one component: recording an edge would draw a box
  // pointing at itself, and recording a gap would claim the type is missing
  // when it is right there. Every one of the 137 gaps left on spring-boot and
  // all 34 on guava were this.
  const repoRoot = makeRepo({
    'FeatureTest.java': [
      'package com.acme;',
      '',
      'import static com.acme.FeatureTest.Example.BAR;',
      '',
      'public class FeatureTest {',
      '  enum Example { BAR }',
      '}',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [], `its own nested type is not missing: ${JSON.stringify(gaps)}`);
  assert.deepEqual(facts, [], 'and a component does not depend on itself');
});

test('[2.19] another library sharing our package prefix is not ours', async () => {
  // google/guava declares com.google.common. Truth is a SEPARATE library and
  // lives in com.google.common.truth. Peeling on the declaration alone matched
  // guava for every Truth import and reported 834 gaps -- 28% of the files in
  // the repository -- against a library it merely shares a prefix with.
  //
  // A package segment is lowercase by universal convention, so a lowercase
  // segment after the candidate means the candidate is a PREFIX of somebody
  // else's package rather than the package this import is in.
  const repoRoot = makeRepo({
    'common/Lists.java': file('com.acme.common', 'Lists'),
    'App.java': file('com.acme', 'App', [
      'com.acme.common.Lists',              // ours
      'com.acme.common.truth.Truth',        // somebody else's, same prefix
    ]),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [],
    `a different library sharing our prefix is not an unresolved import of ours: `
    + `${JSON.stringify(gaps)}`);
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['common/Lists.java', 'package:com.acme.common.truth'],
    'ours resolves to its file; theirs is a dependency');
});

test('[2.19] a nested type of a type we do NOT have is still a Gap', async () => {
  // The other half. Peeling must not become a way to attribute anything
  // starting with a familiar prefix to ourselves: on gson these are the
  // protobuf classes generated at build time, and they are genuinely absent.
  const repoRoot = makeRepo({
    'store/Store.java': file('com.acme.store', 'Store'),
    'App.java': file('com.acme', 'App', ['com.acme.store.Generated.Inner']),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts, []);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].reason, /but that type is not/);
});

test('[2.19] a CRLF checkout is read, not silently skipped', async () => {
  const repoRoot = makeRepo({
    'App.java': ['package com.acme;', '', 'import org.real.Thing;', '', 'public class App {}', ''].join(CRLF),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:org.real']);
  assert.deepEqual(facts[0].location.lines, [3, 3]);
});

test('[2.19] a type missing from a package this repository declares is a Gap', async () => {
  // The package is ours, so the import is not somebody else's dependency.
  // Recording `package:com.acme.store` would say this repository depends on a
  // published copy of itself -- the mistake the Python adapter made, which
  // put a dashed third-party `fastapi` box in fastapi's own diagram.
  const repoRoot = makeRepo({
    'store/Store.java': file('com.acme.store', 'Store'),
    'App.java': file('com.acme', 'App', ['com.acme.store.Generated']),
  });
  const { facts, gaps } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts, []);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].reason, /com\.acme\.store is declared in this repository but that type is not/);
});

test('[2.19] a file in the default package is legal and names nothing', async () => {
  // No `package` line at all. It compiles, and it cannot be the target of an
  // import, so it contributes an inventory entry and no index entry.
  const repoRoot = makeRepo({
    'Loose.java': 'public class Loose {}' + NL,
    'App.java': file('com.acme', 'App', ['org.real.Thing']),
  });
  const { facts, gaps, inventory } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [], 'a default-package file is not an error');
  assert.ok(inventory.includes('Loose.java'), 'and it was still looked at');
  assert.deepEqual(facts.map((fact) => fact.object), ['package:org.real']);
});

test('[2.19] a file the walk skipped is not scanned, and one git ignores is not either', async () => {
  const repoRoot = makeRepo({
    '.gitignore': 'target/' + NL,
    'App.java': file('com.acme', 'App', ['org.real.Thing']),
    'target/generated/Gen.java': file('com.acme.gen', 'Gen', ['org.ghost.Thing']),
  });
  const { facts, inventory } = await runAdapter(javaAdapter, { repoRoot, revision: REVISION });
  assert.ok(!inventory.includes('target/generated/Gen.java'), 'build output is not source somebody wrote');
  assert.ok(!facts.some((fact) => fact.object === 'package:org.ghost'));
});
