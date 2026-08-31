// @ts-check
// Builds the public proof site into site/.
//
//   node scripts/build-site.mjs
//
// The README says "every box citing the manifest it came from, every arrow
// citing the import lines that produced it" and then shows a PNG. A reader
// cannot check a PNG. This produces the pages where they can: the repository's
// own architecture, built by the pipeline the README documents, plus every
// diagram type in every preset.
//
// NOTHING HERE IS COMMITTED. site/ is git-ignored and built in CI on each push
// (.github/workflows/pages.yml), which is what row 7.1 -- no generated
// artifacts in git -- requires. The site is therefore always produced by the
// code at the commit it describes, and cannot quietly describe an older one.
//
// The self-model step runs the real scan pipeline rather than a fixture, so if
// scanning this repository ever breaks, THIS BUILD FAILS. That is deliberate:
// a proof site that silently falls back to a canned diagram is an advert.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, renderFixture, fixturesRoot } from '../packages/conformance/src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const siteRoot = path.join(repoRoot, 'site');
const cli = path.join(repoRoot, 'packages/core/bin/mirofy.mjs');
const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito', 'meridian'];

/** @param {string[]} argv @param {string} label */
function run(argv, label) {
  try {
    return execFileSync(process.execPath, argv, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    console.error(`build-site: ${label} failed`);
    console.error(String(error.stderr || error.stdout || error.message).slice(0, 2000));
    process.exit(1);
  }
}

fs.rmSync(siteRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(siteRoot, 'gallery'), { recursive: true });
fs.mkdirSync(path.join(siteRoot, 'assets'), { recursive: true });

// ---------------------------------------------------------------------------
// The hero: this repository, read by itself
// ---------------------------------------------------------------------------
console.log('build-site: scanning this repository');
run([path.join(repoRoot, 'packages/scanner/bin/scan.mjs')], 'scan');
run([path.join(repoRoot, 'packages/model/bin/model.mjs'), '--from-graph',
  '--graph', path.join(repoRoot, 'scan/evidence-graph.json')], 'model');
run([path.join(repoRoot, 'packages/compile/bin/compile.mjs')], 'compile');
run([path.join(repoRoot, 'packages/layout/bin/layout.mjs')], 'layout');
run([cli, 'render', 'architecture', path.join(repoRoot, 'scan/diagram.json'),
  path.join(siteRoot, 'self-model.html'), '--repo-root', repoRoot], 'render self-model');

const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scan/evidence-graph.json'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scan/model.json'), 'utf8'));
const view = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scan/view.json'), 'utf8'));
const counts = {
  facts: (graph.facts ?? []).length,
  gaps: (graph.gaps ?? []).length,
  components: (model.components ?? []).length,
  relationships: (model.relationships ?? []).length,
  drawn: (view.components ?? view.nodes ?? []).length,
};
console.log(`build-site: self-model — ${counts.facts} facts, ${counts.gaps} gaps, `
  + `${counts.components} components, ${counts.drawn} drawn`);

// ---------------------------------------------------------------------------
// Every type, in every preset
// ---------------------------------------------------------------------------
const scratch = fs.mkdtempSync(path.join(siteRoot, '.src-'));
/** @type {Array<{mode: string, preset: string, file: string, bytes: number}>} */
const made = [];
for (const { mode, fixture } of MODES) {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture), 'utf8'));
  for (const preset of PRESETS) {
    const patched = { ...source, meta: { ...source.meta, visual_preset: preset } };
    delete patched.meta.output;
    const src = path.join(scratch, `${mode}-${preset}.json`);
    fs.writeFileSync(src, JSON.stringify(patched));
    const file = `${mode}--${preset}.html`;
    renderFixture(mode, src, path.join(siteRoot, 'gallery', file));
    made.push({ mode, preset, file, bytes: fs.statSync(path.join(siteRoot, 'gallery', file)).size });
  }
}
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`build-site: ${made.length} gallery artifacts`);

for (const asset of ['logo.png', 'logo-dark.png', 'pipeline.svg']) {
  fs.copyFileSync(path.join(repoRoot, 'assets', asset), path.join(siteRoot, 'assets', asset));
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
})();

const groups = MODES.map(({ mode }) => {
  const cards = made.filter((entry) => entry.mode === mode).map((entry) => (
    `      <a class="card" href="gallery/${esc(entry.file)}">`
    + `<span class="p">${esc(entry.preset)}</span>`
    + `<span class="m">${(entry.bytes / 1024).toFixed(0)} KB</span></a>`
  )).join('\n');
  return `    <h3>${esc(mode)}</h3>\n    <div class="grid">\n${cards}\n    </div>`;
}).join('\n\n');

