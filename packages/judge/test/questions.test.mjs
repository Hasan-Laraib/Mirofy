import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCandidates, componentDir, excerptAround, namesOf, noulFor, ownerOf,
} from '../src/questions.mjs';

// Components shaped the way packages/model/src/derive.mjs emits them.
const packageComponent = (id, dir) => ({
  id,
  kind: 'package',
  labels: [id.replace(/^@[^/]+\//, '')],
  sources: [{ path: `${dir}/package.json` }],
  provenance: 'config-derived',
  metadata: { packageName: id },
});
const moduleComponent = (dir) => ({
  id: dir,
  kind: 'module',
  labels: [dir.slice(dir.lastIndexOf('/') + 1)],
  sources: [{ path: `${dir}/index.mjs` }],
  provenance: 'statically-derived',
  metadata: { modulePath: dir },
});

test('componentDir locates both granularities', () => {
  assert.equal(componentDir(packageComponent('@mirofy/scanner', 'packages/scanner')), 'packages/scanner');
  assert.equal(componentDir(moduleComponent('src/lib')), 'src/lib');
  assert.equal(componentDir({ id: 'x' }), null, 'a component with no location has no directory');
});

test('ownerOf prefers the longest prefix, so a nested package is not eaten by its parent', () => {
  const components = [
    packageComponent('@mirofy/core', 'packages/core'),
    packageComponent('@mirofy/inner', 'packages/core/inner'),
  ];
  const owner = ownerOf('packages/core/inner/src/a.mjs', components);
  assert.equal(owner.id, '@mirofy/inner');
});

test('ownerOf does not match a sibling directory sharing a prefix', () => {
  const components = [packageComponent('@mirofy/scan', 'packages/scan')];
  // "packages/scanner/..." starts with "packages/scan" as a STRING but is a
  // different directory. Matching it would attribute a file to the wrong
  // component.
  assert.equal(ownerOf('packages/scanner/src/a.mjs', components), null);
});

test('namesOf offers the id, its last segment and the label, and drops short ones', () => {
  const names = namesOf(packageComponent('@mirofy/scanner', 'packages/scanner'));
  assert.ok(names.includes('@mirofy/scanner'));
  assert.ok(names.includes('scanner'));
  assert.ok(!names.some((name) => name.length < 3), 'a two-character name matches noise');
});

test('excerptAround numbers the lines and stays near the citation', () => {
  const source = Array.from({ length: 40 }, (_, i) => `line${i + 1}`).join('\n');
  const { excerpt, cited } = excerptAround(source, 20);
  assert.equal(cited, 'line20');
  assert.ok(excerpt.includes('20: line20'));
  assert.ok(excerpt.includes('17: line17'), 'three lines of context before');
  assert.ok(excerpt.includes('23: line23'), 'three lines of context after');
  assert.ok(!excerpt.includes('16: line16'), 'and no more than that -- the state stays small');
});

test('excerptAround refuses a line the file does not have', () => {
  assert.deepEqual(excerptAround('a\nb', 99), { excerpt: '', cited: null });
});

const components = [
  packageComponent('@mirofy/app', 'packages/app'),
  packageComponent('@mirofy/billing', 'packages/billing'),
  packageComponent('@mirofy/unrelated', 'packages/unrelated'),
];
const gapQuestion = {
  path: 'packages/app/src/load.mjs',
  line: 3,
  kind: 'computed',
  specifier: null,
  reason: 'computed import specifier at line 3; the target cannot be known statically',
  adapter: 'imports',
};
const appSource = [
  'const name = process.env.MODE;',
  '// pick a handler',
  'const mod = await import(`./${name}`); // may be billing',
  'export default mod;',
].join('\n');

test('a candidate is built only for a component actually named in the file', () => {
  const { candidates } = buildCandidates({
    questions: [gapQuestion],
    components,
    readFile: () => appSource,
  });
  assert.equal(candidates.length, 1, 'only billing is named; unrelated is not');
  assert.equal(candidates[0].from, '@mirofy/app');
  assert.equal(candidates[0].to, '@mirofy/billing');
  assert.equal(candidates[0].matched, 'billing');
});

test('the owning component is never a candidate against itself', () => {
  const { candidates } = buildCandidates({
    questions: [gapQuestion],
    components,
    readFile: () => `${appSource}\n// app app app`,
  });
  assert.ok(!candidates.some((c) => c.from === c.to));
});

test('a pair the scanner already proved is not re-asked', () => {
  const { candidates } = buildCandidates({
    questions: [gapQuestion],
    components,
    relationships: [{ from: '@mirofy/app', to: '@mirofy/billing' }],
    readFile: () => appSource,
  });
  // A faded guess printed beside a solid fact about the same pair would make
  // the diagram say two different things about one relationship.
  assert.equal(candidates.length, 0);
});

test('a file this process cannot read is counted, not dropped', () => {
  const { candidates, unread } = buildCandidates({
    questions: [gapQuestion],
    components,
    readFile: () => null,
  });
  assert.equal(candidates.length, 0);
  assert.equal(unread, 1);
});

test('the state carries the citation and stays small', () => {
  const { candidates } = buildCandidates({
    questions: [gapQuestion],
    components,
    readFile: () => appSource,
  });
  const { state } = candidates[0];
  assert.equal(state.file, 'packages/app/src/load.mjs');
  assert.equal(state.line, 3);
  assert.ok(state.scanner_note.includes('cannot be known statically'));
  assert.ok(state.excerpt.includes('3: const mod'));
  // The whole file is four lines here, but the guarantee that matters is that
  // the excerpt is an excerpt, not the file.
  assert.ok(!('source' in state), 'the full file must never be sent');
});

test('the question is a noul, and never asks for a confidence', () => {
  const { candidates } = buildCandidates({
    questions: [gapQuestion],
    components,
    readFile: () => appSource,
  });
  const question = noulFor(candidates[0]);
  assert.equal(question.type, 'noul');
  // choice and score return a `confidence` that TypeSafe documents only as a
  // spread statistic. This package must never be in a position to print it.
  assert.ok(!('options' in question));
  assert.equal(typeof question.instructions, 'string');
  assert.ok(question.instructions.includes('line 3'));
  assert.ok(question.criteria.false.includes('comment'), 'the false branch must rule out a mention');
});

test('no questions means no candidates, not an error', () => {
  assert.deepEqual(
    buildCandidates({ questions: [], components, readFile: () => '' }),
    { candidates: [], unread: 0 },
  );
});

test('a pair is asked about once, however many gapped lines suggest it', () => {
  // Pointed at this repository, one dispatcher with three computed imports
  // made the same pair a candidate three times: three paid calls to learn one
  // thing, and three identical judgments of which only one is ever drawn.
  const repeated = [
    { ...gapQuestion, line: 3 },
    { ...gapQuestion, line: 3, reason: 'computed import specifier at line 3; the target cannot be known statically' },
  ];
  const { candidates } = buildCandidates({
    questions: repeated,
    components,
    readFile: () => appSource,
  });
  assert.equal(candidates.length, 1);
  // The surviving candidate still cites a real line.
  assert.equal(candidates[0].gap.line, 3);
});
