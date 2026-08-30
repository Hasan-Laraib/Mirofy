// Row 5.17. Two directions, both of which have caught real defects in this
// codebase:
//   emitted-but-unconsumed  -- the renderer writes an attribute nothing
//                              reads (dead weight, or a deleted consumer)
//   consumed-but-unemitted  -- something reads an attribute no renderer
//                              writes (a selector that never matches; the
//                              silent-no-op class of viewer bug)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanEmitted, scanConsumed, RESERVED } from '../../viewer/src/contract.mjs';

test('every data-* a renderer emits has a declared consumer (5.17)', () => {
  const emitted = scanEmitted();
  const consumed = scanConsumed();
  const orphans = [...emitted].filter((attr) => !consumed.has(attr) && !(attr in RESERVED)).sort();
  assert.deepEqual(orphans, [], `renderers emit attributes nothing consumes:\n  ${orphans.join('\n  ')}`);
});

test('every reserved attribute is still emitted and still carries a reason (5.17)', () => {
  const emitted = scanEmitted();
  for (const [attr, why] of Object.entries(RESERVED)) {
    assert.ok(emitted.has(attr), `${attr} is reserved but no renderer emits it; delete the entry`);
    assert.ok(typeof why === 'string' && why.length >= 20, `${attr} is reserved without a usable reason`);
  }
});

// The viewer authors and consumes these entirely at runtime -- created via
// document.createElementNS/setAttribute in viewer JS (packages/viewer/src/
// js/17-semantic-lens.js) or hand-authored on a control button in
// packages/viewer/src/html/02-markup.html -- and never appear in renderer
// output. They share a renderer-owned prefix (legend swatch chrome, the
// node-finder trigger button) by coincidence of naming, not by contract.
// Verified by reading their call sites, not guessed: each name below is
// only ever the target of setAttribute/removeAttribute/querySelector
// inside the viewer's own source, never a substring match against
// scanEmitted()'s renderer scan.
const VIEWER_OWNED = new Set([
  'data-legend-bridge-runtime',
  'data-legend-count',
  'data-legend-count-badge',
  'data-legend-hit',
  'data-legend-preview-active',
  'data-legend-preview-match',
  'data-legend-preview-peer',
  'data-legend-preview-selected',
  'data-legend-selected',
  'data-legend-zero',
  'data-node-finder-trigger',
]);

test('the viewer reads no data-* that renderers never emit and the viewer never sets (5.17)', () => {
  const emitted = scanEmitted();
  const consumed = scanConsumed();
  const viewerOnly = [...consumed.entries()]
    .filter(([, surfaces]) => surfaces.includes('viewer'))
    .map(([attr]) => attr);
  // The viewer legitimately sets many attributes on itself (panel open
  // state, camera state, legend swatch chrome -- see VIEWER_OWNED above).
  // Those appear in the viewer source as *writes*, so this asserts the
  // narrower thing that is actually checkable without a parser: an
  // attribute the viewer reads whose name is renderer-shaped (data-node-*,
  // data-edge-*, data-composition-*) must be emitted, unless it is a known
  // viewer-owned self-write.
  const rendererShaped = viewerOnly.filter(
    (attr) => /^data-(node|edge|composition|legend|brand|segment)-/.test(attr) && !VIEWER_OWNED.has(attr),
  );
  const missing = rendererShaped.filter((attr) => !emitted.has(attr)).sort();
  assert.deepEqual(missing, [], `the viewer reads renderer-shaped attributes no renderer emits:\n  ${missing.join('\n  ')}`);
});
