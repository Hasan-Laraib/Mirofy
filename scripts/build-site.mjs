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
//
// The page previews are this tool's own `--format svg-static` output, for the
// same reason the hero is a real scan: a page advertising an export nobody
// uses is a page nobody should believe.
//
// They were one per diagram type because svg-static used to flatten every
// document to the classic palette, so six files would have been identical and
// implied a difference that was not there. That is fixed, and each type is now
// previewed in a DIFFERENT preset -- five of the six visible at a glance, each
// card highlighting the chip that names the one it shows.

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

/**
 * The preset each type is previewed in. Spread across the palette on purpose:
 * a page that shows one set of colours five times has not shown you the
 * presets.
 */
const PREVIEW_PRESET = {
  architecture: 'meridian',
  workflow: 'signal-flow',
  sequence: 'blueprint',
  dataflow: 'editorial',
  lifecycle: 'okabe-ito',
};

/** What each diagram type is for, in the reader's terms rather than the schema's. */
const ABOUT = {
  architecture: 'Components, stores and the trust boundaries between them.',
  workflow: 'Work moving across lanes, with the branches and the exceptions.',
  sequence: 'One interaction over time, with returns and async traces.',
  dataflow: 'Where data comes from, what transforms it, and who consumes it.',
  lifecycle: 'States, retries, waits, and the outcomes that end a run.',
};

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

/**
 * Make an svg-static export usable as a thumbnail.
 *
 * The export sets min-width: min(900px, 100%) on its own root so that a
 * standalone file opens at a readable size. Inside an <img> that becomes the
 * SVG's intrinsic width, the picture is laid out at 900px however small the
 * box is, and the bottom is cut off. The standalone export is right and this
 * copy is a thumbnail, so the rule is dropped here and nowhere else.
 */
function thumbnailise(file) {
  const svg = fs.readFileSync(file, 'utf8');
  const stripped = svg.replace('min-width:min(900px,100%);', '');
  if (stripped === svg) {
    console.error(`build-site: ${path.basename(file)} no longer carries the min-width rule `
      + 'this strips -- check whether svg-static changed before trusting the previews.');
    process.exit(1);
  }
  fs.writeFileSync(file, stripped);
}

fs.rmSync(siteRoot, { recursive: true, force: true });
for (const dir of ['gallery', 'assets', 'previews']) {
  fs.mkdirSync(path.join(siteRoot, dir), { recursive: true });
}

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
run([cli, 'render', 'architecture', path.join(repoRoot, 'scan/diagram.json'),
  path.join(siteRoot, 'previews/self-model.svg'), '--format', 'svg-static',
  '--repo-root', repoRoot], 'render self-model preview');
thumbnailise(path.join(siteRoot, 'previews/self-model.svg'));

const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scan/evidence-graph.json'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scan/model.json'), 'utf8'));
const view = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scan/view.json'), 'utf8'));
const citedFiles = new Set();
for (const fact of graph.facts ?? []) if (fact.location?.path) citedFiles.add(fact.location.path);
for (const gap of graph.gaps ?? []) if (gap.path) citedFiles.add(gap.path);
const counts = {
  facts: (graph.facts ?? []).length,
  gaps: (graph.gaps ?? []).length,
  files: citedFiles.size,
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
  // One flat preview per type, from the unmodified fixture.
  const plain = path.join(scratch, `${mode}-preview.json`);
  const source2 = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture), 'utf8'));
  source2.meta = { ...source2.meta, visual_preset: PREVIEW_PRESET[mode] };
  delete source2.meta.output;
  fs.writeFileSync(plain, JSON.stringify(source2));
  run([cli, 'render', mode, plain, path.join(siteRoot, `previews/${mode}.svg`),
    '--format', 'svg-static'], `preview ${mode}`);
  thumbnailise(path.join(siteRoot, `previews/${mode}.svg`));
}
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`build-site: ${made.length} gallery artifacts, ${MODES.length + 1} previews`);

