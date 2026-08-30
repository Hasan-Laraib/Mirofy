// Row 5.19. 37-ENGINEERING-STANDARDS.md commits to an accessibility floor;
// this is the check that the commitment is kept rather than restated.
// Runs against a real rendered artifact in a real browser, in every preset,
// because a contrast failure that only appears in `editorial` is still a
// failure.
//
// What this gate actually enforces, precisely:
//   1. Zero `serious`/`critical` entries in axe-core's `violations` bucket.
//   2. axe's `incomplete` bucket (findings axe could not resolve either
//      way -- neither pass nor fail) never grows a NEW rule id beyond the
//      documented EXPECTED_INCOMPLETE list below. Each entry there is a
//      case axe genuinely cannot compute (see its own reason), not a
//      violation this gate is hiding -- asserting the bucket is *empty*
//      would make the gate permanently red (axe cannot resolve these no
//      matter what the markup does) and it would be disabled within a
//      task. Node counts for every incomplete id are always printed as a
//      test diagnostic (not just on failure), so a jump in the number of
//      affected elements -- e.g. 61 nodes becoming 200 -- is visible in
//      the test output even though it does not by itself fail the gate.
//   3. Nothing else. Three `moderate`-impact violations are real,
//      currently present in every preset, and deliberately left
//      unenforced here because this row's floor is serious/critical only:
//      `heading-order` (1 node -- a `<h3>` inside a `.card` that follows a
//      lower heading level than its nesting implies), `landmark-one-main`
//      (1 node -- the document has no `<main>` landmark), and `region`
//      (4 nodes -- `.toolbar`, `.header`, `.diagram-nav`, `.cards` are not
//      contained by a landmark). Seen, not silently missed; not fixed by
//      this gate.
//
// Boot-time boundary: this gate opens the rendered artifact in a real
// browser and lets its boot-time JS run before scanning (openArtifact
// waits for a double-rAF settle) -- so it only ever sees the *post-boot*
// DOM. packages/core/renderers/shared/cli.mjs's svgRootAttrs() still
// statically emits role="img" on the diagram svg while focusNodeAttrs()
// emits real tabindex="0" role="button" nodes -- the WCAG 4.1.2 conflict
// this row's fix (packages/viewer/src/js/07-focus.js, Task 8 fix round 1)
// corrects only at viewer boot (Mirofy.focus sets role="graphics-document"
// once JS runs). With JavaScript disabled, before boot completes, or for
// any non-viewer consumer of the renderer's raw markup, the defect is
// still present in the static HTML -- and this gate structurally cannot
// see it, because it never inspects pre-boot markup. Recorded as P1b
// debt, not fixed here (see task-8-report.md).
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

// Every entry here is a rule id axe-core reports as `incomplete` (it could
// not determine pass or fail) for every one of the five presets, verified
// by hand against a live scan before being added -- not asserted empty,
// per the header comment above. A rule id appearing in `incomplete` that
// is NOT in this map fails the gate below; that is the point -- a new
// undeterminable finding gets triaged by a person before it can hide
// behind this list, rather than riding in silently.
const EXPECTED_INCOMPLETE = {
  'color-contrast':
    'axe cannot compute a background colour for the toolbar chrome: the ' +
    'affected elements sit over a CSS gradient (or are overlapped by ' +
    'another painted element), and axe\'s contrast check requires a single ' +
    'flat background colour to sample. https://dequeuniversity.com/rules/axe/4.10/color-contrast',
  'aria-valid-attr-value':
    'aria-controls on the preset/export toggle buttons (aria-haspopup) ' +
    'points at a real element (#preset-menu / #export-menu) that exists in ' +
    'the DOM but is closed (hidden) at scan time, since neither menu opens ' +
    'until its button is activated; axe cannot confirm an ID reference ' +
    'resolves to a genuine, present target while that target is hidden. ' +
    'https://dequeuniversity.com/rules/axe/4.10/aria-valid-attr-value',
};

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
        axe.run(document, { resultTypes: ['violations', 'incomplete'] }).then(function (r) {
          return JSON.stringify({
            violations: r.violations.map(function (v) {
              return { id: v.id, impact: v.impact, nodes: v.nodes.length };
            }),
            incomplete: r.incomplete.map(function (v) {
              return { id: v.id, impact: v.impact, nodes: v.nodes.length };
            }),
          });
        })
      `);
      const parsed = JSON.parse(results);

      const violations = parsed.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      assert.deepEqual(violations, [], `axe violations in ${preset}:\n${JSON.stringify(violations, null, 2)}`);

      // Always printed, pass or fail, so a node-count jump on an already-
      // acknowledged incomplete id (e.g. color-contrast 61 -> 200) is
      // visible in the test output rather than only surfacing when a
      // brand-new rule id appears.
      for (const item of parsed.incomplete) {
        t.diagnostic(`axe incomplete in ${preset}: ${item.id} (${item.impact}, ${item.nodes} node(s))`);
      }

      const unexpectedIncomplete = parsed.incomplete.filter((item) => !(item.id in EXPECTED_INCOMPLETE));
      assert.deepEqual(
        unexpectedIncomplete,
        [],
        `axe reported a new, untriaged incomplete rule in ${preset} (add it to EXPECTED_INCOMPLETE with a ` +
          `written reason, or fix the underlying markup if it is resolvable):\n${JSON.stringify(unexpectedIncomplete, null, 2)}`,
      );
    } finally {
      await page.close();
    }
  });
}

// The axe rows above open the artifact in a browser, so they inspect the
// POST-BOOT dom -- after 07-focus.js has had a chance to correct the role.
// That is the wrong surface for this defect: it cannot see what the renderer
// actually wrote. This test reads the rendered HTML directly, needs no Chrome,
// and therefore checks what a JS-disabled reader and every non-viewer consumer
// of the artifact really receive.
test('the rendered SVG declares a role that permits interactive descendants, before any JS runs (5.19)', () => {
  const out = path.join(tmp, 'static-role.html');
  renderFixture('architecture', 'web-app.architecture.json', out);
  const html = fs.readFileSync(out, 'utf8');
  const svgTag = html.match(/<svg\b[^>]*class="[^"]*diagram[^"]*"[^>]*>/)?.[0]
    ?? html.match(/<svg\b[^>]*>/)?.[0] ?? '';
  assert.ok(svgTag, 'no <svg> element found in the rendered artifact');
  assert.doesNotMatch(svgTag, /role="img"/,
    'the diagram svg declares role="img" while its nodes carry tabindex="0" role="button"; '
    + 'role="img" forbids interactive descendants (WCAG 4.1.2). This is the STATIC markup, '
    + 'so it is what a JS-disabled reader and any non-viewer consumer actually get.');
  assert.match(svgTag, /role="graphics-document"/);
});
