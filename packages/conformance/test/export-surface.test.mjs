import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODES, renderFixture } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-export-'));
const FORMATS = ['png', 'jpeg', 'webp', 'svg', 'webm', 'share-card'];
const ACTIONS = ['route-share-card', 'reach-share-card', 'copy-share-card', 'copy'];

test('every rendered artifact exposes all six export formats', () => {
  for (const { mode, fixture } of MODES) {
    const out = path.join(tmp, `${mode}.html`);
    renderFixture(mode, fixture, out);
    const html = fs.readFileSync(out, 'utf8');
    for (const format of FORMATS) {
      assert.ok(html.includes(`data-format="${format}"`), `${mode}: export format ${format} missing`);
    }
  }
});

test('share-card and clipboard actions are wired in every artifact', () => {
  const out = path.join(tmp, 'actions.html');
  renderFixture('architecture', 'web-app.architecture.json', out);
  const html = fs.readFileSync(out, 'utf8');
  for (const action of ACTIONS) {
    assert.ok(html.includes(`data-action="${action}"`), `action ${action} missing`);
  }
});
