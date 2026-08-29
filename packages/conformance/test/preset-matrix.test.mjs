import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODES, renderFixture, fixturesRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-preset-'));
const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial'];

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
