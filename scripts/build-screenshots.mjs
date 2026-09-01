// @ts-check
// Captures the README's capability screenshots by DRIVING THE REAL VIEWER.
//
//   node scripts/build-screenshots.mjs
//
// Every image under assets/ that shows the viewer doing something is produced
// here, from a real rendered artifact, through real clicks in real Chrome. None
// of them are mock-ups, none are hand-composed, and none can show a panel that
// the shipped viewer would not actually open -- if a control is renamed or a
// panel stops opening, this script fails instead of quietly reusing yesterday's
// picture. That is the whole reason it exists rather than a folder of PNGs
// somebody dragged in once.
//
// It is deliberately NOT part of `npm run check`: it needs a browser, and the
// 12-way check matrix has no browser provisioning (see the CI rule in
// packages/conformance/test/helpers/browser.mjs). Run it by hand when the
// viewer's surfaces change, and commit what it writes.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(repoRoot, 'assets');

const helperUrl = new URL('../packages/conformance/test/helpers/browser.mjs', import.meta.url).href;
const { chromeAvailable, launch } = await import(helperUrl);

if (!chromeAvailable()) {
  console.error('build-screenshots: no Chrome. Set MIROFY_CHROME to its path and rerun.');
  process.exit(1);
}

// A real shipped example rather than this repository's own package graph. The
// hero already shows Mirofy looking at itself; these are meant to answer "what
// will this look like on MY system", and a service architecture answers that
// better than twelve boxes all labelled `package`.
const SOURCE = 'packages/core/examples/web-app.architecture.json';

// The Passport shot comes from a DIFFERENT artifact: this repository, scanned.
// The authored example has no source citations, so its passport has no
// provenance row -- a picture of the evidence panel with the evidence missing,
// illustrating the one claim it exists to prove by not showing it.
const SELF = 'scan/diagram.json';

const cli = path.join(repoRoot, 'packages/core/bin/mirofy.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-shots-'));

function render(source, file, quality, extra = []) {
  const out = path.join(tmp, file);
  execFileSync(process.execPath, [cli, 'render', 'architecture',
    path.join(repoRoot, source), out, '--quality', quality, ...extra],
    { stdio: 'inherit' });
  return out;
}

const artifact = render(SOURCE, 'viewer.html', 'showcase');
// standard, not showcase: this repository's own package graph does not pass the
// showcase Proper Crossing Gate (row 3.1) -- conformance fans out to nine
// packages and those edges cross the cli-to-viewer run. That is the gate doing
// its job on a real graph, not something to work around here, and it is why
// assets/self-model.svg ships at standard too.
const selfArtifact = render(SELF, 'self.html', 'standard', ['--repo-root', repoRoot]);

const { browser, sessionId, evaluate, navigate } = await launch();

// 1440x860 at 2x: wide enough that no panel is placed in its degraded
// "compact" form, and retina-sharp on the reader's side. Downscaled to 1x on
// the way out, because a README image is displayed at about 900px and shipping
// four 2880px PNGs would put more weight in git than the pictures are worth.
await browser.cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 860, deviceScaleFactor: 2, mobile: false,
}, sessionId);

/** Run a step, fail loudly if its own assertion about the viewer is false. */
async function shot(name, caption, script, page = artifact, keep = null, viewport = null) {
  if (viewport) {
    await browser.cdp.send('Emulation.setDeviceMetricsOverride',
      { ...viewport, deviceScaleFactor: 2, mobile: false }, sessionId);
  }
  await navigate(pathToFileURL(page).href);
  const state = await evaluate(script);
  if (!state || state.error) {
    throw new Error(`build-screenshots: ${name}: ${state?.error ?? 'the step reported nothing'}`);
  }
  // Two frames so any opening transition has finished painting; a screenshot
  // taken mid-transition is how you end up shipping a half-open panel.
  await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', true);
  const { data } = await browser.cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
  }, sessionId);
  if (viewport) {
    // Put the shared viewport back, or every later shot inherits this one's.
    await browser.cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 860, deviceScaleFactor: 2, mobile: false }, sessionId);
  }
  const out = path.join(assets, `viewer-${name}.png`);
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  if (keep) crop(out, keep);
  downscale(out);
  console.log(`  ${name.padEnd(9)} ${caption}`);
  return { name, caption, state };
}

