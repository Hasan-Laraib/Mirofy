// The workflow renderer's own defaults -- a 92px node, a 104px lane, and a
// hand-tuned array of column centres -- growing to hold what an author put in
// them, instead of asking the author to write less.
//
// Every test here pins the property that makes the growth safe as much as the
// growth itself: nothing moves for a diagram the defaults already fit.

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-lane-fit-'));
  const input = path.join(tmp, 'input.json');
  const output = path.join(tmp, 'output.html');
  fs.writeFileSync(input, JSON.stringify(doc));
  try {
    execFileSync('node', [
      path.join(skillRoot, 'renderers/workflow/render-workflow.mjs'), input, output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { code: 0, stderr: '', html: fs.readFileSync(output, 'utf8') };
  } catch (err) {
    return { code: err.status ?? 1, stderr: String(err.stderr || ''), html: '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Node boxes, as drawn: the mask rect carries each node's final geometry. */
function nodeBoxes(html) {
  return [...html.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="6" class="c-mask"\/>/g)]
    .map(([, x, y, width, height]) => ({
      x: Number(x), y: Number(y), width: Number(width), height: Number(height),
    }));
}

function laneHeights(html) {
  return [...html.matchAll(/data-composition-frame-kind="lane"[^>]*?height="([\d.]+)"/g)]
    .map(([, height]) => Number(height));
}

/** Three short-labelled nodes the 92px default already holds comfortably. */
function simpleWorkflow() {
  return {
    schema_version: 1,
    diagram_type: 'workflow',
    meta: { title: 'Lane fit' },
    lanes: [{ id: 'main', label: 'Main' }],
    nodes: [
      { id: 'a', lane: 'main', col: 0, type: 'external', label: 'Start' },
      { id: 'b', lane: 'main', col: 1, type: 'backend', label: 'Work' },
      { id: 'c', lane: 'main', col: 2, type: 'backend', label: 'Done' },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', variant: 'default' },
      { id: 'bc', from: 'b', to: 'c', variant: 'default' },
    ],
  };
}

test('a diagram the defaults already fit is not touched', () => {
  const { code, html, stderr } = renderOutcome(simpleWorkflow());
  assert.equal(code, 0, stderr);
  const boxes = nodeBoxes(html);
  assert.ok(boxes.length >= 3, `expected three node boxes, got ${boxes.length}`);
  for (const box of boxes.slice(0, 3)) {
    assert.equal(box.width, 92, 'an untouched node keeps the 92px default');
  }
  assert.deepEqual(laneHeights(html).slice(0, 1), [104], 'an untouched lane keeps its 104px height');
});

test('a label wider than the default node widens the node', () => {
  const doc = simpleWorkflow();
  doc.nodes[1].label = 'Deploy to production';
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const widened = nodeBoxes(html)[1];
  assert.ok(widened.width > 92,
    `the node should have grown past the 92px default, got ${widened.width}`);
  assert.ok(html.includes('>Deploy to production</text>'), 'the label renders unshortened');
});

test('an authored node.width is never overridden', () => {
  const doc = simpleWorkflow();
  doc.nodes[1].label = 'Deploy to production';
  doc.nodes[1].width = 150;
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  assert.equal(nodeBoxes(html)[1].width, 150,
    'a width the author wrote is a fact about the document, not a default to improve on');
});

test('columns are re-solved when widened nodes would collide in one lane', () => {
  // Columns 3 and 4 sit 70px apart in the default array, which two 92px nodes
  // cannot both occupy -- let alone two widened ones.
  const doc = simpleWorkflow();
  doc.nodes = [
    { id: 'a', lane: 'main', col: 3, type: 'backend', label: 'Deploy to staging' },
    { id: 'b', lane: 'main', col: 4, type: 'backend', label: 'Manual approval' },
  ];
  doc.edges = [{ id: 'ab', from: 'a', to: 'b', variant: 'default' }];
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const [left, right] = nodeBoxes(html).slice(0, 2).sort((p, q) => p.x - q.x);
  assert.ok(right.x - (left.x + left.width) >= 8,
    `the two nodes overlap by ${(left.x + left.width) - right.x}px`);
});

test('nodes in different lanes may share horizontal space', () => {
  // The check that decides whether to re-solve is per-lane. A first version
  // was not, decided the bundled example's own correct layout did not fit,
  // and re-solved a diagram that needed nothing.
  const doc = simpleWorkflow();
  doc.lanes = [{ id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }];
  doc.nodes = [
    { id: 'a', lane: 'top', col: 3, type: 'backend', label: 'Work' },
    { id: 'b', lane: 'bottom', col: 4, type: 'backend', label: 'Also' },
  ];
  doc.edges = [{ id: 'ab', from: 'a', to: 'b', variant: 'default' }];
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const boxes = nodeBoxes(html).slice(0, 2).sort((left, right) => left.x - right.x);
  assert.ok(boxes.every((box) => box.width === 92),
    'nothing needed solving here, so nothing should have grown');
  // The default column centres are 430 and 500, so an untouched layout puts
  // these 92px boxes at 384 and 454 -- overlapping, and perfectly fine, because
  // they are in different lanes. Re-solving would move them apart and this is
  // what notices.
  assert.deepEqual(boxes.map((box) => box.x), [384, 454],
    'the default column centres should have been left alone');
});

test('a yOffset deeper than the lane grows the lane', () => {
  const doc = simpleWorkflow();
  doc.nodes = [
    { id: 'a', lane: 'main', col: 0, type: 'backend', label: 'Up', yOffset: -80 },
    { id: 'b', lane: 'main', col: 1, type: 'backend', label: 'Mid' },
    { id: 'c', lane: 'main', col: 2, type: 'backend', label: 'Down', yOffset: 80 },
  ];
  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const height = laneHeights(html)[0];
  // A 52px node displaced 80px needs a content band of 52 + 2*80, plus the
  // 30px lane title.
  assert.ok(height >= 52 + 160 + 30,
    `lane height ${height} cannot hold a 52px node at yOffset 80`);
});

test('an authored viewBox is not overrun by a solved layout', () => {
  // The author fixed the canvas. A solve needing more room than that is not
  // adopted at all: the diagram renders as it did before, with the same
  // diagnostics, rather than half-fitted and clipped.
  const doc = simpleWorkflow();
  doc.meta.viewBox = [720, 400];
  doc.nodes = [
    { id: 'a', lane: 'main', col: 0, type: 'backend', label: 'Deploy to production' },
    { id: 'b', lane: 'main', col: 1, type: 'backend', label: 'Deploy to staging' },
    { id: 'c', lane: 'main', col: 2, type: 'backend', label: 'Manual approval now' },
    { id: 'd', lane: 'main', col: 3, type: 'backend', label: 'Integration suite' },
    { id: 'e', lane: 'main', col: 4, type: 'backend', label: 'Second responder' },
    { id: 'f', lane: 'main', col: 5, type: 'backend', label: 'Write postmortem' },
  ];
  doc.edges = [{ id: 'ab', from: 'a', to: 'b', variant: 'default' }];
  const { code, html, stderr } = renderOutcome(doc);
  if (code === 0) {
    const right = Math.max(...nodeBoxes(html).map((box) => box.x + box.width));
    assert.ok(right <= 720, `a node reaches ${right}px on a 720px canvas`);
  } else {
    assert.doesNotMatch(stderr, /clips the/,
      'falling back should not leave a layout that overruns the canvas it was measured against');
  }
});
