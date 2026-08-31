// Rows 6.13 and 4.15. `--format svg-static`, and the tree-shaking that makes
// it small enough to be worth having.
//
// The interactive artifact is ~715 KB and earns it. None of that survives the
// places a diagram most needs to go: a README on GitHub, a pull request, a
// Notion or Confluence page all strip scripts and render an image. Handed the
// full artifact they show nothing at all.
//
// So the static export has to satisfy two things that pull against each other.
// It must be SMALL, or nobody commits it next to their code. And it must look
// like the diagram it came from, which means every style that applied in the
// artifact still applies with no stylesheet, no scripts and no :root to
// resolve variables against.
//
// Size is the easy half to test and the easy half to fake -- a smaller file is
// one delete away. So the tests below spend most of their effort on the other
// half: that nothing which applied was dropped, that no variable was left
// dangling, and that a browser handed the file really does paint it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { coreRoot } from '../src/render.mjs';
import {
  toStaticSvg, parseRules, selectorTouchesSvg, classesUsed, resolveVars, minifyCss,
  selectorCanMatchStatic, flattenTarget, PRESENTATION_PROPERTIES,
} from '../../core/renderers/shared/svg-static.mjs';
import { resolveTokens } from '../../viewer/src/tokens/tokens.mjs';
import { chromeAvailable, openArtifact } from './helpers/browser.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-svg-static-'));

const artifact = (() => {
  const out = path.join(tmp, 'artifact.html');
  execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture',
    path.join(coreRoot, 'examples/web-app.architecture.json'), out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(out, 'utf8');
})();

/** Base tokens, the way the cascade layers them for the default preset. */
async function baseTokens() {
  const { BLOCKS } = await import('../../viewer/src/tokens/tokens.mjs');
  /** @type {Record<string, string>} */
  const tokens = {};
  for (const block of BLOCKS) {
    if (/data-preset/.test(block.selector)) continue;
    for (const [name, value] of block.props) tokens[name] = value;
  }
  return tokens;
}

test('[6.13] the export is a standalone SVG document, not an HTML fragment', async () => {
  const { svg } = toStaticSvg(artifact, { tokens: await baseTokens() });
  assert.match(svg, /^<\?xml version="1\.0"/, 'no XML declaration; this is a file, not a fragment');
  // Inside an HTML document the parser supplies the namespace. A file on disk
  // has no such help, and without it browsers refuse to paint the SVG at all.
  assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
    'the SVG carries no namespace, so a browser will not render it');
  assert.doesNotMatch(svg, /<script/i, 'a static export must not carry scripts');
});

