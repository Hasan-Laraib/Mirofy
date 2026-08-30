// Row 4.14. 36-VISUAL-SYSTEM.md's V4 constraint: the six provenance classes
// must be distinguishable WITHOUT COLOUR, because provenance is a trust
// signal and ~8% of men have colour-vision deficiency. A treatment set that
// only differed by hue would satisfy a casual look and fail the requirement
// outright.
//
// So this measures the non-colour channels only -- stroke-dasharray,
// stroke-width, opacity -- read as COMPUTED styles from a real browser, not
// parsed out of the stylesheet. Parsing the CSS would prove a rule was
// written; it would not prove the rule wins the cascade, which is exactly
// where the print-palette bug lived in Task 2.
//
// Colour is deliberately not asserted here. It may reinforce, and reinforcing
// is fine; it must not carry, and the way to prove that is to ignore it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { coreRoot } from '../src/render.mjs';
import { PROVENANCE_CLASSES } from '../../core/renderers/shared/evidence-provenance.mjs';
import { chromeAvailable } from './helpers/browser.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-provenance-'));
const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito'];

// One node per class plus one edge per class, so every class is present in a
// single document and can be measured side by side under identical conditions.
function buildDocument(preset) {
  // A column of subjects on the left, one hub on the right, and nothing in
  // the corridor between them. The obvious grid layout puts an unrelated node
  // under an edge and trips the clean-flow gate, which is the gate doing its
  // job -- this document exists to be measured, not to be pretty.
  const components = PROVENANCE_CLASSES.map((cls, i) => ({
    id: `n${i}`,
    type: 'backend',
    label: cls,
    pos: [80, 60 + i * 110],
    size: [200, 60],
    provenance: cls,
  }));
  // Somewhere for every edge to land. It claims `authored` explicitly rather
  // than relying on the fallback, so this document's shape stays uniform;
  // the unclaimed path is covered by resolveProvenance's own unit tests.
  components.push({ id: 'hub', type: 'database', label: 'hub', pos: [560, 340], size: [180, 60], provenance: 'authored' });
  const connections = PROVENANCE_CLASSES.map((cls, i) => ({
    from: `n${i}`,
    to: 'hub',
    provenance: cls,
  }));
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Provenance treatments', visual_preset: preset },
    components,
    connections,
  };
}

function render(preset) {
  const input = path.join(tmp, `${preset}.json`);
  fs.writeFileSync(input, JSON.stringify(buildDocument(preset)));
  const out = path.join(tmp, `${preset}.html`);
  execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture', input, out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return out;
}

// Read the non-colour treatment of one edge per class.
const PROBE = `(function () {
  var out = {};
  var seen = {};
  var edges = document.querySelectorAll('path[data-provenance]');
  for (var i = 0; i < edges.length; i += 1) {
    var cls = edges[i].getAttribute('data-provenance');
    if (seen[cls]) continue;
    seen[cls] = true;
    var s = getComputedStyle(edges[i]);
    out[cls] = [s.strokeDasharray || 'none', s.strokeWidth, s.opacity].join(' | ');
  }
  return JSON.stringify(out);
})()`;

async function measure(browser, sid, file, theme) {
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sid, 30000);
  await browser.cdp.send('Page.navigate', { url: pathToFileURL(file).href }, sid);
  await loaded;
  await browser.cdp.send('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)})`,
  }, sid, 15000);
  const result = await browser.cdp.send('Runtime.evaluate',
    { expression: PROBE, returnByValue: true }, sid, 15000);
  return JSON.parse(result.result.value);
}

const skip = chromeAvailable() ? false : 'no Chrome; set MIROFY_CHROME to run the provenance treatment gate';

test('[4.14] the six provenance treatments are pairwise distinct without colour, in every preset and both themes', { skip }, async () => {
  const { ChromeVisualBrowser, findChrome } = await import(
    pathToFileURL(path.join(coreRoot, 'bin/visual-check.mjs')).href);
  const browser = new ChromeVisualBrowser(findChrome());
  const sid = await browser.sessionPromise;
  const collisions = [];
  try {
    for (const preset of PRESETS) {
      const file = render(preset);
      for (const theme of ['dark', 'light']) {
        const treatments = await measure(browser, sid, file, theme);

        const missing = PROVENANCE_CLASSES.filter((cls) => !treatments[cls]);
        assert.deepEqual(missing, [],
          `${preset}/${theme}: no edge carried data-provenance for ${missing.join(', ')} `
          + '-- the renderers are not emitting the resolved class');

        // Pairwise, so the failure names the colliding pair rather than
        // reporting that "the set is too small".
        for (let i = 0; i < PROVENANCE_CLASSES.length; i += 1) {
          for (let j = i + 1; j < PROVENANCE_CLASSES.length; j += 1) {
            const a = PROVENANCE_CLASSES[i];
            const b = PROVENANCE_CLASSES[j];
            if (treatments[a] === treatments[b]) {
              collisions.push(`${preset}/${theme}: ${a} and ${b} share "${treatments[a]}"`);
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(collisions, [],
    'provenance classes are not distinguishable without colour:\n  ' + collisions.join('\n  '));
});
