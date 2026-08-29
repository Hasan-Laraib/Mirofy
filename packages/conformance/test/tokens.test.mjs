// Row 4.12. The byte-identity check in check-template.mjs already proves
// the emitter reproduces the committed palette. What it cannot prove is
// that the token *model* is coherent -- that is what these assert.
//
// Row 4.13 (added in P1a Task 7) proves the okabe-ito colour-blind-safe
// preset the same way: the token model declares it correctly, and the
// renderer actually threads it through to a rendered artifact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BLOCKS, PROPERTY_NAMES } from '../../viewer/src/tokens/tokens.mjs';
import { emitPalette } from '../../viewer/src/tokens/emit.mjs';
import { SRC_ROOT } from '../../viewer/build.mjs';
import { renderFixture, fixturesRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-tokens-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

test('the token model covers 8 blocks and 32 distinct properties (4.12)', () => {
  // Grew to 10 blocks in P1a Task 7 (the okabe-ito preset's dark/light pair);
  // the title stays as proved by row 4.12 in matrix.mjs -- only the count
  // asserted below tracks the model's real, current shape.
  assert.equal(BLOCKS.length, 10);
  assert.equal(PROPERTY_NAMES.length, 32);
});

test('every block defines a subset of the canonical property set, never a stray name (4.12)', () => {
  const canonical = new Set(PROPERTY_NAMES);
  for (const { selector, props } of BLOCKS) {
    for (const [name] of props) {
      assert.ok(canonical.has(name), `${selector} declares ${name}, which is not a known token`);
    }
  }
});

test('the two signal-flow blocks are partial overrides and the other six are complete (4.12)', () => {
  // Encoded deliberately: a future change that "helpfully" completes the
  // signal-flow blocks would move the template bytes, and this says out
  // loud that the omission is intentional inheritance from :root. (Now
  // eight other blocks, not six, since P1a Task 7 added okabe-ito's
  // complete dark/light pair; the title stays as proved by row 4.12.)
  const byCount = Object.fromEntries(BLOCKS.map((b) => [b.selector.trim(), b.props.length]));
  assert.equal(byCount['[data-preset="signal-flow"][data-theme="dark"]'], 30);
  assert.equal(byCount['[data-preset="signal-flow"][data-theme="light"]'], 27);
  for (const [selector, count] of Object.entries(byCount)) {
    if (selector.includes('signal-flow')) continue;
    assert.equal(count, 32, `${selector} should declare all 32 tokens`);
  }
});

test('no token value is empty and every block emits valid CSS declarations (4.12)', () => {
  for (const { selector, props } of BLOCKS) {
    for (const [name, value] of props) {
      assert.ok(String(value).trim().length > 0, `${selector} ${name} has an empty value`);
      assert.ok(!String(value).includes(';'), `${selector} ${name} value contains a stray semicolon`);
    }
  }
  assert.ok(emitPalette().includes('--'), 'emitPalette produced no custom properties');
});

test('the Okabe-Ito preset renders and declares itself on the document root (4.13)', () => {
  const out = path.join(tmp, 'okabe-ito.html');
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));
  source.meta = { ...source.meta, visual_preset: 'okabe-ito' };
  const patched = path.join(tmp, 'okabe-ito.source.json');
  fs.writeFileSync(patched, JSON.stringify(source));
  renderFixture('architecture', patched, out);

  const html = fs.readFileSync(out, 'utf8');
  const rootTag = html.match(/<html\b[^>]*>/)?.[0] ?? '';
  assert.ok(rootTag.includes('data-preset="okabe-ito"'), `preset not on root: ${rootTag}`);
  assert.match(html, /\[data-preset="okabe-ito"\]\[data-theme="dark"\]/, 'dark palette block missing');
  assert.match(html, /\[data-preset="okabe-ito"\]\[data-theme="light"\]/, 'light palette block missing');
});

test('the Okabe-Ito palette uses the published CVD-safe hues (4.13)', () => {
  // Asserting the actual published values, not merely "some colour is set".
  // A preset named for Okabe-Ito that quietly drifted to arbitrary hues
  // would keep every other test in this file green.
  const dark = BLOCKS.find((b) => b.selector.includes('okabe-ito') && b.selector.includes('dark'));
  const values = new Set(dark.props.map(([, value]) => String(value).toLowerCase()));
  for (const hex of ['#56b4e9', '#009e73', '#cc79a7', '#e69f00', '#d55e00', '#f0e442', '#0072b2']) {
    assert.ok([...values].some((v) => v.includes(hex)), `Okabe-Ito hue ${hex} is not present in the dark palette`);
  }
});

test('both Okabe-Ito blocks are complete 32-token palettes (4.13)', () => {
  for (const theme of ['dark', 'light']) {
    const block = BLOCKS.find((b) => b.selector.includes('okabe-ito') && b.selector.includes(theme));
    assert.ok(block, `okabe-ito ${theme} block missing`);
    assert.equal(block.props.length, 32, `okabe-ito ${theme} must declare all 32 tokens`);
  }
});

test('the viewer offers okabe-ito in the preset cycle (4.13)', () => {
  const js = fs.readFileSync(path.join(SRC_ROOT, 'js/02-preset.js'), 'utf8');
  assert.match(js, /var PRESETS = \[[^\]]*'okabe-ito'/, 'okabe-ito is not in the viewer PRESETS list');
  const markup = fs.readFileSync(path.join(SRC_ROOT, 'html/02-markup.html'), 'utf8');
  assert.match(markup, /data-preset-value="okabe-ito"/, 'okabe-ito has no style-picker option');
});