test('[6.13] no variable is left dangling', async () => {
  const { svg, unresolved } = toStaticSvg(artifact, { tokens: await baseTokens() });
  // The artifact resolves var(--x) against :root. There is no :root here, so
  // an unresolved variable is not a cosmetic problem -- it is an element that
  // paints with no colour at all.
  assert.deepEqual(unresolved, [], `unresolved custom properties: ${unresolved.join(', ')}`);
  assert.doesNotMatch(svg, /var\(--/, 'the output still references custom properties');
});

test('[4.15] every rule that could still match survives', async () => {
  // The assertion that stops tree-shaking becoming deletion -- sharpened.
  //
  // It first required every rule targeting a used class to survive, which was
  // too strong: the export strips every `data-*`, so a rule like
  // `svg[data-chapter-handoff] .c-backend` targets a used class and can never
  // match anything. Dropping it is correct, and it is 149 of 183 selector
  // parts.
  //
  // So the invariant is now "could still match", and the premise it rests on
  // is PROVED below rather than assumed.
  const { svg } = toStaticSvg(artifact, { tokens: await baseTokens() });
  const body = svg.slice(svg.indexOf('</style>'));
  assert.doesNotMatch(body, /\sdata-[a-z0-9-]+=/,
    'the output still carries data-* attributes, so dropping their rules was not safe');

  const used = classesUsed(svg);
  const fullCss = [...artifact.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

  const couldMatch = parseRules(fullCss).filter((rule) => {
    if (!selectorCanMatchStatic(rule.selector)) return false;
    const classes = [...rule.selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    return classes.length > 0 && classes.some((name) => used.has(name));
  });
  assert.ok(couldMatch.length > 0, 'the fixture exercises no matchable class rules; it proves nothing');

  const exported = svg.slice(svg.indexOf('<style>'), svg.indexOf('</style>'));
  const missing = couldMatch
    .map((rule) => rule.selector)
    .filter((selector) => !exported.includes(minifyCss(selector)));
  assert.deepEqual(missing, [], `rules that could still match were dropped: ${missing.slice(0, 3).join(' | ')}`);
});

test('[4.15] rules that cannot match are dropped, and most of them can not', async () => {
  const { rulesKept, rulesDropped } = toStaticSvg(artifact, { tokens: await baseTokens() });
  assert.ok(rulesDropped > rulesKept,
    `kept ${rulesKept} rules and dropped ${rulesDropped}; the viewer's chrome styles are not being shaken out`);
});

test('[4.15] the export is a fraction of the interactive artifact', async () => {
  const { bytes } = toStaticSvg(artifact, { tokens: await baseTokens() });
  const artifactBytes = Buffer.byteLength(artifact, 'utf8');
  // Not an arbitrary ceiling: the point is that this is committable next to
  // source, where the interactive artifact is not.
  assert.ok(bytes < artifactBytes / 10,
    `static export is ${Math.round(bytes / 1024)} KB against ${Math.round(artifactBytes / 1024)} KB`);
  assert.ok(bytes < 60 * 1024, `static export grew to ${Math.round(bytes / 1024)} KB`);
});

test('[4.15] viewer-only attributes are gone', async () => {
  const { svg } = toStaticSvg(artifact, { tokens: await baseTokens() });
  // data-*, tabindex, role and aria-* exist for a viewer that is not here.
  // They are pure weight in a static file, and every one of them goes: an
  // earlier version spared data-name on the assumption that stylesheets
  // selected on it. Nothing did.
  assert.doesNotMatch(svg, /\stabindex="/, 'viewer focus attributes survived');
  assert.doesNotMatch(svg, /\sdata-[a-z0-9-]+="/, 'viewer hooks survived');
  assert.doesNotMatch(svg, /\srole="/, 'viewer roles survived');

  // And the diagram is still there afterwards -- stripping attributes must
  // not take the geometry with it.
  assert.ok((svg.match(/<(rect|path|text)[ />]/g) || []).length > 20,
    'attribute stripping removed drawable elements');
});

test('[6.13] minification removes only what CSS ignores', () => {
  // A minifier that rewrote values would change the picture while shrinking
  // the file, which is the one failure that looks like success.
  const before = '.a {\n  /* note */\n  fill: rgb(1, 2, 3);\n  stroke-width: 1.5;\n}';
  const after = minifyCss(before);
  assert.doesNotMatch(after, /note/, 'comments survive');
  assert.match(after, /rgb\(1,2,3\)/, 'a colour value was altered');
  assert.match(after, /stroke-width:1\.5/, 'a numeric value was altered');
});

test('[6.13] a rule naming a class the diagram does not use is dropped', () => {
  const used = new Set(['c-region']);
  assert.equal(selectorTouchesSvg('.c-region rect', used), true);
  assert.equal(selectorTouchesSvg('.c-nowhere rect', used), false);
  // Viewer chrome goes, even though it names elements the SVG also has.
  assert.equal(selectorTouchesSvg('.toolbar button', used), false);
});

test('[6.13] variables resolve through a chain, and a missing one is reported', () => {
  const resolved = resolveVars('a{fill:var(--x)}b{fill:var(--y)}', { '--x': 'var(--z)', '--z': '#abc' });
  assert.match(resolved.css, /fill:#abc/, 'a token pointing at another token was not followed');
  assert.deepEqual(resolved.unresolved, ['--y'], 'a missing token was not reported');
  // A fallback is honoured rather than counted as missing.
  const withFallback = resolveVars('a{fill:var(--nope, #123)}', {});
  assert.match(withFallback.css, /fill:#123/);
  assert.deepEqual(withFallback.unresolved, []);
});

test('[6.13] a browser handed the file actually paints it', { skip: chromeAvailable() ? false : 'needs Chrome' }, async () => {
  // Everything above reasons about text. This checks the only thing that
  // matters to a reader: the file, opened, is the diagram. A dropped rule
  // shows up here as an element painted with the browser default instead of
  // the palette, which no amount of string assertion would catch.
  const { svg } = toStaticSvg(artifact, { tokens: await baseTokens() });
  const file = path.join(tmp, 'static.svg');
  fs.writeFileSync(file, svg);

  const page = await openArtifact(file);
  try {
    const report = await page.evaluate(`(() => {
      const svg = document.documentElement;
      const box = svg.getBoundingClientRect();
      const nodes = svg.querySelectorAll('rect, path, text');
      let painted = 0;
      const fills = new Set();
      for (const el of nodes) {
        const style = getComputedStyle(el);
        if (style.fill && style.fill !== 'none') fills.add(style.fill);
        if (style.display !== 'none' && style.visibility !== 'hidden') painted += 1;
      }
      return JSON.stringify({
        width: Math.round(box.width),
        height: Math.round(box.height),
        elements: nodes.length,
        painted,
        distinctFills: fills.size,
      });
    })()`);
    const result = JSON.parse(report);

    assert.ok(result.width > 200 && result.height > 200,
      `the SVG laid out at ${result.width}x${result.height}`);
    assert.ok(result.elements > 20, `only ${result.elements} drawable elements reached the browser`);
    assert.equal(result.painted, result.elements, 'some elements are not painted');
    // The real tree-shaking check. With the stylesheet dropped, every shape
    // would fall back to the same default fill and this collapses to 1.
    assert.ok(result.distinctFills >= 4,
      `only ${result.distinctFills} distinct fills; the palette did not survive the export`);
  } finally {
    await page.close();
  }
});

test('[6.13] the CLI writes a real .svg file, and refuses a format it does not have', () => {
  const out = path.join(tmp, 'cli-export.svg');
  const stdout = execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture',
    path.join(coreRoot, 'examples/web-app.architecture.json'), out, '--format', 'svg-static',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  assert.ok(fs.existsSync(out), 'the CLI reported success but wrote no file');
  const written = fs.readFileSync(out, 'utf8');
  assert.match(written, /^<\?xml/, 'the CLI wrote something that is not an SVG document');
  // The receipt says what it did, including what it shook out -- a size claim
  // with no accounting behind it is marketing.
  assert.match(stdout, /style rules kept/, 'the CLI reports no tree-shaking accounting');

  // The intermediate artifact is scaffolding; naming a deleted temp file in
  // the output would send the caller looking for something that is gone.
  assert.doesNotMatch(stdout, /artifact\.html/, 'the CLI leaked its intermediate file path');

  assert.throws(() => execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture',
    path.join(coreRoot, 'examples/web-app.architecture.json'), path.join(tmp, 'x.svg'),
    '--format', 'not-a-format',
  ], { stdio: ['ignore', 'pipe', 'pipe'] }), /./, 'an unknown format was accepted');
});

test('[4.15] the export carries its styling as attributes, not only as CSS', async () => {
  // The bug this was written against. The export styled everything through a
  // <style> block and carried almost no presentation attributes. Browsers
  // handle that; Figma, Canva and Illustrator do not reliably apply CSS inside
  // an SVG, so the diagram imported shape-correct and COLOUR-DEAD -- black
  // fills, no strokes, and no way for the reader to tell it had gone wrong
  // except by looking.
  const { svg, elementsStyled } = toStaticSvg(artifact, { tokens: await baseTokens() });
  const body = svg.slice(svg.indexOf('</style>'));

  assert.ok(elementsStyled > 40, `only ${elementsStyled} elements were given attributes`);
  assert.ok((body.match(/\sfill="/g) || []).length > 40, 'the body carries almost no fill attributes');
  assert.ok((body.match(/\sstroke="/g) || []).length > 20, 'the body carries almost no stroke attributes');

  // Real colours, not one repeated default. A flattener that wrote the same
  // value everywhere would satisfy a count and lose the whole palette.
  const fills = new Set([...body.matchAll(/\sfill="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]));
  assert.ok(fills.size >= 6, `only ${fills.size} distinct fill colours survived as attributes`);

  // Text needs more than a colour to survive a font-less importer.
  const texts = [...body.matchAll(/<text[^>]*>/g)].map((m) => m[0]);
  assert.ok(texts.length > 10, 'the fixture has too little text to prove anything');
  for (const text of texts) {
    assert.match(text, /\sfill="/, 'a text element would import with no colour');
    assert.match(text, /\sfont-size="/, 'a text element would import at a default size');
  }
});

test('[4.15] flattening never overrides what the element already said', async () => {
  // A presentation attribute already on the element came from the renderer and
  // is more specific than a class rule. Overwriting it would repaint something
  // the author positioned deliberately.
  const { flattenToAttributes } = await import('../../core/renderers/shared/svg-static.mjs');
  const svg = '<svg><rect class="c-backend" fill="#123456"/><rect class="c-backend"/></svg>';
  const rules = [{ selector: '.c-backend', body: 'fill: #abcdef; stroke: #000000;', at: false }];
  const out = flattenToAttributes(svg, rules).svg;

  assert.match(out, /fill="#123456"/, 'an authored fill was overwritten');
  assert.doesNotMatch(out, /fill="#123456"[^>]*fill="#abcdef"/, 'a second fill was added beside the authored one');
  assert.match(out, /class="c-backend" fill="#abcdef"/, 'the unstyled element got no fill');
  // The stroke was absent from both, so both receive it.
  assert.equal((out.match(/stroke="#000000"/g) || []).length, 2);
});

test('[4.15] only properties SVG accepts as attributes are flattened', async () => {
  const { flattenToAttributes } = await import('../../core/renderers/shared/svg-static.mjs');
  // `transition` and `cursor` have no attribute form. Writing them would
  // produce invalid markup that some importers reject outright.
  const rules = [{ selector: '.x', body: 'fill: red; transition: all 0.2s; cursor: pointer;', at: false }];
  const out = flattenToAttributes('<svg><rect class="x"/></svg>', rules).svg;
  assert.match(out, /fill="red"/);
  assert.doesNotMatch(out, /transition=/);
  assert.doesNotMatch(out, /cursor=/);
  assert.ok(PRESENTATION_PROPERTIES.includes('fill'));
  assert.ok(!PRESENTATION_PROPERTIES.includes('transition'));
});

test('[4.15] a selector too complex to flatten is reported, not guessed at', async () => {
  const { flattenToAttributes } = await import('../../core/renderers/shared/svg-static.mjs');
  // Flattening a selector this misread would paint the wrong element, which is
  // worse than leaving it to the stylesheet.
  assert.equal(flattenTarget('.c-backend').className, 'c-backend');
  assert.equal(flattenTarget('svg .s-database').className, 's-database');
  assert.equal(flattenTarget('rect.c-cloud').tag, 'rect');
  assert.equal(flattenTarget('.a > *'), null);
  assert.equal(flattenTarget('.a .b'), null);
  assert.equal(flattenTarget('svg[data-x] .b'), null);

  const report = flattenToAttributes('<svg><rect class="a"/></svg>',
    [{ selector: '.a > *', body: 'fill: red;', at: false }]);
  assert.equal(report.selectorsNotFlattened, 1, 'an unflattenable selector was not reported');
  assert.doesNotMatch(report.svg, /fill=/, 'a selector that was not understood was applied anyway');
});

test('[4.15] rules that require a stripped attribute are dropped', () => {
  // 149 of 183 selector parts in a real artifact require a data-* attribute.
  // With those attributes gone the rules are unmatchable, not merely unused.
  assert.equal(selectorCanMatchStatic('.c-backend'), true);
  assert.equal(selectorCanMatchStatic('svg[data-animation="trace"] [data-animate]'), false);
  assert.equal(selectorCanMatchStatic('svg[data-chapter-handoff] .c-backend'), false);
  // A grouped selector survives if any part can still match.
  assert.equal(selectorCanMatchStatic('.c-backend, svg[data-x] .y'), true);
  // ...and with the attributes kept, nothing is dropped on this ground.
  assert.equal(selectorCanMatchStatic('svg[data-x] .y', { attributesStripped: false }), true);
});

// ---------------------------------------------------------------------------
// The visual preset, which the static export used to throw away.
//
// `--format svg-static` collected every token block whose selector did not
// mention data-preset, which is all ten preset blocks -- so six presets
// produced one file, byte for byte, and a document authored in meridian
// exported in classic's colours. Nothing here noticed, because nothing here
// rendered the same diagram twice.
// ---------------------------------------------------------------------------

/** Render one fixture as svg-static under a named preset. */
function staticSvgFor(preset) {
  const source = JSON.parse(fs.readFileSync(
    path.join(coreRoot, 'examples/web-app.architecture.json'), 'utf8'));
  source.meta = { ...source.meta, visual_preset: preset };
  delete source.meta.output;
  const input = path.join(tmp, `preset-${preset}.json`);
  const out = path.join(tmp, `preset-${preset}.svg`);
  fs.writeFileSync(input, JSON.stringify(source));
  execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture', input, out,
    '--format', 'svg-static',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(out, 'utf8');
}

test('[6.13] every preset exports its own colours', () => {
  const presets = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito', 'meridian'];
  const byPreset = new Map(presets.map((preset) => [preset, staticSvgFor(preset)]));

  const seen = new Map();
  for (const [preset, svg] of byPreset) {
    const previous = seen.get(svg);
    assert.equal(previous, undefined,
      `"${preset}" exported the same bytes as "${previous}" — the preset was dropped`);
    seen.set(svg, preset);
  }

  // Distinct bytes are not enough: the colours have to be the preset's. The
  // README says meridian keeps arrows graphite so that colour means what a
  // node IS, and that is checkable.
  assert.match(byPreset.get('meridian'), /stroke="#5c6672"/,
    'meridian did not export its graphite arrow');
  assert.doesNotMatch(byPreset.get('classic'), /stroke="#5c6672"/,
    'classic exported meridian\'s arrow, so the fixture proves nothing');
});

test('[6.13] classic resolves to the base palette, with no preset block of its own', () => {
  const { tokens, matchedPreset } = resolveTokens('classic', 'light');
  assert.equal(matchedPreset, false, 'classic should match no preset block');
  assert.equal(tokens['--arrow'], '#94a3b8');
  assert.equal(Object.keys(tokens).length, 32, 'the base palette is 32 properties');
});

test('[6.13] a partial preset inherits the properties it does not override', () => {
  // signal-flow's light block sets 27 of the 32. Laying it over the base is
  // what makes the other five correct; using the block alone would leave a
  // diagram with five colourless properties.
  const base = resolveTokens('classic', 'light').tokens;
  const { tokens } = resolveTokens('signal-flow', 'light');
  assert.equal(Object.keys(tokens).length, 32);

  const inherited = Object.keys(tokens).filter((name) => tokens[name] === base[name]);
  const overridden = Object.keys(tokens).filter((name) => tokens[name] !== base[name]);
  assert.ok(inherited.length > 0, 'signal-flow overrode everything, so this proves no layering');
  assert.ok(overridden.length > 0, 'signal-flow overrode nothing, so the block was not applied');
});

test('[6.13] the theme is chosen, not inherited from block order', () => {
  // A static SVG carries no background rectangle, so it is read on whatever
  // ground it is pasted onto. Light is the deliberate choice; dark tokens
  // would put near-white text on a near-white README.
  const light = resolveTokens('classic', 'light').tokens;
  const dark = resolveTokens('classic', 'dark').tokens;
  assert.notEqual(light['--text'], dark['--text'], 'the two themes resolve identically');
  assert.match(staticSvgFor('classic'), /fill="#0f172a"/,
    'the export is not using the light palette it claims to');
});

test('[6.13] a preset with no palette is refused rather than exported as classic', () => {
  // The failure this whole section replaces was silent. A preset the schema
  // accepts but the palette has no block for must not quietly fall back.
  const source = JSON.parse(fs.readFileSync(
    path.join(coreRoot, 'examples/web-app.architecture.json'), 'utf8'));
  source.meta = { ...source.meta, visual_preset: 'meridian' };
  delete source.meta.output;
  const input = path.join(tmp, 'preset-unknown.json');
  fs.writeFileSync(input, JSON.stringify(source));

  const { tokens, matchedPreset } = resolveTokens('no-such-preset', 'light');
  assert.equal(matchedPreset, false);
  assert.deepEqual(tokens, resolveTokens('classic', 'light').tokens,
    'an unknown preset should resolve to the base, which is what the CLI then refuses');
});
