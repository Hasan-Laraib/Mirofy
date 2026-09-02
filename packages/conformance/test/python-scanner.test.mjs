// The Python import adapter (row 2.8, second language).
//
// Same two halves as every other adapter test: the facts it must find, and the
// Gap it must record where analysis honestly stops. An adapter that only ever
// emits facts has not been shown to obey the rule.
//
// It exists because somebody pointed Mirofy at a 266-file Python repository and
// got two boxes out of it -- the two JavaScript files in an examples/ folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pythonAdapter } from '../../scanner/src/adapters/python.mjs';
import { runAdapter } from '../../scanner/src/adapter.mjs';

const REVISION = 'c'.repeat(40);
const NL = String.fromCharCode(10);
const TRIPLE = '"'.repeat(3);
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

/** A throwaway git repository. git, because the walk asks it what to ignore. */
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-python-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('[2.8] python scanner resolves absolute, relative and aliased imports with exact lines', async () => {
  const repoRoot = makeRepo({
    'src/pkg/__init__.py': '',
    'src/pkg/graph/__init__.py': '',
    'src/pkg/cli.py': [
      'import os',
      'from pkg.orchestrator import run',
      'from .graph import build',
      'import requests as rq',
      '',
    ].join(NL),
    'src/pkg/orchestrator.py': ['def run():', '    return 1', ''].join(NL),
    'src/pkg/graph/build.py': ['def build():', '    return 1', ''].join(NL),
  });
  const { facts, gaps } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);

  const from = facts.filter((fact) => fact.subject === 'src/pkg/cli.py');
  assert.deepEqual(from.map((fact) => fact.object).sort(), [
    'package:python:os',       // stdlib: named rather than drawn, like node builtins
    'package:requests',        // `as rq` does not change what is imported
    'src/pkg/graph/build.py',  // the module, not the package __init__ beside it
    'src/pkg/orchestrator.py', // absolute, resolved through the src/ root
  ]);
  for (const fact of from) assert.equal(fact.provenance, 'statically-derived');
  assert.deepEqual(from.find((f) => f.object === 'package:python:os').location.lines, [1, 1]);
  assert.deepEqual(from.find((f) => f.object === 'src/pkg/graph/build.py').location.lines, [3, 3]);
});

test('[2.8] an import inside a python docstring or comment is not a fact', async () => {
  // Docstrings routinely contain example imports. Reading them puts edges in
  // the diagram that the code does not have, cited to a line that is prose.
  const repoRoot = makeRepo({
    'app.py': [
      `${TRIPLE}Module.`,
      '',
      'Example:',
      '    from ghost import missing',
      TRIPLE,
      '# from commented import out',
      'import json',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object), ['package:python:json'],
    'only the real import survives; the docstring and the comment are prose');
  assert.deepEqual(facts[0].location.lines, [7, 7],
    'and the line number survives the blanking, or every citation after a docstring is wrong');
});

test('[2.8] stdlib is named rather than drawn, on BOTH import forms', async () => {
  // `import os` and `from os import path` take different branches. Only the
  // first was covered, and planting "draw the stdlib" into the second passed
  // every test -- so every Python file in a repository would have contributed
  // an edge to `typing`, `os` and `dataclasses`, which is the noise node
  // builtins are excluded to avoid.
  const repoRoot = makeRepo({
    'app.py': [
      'import os',
      'from typing import List',
      'from collections.abc import Mapping',
      'from mypkg import thing',
      '',
    ].join(NL),
  });
  const { facts } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(facts.map((fact) => fact.object).sort(), [
    'package:mypkg',              // a real third-party dependency, drawn
    'package:python:collections', // stdlib via a dotted from-import
    'package:python:os',          // stdlib via plain import
    'package:python:typing',      // stdlib via from-import
  ]);
});

test('[2.8] a CRLF checkout is read, not silently skipped', async () => {
  // JavaScript's `.` does not match a carriage return -- it counts as a line
  // terminator -- so `(.+)$` fails on every line of a CRLF file. This adapter
  // read 8 of 264 files on a Windows clone of a real repository and reported
  // ZERO gaps while doing it: no error, no warning, just a nearly empty
  // diagram. Every Windows checkout of every Python project would have hit it.
  const repoRoot = makeRepo({
    'src/a.py': ['import os', 'from .other import thing', ''].join(CRLF),
    'src/other.py': 'thing = 1' + CRLF,
  });
  const { facts, gaps } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(gaps, []);
  assert.deepEqual(facts.map((fact) => fact.object).sort(), ['package:python:os', 'src/other.py'],
    'a CRLF file must yield the same facts an LF one does');
  // And the line numbers survive the split.
  assert.deepEqual(facts.find((f) => f.object === 'src/other.py').location.lines, [2, 2]);
});

test('[2.8] a computed python import is a Gap with its line, never a guessed fact', async () => {
  const repoRoot = makeRepo({
    'app.py': [
      'import importlib',
      'def load(name):',
      '    return importlib.import_module(name)',
      '',
    ].join(NL),
  });
  const { facts, gaps } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].reason, /computed import at line 3/);
  assert.deepEqual(facts.map((fact) => fact.object), ['package:python:importlib'],
    'the importlib import itself is real; what it loads at runtime is not knowable');
});

test('[2.8] a python import matching two source roots is a Gap, not the first hit', async () => {
  // Which one wins depends on sys.path, which is configuration and not in the
  // source. Picking one would be a guess dressed as evidence.
  const repoRoot = makeRepo({
    'src/thing.py': 'x = 1' + NL,
    'lib/thing.py': 'x = 2' + NL,
    'main.py': 'import thing' + NL,
  });
  const { facts, gaps } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  const ambiguous = gaps.filter((gap) => /matches 2 files/.test(gap.reason));
  assert.equal(ambiguous.length, 1, `expected one ambiguity gap, got ${JSON.stringify(gaps)}`);
  assert.ok(!facts.some((fact) => fact.subject === 'main.py'),
    'an ambiguous import produces no edge at all, rather than a plausible one');
});

test('[2.8] a relative python import above the repository root is a Gap', async () => {
  const repoRoot = makeRepo({ 'app.py': 'from ... import escape' + NL });
  const { facts, gaps } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.equal(facts.length, 0);
  assert.match(gaps[0].reason, /climbs above the repository root/);
});

test('[2.8] a python file the walk skipped is not scanned, and one git ignores is not either', async () => {
  const repoRoot = makeRepo({
    '.gitignore': 'generated/' + NL,
    'app.py': 'import json' + NL,
    'generated/built.py': 'import csv' + NL,
    'node_modules/pkg/thing.py': 'import re' + NL,
  });
  const { facts, inventory } = await runAdapter(pythonAdapter, { repoRoot, revision: REVISION });
  assert.deepEqual(inventory, ['app.py'],
    'build output and vendored trees are not source somebody wrote');
  assert.deepEqual(facts.map((fact) => fact.object), ['package:python:json']);
});