for (const asset of ['logo.png', 'logo-dark.png']) {
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

const typeCards = MODES.map(({ mode }) => {
  const shown = PREVIEW_PRESET[mode];
  const chips = made.filter((entry) => entry.mode === mode).map((entry) => (
    `          <a class="chip${entry.preset === shown ? ' shown' : ''}" href="gallery/${esc(entry.file)}">${esc(entry.preset)}</a>`
  )).join('\n');
  return `      <article class="type">
        <a class="plate" href="gallery/${esc(mode)}--${esc(shown)}.html">
          <img src="previews/${esc(mode)}.svg" alt="A ${esc(mode)} diagram in the ${esc(shown)} preset" loading="lazy">
        </a>
        <div class="type-body">
          <h3>${esc(mode)}</h3>
          <p>${esc(ABOUT[mode] ?? '')}</p>
          <div class="chips">
${chips}
          </div>
        </div>
      </article>`;
}).join('\n\n');

const index = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mirofy — diagrams that cite their sources</title>
<meta name="description" content="Mirofy's own architecture, derived from its own source code, plus every diagram type in every preset. All generated in CI, none mocked up.">
<meta property="og:title" content="Mirofy — diagrams that cite their sources">
<meta property="og:description" content="Every artifact on this page was generated by the code at the commit it names.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
  /* The palette is the logo's, resolved: its mark runs #3B4FE0 to #7C3AED, and
     that gradient is the one bold thing on the page. Everything else is ink,
     paper and hairlines. */
  :root {
    --bg: #fbfbfd;
    --surface: #ffffff;
    --sunk: #f3f4f8;
    --fg: #12151c;
    --dim: #5b6478;
    --line: #e3e6ee;
    --accent: #3b4fe0;
    --accent-2: #7c3aed;
    --plate: #ffffff;
    --shadow: 0 1px 2px rgba(18, 21, 28, .05), 0 8px 24px -12px rgba(18, 21, 28, .18);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0d13;
      --surface: #11151e;
      --sunk: #0e121a;
      --fg: #e7ecf4;
      --dim: #8a94a6;
      --line: #1f2634;
      --accent: #7d8cff;
      --accent-2: #b98bff;
      --plate: #ffffff;
      --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 12px 32px -14px rgba(0, 0, 0, .7);
    }
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font: 400 16px/1.65 "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1020px; margin: 0 auto; padding: 0 24px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }

  /* ---- hero ---- */
  .hero { position: relative; overflow: hidden; border-bottom: 1px solid var(--line); }
  .hero::before {
    content: ""; position: absolute; inset: -40% -10% auto; height: 460px;
    background: radial-gradient(60% 100% at 50% 0%, rgba(124, 58, 237, .16), transparent 70%),
                radial-gradient(50% 100% at 20% 10%, rgba(59, 79, 224, .14), transparent 70%);
    pointer-events: none;
  }
  .hero .wrap { position: relative; padding-top: 76px; padding-bottom: 60px; text-align: center; }
  .logo { width: 320px; max-width: 78%; height: auto; }
  .tagline {
    margin: 22px auto 0; max-width: 30ch;
    font-size: 26px; line-height: 1.3; font-weight: 600; letter-spacing: -.017em;
    text-wrap: balance;
  }
  .sub { margin: 14px auto 0; max-width: 56ch; color: var(--dim); text-wrap: balance; }
  .cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 30px; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 20px; border-radius: 9px; font-weight: 600; font-size: 15px;
    border: 1px solid transparent;
  }
  .btn.primary {
    color: #fff; background: linear-gradient(100deg, #3b4fe0, #7c3aed);
    box-shadow: 0 6px 20px -8px rgba(92, 62, 232, .8);
  }
  .btn.primary:hover { text-decoration: none; filter: brightness(1.07); }
  .btn.ghost { border-color: var(--line); color: var(--fg); background: var(--surface); }
  .btn.ghost:hover { text-decoration: none; border-color: var(--accent); }

  /* ---- the receipt ---- */
  section { padding: 64px 0; }
  section + section { border-top: 1px solid var(--line); }
  h2 {
    margin: 0 0 6px; font-size: 13px; font-weight: 600; letter-spacing: .12em;
    text-transform: uppercase; color: var(--dim);
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .lead { margin: 0 0 28px; font-size: 20px; line-height: 1.45; letter-spacing: -.011em; max-width: 62ch; }
  .note { color: var(--dim); max-width: 68ch; }

  .receipt {
    border: 1px solid var(--line); border-radius: 12px; background: var(--sunk);
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13.5px; overflow: hidden;
  }
  .receipt-head {
    padding: 10px 16px; border-bottom: 1px solid var(--line); color: var(--dim);
    font-size: 12px; letter-spacing: .04em; background: var(--surface);
  }
  .receipt dl { margin: 0; padding: 6px 0; }
  .receipt .row {
    display: flex; justify-content: space-between; gap: 16px;
    padding: 7px 16px; border-bottom: 1px dashed var(--line);
  }
  .receipt .row:last-child { border-bottom: 0; }
  .receipt dt { color: var(--dim); }
  .receipt dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 500; }
  .receipt .row.mute dd { color: var(--dim); }

  /* ---- the self-model card ---- */
  .feature {
    display: block; margin-top: 24px; border: 1px solid var(--line); border-radius: 14px;
    background: var(--surface); overflow: hidden; box-shadow: var(--shadow);
    transition: border-color .16s ease, transform .16s ease;
  }
  .feature:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); }
  /* Every plate is the same shape whatever the diagram inside it is. The five
     fixtures have five different aspect ratios, and letting each card size
     itself to its own left rows of the grid with holes in them. */
  /* The image STRETCHES to the plate and object-fit centres the picture inside
     it. place-items: center here instead would size the image to its own
     content, height: 100% would resolve against nothing, and a tall diagram
     would overflow and be cut off at the bottom. */
  .plate {
    display: grid; overflow: hidden;
    background: var(--plate); border-bottom: 1px solid var(--line);
    aspect-ratio: 16 / 9; padding: 18px;
  }
  /* object-fit rather than max-width: the svg-static output carries its own
     min-width of 900px, which overflows a smaller plate and gets clipped.
     object-fit sizes the image box and letterboxes what is inside it, so the
     diagram is always whole. */
  .plate img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; object-fit: contain; }
  .feature-body { padding: 20px 22px; display: flex; justify-content: space-between; gap: 20px; align-items: center; }
  .feature-body strong { display: block; font-size: 18px; color: var(--fg); letter-spacing: -.011em; }
  .feature-body span { color: var(--dim); font-size: 15px; }
  .go { color: var(--accent); font-weight: 600; white-space: nowrap; }

  /* ---- type cards ---- */
  .types { display: grid; gap: 20px; margin-top: 26px; }
  @media (min-width: 720px) {
    .types { grid-template-columns: 1fr 1fr; }
    /* Five cards in two columns leave a hole. The last one takes the whole
       row and turns sideways, which reads as the end of the section rather
       than as a missing card. */
    .type:last-child { grid-column: 1 / -1; flex-direction: row; }
    .type:last-child .plate {
      flex: 0 0 46%; aspect-ratio: auto; border-bottom: 0; border-right: 1px solid var(--line);
    }
    .type:last-child .type-body { justify-content: center; }
  }
  .type {
    border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
    overflow: hidden; display: flex; flex-direction: column;
    transition: border-color .16s ease;
  }
  .type:hover { border-color: var(--accent-2); }
  .type .plate { aspect-ratio: 16 / 10; padding: 14px; }
  .type-body { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  .type h3 {
    margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .01em; text-transform: capitalize;
  }
  .type p { margin: 0; color: var(--dim); font-size: 14.5px; line-height: 1.5; min-height: 3em; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; padding: 3.5px 8px; border-radius: 999px; line-height: 1.35;
    border: 1px solid var(--line); color: var(--dim); background: var(--sunk);
  }
  .chip:hover { text-decoration: none; border-color: var(--accent); color: var(--accent); }
  /* The preset the plate above is actually showing. */
  .chip.shown { border-color: var(--accent); color: var(--accent); background: transparent; }

  /* ---- footer ---- */
  footer { border-top: 1px solid var(--line); padding: 32px 0 56px; color: var(--dim); font-size: 14px; }
  footer .wrap { display: flex; flex-wrap: wrap; gap: 10px 24px; justify-content: space-between; }
  code {
    font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .92em;
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
  }
</style>

<header class="hero">
  <div class="wrap">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
      <img class="logo" src="assets/logo.png" alt="Mirofy">
    </picture>
    <p class="tagline">Diagrams that cite their sources — and say what they could not see.</p>
    <p class="sub">
      Every artifact on this page was generated in CI by the code at the commit
      it names. None of it is a mock-up, and none of it is checked in.
    </p>
    <div class="cta">
      <a class="btn primary" href="self-model.html">Open Mirofy's own map →</a>
      <a class="btn ghost" href="https://github.com/Hasan-Laraib/Mirofy">View source</a>
    </div>
  </div>
</header>

<section>
  <div class="wrap">
    <h2>Start here</h2>
    <p class="lead">
      This is Mirofy's architecture, produced by pointing Mirofy at its own
      repository. Click any node to read the file, line range and commit the
      relationship came from.
    </p>

    <div class="receipt">
      <div class="receipt-head">scan → model → compile → layout → render</div>
      <dl>
        <div class="row"><dt>facts recorded</dt><dd>${counts.facts.toLocaleString('en')}</dd></div>
        <div class="row"><dt>files cited</dt><dd>${counts.files}</dd></div>
        <div class="row mute"><dt>gaps — files it could not read</dt><dd>${counts.gaps}</dd></div>
        <div class="row"><dt>components derived</dt><dd>${counts.components}</dd></div>
        <div class="row"><dt>relationships derived</dt><dd>${counts.relationships}</dd></div>
        <div class="row mute"><dt>drawn in this view</dt><dd>${counts.drawn}</dd></div>
      </dl>
    </div>

    <a class="feature" href="self-model.html">
      <span class="plate"><img src="previews/self-model.svg" alt="Mirofy's own architecture" loading="lazy"></span>
      <span class="feature-body">
        <span>
          <strong>Mirofy, mapped by Mirofy</strong>
          <span>${counts.components - counts.drawn} components were left out of this view on purpose, and the artifact records which and why.</span>
        </span>
        <span class="go">Open ↗</span>
      </span>
    </a>

    <p class="note" style="margin-top:22px">
      ${counts.gaps} file(s) could not be read, and they are counted rather than
      skipped. An empty answer here means <em>not found</em> — never
      <em>does not exist</em>.
    </p>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Five types, six presets</h2>
    <p class="lead">
      Thirty artifacts, rendered from the same fixtures the golden digests and
      the conformance suite reason about.
    </p>
    <p class="note">
      Inside any of them: <code>?</code> for the guide, <code>/</code> to find a
      node, <code>R</code> to probe a route, <code>L</code> for the semantic
      lens, <code>S</code> to cycle presets, <code>T</code> for theme.
    </p>

    <div class="types">
${typeCards}
    </div>

    <p class="note" style="margin-top:26px">
      Each preview above is this tool's own <code>--format svg-static</code>
      output — 19&nbsp;KB, no scripts, no stylesheet needed. It is what you paste
      into a README or a Figma board, and it carries the document's preset:
      each card is rendered in the one its highlighted chip names.
    </p>
  </div>
</section>

<footer>
  <div class="wrap">
    <span>Built from ${commit ? `<code>${esc(commit.slice(0, 12))}</code>` : 'the current commit'} — nothing on this site is committed to the repository.</span>
    <span><a href="https://github.com/Hasan-Laraib/Mirofy">GitHub</a> · MIT</span>
  </div>
</footer>
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
