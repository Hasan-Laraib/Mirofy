// The reason strings here are BUILT THE WAY THE ADAPTERS BUILD THEM, not
// copied by eye. Each one is the adapter's own template with its own
// interpolation, so a reword in the adapter shows up here as a failure rather
// than as a judge that quietly finds nothing to ask about.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readGap, unresolvedImports } from '../src/gaps.mjs';

// packages/scanner/src/adapters/imports.mjs:169 and :180
const computedImports = (lineNo) =>
  `computed import specifier at line ${lineNo}; the target cannot be known statically`;
// packages/scanner/src/adapters/python.mjs and siblings
const computedOther = (lineNumber) =>
  `computed import at line ${lineNumber}; the target cannot be known statically`;
// packages/scanner/src/adapters/imports.mjs:135
const unresolvedRelative = (specifier, lineNo) =>
  `import of ${JSON.stringify(specifier)} at line ${lineNo} resolves to no file`;
// packages/scanner/src/adapters/python.mjs:282 and :289
const climbs = (lineNumber) =>
  `relative import at line ${lineNumber} climbs above the repository root`;
const noFile = (lineNumber) =>
  `relative import at line ${lineNumber} resolves to no file in this repository`;

test('a computed import is a question, and keeps its line', () => {
  const read = readGap({ path: 'src/load.mjs', reason: computedImports(169), adapter: 'imports' });
  assert.ok(read, 'a computed import must be readable as a question');
  assert.equal(read.kind, 'computed');
  assert.equal(read.line, 169);
  assert.equal(read.path, 'src/load.mjs');
  assert.equal(read.adapter, 'imports');
  // A computed specifier has no target by definition. Inventing one here
  // would be the guess this package exists to avoid making silently.
  assert.equal(read.specifier, null);
});

test('the sibling adapters spell it without the word "specifier"', () => {
  const read = readGap({ path: 'app/main.py', reason: computedOther(42) });
  assert.ok(read, 'the adapters that omit "specifier" must still match');
  assert.equal(read.kind, 'computed');
  assert.equal(read.line, 42);
});

test('an unresolved relative import keeps its specifier, unquoted', () => {
  const read = readGap({ path: 'src/a.mjs', reason: unresolvedRelative('./missing.js', 135) });
  assert.ok(read);
  assert.equal(read.kind, 'unresolved-relative');
  assert.equal(read.line, 135);
  // JSON.stringify put quotes on it; they must not survive into the question.
  assert.equal(read.specifier, './missing.js');
});

test('both relative-import endings are read, and the line is not confused for a specifier', () => {
  for (const [reason, line] of [[climbs(282), 282], [noFile(289), 289]]) {
    const read = readGap({ path: 'app/pkg/mod.py', reason });
    assert.ok(read, `must read: ${reason}`);
    assert.equal(read.line, line);
    assert.equal(read.specifier, null, 'these reasons carry no specifier');
  }
});

test('a named import that could not be attributed keeps the name', () => {
  const reason = 'import at line 258 names com.example.Thing, and package foo declares no such type';
  const read = readGap({ path: 'src/Main.java', reason });
  assert.ok(read);
  assert.equal(read.line, 258);
  assert.equal(read.specifier, 'com.example.Thing');
});

test('an unreadable file is NOT a question', () => {
  // Nothing was read. Asking a model about the contents of a file nobody could
  // open is exactly the guess this package refuses to make.
  const read = readGap({ path: 'src/x.mjs', reason: 'unreadable: EACCES: permission denied' });
  assert.equal(read, null);
});

test('the other gap kinds are not questions either', () => {
  const notQuestions = [
    'YAML anchor or merge key at line 12; this adapter reads a subset and will not guess',
    'list item at line 4 has no key to belong to',
    'no services could be read from this compose file',
    'could not be read: ENOENT',
  ];
  for (const reason of notQuestions) {
    assert.equal(readGap({ path: 'x', reason }), null, `must not be a question: ${reason}`);
  }
});

test('a malformed gap is refused rather than half-read', () => {
  assert.equal(readGap(null), null);
  assert.equal(readGap({}), null);
  assert.equal(readGap({ path: 'a', reason: '' }), null);
  assert.equal(readGap({ reason: computedImports(1) }), null, 'a reason without a path names nothing');
});

test('unresolvedImports counts what it skipped', () => {
  const { questions, skipped } = unresolvedImports([
    { path: 'a.mjs', reason: computedImports(1) },
    { path: 'b.mjs', reason: 'unreadable: EACCES' },
    { path: 'c.mjs', reason: unresolvedRelative('./x', 2) },
    { path: 'd.mjs', reason: 'no services could be read from this compose file' },
  ]);
  assert.equal(questions.length, 2);
  // Reporting 2 questions without reporting 2 skipped would imply the scan had
  // nothing else in it.
  assert.equal(skipped, 2);
});

test('unresolvedImports tolerates a missing gap list', () => {
  assert.deepEqual(unresolvedImports(undefined), { questions: [], skipped: 0 });
  assert.deepEqual(unresolvedImports([]), { questions: [], skipped: 0 });
});
