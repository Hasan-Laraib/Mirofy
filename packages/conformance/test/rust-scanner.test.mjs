// The Rust import adapter (row 2.20, fifth language).
//
// Same two halves as every other adapter test: the facts it must find, and the
// Gap it must record where analysis honestly stops.
//
// It exists because `.rs` was the largest unread group in the biggest
// repository this tool had been pointed at -- 1,038 files in vercel/next.js,
// a whole Rust toolchain inside a TypeScript project, invisible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  rustAdapter, stripNonCode, crateName, moduleOf, targetOf, expandUse,
} from '../../scanner/src/adapters/rust.mjs';
import { runAdapter } from '../../scanner/src/adapter.mjs';

const REVISION = 'f'.repeat(40);
const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-rust-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

const manifest = (name) => `[package]${NL}name = "${name}"${NL}version = "0.1.0"${NL}`;

test('[2.20] crate, super and self resolve against the files that are there', async () => {
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': ['pub mod api;', 'pub mod store;', ''].join(NL),
    'src/store.rs': 'pub fn save() {}' + NL,
    'src/api/mod.rs': ['pub mod routes;', ''].join(NL),
    'src/api/routes.rs': [
      'use crate::store::save;',
      'use super::helper;',
      'use std::collections::HashMap;',
      'use serde::Serialize;',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(), [
    'package:rust:std',   // the toolchain: named rather than drawn
    'package:serde',      // a crate from the registry
    'src/api/mod.rs',     // `super::helper` -- the parent module of api/routes
    'src/store.rs',       // `crate::store::save` peeled to the file that exists
  ].sort());
  assert.deepEqual(
    facts.find((f) => f.object === 'src/store.rs').location.lines, [1, 1],
  );
  for (const fact of facts) assert.equal(fact.provenance, 'statically-derived');
});

