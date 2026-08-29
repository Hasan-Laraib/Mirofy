// Drives the delivered artifact in real headless Chrome via the same CDP
// client the ancestor's visual-check uses (ChromeVisualBrowser / findChrome,
// packages/core/bin/visual-check.mjs) and asserts, per harvested row, that
// the row's actual mechanism fires -- not just that its markup exists.
//
// Fix-round-1 history (read before touching row coverage or titles):
//   Round 0 shipped one test() that clicked 3 toggle panels plus a
//   guided-views boot check, then relied on matrix.mjs's pre-existing
//   mapping of ALL 14 browser rows (5.1-5.14) to this one file. Because
//   scripts/conformance.mjs counted a row "proved" whenever its proof FILE
//   exited 0, all 14 rows read as proved once PRODUCT_CHROME was set, even
//   though 10 of them had no assertion behind them at all. That is a false
//   proof -- the exact failure this suite exists to catch -- and it was
//   introduced by this task, not inherited from one.
//
// This revision fixes it two ways:
//   1. Every one of the 14 rows below now has a real, sound assertion
//      against the viewer's actual runtime behaviour (see the per-row
//      blocks). None were stretched: each fires a genuine DOM API a real
//      user/keyboard operation would trigger (click, focus, a query-string
//      or hash present at navigation time, or CDP media emulation for
//      print), and asserts a state change the template's own source
//      attributes/text expose (not a re-implementation of the assertion's
//      own expectation).
//   2. Each row is now its OWN node:test test() block with a title
//      prefixed by its row id (e.g. "[5.1] ..."), and matrix.mjs records
//      that exact title as testTitle. scripts/conformance.mjs verifies --
//      via `node --test --test-reporter=tap`, parsed for a passing ok line
//      matching that literal title -- that the SPECIFIC row's test passed,
//      not merely that the file as a whole exited 0. A regression that
//      adds a 15th row pointing at this file without its own passing
//      titled test is now caught by the accounting script itself, instead
//      of silently inheriting "proved" from its neighbours.
//
// Fixture note: production-deployment.architecture.json is the only
// fixture in this repo with BOTH meta.views populated (guided views /
// story beats, row 1.6) AND meta.animation: "trace" (Motion Governor's
// capability gate) -- using web-app.architecture.json for those rows would
// make the assertions pass regardless of whether the feature works, which
// is exactly the "existence check wearing an interaction-proof costume"
// failure mode this file exists to avoid.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderFixture } from '../src/render.mjs';

// Imported with a non-literal specifier (deliberately, not for style) so
// that tsc --noEmit does not pull packages/core/bin/visual-check.mjs into
// its checked-files program: the root tsconfig.json excludes packages/core
// (it is ancestor code, imported unmodified, and is not itself typechecked
// by this project), but TypeScript's "exclude" only governs root-file
// discovery -- a statically-resolvable relative import from an included
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
const skip = chrome ? false : 'set PRODUCT_CHROME to run the real browser regression';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-browser-'));

let browser;
let sessionId;
let watcher;
let fileUrl;

