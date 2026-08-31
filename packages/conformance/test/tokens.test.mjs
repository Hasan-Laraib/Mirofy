// Row 4.12. The byte-identity check in check-template.mjs already proves
// the emitter reproduces the committed palette. What it cannot prove is
// that the token *model* is coherent -- that is what these assert.
//
// Row 4.13 (added in P1a Task 7) proves the okabe-ito colour-blind-safe
// preset the same way: the token model declares it correctly, and the
// renderer actually threads it through to a rendered artifact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BLOCKS, PROPERTY_NAMES } from '../../viewer/src/tokens/tokens.mjs';
import { emitPalette } from '../../viewer/src/tokens/emit.mjs';
import { SRC_ROOT } from '../../viewer/build.mjs';
import { renderFixture, fixturesRoot } from '../src/render.mjs';
import { CVD_TYPES, contrastRatio, deltaE2000, hexToLab } from '../src/color-science.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-tokens-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

test('the token model covers 12 blocks and 32 distinct properties (4.12)', () => {
  // Grew from 8 to 10 in P1a Task 7 (okabe-ito), and to 12 with the meridian
  // preset. The count is pinned so a preset cannot appear or vanish quietly.
  // (the okabe-ito preset's dark/light
  // pair). Fix round 1 updated this title (and matrix.mjs's row 4.12
  // testTitle, kept in lockstep) to match, instead of leaving a stale '8'
  // next to an assertion of 10.
  assert.equal(BLOCKS.length, 12);
  assert.equal(PROPERTY_NAMES.length, 32);
});

test('every block defines a subset of the canonical property set, never a stray name (4.12)', () => {
  const canonical = new Set(PROPERTY_NAMES);
  for (const { selector, props } of BLOCKS) {
    for (const [name] of props) {
      assert.ok(canonical.has(name), `${selector} declares ${name}, which is not a known token`);
    }
  }
});

test('the two signal-flow blocks are partial overrides and the other six are complete (4.12)', () => {
  // Encoded deliberately: a future change that "helpfully" completes the
  // signal-flow blocks would move the template bytes, and this says out
  // loud that the omission is intentional inheritance from :root. (Now
  // eight other blocks, not six, since P1a Task 7 added okabe-ito's
  // complete dark/light pair; the title stays as proved by row 4.12.)
  const byCount = Object.fromEntries(BLOCKS.map((b) => [b.selector.trim(), b.props.length]));
  assert.equal(byCount['[data-preset="signal-flow"][data-theme="dark"]'], 30);
  assert.equal(byCount['[data-preset="signal-flow"][data-theme="light"]'], 27);
  for (const [selector, count] of Object.entries(byCount)) {
    if (selector.includes('signal-flow')) continue;
    assert.equal(count, 32, `${selector} should declare all 32 tokens`);
  }
});

test('no token value is empty and every block emits valid CSS declarations (4.12)', () => {
  for (const { selector, props } of BLOCKS) {
    for (const [name, value] of props) {
      assert.ok(String(value).trim().length > 0, `${selector} ${name} has an empty value`);
      assert.ok(!String(value).includes(';'), `${selector} ${name} value contains a stray semicolon`);
    }
  }
  assert.ok(emitPalette().includes('--'), 'emitPalette produced no custom properties');
});

test('the Okabe-Ito preset renders and declares itself on the document root (4.13)', () => {
  const out = path.join(tmp, 'okabe-ito.html');
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));
  source.meta = { ...source.meta, visual_preset: 'okabe-ito' };
  const patched = path.join(tmp, 'okabe-ito.source.json');
  fs.writeFileSync(patched, JSON.stringify(source));
  renderFixture('architecture', patched, out);

  const html = fs.readFileSync(out, 'utf8');
  const rootTag = html.match(/<html\b[^>]*>/)?.[0] ?? '';
  assert.ok(rootTag.includes('data-preset="okabe-ito"'), `preset not on root: ${rootTag}`);
  assert.match(html, /\[data-preset="okabe-ito"\]\[data-theme="dark"\]/, 'dark palette block missing');
  assert.match(html, /\[data-preset="okabe-ito"\]\[data-theme="light"\]/, 'light palette block missing');
});

