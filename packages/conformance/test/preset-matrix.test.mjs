import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODES, renderFixture, fixturesRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-preset-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito'];

function renderWithPreset(mode, fixture, preset, outPath) {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture), 'utf8'));
  source.meta = { ...source.meta, visual_preset: preset };
  const patched = path.join(tmp, `${mode}-${preset}.json`);
  fs.writeFileSync(patched, JSON.stringify(source));
  renderFixture(mode, patched, outPath);
}

test('every preset renders for every mode and declares itself on the document root', () => {
  for (const { mode, fixture } of MODES) {
    for (const preset of PRESETS) {
      const out = path.join(tmp, `${mode}-${preset}.html`);
      renderWithPreset(mode, fixture, preset, out);
      const html = fs.readFileSync(out, 'utf8');
      const rootTag = html.match(/<html\b[^>]*>/)?.[0] ?? '';
      assert.ok(rootTag.includes(`data-preset="${preset}"`), `${mode}/${preset}: preset not on root (root tag: ${rootTag})`);
      assert.ok(rootTag.includes('data-theme="dark"'), `${mode}/${preset}: default theme missing`);
    }
  }
});

test('both colour modes are defined in every rendered artifact', () => {
  const out = path.join(tmp, 'theme-check.html');
  renderFixture('architecture', 'web-app.architecture.json', out);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /\[data-theme="light"\]/, 'light palette block missing');
  assert.ok(html.includes('[data-preset="blueprint"]'), 'blueprint palette block missing');
  assert.ok(html.includes('[data-preset="editorial"]'), 'editorial palette block missing');
});

test('the "S" key cycles the visual style via Mirofy.preset.cycle (4.5)', () => {
  const out = path.join(tmp, 'style-picker.html');
  renderFixture('architecture', 'web-app.architecture.json', out);
  const html = fs.readFileSync(out, 'utf8');

  // The cycle function itself: preset.mjs's public surface, called by both
  // the "S" keyboard shortcut and the on-screen style-picker menu.
  assert.match(html, /function cycle\(\)\s*\{\s*return apply\(nextAfter\(current\(\)\)\);\s*\}/, 'Mirofy.preset.cycle implementation missing');
  assert.match(html, /return\s*\{[^}]*\bcycle:\s*cycle\b/, 'cycle is not exposed on the Mirofy.preset public surface');

  // The keyboard branch: "S" must be wired to call it, not just be reserved
  // in the help text.
  const branchIndex = html.search(/e\.key === ['"]s['"] \|\| e\.key === ['"]S['"]/);
  assert.notEqual(branchIndex, -1, '"S" key branch missing from the keyboard handler');
  const branchBody = html.slice(branchIndex, branchIndex + 200);
  assert.match(branchBody, /Mirofy\.preset\.cycle\(\)/, '"S" key branch does not call Mirofy.preset.cycle()');
});
