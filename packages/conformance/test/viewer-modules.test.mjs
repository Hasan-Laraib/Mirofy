// Row 5.16. A byte-identity check alone would stay green if all 19 modules
// were concatenated back into one file -- it only proves the *output* is
// right, never that the source is actually modular. These assertions are
// about the source tree, so that "modularized viewer" cannot quietly
// regress to a monolith while the build keeps passing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PARTS } from '../../viewer/src/parts.mjs';
import { SRC_ROOT } from '../../viewer/build.mjs';
import { emitPalette } from '../../viewer/src/tokens/emit.mjs';

const jsParts = PARTS.filter((p) => p.kind === 'file' && p.path.startsWith('js/') && p.path !== 'js/boot.js');

test('the viewer ships as 20 separate module files, not one blob (5.16)', () => {
  assert.equal(jsParts.length, 20, 'expected 20 viewer JS modules in the part manifest');
  for (const part of jsParts) {
    assert.ok(fs.existsSync(path.join(SRC_ROOT, part.path)), `${part.path} is listed in PARTS but does not exist`);
  }
});

test('no single viewer module exceeds 2000 lines (5.16)', () => {
  // The monolith was 9400 lines. The largest extracted block (04-export)
  // is 1455. This ceiling is what stops a future change from re-growing a
  // module back toward the size the extraction existed to remove.
  for (const part of jsParts) {
    const lines = fs.readFileSync(path.join(SRC_ROOT, part.path), 'utf8').split('\n').length - 1;
    assert.ok(lines <= 2000, `${part.path} is ${lines} lines; split it rather than raising this ceiling`);
  }
});

test('every part listed in the manifest is a file that exists, and every file is listed (5.16)', () => {
  const listed = new Set(PARTS.filter((p) => p.kind === 'file').map((p) => p.path));
  const onDisk = [];
  for (const dir of ['js', 'css', 'html']) {
    const abs = path.join(SRC_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) onDisk.push(`${dir}/${name}`);
  }
  // An orphan file is dead source that no build consumes -- the exact
  // failure mode that lets someone "fix" the viewer and see no effect.
  for (const rel of onDisk) {
    assert.ok(listed.has(rel), `${rel} exists under src/ but no PARTS entry consumes it`);
  }
});

test('the palette file holds exactly the ten preset/theme blocks (4.12)', () => {
  // Task 6 replaced the hand-written css/00-palette.css with a generated
  // emitter (see packages/viewer/src/tokens/); this test now reads the
  // emitter's output rather than a file on disk, but keeps every original
  // assertion -- it is the only check that all ten blocks still exist.
  // Grew from eight to ten in P1a Task 7 (the okabe-ito preset's dark/light
  // pair).
  const css = emitPalette();
  // Palette selectors carry the 4-space base indentation every part file
  // keeps from the monolith's <style> tag (see js/01-preamble.js), so the
  // match is anchored to that indentation rather than column 0 -- an
  // unanchored [a-z:] start would also catch mid-comment continuation
  // lines like "so the arrows drawn underneath...".
  const selectors = css.match(/^ {4}\[?[a-z:][^{]*\{/gm) ?? [];
  assert.equal(selectors.length, 10, `expected 10 palette blocks, found ${selectors.length}`);
  for (const needle of [
    ':root',
    '[data-theme="light"]',
    '[data-preset="signal-flow"][data-theme="dark"]',
    '[data-preset="signal-flow"][data-theme="light"]',
    '[data-preset="blueprint"][data-theme="dark"]',
    '[data-preset="blueprint"][data-theme="light"]',
    '[data-preset="editorial"][data-theme="dark"]',
    '[data-preset="editorial"][data-theme="light"]',
    '[data-preset="okabe-ito"][data-theme="dark"]',
    '[data-preset="okabe-ito"][data-theme="light"]',
  ]) {
    assert.ok(css.includes(needle), `palette block missing: ${needle}`);
  }
  // 01-structure.css must not have absorbed any custom-property block, or the
  // token generator would silently stop covering part of the palette.
  //
  // This used to test one literal selector, which only ever caught the single
  // block someone thought to name. P1a recorded it as "backstopped by the
  // count assertion" above; it is not -- that count reads emitPalette()'s
  // output, and a palette block sitting in structural CSS never appears
  // there. Neither check could see the standing counter-example: the print
  // block below, 27 custom properties, living in 01-structure.css the whole
  // time.
  //
  // So scan for the SHAPE instead: any rule declaring four or more custom
  // properties is palette-like, and the set of them must match this
  // allowlist exactly. An eleventh block then fails this gate by existing,
  // rather than by happening to match a string someone remembered to add.
  const ALLOWED_PROPERTY_BLOCKS = new Map([
    [':root, [data-theme="dark"], [data-theme="light"], html[data-preset][data-theme]',
      'The @media print palette. It must restate the full light palette rather than '
      + 'inherit it, because printing from dark theme would otherwise put dark fills and '
      + 'neon strokes on white paper, and @media contributes no specificity of its own. '
      + 'tokens.test.mjs separately proves it outranks every preset palette.'],
  ]);

  const structure = fs.readFileSync(path.join(SRC_ROOT, 'css/01-structure.css'), 'utf8');
  const withoutComments = structure.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRe.exec(withoutComments)) !== null) {
    const declared = (match[2].match(/(^|[\s;])--[\w-]+\s*:/g) ?? []).length;
    if (declared >= 4) found.push(match[1].trim().replace(/\s+/g, ' '));
  }

  const unexpected = found.filter((sel) => !ALLOWED_PROPERTY_BLOCKS.has(sel));
  assert.deepEqual(unexpected, [],
    'a palette-like block (4+ custom properties) appeared in 01-structure.css without an '
    + 'allowlist entry. Either move it into the token model (packages/viewer/src/tokens/), '
    + 'or add it to ALLOWED_PROPERTY_BLOCKS above with a written reason it must live in '
    + 'structural CSS.');
  const missing = [...ALLOWED_PROPERTY_BLOCKS.keys()].filter((sel) => !found.includes(sel));
  assert.deepEqual(missing, [],
    'an allowlisted palette block is gone from 01-structure.css. If that is deliberate, '
    + 'remove its entry; if not, the print palette has been lost.');
});