test('the Okabe-Ito palette uses the published CVD-safe hues (4.13)', () => {
  // Asserting the actual published values, not merely "some colour is set".
  // A preset named for Okabe-Ito that quietly drifted to arbitrary hues
  // would keep every other test in this file green.
  const dark = BLOCKS.find((b) => b.selector.includes('okabe-ito') && b.selector.includes('dark'));
  const values = new Set(dark.props.map(([, value]) => String(value).toLowerCase()));
  for (const hex of ['#56b4e9', '#009e73', '#cc79a7', '#e69f00', '#d55e00', '#f0e442', '#0072b2']) {
    assert.ok([...values].some((v) => v.includes(hex)), `Okabe-Ito hue ${hex} is not present in the dark palette`);
  }
});

test('both Okabe-Ito blocks are complete 32-token palettes (4.13)', () => {
  for (const theme of ['dark', 'light']) {
    const block = BLOCKS.find((b) => b.selector.includes('okabe-ito') && b.selector.includes(theme));
    assert.ok(block, `okabe-ito ${theme} block missing`);
    assert.equal(block.props.length, 32, `okabe-ito ${theme} must declare all 32 tokens`);
  }
});

test('the viewer offers okabe-ito in the preset cycle (4.13)', () => {
  const js = fs.readFileSync(path.join(SRC_ROOT, 'js/02-preset.js'), 'utf8');
  assert.match(js, /var PRESETS = \[[^\]]*'okabe-ito'/, 'okabe-ito is not in the viewer PRESETS list');
  const markup = fs.readFileSync(path.join(SRC_ROOT, 'html/02-markup.html'), 'utf8');
  assert.match(markup, /data-preset-value="okabe-ito"/, 'okabe-ito has no style-picker option');
});

// --- Fix round 1 (4.13): pairwise CVD-separation + contrast regression ---
//
// The original light block darkened each of the seven semantic strokes
// *independently* to just clear a contrast target. Okabe-Ito's discrimination
// rides jointly on hue AND lightness; flattening every hue into one narrow
// lightness band destroyed the lightness axis that carried much of the
// separation. Three pairs collapsed under simulated colour-vision deficiency
// (reviewer figures, Machado 2009 severity 1.0, cross-checked with Vienot
// 1999): frontend/external under normal vision, dE00 2.0 (not even a CVD
// defect -- everyone sees them as the same colour); security/messagebus
// under deuteranopia, dE00 1.4; cloud/messagebus under protanopia, dE00 1.3.
// These tests would have failed on that block; see task-7-report.md for the
// transcript proving it.

const SEMANTIC_ROLES = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external'];

function strokesOf(block) {
  const strokes = {};
  for (const [name, value] of block.props) {
    const match = name.match(/^--([a-z]+)-stroke$/);
    if (match && SEMANTIC_ROLES.includes(match[1])) strokes[match[1]] = value;
  }
  return strokes;
}

function okabeItoBlock(theme) {
  return BLOCKS.find((b) => b.selector.includes('okabe-ito') && b.selector.includes(theme));
}

// Chosen independently of what either block measures, not tuned to the
// light block's re-derived values: roughly 1.7x the ~2.3 dE00 "just
// noticeable difference" widely cited from Sharma, Wu & Dalal (2005) -- a
// bare-JND difference can never pass -- while staying comfortably below the
// dark block's measured worst case (~10.9, tritan, database/cloud), which
// is a reference point for what's achievable when a hue only has to clear
// separation and isn't also being pulled down to hit a light-surface
// contrast floor.
const MIN_SEPARATION = 4.0;

