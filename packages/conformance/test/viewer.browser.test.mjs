// Proves the four browser-deferred conformance rows (node finder, route
// probe, semantic lens, guided views) by driving the delivered artifact in a
// real headless Chrome via the same CDP client the ancestor's visual-check
// uses (`ChromeVisualBrowser` / `findChrome`, packages/core/bin/visual-check.mjs).
//
// Why this is more than a markup-presence check: an id or class string can
// survive in the template while the interactive behaviour behind it is
// broken (an event listener that throws, a selector that no longer matches,
// a panel that never toggles). Asserting `html.includes('node-finder')`
// proves none of that — it proves the renderer emitted a string. This test
// additionally clicks the real toolbar buttons (`btn-node-finder`,
// `btn-route-probe`, `btn-semantic-lens`) with `Element.click()` inside the
// live page, which dispatches a genuine `click` event through the same
// `addEventListener('click', ...)` handlers the template wires up, and
// asserts each panel's `hidden` state actually flips open then closed. It
// also checks that guided views (a load-time surface, not a click target —
// `Archify.guidedViews` unhides its panel during boot once the fixture
// carries guided-view data, see template.html's `panel.hidden = false`)
// is unhidden after the page finishes booting, and that no uncaught
// exception or console.error fires during boot or interaction.
//
// This is a real interaction proof for three of the four rows and a
// post-boot state proof for the fourth (guided views has no click surface
// of its own to drive). It is not a full accessibility or visual audit —
// it does not check focus trapping, keyboard operation, or layout; it
// proves the wiring is alive, not that the UX is polished.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderFixture } from '../src/render.mjs';

// Imported with a non-literal specifier (deliberately, not for style) so
// that `tsc --noEmit` does not pull packages/core/bin/visual-check.mjs into
// its checked-files program: the root tsconfig.json excludes packages/core
// (it is ancestor code, imported unmodified, and is not itself typechecked
// by this project), but TypeScript's `exclude` only governs root-file
// discovery — a *statically*-resolvable relative import from an included
// file still drags the target file into the program and its ancestor-only
// type errors would then fail our typecheck gate. A dynamically-computed
// specifier is invisible to that static resolution, so the module is loaded
// at runtime exactly as before with no change to behaviour, while the
// typecheck gate stays scoped to this project's own code.
const visualCheckUrl = new URL('../../core/bin/visual-check.mjs', import.meta.url).href;
const { ChromeVisualBrowser, findChrome } = await import(visualCheckUrl);

// PRODUCT_CHROME is the CI-provided path (set by the browser job from
// browser-actions/setup-chrome's output); findChrome() is the local-dev
// fallback that probes OS-standard install locations when the variable
// is not set.
const chrome = process.env.PRODUCT_CHROME || findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-browser-'));

// A toggle panel driven by a toolbar button: clicking the trigger opens it
// (hidden -> visible) and clicking it again closes it (visible -> hidden).
// node-finder, route-probe and semantic-lens all follow this exact pattern
// in template.html (each wires `trigger.addEventListener('click', toggle)`
// or an equivalent one-liner around its own `panel.hidden` flag).
const TOGGLE_SURFACES = [
  { name: 'node-finder', triggerId: 'btn-node-finder', panelId: 'node-finder' },
  { name: 'route-probe', triggerId: 'btn-route-probe', panelId: 'route-probe' },
  { name: 'semantic-lens', triggerId: 'btn-semantic-lens', panelId: 'semantic-lens' },
];

async function evaluate(browser, expression, awaitPromise = false) {
  const sessionId = await browser.sessionPromise;
  const response = await browser.cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Runtime.evaluate failed');
  }
  return response.result?.value;
}