// Captured at 2x for sharpness, shipped at 1x-and-a-half. The comment above
// promised this and the first version did not do it: four 2880px frames were
// 1.4 MB of git history for images a README displays at about 900px.
// The hero is a banner, so it is cropped to the toolbar-and-diagram band: the
// artifact's closing note cards are good content but they make the frame tall,
// and a hero that pushes the first sentence below the fold is working against
// the page.
function crop(file, keep) {
  const program = 'import sys;from PIL import Image;'
    + 'im=Image.open(sys.argv[1]);k=float(sys.argv[2]);'
    + 'im.crop((0,0,im.width,int(im.height*k))).save(sys.argv[1],optimize=True)';
  execFileSync('python', ['-c', program, file, String(keep)], { stdio: 'ignore' });
}

function downscale(file) {
  // One line on purpose: a multi-line -c program needs newline escaping, and
  // this file has already been bitten once by an escape that collapsed.
  // Resize, then reduce to a 256-colour palette. These are screenshots of flat
  // UI -- solid fills, hairlines and mono text -- which is the exact content
  // palette PNG was made for: it cuts them by about 60% with no visible change
  // at any zoom worth looking at. Without it the five captures pushed the
  // tracked tree to 6.1 MB against a 6 MB budget, and the honest fix for that
  // is smaller pictures, not a bigger budget.
  const program = 'import sys;from PIL import Image;'
    + 'im=Image.open(sys.argv[1]).convert("RGB");w=1280;'
    + 'im=im.resize((w,round(im.height*w/im.width)),Image.LANCZOS);'
    + 'im.quantize(colors=256,method=0).save(sys.argv[1],optimize=True)';
  try {
    execFileSync('python', ['-c', program, file], { stdio: 'ignore' });
  } catch {
    console.warn(`  (could not downscale ${path.basename(file)}; shipping it at capture size)`);
  }
}

