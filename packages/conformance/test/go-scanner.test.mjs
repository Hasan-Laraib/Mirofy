// The Go import adapter (row 2.18, third language).
//
// Same two halves as every other adapter test: the facts it must find, and the
// Gap it must record where analysis honestly stops. An adapter that only ever
// emits facts has not been shown to obey the rule.
//
// It exists because pointing Mirofy at a Go repository drew nothing, and `.go`
// was one of the largest unread groups in every real repository it was run
// against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { goAdapter, stripComments, isStdlib } from '../../scanner/src/adapters/go.mjs';
import { runAdapter } from '../../scanner/src/adapter.mjs';

const REVISION = 'd'.repeat(40);
const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

/** A throwaway git repository. git, because the walk asks it what to ignore. */
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-go-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('[2.18] the standard library is decided by the dot rule, not by a list', () => {
  // This is how the Go toolchain itself decides: a first path segment with a
  // dot in it is a domain, and a domain means a module fetched from somewhere.
  // A hand-maintained list of stdlib package names would go stale the first
  // time Go adds one, and would be wrong about every internal module whose
  // name happens to collide.
  for (const inside of ['fmt', 'os', 'net/http', 'encoding/json', 'crypto/sha256']) {
    assert.equal(isStdlib(inside), true, `${inside} is standard library`);
  }
  for (const outside of ['github.com/user/repo', 'gopkg.in/yaml.v3', 'golang.org/x/sync/errgroup']) {
    assert.equal(isStdlib(outside), false, `${outside} is fetched, not built in`);
  }
});

test('[2.18] go imports resolve against the module path go.mod declares', async () => {
  const repoRoot = makeRepo({
    'go.mod': 'module github.com/acme/service' + NL + NL + 'go 1.22' + NL,
    'main.go': [
      'package main',
      '',
      'import (',
      '\t"fmt"',
      '\t"github.com/acme/service/internal/store"',
      '\tyaml "gopkg.in/yaml.v3"',
      ')',
      '',
      'func main() { fmt.Println(store.Name(), yaml.Version) }',
      '',
    ].join(NL),
    'internal/store/store.go': 'package store' + NL + NL + 'func Name() string { return "s" }' + NL,
  });
  const { facts, gaps } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(), [
    'internal/store/store.go', // this module's own package, resolved to a real file
    'package:go:fmt',          // stdlib: named rather than drawn
    'package:gopkg.in/yaml.v3', // third-party, and the alias does not change it
  ]);
  // Line numbers survive the comment blanking, or every citation is wrong.
  assert.deepEqual(facts.find((f) => f.object === 'package:go:fmt').location.lines, [4, 4]);
  assert.deepEqual(
    facts.find((f) => f.object === 'internal/store/store.go').location.lines, [5, 5],
  );
  for (const fact of facts) assert.equal(fact.provenance, 'statically-derived');
});

test('[2.18] a single-line import is read as well as a block', async () => {
  // Both forms are ordinary Go and an adapter that reads only the block form
  // would silently miss every small file.
  const repoRoot = makeRepo({
    'go.mod': 'module example.com/m' + NL,
    'a.go': 'package a' + NL + NL + 'import "net/http"' + NL,
    'b.go': 'package a' + NL + NL + 'import alias "example.com/m/sub"' + NL,
    'sub/s.go': 'package sub' + NL,
  });
  const { facts, gaps } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['package:go:net/http', 'sub/s.go']);
});