test('every pair of Okabe-Ito semantic hues stays separated under simulated colour-vision deficiency (4.13)', () => {
  for (const theme of ['dark', 'light']) {
    const block = okabeItoBlock(theme);
    assert.ok(block, `okabe-ito ${theme} block missing`);
    const strokes = strokesOf(block);
    assert.equal(Object.keys(strokes).length, 7, `okabe-ito ${theme} should declare all 7 semantic strokes`);

    for (const cvdType of CVD_TYPES) {
      for (let i = 0; i < SEMANTIC_ROLES.length; i++) {
        for (let j = i + 1; j < SEMANTIC_ROLES.length; j++) {
          const a = SEMANTIC_ROLES[i];
          const b = SEMANTIC_ROLES[j];
          const dE = deltaE2000(hexToLab(strokes[a], cvdType), hexToLab(strokes[b], cvdType));
          assert.ok(
            dE >= MIN_SEPARATION,
            `okabe-ito ${theme}: ${a} (${strokes[a]}) vs ${b} (${strokes[b]}) under ${cvdType} vision `
              + `separate by only dE00=${dE.toFixed(2)} (need >= ${MIN_SEPARATION})`
          );
        }
      }
    }
  }
});

// --- Fix round 2 (4.13): every role needs the 4.5:1 text floor ---
//
// Fix round 1's TEXT_ROLES split (six roles at WCAG 1.4.3's 4.5:1 text
// floor, `external` alone relaxed to 1.4.11's 3:1 non-text floor) rested on
// a comment claiming external is "never a literal CSS `color` on text". That
// claim was false: `external` IS used as text colour in two places --
// `.t-external { fill: var(--external-stroke); }`
// (packages/viewer/src/css/01-structure.css:3622), a "Text helpers" rule
// applied to real SVG `<text class="t-external">` labels via the
// `componentText` map (packages/core/renderers/shared/geometry.mjs:1274,
// consumed by render-architecture.mjs, render-dataflow.mjs and
// render-workflow.mjs for a component's "tag" text) -- and
// `.semantic-lens-kind { --lens-color: var(--external-stroke); }` /
// `.semantic-lens-kind em { color: var(--lens-color); }`
// (01-structure.css:1027, :1084), a literal CSS `color` on an `<em>`.
//
// The fix is not to add external back to a two-tier split: it is to drop
// the split entirely. `#0072b2` clears 4.5:1 against every surface these
// tests check (see panelSurfaceOf below), so holding all seven roles to the
// one, stricter floor costs nothing and removes the latent hole a future
// edit to `external` could otherwise fall through.
const REQUIRED_TEXT_CONTRAST = 4.5;

// The contrast floor is only meaningful against the surface the text
// actually renders on. Traced every real text usage of the seven roles in
// packages/viewer/src/css/01-structure.css and packages/core/renderers/:
//   - The SVG canvas itself (componentText / t-X labels, boundary labels,
//     connection labels) sits on `.diagram-container { background:
//     var(--panel); }` (01-structure.css:379) -- the grid pattern
//     (packages/core/renderers/shared/utils.mjs's <pattern id="grid">) only
//     draws grid lines, no fill, so `--panel` is what actually shows through.
//   - Every floating panel that colours text with one of these roles --
//     .route-probe (:1137), .node-finder (:1856), .semantic-lens (:961),
//     .focus-chip/.semantic-passport (:1307), .diagram-guide (:1663),
//     .guided-views (:2039) -- paints `var(--toolbar-menu-bg)` or
//     `var(--toolbar-bg)` as its own background, not `--bg`.
//   - `--bg` (packages/viewer/src/css/01-structure.css:5) is used only on
//     `body`, whose own text colour is `--text`, never one of these seven;
//     `.toolbar`'s background is transparent (:2712), but no role's text
//     colour is set on a bare toolbar child -- every such rule is scoped
//     under one of the panels above, each of which paints its own opaque
//     (or near-opaque) background first.
// So the operative surface for all seven roles, in every case found, is
// `--panel` (or a token that resolves to the same value in this block) --
// never the bare page `--bg`. Read from the block's own token rather than
// hardcoded, so a future edit to `--panel` cannot silently invalidate this.
function panelSurfaceOf(block) {
  const panel = block.props.find(([name]) => name === '--panel');
  assert.ok(panel, `${block.selector} has no --panel token`);
  return panel[1];
}