const steps = [];
try {
  // THE HERO. The self-model was the hero and it is grey for an honest reason:
  // all twelve of its components are `config-derived` `package`, identical on
  // every dimension the model records, so there is nothing for colour to mean.
  // This artifact has six real kinds, so its colour carries the rule the README
  // states -- and the Lens is open showing exactly that mapping, which is the
  // one panel that makes the colour legible rather than decorative.
  steps.push(await shot('hero', 'The hero: a real artifact, full colour', `(function () {
    // No panel open. The first version opened the Semantic Lens and its card
    // sat over the right half of the diagram, hiding five of the ten nodes --
    // a hero of a system you cannot see. Interactivity is shown by the four
    // captures further down; this frame's job is the diagram itself.
    // The renderer paints kind onto the node classes (c-cloud, c-backend,
    // c-database, ...). Counting those is the honest measure of "the colour
    // means something"; there is no element with a legend class to count --
    // the legend is drawn inside the SVG.
    var STRUCTURAL = { 'c-grid': 1, 'c-mask': 1, 'c-region': 1 };
    var kinds = {};
    [].slice.call(document.querySelectorAll('svg [class]')).forEach(function (el) {
      var raw = el.getAttribute('class') || '';
      raw.split(' ').forEach(function (token) {
        if (/^c-[a-z-]+$/.test(token) && !STRUCTURAL[token]) kinds[token] = 1;
      });
    });
    var names = Object.keys(kinds);
    // A hero whose colour means nothing would argue against the rule the README
    // states two sections later. This is exactly why the self-model is not the
    // hero any more: every one of its nodes is the same kind.
    if (names.length < 4) {
      return { error: 'only ' + names.length + ' kinds carry colour here (' + names.join(', ') + ')' };
    }
    return { kinds: names.length, roles: names.sort() };
  })()`, artifact, 0.80, { width: 1680, height: 900 }));

  // Search. Typing a real query and reporting how many nodes matched, so the
  // shot cannot be of an empty finder that merely happens to be open.
  steps.push(await shot('search', 'Node Finder, filtered by a typed query', `(function () {
    var btn = document.getElementById('btn-node-finder');
    if (!btn) return { error: 'btn-node-finder is gone' };
    btn.click();
    var panel = document.getElementById('node-finder');
    if (!panel || panel.hidden) return { error: 'the finder did not open' };
    // The viewer's own ids, not a scrape of the panel's text. Scraping missed
    // the status line entirely and reported "no tally" for a finder that was
    // working perfectly.
    var input = document.getElementById('node-finder-input');
    var status = document.getElementById('node-finder-status');
    var results = document.getElementById('node-finder-results');
    if (!input || !status || !results) return { error: 'the finder lost one of its parts' };
    var all = results.children.length;
    input.focus();
    input.value = 'api';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    var shown = results.children.length;
    // A picture of an unfiltered list is not a picture of search.
    if (shown === 0) return { error: 'the query "api" matched nothing' };
    if (shown >= all) return { error: 'the query "api" narrowed nothing: ' + status.textContent };
    return { showing: status.textContent.trim(), from: all };
  })()`));

  // Focus + Semantic Passport: the differentiator. The step asserts the
  // passport actually carries provenance, not just that a panel appeared.
  steps.push(await shot('passport', 'A focused node and its Semantic Passport', `(function () {
    var nodes = document.querySelectorAll('[data-node-hit-key], [data-node-id]');
    if (!nodes.length) return { error: 'no node hit targets in the artifact' };
    // The node whose passport carries the most evidence links, so the shot
    // shows citations rather than an empty evidence list.
    var best = null;
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      var links = document.querySelectorAll('#focus-evidence-links a').length;
      if (!best || links > best.links) best = { index: i, links: links };
    }
    var clear = document.getElementById('btn-focus-clear');
    if (clear && !clear.hidden) clear.click();
    nodes[best.index].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    var provenance = document.getElementById('focus-provenance');
    var repository = document.getElementById('focus-repository');
    var label = document.getElementById('focus-label');
    if (!label || !label.textContent.trim()) return { error: 'nothing became focused' };
    var prov = provenance && !provenance.hidden ? provenance.textContent.trim() : null;
    // The whole point of this picture. Without it there is nothing to show.
    if (!prov) return { error: 'the passport for ' + label.textContent.trim() + ' carries no provenance' };
    return {
      node: label.textContent.trim(),
      provenance: prov,
      repository: repository && !repository.hidden ? repository.textContent.trim() : null,
      citations: best.links,
    };
  })()`, selfArtifact));

  // Authored reachability: click a node, then trace upstream. The path lights
  // and everything off it dims -- the most visually distinctive thing here.
  steps.push(await shot('trace', 'Authored reachability traced upstream', `(function () {
    var nodes = document.querySelectorAll('[data-node-hit-key], [data-node-id]');
    if (!nodes.length) return { error: 'no node hit targets in the artifact' };
    // Pick the node with the DEEPEST upstream, not merely the first that has
    // any. The first node in document order was a source with none (the shot
    // was then indistinguishable from the passport one), and the first with
    // any reached exactly one hop, which lights almost nothing. The point of
    // this picture is a path across the diagram.
    var best = null;
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      var count = document.getElementById('focus-reach-upstream-count');
      var reach = count ? parseInt(count.textContent.trim(), 10) : 0;
      var btn = document.getElementById('btn-reach-upstream');
      if (!reach || !btn || btn.hidden || btn.disabled) continue;
      if (!best || reach > best.reach) best = { index: i, reach: reach };
    }
    if (best) {
      // The survey above left the LAST node focused. If that is also the best
      // one, clicking it again toggles the selection off and the shot is of an
      // empty passport with nothing traced -- which is what happened. Clear
      // first, then select.
      var clear = document.getElementById('btn-focus-clear');
      if (clear && !clear.hidden) clear.click();
      nodes[best.index].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      var up = document.getElementById('btn-reach-upstream');
      var reach = best.reach;
      up.click();
      var label = document.getElementById('focus-label');
      var status = document.getElementById('focus-reach-status');
      var named = label ? label.textContent.trim() : '';
      var said = status ? status.textContent.trim() : '';
      // Refuse to save a picture of a trace that is not showing.
      if (!named) return { error: 'nothing ended up focused after the trace' };
      if (!said) return { error: 'the trace reported no status for ' + named };
      return { node: named, upstream: reach, status: said };
    }
    return { error: 'no node in this artifact reported any upstream reach' };
  })()`));

  // Semantic Lens: the surface that makes provenance visible across the whole
  // diagram at once rather than one node at a time.
  steps.push(await shot('lens', 'The Semantic Lens over the whole diagram', `(function () {
    var btn = document.getElementById('btn-semantic-lens');
    if (!btn) return { error: 'btn-semantic-lens is gone' };
    btn.click();
    var panel = document.getElementById('semantic-lens');
    if (!panel || panel.hidden) return { error: 'the lens did not open' };
    return { controls: panel.querySelectorAll('button, input, select').length };
  })()`));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nbuild-screenshots: ${steps.length} captured from ${SOURCE}`);
for (const step of steps) console.log(`  ${step.name}: ${JSON.stringify(step.state)}`);
