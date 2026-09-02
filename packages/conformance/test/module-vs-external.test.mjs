// Your code and somebody else's must not be drawn the same way.
//
// A repository map's single most useful kind distinction is "I wrote this" vs
// "this arrived from a package manager". The scanner has always known which is
// which -- a derived module and a `package:` node are different things in the
// evidence graph -- but the layout used to flatten both onto the schema type
// `external`, keeping the real kind only in the free-form `tag`. Twelve boxes
// came out identically grey. The information was found, carried most of the
// way, and thrown away at the last step.
//
// WHY STROKE PATTERN AND NOT A COLOUR. The obvious fix is an eighth semantic
// colour, and it cannot be done: the shipped `okabe-ito` preset spends all
// seven of its colour-blind-safe hues on the seven existing roles, and the
// pairwise dE00 separation test in packages/conformance/test/tokens.test.mjs
// is what would catch an eighth that only looked distinct to trichromats.
// Stroke pattern is a channel nothing else on a component uses, it survives
// all six presets and both themes, it needs no new token, and dashed already
// means "a boundary" on lanes and regions -- which is what third-party code
// sits outside of.
//
// So this test asserts the two are DISTINGUISHABLE, not merely differently
// named. Different class names that resolve to identical paint would be the
// original bug wearing a new hat, which is why the stylesheet is asserted too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaTypeFor } from '../../layout/src/document.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '../../core');
const cli = path.join(skillRoot, 'bin/mirofy.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-kind-'));

const DOC = {
  schema_version: 1,
  diagram_type: 'architecture',
  meta: { title: 'Mine and theirs', viewBox: [720, 300] },
  components: [
    { id: 'app', type: 'module', label: 'app', pos: [60, 90] },
    { id: 'requests', type: 'external', label: 'requests', pos: [360, 90] },
  ],
  connections: [],
};

/** Render DOC and hand back the whole artifact. */
function artifact() {
  const input = path.join(tmp, 'doc.json');
  const output = path.join(tmp, 'doc.html');
  fs.writeFileSync(input, JSON.stringify(DOC));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', input, output],
    { cwd: skillRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return fs.readFileSync(output, 'utf8');
}

/** The class on each component rect -- height 60 -- skipping legend swatches. */
function nodeClasses(html) {
  return [...html.matchAll(/<rect[^>]*height="60"[^>]*class="(c-module|c-external)"/g)].map((m) => m[1]);
}

test('[4.17] a derived module keeps its own type instead of collapsing to external', () => {
  // The layout is where the flattening used to happen, so it is asserted at
  // the source and not only through the picture.
  assert.equal(schemaTypeFor('module'), 'module',
    'a module must survive the layout as a module');
  assert.equal(schemaTypeFor('mystery-kind'), 'external',
    'and an unknown kind must still fall back to the type that claims least');
});

test('[4.17] my code and a third-party package are drawn differently', () => {
  const html = artifact();
  const classes = nodeClasses(html);
  assert.deepEqual(classes, ['c-module', 'c-external'],
    'the two kinds must not share a class');
});

test('[4.17] and the two classes resolve to visibly different paint', () => {
  // The point of the whole change. Distinct class names that paint identically
  // would satisfy the test above while leaving the diagram exactly as it was.
  const html = artifact();
  const external = html.match(/\.c-external\s*\{[^}]*\}/)?.[0] ?? '';
  const module = html.match(/\.c-module\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(external, 'the artifact must carry a .c-external rule');
  assert.ok(module, 'the artifact must carry a .c-module rule');
  assert.match(external, /stroke-dasharray/,
    'third-party code is drawn dashed: it sits outside the system boundary');
  assert.ok(!/stroke-dasharray/.test(module),
    'code from this repository is drawn solid');
});

test('[4.17] the legend names both kinds, or the distinction is unexplained', () => {
  // A reader who sees two stroke treatments and no key has to guess, and a
  // guessed legend is how a diagram starts lying.
  const html = artifact();
  const swatches = [...html.matchAll(
    /width="16" height="10"[^>]*class="(c-[a-z-]+)"[^>]*\/>\s*<text[^>]*>([^<]*)/g,
  )].map((m) => [m[1], m[2]]);
  assert.deepEqual(swatches, [['c-module', 'Module'], ['c-external', 'External']]);
});
