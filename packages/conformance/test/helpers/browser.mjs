// Shared Chrome launcher for every browser-driven conformance suite
// (viewer.browser.test.mjs, accessibility.browser.test.mjs). Lifted out of
// viewer.browser.test.mjs unchanged (Task 8) so there is exactly one Chrome
// discovery path and one skip rule to audit -- a second, independently
// written launcher would mean two places "skipped is not passed" could
// quietly drift apart.
//
// Drives real headless Chrome via the same CDP client
// packages/core/bin/visual-check.mjs uses (ChromeVisualBrowser / findChrome).
import { pathToFileURL } from 'node:url';

// Imported with a non-literal specifier (deliberately, not for style) so
// that tsc --noEmit does not pull packages/core/bin/visual-check.mjs into
// its checked-files program: the root tsconfig.json excludes packages/core
// (it is not itself typechecked by this project), but TypeScript's "exclude"
// only governs root-file
// discovery -- a statically-resolvable relative import from an included
// file still drags the target file into the program and its own
// type errors would then fail our typecheck gate. A dynamically-computed
// specifier is invisible to that static resolution, so the module is loaded
// at runtime exactly as before with no change to behaviour, while the
// typecheck gate stays scoped to this project's own code.
const visualCheckUrl = new URL('../../../core/bin/visual-check.mjs', import.meta.url).href;
const { ChromeVisualBrowser, findChrome } = await import(visualCheckUrl);

// MIROFY_CHROME is the CI-provided path (set by the browser job from
// browser-actions/setup-chrome's output); findChrome() is a local-dev
// convenience that probes OS-standard install locations.
//
// CI rule: every GitHub-hosted runner ships a system Chrome (it is what
// findChrome() would happily find), but the `check` job's 12-way OS/Node
// matrix was never designed or validated to drive a real browser -- it has
// no MIROFY_CHROME of its own and no browser-provisioning step. Falling
// back to findChrome() there silently turned every `check` matrix leg into
// an unvalidated browser run. So findChrome() is used ONLY when
// process.env.CI is unset (i.e. a developer's own machine); when CI is set,
// this file requires MIROFY_CHROME to be explicit -- absent that, it is
// unset here and every caller defers its browser rows by id, on every OS,
// exactly as documented. The dedicated `browser` job is the only CI job
// that sets MIROFY_CHROME, so it is the only place these rows are proved.
const chrome = process.env.MIROFY_CHROME || (process.env.CI ? null : findChrome());

export function chromeAvailable() {
  return Boolean(chrome);
}

async function makeEvaluate(browser, sessionId) {
  // awaitPromise defaults true: CDP's Runtime.evaluate documents this flag
  // as having "no effect on non-promise values", so callers that evaluate a
  // synchronous expression (most of viewer.browser.test.mjs) see identical
  // behaviour, while callers whose expression returns a Promise (axe.run(...)
  // .then(...), in accessibility.browser.test.mjs) get it awaited without
  // having to say so at every call site.
  return async function evaluate(expression, awaitPromise = true) {
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
  };
}

// Low-level launch: starts one Chrome session and hands back the raw
// browser/session plus an `evaluate` and a `navigate` bound to it. Used
// directly by viewer.browser.test.mjs, which shares a single browser
// instance across many test() blocks (an uncaught-exception watcher must
// span the whole run, and several rows depend on state a prior test in the
// same file left behind) rather than opening a fresh page per test.
export async function launch() {
  if (!chrome) throw new Error('no Chrome available; call chromeAvailable() before launch()');
  const browser = new ChromeVisualBrowser(chrome);
  const sessionId = await browser.sessionPromise;

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

  const evaluate = await makeEvaluate(browser, sessionId);

  async function navigate(url) {
    const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId, 20000);
    const navigation = await browser.cdp.send('Page.navigate', { url }, sessionId);
    if (navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
    await loaded;
    // Let boot-time module IIFEs (Mirofy.guidedViews et al.) finish running.
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
  }

  return { browser, sessionId, evaluate, navigate };
}

// High-level convenience for a single-page check: launch a fresh Chrome
// session, navigate to `filePath` once, and hand back just {evaluate,
// close}. Used by accessibility.browser.test.mjs, which scans one rendered
// artifact per preset rather than driving one shared page through many
// interactions.
export async function openArtifact(filePath) {
  const { browser, evaluate, navigate } = await launch();
  await navigate(pathToFileURL(filePath).href);
  return {
    evaluate,
    async close() {
      await browser.close();
    },
  };
}