async function evaluate(expression, awaitPromise = false) {
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

async function navigate(url) {
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId, 20000);
  const navigation = await browser.cdp.send('Page.navigate', { url }, sessionId);
  if (navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
  await loaded;
  // Let boot-time module IIFEs (Archify.guidedViews et al.) finish running.
  await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
}

// Watches for uncaught exceptions and console.error calls for the whole
// run. Built on the same cdp.waitFor primitive visual-check.mjs exposes,
// re-armed in a loop; stop() flips a flag and the in-flight wait is
// rejected by browser.close()'s cdp.failAll, so nothing is left dangling
// once the run finishes.
function watchPageErrors() {
  const errors = [];
  let active = true;
  const exceptionLoop = (async () => {
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
  return { errors, stop: () => { active = false; }, settled: Promise.all([exceptionLoop, consoleLoop]) };
}

before(async () => {
  if (!chrome) return;
  const out = path.join(tmp, 'architecture.html');
  renderFixture('architecture', 'production-deployment.architecture.json', out);
  fileUrl = pathToFileURL(out).href;
  browser = new ChromeVisualBrowser(chrome);
  sessionId = await browser.sessionPromise;
  // A headless target does not dispatch real focus/focusin events to page
  // content until it has been brought to the front -- document.activeElement
  // updates regardless, but Intent Trace's focusin listener (row 5.4) never
  // fires without this, which silently looks like "the feature is broken"
  // rather than "the harness never gave the page real focus". Verified by
  // hand: identical focus() call, no bringToFront -> focusin never fires;
  // with bringToFront -> it fires every time.
  const targets = await browser.cdp.send('Target.getTargets');
  const page = targets.targetInfos?.find((target) => target.type === 'page');
  if (page) await browser.cdp.send('Target.activateTarget', { targetId: page.targetId });
  await browser.cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
  // A generous fixed viewport makes the space-dependent surfaces (the
  // radar minimap, which degrades to "compact" or "unavailable" under
  // tight space) deterministic across CI runners and local dev alike.
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  watcher = watchPageErrors();
});

after(async () => {
  if (!browser) return;
  watcher?.stop();
  await browser.close();
});

test('conformance markup: node-finder, route-probe, semantic-lens and guided-views ids exist in the rendered artifact', () => {
  const out = path.join(tmp, 'markup-check.html');
  renderFixture('architecture', 'production-deployment.architecture.json', out);
  const html = fs.readFileSync(out, 'utf8');
  for (const id of ['node-finder', 'route-probe', 'semantic-lens', 'guided-views']) {
    assert.ok(html.includes(id), `viewer surface ${id} missing from the artifact markup`);
  }
});

// ---------------------------------------------------------------------
// Navigation 1 -- toolbar toggles, camera, motion governor, presentation.
// These are independent of each other and of node-focus state, so they
// share one page load; each block returns the surface to its starting
// state before the next block runs.
// ---------------------------------------------------------------------

test('[5.9] guided views leave their boot-time hidden state once meta.views is populated', { skip }, async () => {
  await navigate(fileUrl);
  const hidden = await evaluate(`document.getElementById('guided-views').hidden`);
  assert.equal(hidden, false, 'guided-views panel never left its boot-time hidden state');
});

test('[5.2] Node Finder toggles open and closed via btn-node-finder', { skip }, async () => {
  const beforeState = await evaluate(`document.getElementById('node-finder').hidden`);
  assert.equal(beforeState, true, 'expected closed before interaction');
  const opened = await evaluate(`(function () {
    document.getElementById('btn-node-finder').click();
    return document.getElementById('node-finder').hidden;
  })()`);
  assert.equal(opened, false, 'clicking btn-node-finder did not open the panel');
  const closed = await evaluate(`(function () {
    document.getElementById('btn-node-finder').click();
    return document.getElementById('node-finder').hidden;
  })()`);
  assert.equal(closed, true, 'clicking btn-node-finder again did not close the panel');
});

test('[5.5] Route Probe toggles open and closed via btn-route-probe', { skip }, async () => {
  const beforeState = await evaluate(`document.getElementById('route-probe').hidden`);
  assert.equal(beforeState, true, 'expected closed before interaction');
  const opened = await evaluate(`(function () {
    document.getElementById('btn-route-probe').click();
    return document.getElementById('route-probe').hidden;
  })()`);
  assert.equal(opened, false, 'clicking btn-route-probe did not open the panel');
  const closed = await evaluate(`(function () {
    document.getElementById('btn-route-probe').click();
    return document.getElementById('route-probe').hidden;
  })()`);
  assert.equal(closed, true, 'clicking btn-route-probe again did not close the panel');
});

test('[5.7] Semantic Lens toggles open and closed via btn-semantic-lens', { skip }, async () => {
  const beforeState = await evaluate(`document.getElementById('semantic-lens').hidden`);
  assert.equal(beforeState, true, 'expected closed before interaction');
  const opened = await evaluate(`(function () {
    document.getElementById('btn-semantic-lens').click();
    return document.getElementById('semantic-lens').hidden;
  })()`);
  assert.equal(opened, false, 'clicking btn-semantic-lens did not open the panel');
  const closed = await evaluate(`(function () {
    document.getElementById('btn-semantic-lens').click();
    return document.getElementById('semantic-lens').hidden;
  })()`);
  assert.equal(closed, true, 'clicking btn-semantic-lens again did not close the panel');
});

test('[5.8] Semantic Radar (minimap) toggles open and closed via btn-overview-map', { skip }, async () => {
  const beforeState = await evaluate(`document.getElementById('overview-map').hidden`);
  assert.equal(beforeState, true, 'expected closed before interaction');
  const opened = await evaluate(`(function () {
    document.getElementById('btn-overview-map').click();
    return {
      hidden: document.getElementById('overview-map').hidden,
      expanded: document.getElementById('btn-overview-map').getAttribute('aria-expanded'),
    };
  })()`);
  assert.equal(opened.hidden, false, 'clicking btn-overview-map did not open the minimap (space-dependent placement -- see the fixed 1600x1000 viewport set in before())');
  assert.equal(opened.expanded, 'true', 'btn-overview-map did not report aria-expanded=true once open');
  const closed = await evaluate(`(function () {
    document.getElementById('btn-overview-map').click();
    return document.getElementById('overview-map').hidden;
  })()`);
  assert.equal(closed, true, 'clicking btn-overview-map again did not close the minimap');
});

test('[5.1] Pan/zoom/reset (Semantic Camera) actually changes the rendered svg scale', { skip }, async () => {
  const scaleBefore = await evaluate(`document.querySelector('.diagram-container > svg').getAttribute('data-view-scale')`);
  assert.equal(scaleBefore, '1', 'expected the camera to start at 1x scale');
  const scaleZoomedIn = await evaluate(`(function () {
    document.querySelector('[data-view="in"]').click();
    return document.querySelector('.diagram-container > svg').getAttribute('data-view-scale');
  })()`);
  assert.equal(scaleZoomedIn, '1.25', 'clicking the zoom-in control did not change data-view-scale');
  const scaleReset = await evaluate(`(function () {
    document.querySelector('[data-view="reset"]').click();
    return document.querySelector('.diagram-container > svg').getAttribute('data-view-scale');
  })()`);
  assert.equal(scaleReset, '1', 'clicking reset did not return the camera to 1x scale');
});

test('[5.11] Motion Governor flips html[data-motion] between live and still via btn-motion', { skip }, async () => {
  // production-deployment.architecture.json sets meta.animation:"trace",
  // which is Motion Governor's capability gate (Archify.motionGovernor
  // hides btn-motion entirely otherwise) -- this is why this row needs a
  // different fixture than the plain toggle-panel rows above.
  const capable = await evaluate(`document.getElementById('btn-motion').hidden === false`);
  assert.equal(capable, true, 'btn-motion stayed hidden -- the fixture is not motion-governor-capable (meta.animation:"trace" missing?)');
  const initial = await evaluate(`document.documentElement.getAttribute('data-motion')`);
  assert.ok(initial === 'live' || initial === 'still', `unexpected initial data-motion value: ${initial}`);
  const toggled = await evaluate(`(function () {
    document.getElementById('btn-motion').click();
    return document.documentElement.getAttribute('data-motion');
  })()`);
  assert.notEqual(toggled, initial, 'clicking btn-motion did not flip data-motion');
  const restored = await evaluate(`(function () {
    document.getElementById('btn-motion').click();
    return document.documentElement.getAttribute('data-motion');
  })()`);
  assert.equal(restored, initial, 'clicking btn-motion a second time did not restore the original data-motion value');
});

test('[5.12] Presentation Stage sets and clears html[data-present] via btn-present', { skip }, async () => {
  const beforeState = await evaluate(`document.documentElement.hasAttribute('data-present')`);
  assert.equal(beforeState, false, 'expected presentation stage to start inactive');
  const entered = await evaluate(`(function () {
    document.getElementById('btn-present').click();
    return document.documentElement.getAttribute('data-present');
  })()`);
  assert.equal(entered, 'true', 'clicking btn-present did not set data-present');
  const exited = await evaluate(`(function () {
    document.getElementById('btn-present').click();
    return document.documentElement.hasAttribute('data-present');
  })()`);
  assert.equal(exited, false, 'clicking btn-present again did not clear data-present');
});

// ---------------------------------------------------------------------
// Navigation 2 -- node-focus-dependent surfaces. Intent Trace, Focus +
// Passport and Reachability all read/write shared svg state
// (data-intent-trace-active, data-focus-active, data-reach-active), so
// this group gets its own fresh page load and runs in a fixed order.
// ---------------------------------------------------------------------

test('[5.4] Intent Trace lights up on real keyboard focus of a node', { skip }, async () => {
  await navigate(fileUrl);
  const beforeState = await evaluate(`document.querySelector('.diagram-container > svg').hasAttribute('data-intent-trace-active')`);
  assert.equal(beforeState, false, 'expected no intent trace before interaction');
  const focused = await evaluate(`(function () {
    document.querySelector('[data-node-id="api_b"]').focus();
    return {
      active: document.querySelector('.diagram-container > svg').getAttribute('data-intent-trace-active'),
      status: document.getElementById('intent-trace-status').textContent,
    };
  })()`);
  assert.equal(focused.active, 'api_b', 'focusing a node did not set data-intent-trace-active to that node id');
  assert.ok(focused.status && focused.status.length > 0, 'intent-trace-status was not announced on focus');
  const blurred = await evaluate(`(function () {
    document.querySelector('[data-node-id="api_b"]').blur();
    return document.querySelector('.diagram-container > svg').hasAttribute('data-intent-trace-active');
  })()`);
  assert.equal(blurred, false, 'blurring the node did not clear data-intent-trace-active');
});

test('[5.3] Focus + Semantic Passport opens on a real node click and reports the clicked node id', { skip }, async () => {
  const beforeState = await evaluate(`document.getElementById('focus-chip').hidden`);
  assert.equal(beforeState, true, 'expected the passport to start closed');
  const clicked = await evaluate(`(function () {
    // Diagram nodes are SVG <g> elements: SVGElement has no .click() method
    // (that is HTMLElement-only), so a real click is simulated the way a
    // pointer device produces one -- a dispatched MouseEvent -- rather than
    // a same-named method call that would silently no-op here.
    var node = document.querySelector('[data-node-id="api_a"]');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return {
      hidden: document.getElementById('focus-chip').hidden,
      id: document.getElementById('focus-id').textContent,
    };
  })()`);
  assert.equal(clicked.hidden, false, 'clicking a node did not open the semantic passport');
  assert.equal(clicked.id, 'api_a', 'the passport did not report the clicked node id');
});

test('[5.6] Authored Reachability (upstream) renders a node/link-count receipt on the focused node', { skip }, async () => {
  // Depends on the previous test having focused "api_a" -- reachability
  // requires exactly one active focus id.
  const beforeState = await evaluate(`document.getElementById('btn-reach-upstream').getAttribute('aria-pressed')`);
  assert.equal(beforeState, 'false', 'expected reachability to start inactive');
  const reached = await evaluate(`(function () {
    document.getElementById('btn-reach-upstream').click();
    return {
      pressed: document.getElementById('btn-reach-upstream').getAttribute('aria-pressed'),
      reachActive: document.querySelector('.diagram-container > svg').getAttribute('data-reach-active'),
      statusHidden: document.getElementById('focus-reach-status').hidden,
      statusText: document.getElementById('focus-reach-status').textContent,
    };
  })()`);
  assert.equal(reached.pressed, 'true', 'clicking btn-reach-upstream did not set aria-pressed');
  assert.equal(reached.reachActive, 'upstream', 'clicking btn-reach-upstream did not set data-reach-active="upstream"');
  assert.equal(reached.statusHidden, false, 'the reach status receipt stayed hidden');
  assert.ok(reached.statusText && reached.statusText.length > 0, 'the reach status receipt was empty');
});

test('[5.10] activating a guided-view chapter sets data-story-active and builds the Director Strip trail', { skip }, async () => {
  await evaluate(`document.getElementById('btn-focus-clear').click()`);
  const beforeState = await evaluate(`document.querySelector('.diagram-container > svg').hasAttribute('data-story-active')`);
  assert.equal(beforeState, false, 'expected no active story chapter before interaction');
  const activated = await evaluate(`(function () {
    document.querySelector('[data-guided-view-id="request-boundary"]').click();
    return {
      active: document.querySelector('.diagram-container > svg').getAttribute('data-story-active'),
      stops: document.getElementById('guided-view-trail').querySelectorAll('.guided-view-stop').length,
    };
  })()`);
  assert.equal(activated.active, 'request-boundary', 'clicking the chapter button did not set data-story-active');
  // "request-boundary" carries 5 focus ids in the fixture (meta.views[0].focus).
  assert.equal(activated.stops, 5, 'the Director Strip trail was not built with one stop per chapter focus id');
});

// ---------------------------------------------------------------------
// Navigation 3 -- embed mode. ?embed=1 must be present at navigation
// time (the boot script reads it from location.search before first
// paint), so this needs its own fresh load.
// ---------------------------------------------------------------------

test('[5.14a] embed mode (?embed=1) sets data-embed and actually hides the toolbar chrome', { skip }, async () => {
  await navigate(`${fileUrl}?embed=1`);
  const embed = await evaluate(`(function () {
    return {
      dataEmbed: document.documentElement.getAttribute('data-embed'),
      toolbarDisplay: getComputedStyle(document.querySelector('.toolbar')).display,
    };
  })()`);
  assert.equal(embed.dataEmbed, 'true', 'the ?embed=1 query param did not set data-embed="true"');
  // .toolbar has no "hidden" attribute of its own -- unlike the panels
  // above, its suppression is entirely the embed CSS rule, so this
  // actually distinguishes "embed mode works" from "the element always
  // starts hidden regardless".
  assert.equal(embed.toolbarDisplay, 'none', 'embed mode did not hide .toolbar');
});

// ---------------------------------------------------------------------
// Navigation 4 -- deep link restoration + print media. #focus= must be
// present at navigation time; print media emulation can then be layered
// on the same already-loaded page since it does not touch focus state.
// ---------------------------------------------------------------------

test('[5.13] a hash-based focus deep link restores the Semantic Passport on load', { skip }, async () => {
  await navigate(`${fileUrl}#focus=api_a`);
  const restored = await evaluate(`(function () {
    return {
      hidden: document.getElementById('focus-chip').hidden,
      id: document.getElementById('focus-id').textContent,
    };
  })()`);
  assert.equal(restored.hidden, false, 'the #focus=api_a deep link did not restore the semantic passport on load');
  assert.equal(restored.id, 'api_a', 'the restored passport did not report the linked node id');
});

test('[5.14b] print media emulation hides the toolbar chrome', { skip }, async () => {
  await browser.cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
  const toolbarDisplay = await evaluate(`getComputedStyle(document.querySelector('.toolbar')).display`);
  assert.equal(toolbarDisplay, 'none', 'emulated print media did not hide .toolbar');
  await browser.cdp.send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId);
});

test('viewer raised no uncaught exceptions or console.error calls during the whole run', { skip }, async () => {
  // errors[] is appended to synchronously as each watched CDP event
  // resolves during the tests above, so anything that already happened is
  // already in the array by the time this final test runs -- there is
  // nothing further to wait for. (The still-pending waitFor for a *future*
  // event is torn down by browser.close() in after(), not here, so this
  // check stays fast instead of idling out to its 30s timeout.)
  watcher.stop();
  assert.deepEqual(watcher.errors, [], `viewer raised console errors/exceptions: ${JSON.stringify(watcher.errors)}`);
});