async function navigate(browser, url) {
  const sessionId = await browser.sessionPromise;
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId, 20000);
  const navigation = await browser.cdp.send('Page.navigate', { url }, sessionId);
  if (navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
  await loaded;
  // Let boot-time module IIFEs (Archify.guidedViews et al.) finish running.
  await evaluate(browser, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
}

// Watches for uncaught exceptions and console.error calls for the lifetime
// of the test. Built on the same `cdp.waitFor` primitive visual-check.mjs
// exposes, re-armed in a loop; `stop()` flips a flag and the in-flight wait
// is rejected by `browser.close()`'s `cdp.failAll`, so nothing is left
// dangling once the test finishes.
function watchPageErrors(browser, sessionId) {
  const errors = [];
  let active = true;
  const loop = (async () => {
    while (active) {
      try {
        const params = await browser.cdp.waitFor('Runtime.exceptionThrown', sessionId, 30000);
        if (active) errors.push(params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || 'uncaught exception');
      } catch {
        break;
      }
    }
  })();
  const consoleLoop = (async () => {
    while (active) {
      try {
        const params = await browser.cdp.waitFor('Runtime.consoleAPICalled', sessionId, 30000);
        if (active && params.type === 'error') {
          errors.push((params.args || []).map((a) => a.value ?? a.description ?? '').join(' ') || 'console.error');
        }
      } catch {
        break;
      }
    }
  })();
  return { errors, stop: () => { active = false; }, settled: Promise.all([loop, consoleLoop]) };
}

test('viewer boots without console errors and its interactive surfaces actually toggle in real Chrome',
  { skip: chrome ? false : 'set PRODUCT_CHROME to run the real browser regression' },
  async () => {
    // production-deployment.architecture.json is the one fixture in this repo
    // whose `meta.views` is populated (see validation-gates.test.mjs 1.6) —
    // it is required to actually exercise guided views. web-app.architecture.json
    // has no views data, so guided-views would stay hidden regardless of
    // whether the feature works, which would make this an existence check
    // wearing an interaction-proof costume.
    const out = path.join(tmp, 'architecture.html');
    renderFixture('architecture', 'production-deployment.architecture.json', out);
    const html = fs.readFileSync(out, 'utf8');
    for (const id of ['node-finder', 'route-probe', 'semantic-lens', 'guided-views']) {
      assert.ok(html.includes(id), `viewer surface ${id} missing from the artifact markup`);
    }

    const browser = new ChromeVisualBrowser(chrome);
    let watcher;
    try {
      const sessionId = await browser.sessionPromise;
      watcher = watchPageErrors(browser, sessionId);

      await navigate(browser, pathToFileURL(out).href);

      // Guided views is a load-time surface (no toolbar toggle of its own):
      // Archify.guidedViews unhides its panel during boot once the fixture
      // carries guided-view data. Prove it actually happened, not just that
      // the markup exists.
      const guidedViewsHidden = await evaluate(browser, `document.getElementById('guided-views').hidden`);
      assert.equal(guidedViewsHidden, false, 'guided-views panel never left its boot-time hidden state');

      for (const surface of TOGGLE_SURFACES) {
        const before = await evaluate(browser, `document.getElementById(${JSON.stringify(surface.panelId)}).hidden`);
        assert.equal(before, true, `${surface.name}: expected closed before interaction`);

        const opened = await evaluate(browser, `(function () {
          document.getElementById(${JSON.stringify(surface.triggerId)}).click();
          return document.getElementById(${JSON.stringify(surface.panelId)}).hidden;
        })()`);
        assert.equal(opened, false, `${surface.name}: clicking ${surface.triggerId} did not open the panel`);

        const closed = await evaluate(browser, `(function () {
          document.getElementById(${JSON.stringify(surface.triggerId)}).click();
          return document.getElementById(${JSON.stringify(surface.panelId)}).hidden;
        })()`);
        assert.equal(closed, true, `${surface.name}: clicking ${surface.triggerId} again did not close the panel`);
      }

      watcher.stop();
      assert.deepEqual(watcher.errors, [], `viewer raised console errors/exceptions: ${JSON.stringify(watcher.errors)}`);
    } finally {
      watcher?.stop();
      await browser.close();
    }
  });