test('[2.20] a cargo name is not a code name', async () => {
  // Cargo.toml says `next-build`; the code says `next_build`. A workspace
  // member imported by a sibling arrives hyphen-free, so an index keyed on the
  // manifest spelling records every internal crate-to-crate edge in every Rust
  // workspace as a third-party dependency.
  assert.equal(crateName('next-build'), 'next_build');
  assert.equal(crateName('serde'), 'serde');

  const repoRoot = makeRepo({
    'Cargo.toml': `[workspace]${NL}members = ["crates/a", "crates/b"]${NL}`,
    'crates/a/Cargo.toml': manifest('demo-core'),
    'crates/a/src/lib.rs': 'pub fn thing() {}' + NL,
    'crates/b/Cargo.toml': manifest('demo-cli'),
    'crates/b/src/main.rs': ['use demo_core::thing;', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['crates/a/src/lib.rs'],
    'a sibling workspace crate is this repository, not the registry');
});

test('[2.20] an unresolved item in a SIBLING crate is still this repository', async () => {
  // A crate this repository BUILDS is not a dependency on a published copy of
  // itself. Falling back to `package:<name>` drew deno_core and deno_error as
  // dashed third-party boxes in deno, which builds both -- the same mistake the
  // Python and Java adapters each had to be taught, arriving a third time by a
  // different route.
  //
  // The crate root is the honest target: the edge is to that crate, and which
  // file inside it is what could not be worked out.
  const repoRoot = makeRepo({
    'Cargo.toml': `[workspace]${NL}members = ["crates/a", "crates/b"]${NL}`,
    'crates/a/Cargo.toml': manifest('demo-core'),
    'crates/a/src/lib.rs': 'pub fn thing() {}' + NL,
    'crates/b/Cargo.toml': manifest('demo-cli'),
    // `inner` is not a file in demo-core; it is an inline module or a
    // re-export, and either way the edge is to demo-core.
    'crates/b/src/main.rs': ['use demo_core::inner::deep::Thing;', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['crates/a/src/lib.rs'],
    `a crate this repository builds must never be recorded as a package: `
    + `${JSON.stringify(facts.map((fact) => fact.object))}`);
});

test('[2.20] a use inside a comment is not a fact, and block comments NEST', async () => {
  // `/* /* */ */` is ONE comment in Rust. A scanner that stops at the first
  // `*/` reads the tail as code, which is how a commented-out module becomes a
  // dependency.
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': [
      '// use ghost_one::Thing;',
      '/*',
      'use ghost_two::Thing;',
      '/* nested */',
      'use ghost_three::Thing;',
      '*/',
      'use serde::Serialize;',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:serde'],
    'only the real use survives; three commented ones are prose');
  assert.deepEqual(facts[0].location.lines, [7, 7],
    'and the line number survives the blanking');
});

test('[2.20] a raw string does not swallow the code after it', async () => {
  // `r#"..."#` carries its own delimiter, and a `"` inside it is data. Matching
  // the wrong closing quote reads everything after as string and the uses below
  // vanish -- silently, which is the failure mode this project refuses.
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': [
      'const SQL: &str = r#"SELECT "x" FROM t"#;',
      'use serde::Serialize;',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:serde']);
  assert.deepEqual(facts[0].location.lines, [2, 2]);
});

test('[2.20] a lifetime is not a character literal', async () => {
  // `&'a str` opens no literal. Treating it as one blanks the rest of the file,
  // and every `use` below a generic function disappears.
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': [
      "pub fn borrow<'a>(x: &'a str) -> &'a str { x }",
      'use serde::Serialize;',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:serde'],
    'the use after a lifetime-carrying signature must survive');
});

test('[2.20] `use super::*` in an inline test module is not an edge', async () => {
  // `#[cfg(test)] mod tests { use super::*; }` is the commonest shape in Rust,
  // and `super` there is the FILE, not the file's parent. Resolving it as the
  // parent walked up to the crate root and recorded an edge to lib.rs -- a
  // WRONG ANSWER rather than a gap, which is worse, and one that inflated the
  // fact count of every Rust repository with tests in it.
  //
  // It is the inside of one component: not an edge, and not a gap.
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': 'pub mod counter;' + NL,
    'src/counter.rs': [
      'use serde::Serialize;',
      '',
      'pub fn count() -> u32 { 1 }',
      '',
      '#[cfg(test)]',
      'mod tests {',
      '    use super::*;',
      '    #[test]',
      '    fn works() { assert_eq!(count(), 1); }',
      '}',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:serde'],
    `the test module reaches its own file, which is not an edge: `
    + `${JSON.stringify(facts.map((fact) => fact.object))}`);
});

test('[2.20] a braced use records every name in it', () => {
  assert.deepEqual(expandUse('std::collections::{HashMap, HashSet}'),
    ['std::collections::HashMap', 'std::collections::HashSet']);
  assert.deepEqual(expandUse('crate::a::{b, c as d}'), ['crate::a::b', 'crate::a::c']);
  assert.deepEqual(expandUse('serde::Serialize'), ['serde::Serialize']);
  // `self` inside braces means the parent itself, which the base already names.
  assert.deepEqual(expandUse('crate::a::{self, b}'), ['crate::a::b']);
});

test('[2.20] a module path is read off the file that holds it', () => {
  assert.deepEqual(moduleOf('src/a/b.rs', 'src'), ['a', 'b']);
  assert.deepEqual(moduleOf('src/a/mod.rs', 'src'), ['a']);
  assert.deepEqual(moduleOf('src/lib.rs', 'src'), []);
  assert.deepEqual(moduleOf('crates/x/src/a.rs', 'crates/x/src'), ['a']);
});

test('[2.20] a crate whose sources are not under src/ is read anyway', async () => {
  // `src/` is only Cargo’s default. `[lib] path = "lib.rs"` puts the sources in
  // the crate directory itself, and deno does that for its main crate and
  // several more -- 3,896 gaps, 27% of every fact in the repository, against
  // directories that were never there.
  //
  // The `./` form is the same file. Keeping it made the subdirectory test say
  // yes and sent the search to `<crate>/./lib.rs`, a path no walk produces.
  for (const declaredPath of ['lib.rs', './lib.rs']) {
    const repoRoot = makeRepo({
      'Cargo.toml': `[package]${NL}name = "demo"${NL}${NL}[lib]${NL}path = "${declaredPath}"${NL}`,
      'lib.rs': 'pub mod store;' + NL,
      'store.rs': 'pub fn save() {}' + NL,
      'api.rs': ['use crate::store::save;', ''].join(NL),
    });
    const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
    assert.deepEqual(gaps, [], `with path ${declaredPath}: ${JSON.stringify(gaps)}`);
    assert.deepEqual(facts.map((fact) => fact.object), ['store.rs'],
      `with path ${declaredPath}, the sources are where the manifest says`);
  }
});

test('[2.20] a test, bench or example is its own crate', () => {
  // Cargo compiles every direct child of tests, benches and examples as its
  // OWN crate, so `crate::util` in one of them means a module beside the test
  // file rather than one under src.
  assert.deepEqual(targetOf('tests/eviction.rs', ''), { base: 'tests', roots: [] });
  assert.deepEqual(targetOf('crates/x/tests/a.rs', 'crates/x'), { base: 'crates/x/tests', roots: [] });
  assert.deepEqual(targetOf('crates/x/benches/b.rs', 'crates/x').base, 'crates/x/benches');
  assert.deepEqual(targetOf('src/lib.rs', '').base, 'src');
  assert.deepEqual(targetOf('src/lib.rs', '').roots, ['lib.rs', 'main.rs']);
});

test('[2.20] an integration test resolves crate:: beside itself, not under src', async () => {
  // vercel/next.js produced 34 gaps against exactly this: integration tests
  // saying `crate::util` with `tests/util.rs` sitting right next to them.
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': 'pub fn thing() {}' + NL,
    'tests/util.rs': 'pub fn helper() {}' + NL,
    'tests/eviction.rs': ['use crate::util::helper;', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [],
    `tests/util.rs is right there: ${JSON.stringify(gaps)}`);
  assert.deepEqual(facts.map((fact) => fact.object), ['tests/util.rs']);
});

test('[2.20] stripNonCode keeps every newline', () => {
  const source = ['a', '// gone', '/* also', 'gone */', 'let s = "x";', ''].join(NL);
  const stripped = stripNonCode(source);
  assert.equal(stripped.split(NL).length, source.split(NL).length,
    'a blanking pass that loses a newline moves every citation after it');
});

test('[2.20] a CRLF checkout is read, not silently skipped', async () => {
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': ['use serde::Serialize;', ''].join(CRLF),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:serde']);
  assert.deepEqual(facts[0].location.lines, [1, 1]);
});

test('[2.20] a crate-relative use matching no file is a Gap', async () => {
  // It says `crate::`, so it is not somebody else's package. Recording
  // `package:demo` would say this repository depends on a published copy of
  // itself -- the mistake the Python and Java adapters each had to be taught.
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': ['use crate::missing::Thing;', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts, []);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].reason, /matches no file under src/);
});

test('[2.20] a super that climbs above the crate root is a Gap', async () => {
  const repoRoot = makeRepo({
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': ['use super::super::Thing;', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts, []);
  assert.match(gaps[0].reason, /above the crate root|climbs/);
});

test('[2.20] a file the walk skipped is not scanned, and one git ignores is not either', async () => {
  const repoRoot = makeRepo({
    '.gitignore': 'target/' + NL,
    'Cargo.toml': manifest('demo'),
    'src/lib.rs': 'use serde::Serialize;' + NL,
    'target/debug/build.rs': 'use ghost::Thing;' + NL,
  });
  const { facts, inventory } = await runAdapter(rustAdapter, { repoRoot, revision: REVISION });
  assert.ok(!inventory.includes('target/debug/build.rs'),
    'build output is not source somebody wrote');
  assert.ok(!facts.some((fact) => fact.object === 'package:ghost'));
});
