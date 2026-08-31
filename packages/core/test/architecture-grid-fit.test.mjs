// The architecture renderer's default 120x60 component box growing to hold its
// text -- but only under `layout.mode: "grid"`, where the renderer derives the
// positions and the box size is therefore its own to choose.
//
// Under free placement the author wrote `pos` for every component, and
// widening a box there walks it into a neighbour somebody put at a specific
// point. That case belongs to `repair`, which can move components as well as
// resize them. These tests pin both halves of that division.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

function renderOutcome(doc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-grid-fit-'));
  const input = path.join(tmp, 'input.json');
  const output = path.join(tmp, 'output.html');
  fs.writeFileSync(input, JSON.stringify(doc));
  try {
    execFileSync('node', [
      path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { code: 0, stderr: '', html: fs.readFileSync(output, 'utf8') };
  } catch (err) {
    return { code: err.status ?? 1, stderr: String(err.stderr || ''), html: '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Component boxes, as drawn. */
function componentBoxes(html) {
  return [...html.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+" class="c-mask"\/>/g)]
    .map(([, x, y, width, height]) => ({
      x: Number(x), y: Number(y), width: Number(width), height: Number(height),
    }));
}

function gridWorkflow() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Grid fit' },
    layout: { mode: 'grid', cols: 3 },
    components: [
      { id: 'a', type: 'frontend', label: 'Web', row: 0, col: 0 },
      { id: 'b', type: 'backend', label: 'API', row: 0, col: 1 },
      { id: 'c', type: 'database', label: 'Store', row: 0, col: 2 },
    ],
    connections: [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'bc', from: 'b', to: 'c' },
    ],
  };
}

test('a grid the default box already fits is not touched', () => {
  const { code, html, stderr } = renderOutcome(gridWorkflow());
  assert.equal(code, 0, stderr);
  const boxes = componentBoxes(html).slice(0, 3);
  assert.equal(boxes.length, 3);
  for (const box of boxes) assert.equal(box.width, 120, 'an untouched component keeps 120px');
  assert.deepEqual(boxes.map((box) => box.x), [40, 200, 360],
    'the default grid step of 160px should have been left alone');
});

test('a sublabel too wide for the default box widens every default box', () => {
  // One width for all of them: components in a grid are read as a table, and a
  // row of boxes at differing widths reads as differing kinds of thing.
  const doc = gridWorkflow();
  doc.components[0].sublabel = 'Single ingress for all client traffic';
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const boxes = componentBoxes(html).slice(0, 3);
  assert.ok(boxes[0].width > 120, `expected growth past 120px, got ${boxes[0].width}`);
  assert.equal(new Set(boxes.map((box) => box.width)).size, 1,
    'every default box should share one width');
  assert.ok(html.includes('>Single ingress for all client traffic</text>'),
    'the sublabel renders unshortened');
});

test('widening the box widens the grid step, so columns never collide', () => {
  const doc = gridWorkflow();
  doc.components[0].sublabel = 'Single ingress for all client traffic';
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const boxes = componentBoxes(html).slice(0, 3).sort((left, right) => left.x - right.x);
  for (let i = 1; i < boxes.length; i += 1) {
    const gap = boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width);
    assert.ok(gap >= 8,
      `columns ${i - 1} and ${i} are ${gap}px apart — the step did not follow the width`);
  }
});

test('an authored size is never overridden, and takes no part in the fitting', () => {
  const doc = gridWorkflow();
  doc.components[0].sublabel = 'Single ingress for all client traffic';
  doc.components[0].size = [120, 60];
  const { code, stderr } = renderOutcome(doc);
  // The author pinned a box too small for their own sublabel. That is their
  // geometry and their call, so it is reported rather than quietly enlarged.
  assert.notEqual(code, 0, 'a component the author sized too small should still be reported');
  assert.match(stderr, /Single ingress for all client traffic/);
});

test('free placement is left to repair, which can move components too', () => {
  const doc = gridWorkflow();
  delete doc.layout;
  for (const [index, component] of doc.components.entries()) {
    component.pos = [40 + index * 160, 80];
    delete component.row;
    delete component.col;
  }
  doc.components[0].label = 'Content Delivery Network';
  const { code, stderr } = renderOutcome(doc);
  assert.notEqual(code, 0, 'a free-placed component keeps the author geometry and reports');
  assert.match(stderr, /Content Delivery Network/);
});

test('a component the author sized does not widen everyone else', () => {
  // The shared width is computed from the boxes the renderer owns. A component
  // carrying an explicit size is the author's, so its text must not drag the
  // other columns wider to accommodate something it already accommodates.
  const doc = gridWorkflow();
  doc.components[0].sublabel = 'Single ingress for all client traffic';
  doc.components[0].size = [150, 60];
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const boxes = componentBoxes(html).slice(0, 3).sort((left, right) => left.x - right.x);
  assert.equal(boxes[0].width, 150, 'the authored size is kept exactly');
  assert.deepEqual(boxes.slice(1).map((box) => box.width), [120, 120],
    'the other columns keep the default width');
});
