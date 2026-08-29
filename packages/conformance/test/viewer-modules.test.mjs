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

test('the viewer ships as 19 separate module files, not one blob (5.16)', () => {
  assert.equal(jsParts.length, 19, 'expected 19 viewer JS modules in the part manifest');
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

test('the palette file holds exactly the eight preset/theme blocks (4.12)', () => {
  // Task 6 replaced the hand-written css/00-palette.css with a generated
  // emitter (see packages/viewer/src/tokens/); this test now reads the
  // emitter's output rather than a file on disk, but keeps every original
  // assertion -- it is the only check that all eight blocks still exist.
  const css = emitPalette();
  // Palette selectors carry the 4-space base indentation every part file
  // keeps from the monolith's <style> tag (see js/01-preamble.js), so the
  // match is anchored to that indentation rather than column 0 -- an
  // unanchored [a-z:] start would also catch mid-comment continuation
  // lines like "so the arrows drawn underneath...".
  const selectors = css.match(/^ {4}\[?[a-z:][^{]*\{/gm) ?? [];
  assert.equal(selectors.length, 8, `expected 8 palette blocks, found ${selectors.length}`);
  for (const needle of [
    ':root',
    '[data-theme="light"]',
    '[data-preset="signal-flow"][data-theme="dark"]',
    '[data-preset="signal-flow"][data-theme="light"]',
    '[data-preset="blueprint"][data-theme="dark"]',
    '[data-preset="blueprint"][data-theme="light"]',
    '[data-preset="editorial"][data-theme="dark"]',
    '[data-preset="editorial"][data-theme="light"]',
  ]) {
    assert.ok(css.includes(needle), `palette block missing: ${needle}`);
  }
  // 01-structure.css must not have absorbed any custom-property block, or
  // Task 6's generator would silently stop covering part of the palette.
  const structure = fs.readFileSync(path.join(SRC_ROOT, 'css/01-structure.css'), 'utf8');
  assert.ok(!structure.includes('[data-preset="editorial"][data-theme="light"] {'), 'a palette block leaked into 01-structure.css');
});