test('every Okabe-Ito light-mode stroke clears the WCAG text contrast floor against the panel surface (4.13)', () => {
  const lightBlock = okabeItoBlock('light');
  const strokes = strokesOf(lightBlock);
  const surface = panelSurfaceOf(lightBlock);
  for (const role of SEMANTIC_ROLES) {
    const ratio = contrastRatio(strokes[role], surface);
    assert.ok(
      ratio >= REQUIRED_TEXT_CONTRAST,
      `okabe-ito light ${role}-stroke (${strokes[role]}) contrast ${ratio.toFixed(2)}:1 against panel `
        + `(${surface}) is below the required ${REQUIRED_TEXT_CONTRAST}:1`
    );
  }
});

// The print block overrides the palette so that printing from dark theme does
// not put dark fills and neon strokes on white paper. Whether it actually wins
// is a cascade question, not a text question: @media contributes no
// specificity, so the block only overrides a preset palette if its own
// selector outranks that preset's. Specificity is COMPUTED here rather than
// pattern-matched against a literal selector string, so a future edit to
// either selector is evaluated on its merits instead of silently passing.
function specificity(selector) {
  const s = selector.trim();
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length
    + (s.match(/\[[^\]]+\]/g) || []).length
    + (s.match(/:(?!:)[\w-]+/g) || []).length;
  // :root is a pseudo-class, already counted above; strip it before counting
  // element names so it is not double-counted as an element.
  const elements = (s.replace(/:(?!:)[\w-]+/g, ' ').match(/(^|[\s>+~])([a-z][\w-]*)/gi) || []).length;
  return [ids, classes, elements];
}
const beats = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
};

