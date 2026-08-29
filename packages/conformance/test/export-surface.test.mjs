import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODES, renderFixture } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-export-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const FORMATS = ['png', 'jpeg', 'webp', 'svg', 'webm', 'share-card'];
const ACTIONS = ['route-share-card', 'reach-share-card', 'copy-share-card', 'copy'];

// Both tests below assert markup presence only (a `<button data-format="…">`
// or `<button data-action="…">` exists in the rendered artifact) -- they do
// not click anything and do not prove the export dispatcher actually runs
// when clicked. That dispatcher lives entirely in template.html's runtime
// JS (the `menu.addEventListener('click', ...)` handler that reads
// data-format/data-action off the clicked button); no-opping that handler
// entirely leaves both tests here green, because the buttons are still
// rendered into markup regardless of whether anything listens for clicks on
// them. Proving the click actually fires would need a real browser (see
// viewer.browser.test.mjs's header comment on why 40 rows are proved
// without one) -- no such test exists anywhere in this repo today. Titles
// say "declares"/"carry ... markup", not "wired" or "exposes", for exactly
// this reason; see matrix.mjs's `note` on rows 6.4/6.5/6.6.
test('every rendered artifact declares markup for all six export formats (data-format buttons present; click dispatch not exercised)', () => {
  for (const { mode, fixture } of MODES) {
    const out = path.join(tmp, `${mode}.html`);
    renderFixture(mode, fixture, out);
    const html = fs.readFileSync(out, 'utf8');
    for (const format of FORMATS) {
      const buttonRe = new RegExp(`<button[^>]*data-format="${format}"`);
      assert.match(html, buttonRe, `${mode}: export format ${format} missing`);
    }
  }
});

test('share-card and clipboard action buttons carry the expected data-action markup in every artifact (present; click dispatch not exercised)', () => {
  const out = path.join(tmp, 'actions.html');
  renderFixture('architecture', 'web-app.architecture.json', out);
  const html = fs.readFileSync(out, 'utf8');
  for (const action of ACTIONS) {
    const buttonRe = new RegExp(`<button[^>]*data-action="${action}"`);
    assert.match(html, buttonRe, `action ${action} missing`);
  }
});
