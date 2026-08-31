import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textUnits } from '../renderers/shared/utils.mjs';
import { requiredNodeWidth } from '../renderers/shared/text-fit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

function renderOutcome(doc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-column-fit-'));
  const input = path.join(tmp, 'input.json');
  const output = path.join(tmp, 'output.html');
  fs.writeFileSync(input, JSON.stringify(doc));
  try {
    execFileSync('node', [
      path.join(skillRoot, 'renderers/sequence/render-sequence.mjs'),
      input,
      output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { code: 0, stderr: '', html: fs.readFileSync(output, 'utf8') };
  } catch (err) {
    return { code: err.status ?? 1, stderr: String(err.stderr || ''), html: '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function render(doc) {
  const outcome = renderOutcome(doc);
  assert.equal(outcome.code, 0, outcome.stderr);
  return outcome.html;
}

function participantBoxes(html) {
  return [...html.matchAll(/<rect x="([\d.]+)" y="72" width="([\d.]+)" height="54"/g)]
    .map(([, x, width]) => ({ x: Number(x), width: Number(width) }))
    .filter((box, index, all) => all.findIndex((other) => other.x === box.x) === index)
    .sort((left, right) => left.x - right.x);
}

function wideSequence(columnFit) {
  const meta = { title: 'Column fit', viewBox: [1320, 620] };
  if (columnFit) meta.column_fit = columnFit;
  return {
    schema_version: 1,
    diagram_type: 'sequence',
    meta,
    participants: [
      { id: 'browser', type: 'frontend', label: 'Browser' },
      { id: 'gateway', type: 'backend', label: 'Gateway' },
      { id: 'idp', type: 'security', label: 'IdP' },
      { id: 'api', type: 'backend', label: 'API' },
      { id: 'store', type: 'database', label: 'Store' }
    ],
    messages: [
      { from: 'browser', to: 'gateway', y: 200, label: 'request' },
      { from: 'gateway', to: 'idp', y: 260, label: 'authorize' },
      { from: 'idp', to: 'api', y: 320, label: 'token' },
      { from: 'api', to: 'store', y: 380, label: 'read' }
    ]
  };
}

test('fixed column fit keeps the historical 108px gap regardless of viewBox width', () => {
  const boxes = participantBoxes(render(wideSequence()));
  assert.equal(boxes.length, 5);
  assert.equal(boxes[0].width, 86);
  assert.equal(boxes[1].x - boxes[0].x, 108);
  assert.equal(boxes.at(-1).x + boxes.at(-1).width < 600, true,
    'fixed lanes stay packed on the left, leaving the wide canvas unused');
});

test('spread column fit uses the viewBox width and stays inside it', () => {
  const boxes = participantBoxes(render(wideSequence('spread')));
  assert.equal(boxes.length, 5);
  assert.ok(boxes[0].width > 86, 'participant boxes widen with the available room');
  assert.ok(boxes[1].x - boxes[0].x > 108, 'columns spread past the fixed gap');
  assert.equal(boxes[0].x, 62, 'first lane keeps the side margin');
  assert.ok(boxes.at(-1).x + boxes.at(-1).width <= 1320 - 40,
    'last lane stays inside the viewBox with the reserved margin');
});

test('spread column fit is opt-in, so an unset value renders like fixed', () => {
  assert.equal(render(wideSequence()), render(wideSequence('fixed')));
});

const wideLabel = 'Payment Gateway Service';

function labelledSequence(columnFit) {
  const doc = wideSequence(columnFit);
  doc.participants[1].label = wideLabel;
  return doc;
}

test('a label too wide for the standard box widens the box, not the label', () => {
  // This used to assert the opposite: that the fixed box REJECTED such a
  // label, and that the author had to find meta.column_fit "spread" to keep
  // their wording. That put a naming decision about the system being drawn at
  // the mercy of a rendering default nobody had heard of. A participant box is
  // never authored -- 86px is this renderer's own choice -- so the renderer
  // changes its choice rather than asking for a shorter word.
  const estimatedLabelW = textUnits(wideLabel) * 6.8;
  assert.ok(estimatedLabelW > 86 + 6, 'the fixture label must actually exceed the standard box');

  const fitted = renderOutcome(labelledSequence());
  assert.equal(fitted.code, 0, fitted.stderr);
  const box = participantBoxes(fitted.html)[1];
  assert.ok(box.width > 86, `the box should have grown past the standard 86px, got ${box.width}`);
  assert.ok(estimatedLabelW <= box.width + 6, `label ~${estimatedLabelW}px must fit the ${box.width}px box`);
  assert.ok(fitted.html.includes(`>${wideLabel}</text>`), 'the label renders unshortened');

  // spread still has a job of its own, and it is a different one: fitting
  // grows a box until the text fits, spread grows it until the canvas is used.
  const spread = renderOutcome(labelledSequence('spread'));
  assert.equal(spread.code, 0, spread.stderr);
  const spreadBox = participantBoxes(spread.html)[1];
  assert.ok(spreadBox.width > box.width,
    `spread (${spreadBox.width}px) should still claim more than a snug fit (${box.width}px)`);
});

test('the sublabel diagnostic reports the width in force, not the historical constant', () => {
  const unrescuable = 'Payment authorization gateway detail text that stays far too long to shrink';
  const doc = wideSequence('spread');
  doc.participants[0].sublabel = unrescuable;

  const { code, stderr } = renderOutcome(doc);
  assert.notEqual(code, 0, 'a sublabel past the legible minimum is still rejected');
  assert.match(stderr, /participant boxes are 190px for this viewBox width and 5 participants/);
  assert.doesNotMatch(stderr, /boxes are a fixed/, 'spread must not quote the fixed layout');
});

test('the fast authoring path explains when to opt into spread', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(skillRoot, 'schemas/sequence.schema.json'), 'utf8'));
  const description = schema.properties.meta.properties.column_fit.description;
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const rendererReadme = fs.readFileSync(path.join(skillRoot, 'renderers/sequence/README.md'), 'utf8');

  assert.match(description, /wide viewBox/);
  assert.match(description, /meaningful participant labels/);
  assert.match(skill, /do not shorten semantic labels before trying `spread`/);
  assert.match(rendererReadme, /Use `"spread"` when a wide/);
  assert.match(rendererReadme, /try `meta\.column_fit: "spread"` before shortening/);
});

test('a sublabel too wide for the standard box widens it too', () => {
  // A sublabel says what a participant IS. Shrink-to-fit handles the ordinary
  // overrun; past the legible minimum the box has to grow, or the only advice
  // left is "say less about it".
  const sublabel = 'OIDC authorisation server for staff';
  const doc = wideSequence();
  doc.participants[2].sublabel = sublabel;

  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const box = participantBoxes(html)[2];
  assert.ok(box.width >= requiredNodeWidth(sublabel, 6),
    `box ${box.width}px must hold a sublabel needing ${requiredNodeWidth(sublabel, 6)}px`);
  assert.ok(html.includes(`>${sublabel}</text>`), 'the sublabel renders unshortened');
});

test('widening the box widens the column pitch, so boxes never collide', () => {
  const doc = wideSequence();
  doc.participants[1].label = 'Payment Gateway Service';

  const { code, html, stderr } = renderOutcome(doc);
  assert.equal(code, 0, stderr);
  const boxes = participantBoxes(html);
  assert.ok(boxes[0].width > 86, 'the fixture must actually have widened the boxes');
  for (let i = 1; i < boxes.length; i += 1) {
    const gap = boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width);
    assert.ok(gap > 0,
      `boxes ${i - 1} and ${i} overlap by ${-gap}px — the pitch did not follow the width`);
  }
});
