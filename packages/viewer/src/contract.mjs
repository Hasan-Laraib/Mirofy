// The renderer -> consumer contract for data-* attributes.
//
// Three surfaces consume what the renderers emit, and conflating them is
// how this check turns vacuous:
//   viewer    -- read by the viewer JS, or matched by a CSS selector, in
//                packages/viewer/src/{js,css,html}
//   validator -- read by scripts/check-render-output.mjs (the post-render
//                quality gates)
//   tooling   -- read by delta/architecture-delta.mjs, bin/visual-check.mjs,
//                or bin/mirofy.mjs (the `deliver` command inspects
//                data-engineering-profile on the rendered artifact)
//
// An attribute may have several consumers. An attribute with *none* is
// either dead weight in the rendered SVG or a consumer that was deleted
// without removing its producer -- both are defects, and both are what
// this file exists to surface.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const viewerSrc = here;
const coreRoot = path.resolve(here, '../../core');

const ATTR = /data-[a-z0-9-]+/g;

function readAll(dir, extensions) {
  const out = [];
  const walk = (abs) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(fs.readFileSync(next, 'utf8'));
    }
  };
  walk(dir);
  return out.join('\n');
}

export function scanEmitted() {
  const text = readAll(path.join(coreRoot, 'renderers'), ['.mjs']);
  return new Set(text.match(ATTR) ?? []);
}

export function scanConsumed() {
  const surfaces = {
    viewer: readAll(viewerSrc, ['.js', '.css', '.html']),
    validator: fs.readFileSync(path.join(coreRoot, 'scripts/check-render-output.mjs'), 'utf8'),
    tooling: [
      fs.readFileSync(path.join(coreRoot, 'delta/architecture-delta.mjs'), 'utf8'),
      fs.readFileSync(path.join(coreRoot, 'bin/visual-check.mjs'), 'utf8'),
      fs.readFileSync(path.join(coreRoot, 'bin/mirofy.mjs'), 'utf8'),
    ].join('\n'),
  };
  const consumed = new Map();
  for (const [surface, text] of Object.entries(surfaces)) {
    for (const attr of new Set(text.match(ATTR) ?? [])) {
      if (!consumed.has(attr)) consumed.set(attr, []);
      consumed.get(attr).push(surface);
    }
  }
  return consumed;
}

// Attributes deliberately emitted with no consumer. Each needs a reason a
// reviewer can disagree with -- an empty allowlist entry is how this check
// gets neutered one attribute at a time.
/** @type {Record<string, string>} */
export const RESERVED = {
  'data-brand-mark': 'brand-mark badge provenance stamp; test/brand-marks.test.mjs asserts the preset/captured mark identity it records. No runtime surface reads it.',
  'data-brand-sha256': 'supply-chain provenance stamp for a captured brand asset; test/brand-marks.test.mjs asserts the sha256 of the fetched mark. No runtime surface reads it.',
  'data-brand-status': '"preset" vs "captured" brand-mark provenance, asserted by test/brand-marks.test.mjs. No runtime surface reads it.',
  'data-brand-title': 'brand-mark provenance title (source host/name), asserted by test/brand-marks.test.mjs. No runtime surface reads it.',
  'data-node-brand-source': 'node-level brand provenance (vs the badge group); test/brand-marks.test.mjs asserts it appears for captured marks with a live source URL. No runtime surface reads it.',
  'data-legend-baseline': 'legend swatch layout geometry (y baseline); test/legend-contract.test.mjs asserts swatches do not overlap. No runtime surface reads it.',
  'data-legend-width': 'legend swatch layout geometry (width); test/legend-contract.test.mjs asserts swatches do not overlap. No runtime surface reads it.',
  'data-legend-x': 'legend swatch layout geometry (x position); test/legend-contract.test.mjs asserts swatches do not overlap. No runtime surface reads it.',
  'data-legend-semantic-kind': 'legend swatch semantic-kind tag verified by test/legend-contract.test.mjs; distinct from the viewer-read data-legend-kind container attribute.',
  'data-segment-id': 'sequence-diagram segment index; test/layout-rules.test.mjs asserts segment labels stay ordered above lifelines. No runtime surface reads it.',
  'data-semantic-sigil': 'semantic icon kind; test/animation.test.mjs and test/geometry.test.mjs assert it. The viewer styles the sigil via its .semantic-sigil class, not this attribute.',
  'data-flow': 'not an attribute: a regex false-positive matching the prose substring "data-flow" ("data-flow diagram") in render-dataflow.mjs and i18n.mjs.',
  'data-brand-source': 'unclassified at P1a; see task report',
  'data-node-brand-id': 'unclassified at P1a; see task report',
  'data-node-brand-status': 'unclassified at P1a; see task report',
};