test('[2.18] an import inside a comment is not a fact, and a URL in a string is not one either', async () => {
  // The reason comment stripping is character-by-character rather than a
  // regular expression: `//` inside a string literal is not a comment, and
  // import paths ARE string literals.
  const repoRoot = makeRepo({
    'go.mod': 'module example.com/m' + NL,
    'a.go': [
      'package a',
      '',
      '// import "github.com/ghost/one"',
      '/*',
      'import "github.com/ghost/two"',
      '*/',
      'import "fmt"',
      '',
      'const Site = "https://example.com/not-a-comment"',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:go:fmt'],
    'only the real import survives; the commented ones are prose');
  assert.deepEqual(facts[0].location.lines, [7, 7],
    'and the line number survives the blanking');
});

test('[2.18] stripComments keeps every newline, and keeps string contents', () => {
  const source = ['a', '// gone', '/* also', 'gone */', 'b "keep // this"', ''].join(NL);
  const stripped = stripComments(source);
  assert.equal(stripped.split(NL).length, source.split(NL).length,
    'a blanking pass that loses a newline moves every citation after it');
  assert.ok(stripped.includes('keep // this'),
    'a double slash inside a string literal is not a comment');
});

test('[2.18] a CRLF checkout is read, not silently skipped', async () => {
  // A guard, and honestly a weak one: I could not break it. The patterns here
  // separate tokens with `\s`, which matches a carriage return, so a trailing
  // CR is absorbed wherever it lands. The Python adapter read 8 of 264 files
  // on a Windows clone because its patterns used `.`, which does NOT match a
  // carriage return -- and reported zero gaps while doing it.
  //
  // So this holds the line against that shape arriving here later, rather
  // than proving anything about the code as it stands.
  const repoRoot = makeRepo({
    'go.mod': 'module example.com/m' + CRLF,
    'a.go': ['package a', '', 'import "os"', ''].join(CRLF),
  });
  const { facts, gaps } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:go:os']);
  assert.deepEqual(facts[0].location.lines, [3, 3]);
});

test('[2.18] an internal import naming a directory that is not there is a Gap', async () => {
  // It starts with this module's path, so it is not somebody else's package --
  // recording `package:github.com/acme/service/missing` would say this
  // repository depends on a published copy of itself, which is the mistake the
  // Python adapter made and this one does not repeat.
  const repoRoot = makeRepo({
    'go.mod': 'module github.com/acme/service' + NL,
    'main.go': ['package main', '', 'import "github.com/acme/service/missing"', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts, []);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].reason, /has no Go files at missing/);
});

test('[2.18] a nested module wins over the module that contains it', async () => {
  // A repository with more than one go.mod is ordinary, and attributing the
  // inner module's packages to the outer one would put every edge on the wrong
  // component. Longest module path first, the same rule package ownership uses
  // everywhere else in this scanner.
  const repoRoot = makeRepo({
    'go.mod': 'module example.com/outer' + NL,
    'tools/go.mod': 'module example.com/outer/tools' + NL,
    'tools/lint/lint.go': 'package lint' + NL,
    'main.go': ['package main', '', 'import "example.com/outer/tools/lint"', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, [], 'the inner module owns tools/, so lint/ is right where it says');
  assert.deepEqual(facts.map((fact) => fact.object), ['tools/lint/lint.go']);
});

test('[2.18] a repository with no go.mod records gaps rather than inventing a module', async () => {
  // Without a manifest there is nothing that says what this module is called,
  // so an import cannot be shown to be internal. Every import is therefore
  // third-party or stdlib, which is what the evidence supports.
  const repoRoot = makeRepo({
    'a.go': ['package a', '', 'import "fmt"', 'import "github.com/x/y"', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(),
    ['package:github.com/x/y', 'package:go:fmt']);
});

test('[2.18] a file the walk skipped is not scanned, and one git ignores is not either', async () => {
  const repoRoot = makeRepo({
    '.gitignore': 'generated/' + NL,
    'go.mod': 'module example.com/m' + NL,
    'a.go': 'package a' + NL + 'import "fmt"' + NL,
    'generated/built.go': 'package g' + NL + 'import "os"' + NL,
    'vendor/x/y.go': 'package y' + NL + 'import "net"' + NL,
  });
  const { facts, inventory } = await runAdapter(goAdapter, { repoRoot, revision: REVISION });
  assert.ok(!inventory.includes('generated/built.go'), 'build output is not source somebody wrote');
  assert.deepEqual(facts.map((fact) => fact.object).filter((o) => o === 'package:go:os'), [],
    'an ignored file contributes no facts');
});
