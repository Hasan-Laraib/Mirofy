// Row 5.19. 37-ENGINEERING-STANDARDS.md commits to an accessibility floor;
// this is the check that the commitment is kept rather than restated.
// Runs against a real rendered artifact in a real browser, in every preset,
// because a contrast failure that only appears in `editorial` is still a
// failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixturesRoot, renderFixture } from '../src/render.mjs';
import { openArtifact, chromeAvailable } from './helpers/browser.mjs';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-a11y-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito'];

for (const preset of PRESETS) {
  test(`[5.19] axe-core reports no serious or critical violations in the ${preset} preset`, async (t) => {
    if (!chromeAvailable()) {
      t.skip('no Chrome; set MIROFY_CHROME to run the accessibility gate');
      return;
    }
    const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));
    source.meta = { ...source.meta, visual_preset: preset };
    const patched = path.join(tmp, `${preset}.source.json`);
    fs.writeFileSync(patched, JSON.stringify(source));
    const out = path.join(tmp, `${preset}.html`);
    renderFixture('architecture', patched, out);

    const page = await openArtifact(out);
    try {
      await page.evaluate(axeSource);
      const results = await page.evaluate(`
        axe.run(document, { resultTypes: ['violations'] }).then(function (r) {
          return JSON.stringify(r.violations.map(function (v) {
            return { id: v.id, impact: v.impact, nodes: v.nodes.length };
          }));
        })
      `);
      const violations = JSON.parse(results).filter((v) => v.impact === 'serious' || v.impact === 'critical');
      assert.deepEqual(violations, [], `axe violations in ${preset}:\n${JSON.stringify(violations, null, 2)}`);
    } finally {
      await page.close();
    }
  });
}