const index = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mirofy — every artifact on this page is generated</title>
<meta name="description" content="Mirofy's own architecture, derived from its own source code, plus every diagram type in every preset. All generated, none mocked up.">
<style>
  :root {
    --bg: #ffffff; --fg: #16181d; --dim: #5c6672; --line: #dfe3e8;
    --accent: #2f56d3; --accent-2: #7c3aed; --card: #f8f9fb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --fg: #e9eef6; --dim: #99a3b3; --line: #232a35;
      --accent: #7aa2ff; --accent-2: #b98bff; --card: #141a23;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 980px; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  header { text-align: center; }
  header img.logo { width: 300px; max-width: 76%; height: auto; }
  .tag { color: var(--dim); font-size: 1.05rem; margin: .4rem 0 0; }
  h2 { font-size: 1.35rem; margin: 3rem 0 .4rem; }
  h3 { font-size: .82rem; text-transform: uppercase; letter-spacing: .09em;
       color: var(--dim); margin: 2rem 0 .7rem; font-weight: 600; }
  p { margin: .7rem 0; }
  a { color: var(--accent); }
  .lede { color: var(--dim); }
  .hero {
    display: block; margin: 1.5rem 0 0; padding: 1.4rem 1.5rem;
    border: 1px solid var(--line); border-radius: 12px; background: var(--card);
    text-decoration: none; color: inherit;
  }
  .hero:hover { border-color: var(--accent); }
  .hero strong { font-size: 1.1rem; }
  .hero .go { color: var(--accent); font-weight: 600; }
  .stats { display: flex; flex-wrap: wrap; gap: 1.6rem; margin: 1rem 0 0; padding: 0; list-style: none; }
  .stats li { font-variant-numeric: tabular-nums; }
  .stats b { display: block; font-size: 1.5rem; line-height: 1.1; }
  .stats span { color: var(--dim); font-size: .8rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: .55rem; }
  a.card {
    display: flex; justify-content: space-between; align-items: baseline; gap: .5rem;
    padding: .65rem .8rem; border: 1px solid var(--line); border-radius: 8px;
    text-decoration: none; color: inherit; background: var(--card);
  }
  a.card:hover { border-color: var(--accent-2); }
  .card .p { font-weight: 600; font-size: .92rem; }
  .card .m { color: var(--dim); font-size: .78rem; font-variant-numeric: tabular-nums; }
  footer { margin-top: 3.5rem; padding-top: 1.2rem; border-top: 1px solid var(--line);
           color: var(--dim); font-size: .85rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; }
  img.pipeline { width: 100%; height: auto; margin: 1.5rem 0 0; }
</style>
<div class="wrap">
  <header>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
      <img class="logo" src="assets/logo.png" alt="Mirofy">
    </picture>
    <p class="tag">Diagrams of your system that cite their sources — and say what they could not see.</p>
  </header>

  <h2>Start here</h2>
  <p class="lede">
    This is Mirofy's own architecture, produced by scanning this repository with
    Mirofy. Click a node to open its Semantic Passport and read the file, line
    range and commit the relationship came from.
  </p>

  <a class="hero" href="self-model.html">
    <strong>Mirofy, mapped by Mirofy</strong> — <span class="go">open it →</span>
    <ul class="stats">
      <li><b>${counts.facts}</b><span>facts</span></li>
      <li><b>${counts.gaps}</b><span>recorded gaps</span></li>
      <li><b>${counts.components}</b><span>components derived</span></li>
      <li><b>${counts.relationships}</b><span>relationships</span></li>
      <li><b>${counts.drawn}</b><span>drawn in this view</span></li>
    </ul>
  </a>

  <p class="lede">
    ${counts.components - counts.drawn} component(s) were left out of the drawn view on purpose, and the
    artifact records which and why. ${counts.gaps} file(s) could not be read, and
    they are counted rather than skipped — an empty answer here means
    <em>not found</em>, never <em>does not exist</em>.
  </p>

  <img class="pipeline" src="assets/pipeline.svg" alt="scan to model to compile to layout to render">

  <h2>Every type, every preset</h2>
  <p class="lede">
    Thirty artifacts, rendered from the same fixtures the golden digests and the
    conformance suite reason about. Inside any of them: <code>?</code> for the
    guide, <code>/</code> to find a node, <code>R</code> to probe a route,
    <code>S</code> to cycle presets, <code>T</code> for theme.
  </p>

${groups}

  <footer>
    Every page here is generated in CI from
    ${commit ? `commit <code>${esc(commit.slice(0, 12))}</code>` : 'the current commit'}
    and nothing is committed to the repository — so the site cannot describe a
    version of the code that no longer exists.
    <br>
    <a href="https://github.com/Hasan-Laraib/Mirofy">Source on GitHub</a> · MIT
  </footer>
</div>
</html>
`;

fs.writeFileSync(path.join(siteRoot, 'index.html'), index);

// A .nojekyll file keeps GitHub Pages from stripping paths that begin with an
// underscore. Nothing here does today, and that is not a reason to let a
// future rename fail silently in production only.
fs.writeFileSync(path.join(siteRoot, '.nojekyll'), '');

const bytes = fs.readdirSync(path.join(siteRoot, 'gallery'))
  .reduce((total, name) => total + fs.statSync(path.join(siteRoot, 'gallery', name)).size, 0)
  + fs.statSync(path.join(siteRoot, 'self-model.html')).size;
console.log(`build-site: ${(bytes / 1024 / 1024).toFixed(1)} MB in ${path.relative(repoRoot, siteRoot)}/`);
