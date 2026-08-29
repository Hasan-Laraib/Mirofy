import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODES, renderFixture } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-smoke-'));

test('all five diagram modes render from their v1-baseline fixture', () => {
  assert.equal(MODES.length, 5);
  for (const { mode, fixture } of MODES) {
    const out = path.join(tmp, `${mode}.html`);
    renderFixture(mode, fixture, out);
    const html = fs.readFileSync(out, 'utf8');
    assert.ok(html.startsWith('<!DOCTYPE html>'), `${mode}: not an HTML document`);
    assert.ok(html.includes('<svg'), `${mode}: no inline SVG`);
    assert.ok(html.length > 500_000, `${mode}: suspiciously small (${html.length} bytes)`);
  }
});