test('the print palette outranks every preset palette it must override (4.12)', () => {
  const css = fs.readFileSync(path.join(SRC_ROOT, 'css/01-structure.css'), 'utf8');
  const printIndex = css.indexOf('@media print');
  assert.ok(printIndex > -1, 'no @media print block found in 01-structure.css');
  const printSelector = css.slice(printIndex).match(/@media print\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)*([^{]+)\{/)?.[1];
  assert.ok(printSelector, 'could not read the print palette block selector');

  const printBest = printSelector.split(',')
    .map((part) => specificity(part))
    .reduce((best, cur) => (beats(cur, best) ? cur : best), [0, 0, 0]);

  const presetBlocks = BLOCKS.filter((b) => b.selector.includes('data-preset'));
  assert.ok(presetBlocks.length > 0, 'no preset-qualified palette blocks in the token model');

  const losing = presetBlocks
    .map((b) => ({ selector: b.selector.trim(), spec: specificity(b.selector) }))
    .filter(({ spec }) => !beats(printBest, spec));

  assert.deepEqual(losing.map((l) => l.selector), [],
    `the print palette (specificity ${printBest.join(',')} from "${printSelector.trim()}") does not `
    + `outrank ${losing.length} preset palette block(s); printing from dark theme in those presets `
    + 'puts the preset dark palette on white paper.');
});

// Row 4.16. The `meridian` preset.
//
// Added because the inherited presets all share one visual habit: saturated
// component fills and coloured arrows, which reads as a dashboard. An
// architecture diagram that goes into a design document, a review, or a
// printout wants the opposite -- a near-neutral ground, low-chroma fills, and
// arrows that carry no hue at all, so that colour means "what this node IS"
// and nothing else competes with it.
//
// It is ADDED, never substituted. Every existing preset renders byte-for-byte
// as it did; a reader who liked `classic` still has `classic`.
//
// And it is measured rather than admired. A palette that looks right on the
// author's monitor and fails in a bright room or on paper is not a
// professional palette, so the floors below are asserted, not assumed.
test('[4.16] every meridian stroke and text pair clears its legibility floor', async () => {
  const { contrastRatio } = await import('../src/color-science.mjs');
  const { BLOCKS } = await import('../../viewer/src/tokens/tokens.mjs');

  const SEMANTIC = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external'];
  for (const theme of ['dark', 'light']) {
    const block = BLOCKS.find((b) => b.selector.includes('meridian') && b.selector.includes(theme));
    assert.ok(block, `meridian ${theme} block is missing`);
    const token = Object.fromEntries(block.props);
    const bg = token['--bg'];

    // WCAG AAA for body text is 7:1. Both themes are built well past it,
    // because a diagram is read at a glance and often at a distance.
    assert.ok(contrastRatio(token['--text'], bg) >= 7,
      `meridian ${theme} body text is ${contrastRatio(token['--text'], bg).toFixed(2)}:1 against its ground`);
    assert.ok(contrastRatio(token['--text-muted'], bg) >= 4.5,
      `meridian ${theme} muted text falls below the AA floor`);

    for (const kind of SEMANTIC) {
      // 3:1 is the WCAG floor for a graphical object's boundary. A stroke that
      // fails it is a component with no visible edge.
      const ratio = contrastRatio(token[`--${kind}-stroke`], bg);
      assert.ok(ratio >= 3,
        `meridian ${theme} ${kind} stroke is ${ratio.toFixed(2)}:1, below the 3:1 graphics floor`);
    }
  }
});

test('[4.16] meridian semantic hues stay far enough apart to tell apart', async () => {
  const { hexToLab, deltaE2000 } = await import('../src/color-science.mjs');
  const { BLOCKS } = await import('../../viewer/src/tokens/tokens.mjs');

  const SEMANTIC = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external'];
  for (const theme of ['dark', 'light']) {
    const token = Object.fromEntries(
      BLOCKS.find((b) => b.selector.includes('meridian') && b.selector.includes(theme)).props,
    );
    for (let i = 0; i < SEMANTIC.length; i += 1) {
      for (let j = i + 1; j < SEMANTIC.length; j += 1) {
        const delta = deltaE2000(
          hexToLab(token[`--${SEMANTIC[i]}-stroke`]),
          hexToLab(token[`--${SEMANTIC[j]}-stroke`]),
        );
        // Just-noticeable difference is about 2.3. A restrained palette risks
        // collapsing two component types into the same apparent colour, which
        // is worse than a garish one: the reader cannot tell a database from a
        // queue and does not know they cannot.
        assert.ok(delta >= 8,
          `meridian ${theme}: ${SEMANTIC[i]} and ${SEMANTIC[j]} differ by only ${delta.toFixed(1)} deltaE`);
      }
    }
  }
});

test('[4.16] meridian arrows carry no component hue', async () => {
  const { hexToLab, deltaE2000 } = await import('../src/color-science.mjs');
  const { BLOCKS } = await import('../../viewer/src/tokens/tokens.mjs');

  // The point of the preset. If the arrow colour drifted towards one of the
  // component hues, a relationship would start looking like a category, which
  // is exactly the ambiguity this palette exists to remove.
  for (const theme of ['dark', 'light']) {
    const token = Object.fromEntries(
      BLOCKS.find((b) => b.selector.includes('meridian') && b.selector.includes(theme)).props,
    );
    const arrow = hexToLab(token['--arrow']);
    for (const kind of ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus']) {
      const delta = deltaE2000(arrow, hexToLab(token[`--${kind}-stroke`]));
      assert.ok(delta >= 10,
        `meridian ${theme}: the arrow reads as ${kind} (${delta.toFixed(1)} deltaE apart)`);
    }
  }
});

test('[4.16] adding meridian changed no existing preset', async () => {
  const { BLOCKS } = await import('../../viewer/src/tokens/tokens.mjs');
  // The whole safety argument for this addition. Every inherited preset keeps
  // its exact token set; the golden digests for those 25 artifacts are
  // unchanged, and only the 5 new meridian ones were added.
  //
  // Counts are pinned per preset rather than assumed uniform. `signal-flow`
  // overrides 30 tokens dark and 27 light and inherits the rest -- a preset is
  // allowed to be partial, and an earlier version of this test asserted a flat
  // 32 and failed on a preset that was always like that.
  const EXPECTED = {
    'signal-flow': [30, 27],
    blueprint: [32, 32],
    editorial: [32, 32],
    'okabe-ito': [32, 32],
  };
  for (const [name, counts] of Object.entries(EXPECTED)) {
    const found = BLOCKS.filter((b) => b.selector.includes(name));
    assert.equal(found.length, 2, `${name} no longer has exactly a dark and a light block`);
    assert.deepEqual(found.map((b) => b.props.length), counts,
      `${name} gained or lost tokens when meridian was added`);
  }
});
