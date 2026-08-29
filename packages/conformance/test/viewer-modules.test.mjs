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
