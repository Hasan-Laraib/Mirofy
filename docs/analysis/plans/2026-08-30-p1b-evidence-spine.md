# P1b · Evidence Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every relationship in a Mirofy diagram answer *"why do I believe this?"* — with file, lines, revision, and a provenance class that is legible without colour.

**Architecture:** Evidence already exists for architecture *components* and is verified against a real git repository. P1b promotes the `sources` shape into `common.schema.json`, attaches it to the relationship array of all five diagram types, adds a six-class `provenance` field carried independently of the fact, renders both on edges as well as nodes, surfaces them in the Semantic Passport, and decouples host-specific link generation from host-agnostic verification. It also clears P1a's debt and builds the three operator-facing tools — a living status file, a preview gallery, and PDF regeneration.

**Tech Stack:** Node 18/20/22/24, ESM (`.mjs`), `node:test`, ESLint 9 flat config, `tsc --noEmit` with `checkJs`, Chrome via the existing CDP client, `marked` (devDependency, for PDF generation). No runtime dependencies.

**Spec:**
- `docs/analysis/33-MASTER-ROADMAP.md` — P1.8, P1.9, P1.10, P1.11
- `docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md` — rows 2.3, 2.4, 2.5, 4.14, 5.20
- `docs/analysis/36-VISUAL-SYSTEM.md` — V4 evidence-first visual language, §4 never-regress list
- `docs/analysis/37-ENGINEERING-STANDARDS.md` — test-per-feature, commit granularity
- `L:\Projects\product-p0\docs\P1A-BUILD-LEDGER.md` — the debt this plan clears

**Repository:** `L:\Projects\product-p0` — remote `Hasan-Laraib/Mirofy`, `main` @ `2d2cd09`, CI 13/13 green, conformance 60 rows / 59 proved with Chrome, 1 UNPROVEN (6.10).

---

## Scope

**In scope:** rows **2.4** (evidence on relationships), **2.5** (six-class provenance), **4.14** (evidence-first visual language), **5.20** (Evidence Passport), **2.3** (host-agnostic evidence); P1a's debt; and the three operator tools.

**Deferred to P1c — the scanning spine:** rows 2.7 (evidence graph), 2.8/2.9/2.10 (scanner adapters), 2.17 (honest coverage report), and the system model (roadmap P1.1–P1.6).

> **Why evidence-in-documents comes before scanners.** This plan works entirely on **authored** evidence, which already ships and is already verified against a real repository. It needs no fact store, no adapter, no model — and it delivers the differentiator the product thesis names first. The scanners in P1c produce evidence; P1b builds the place to put it, the vocabulary to describe it, and the surface to read it. Built the other way round, P1c would have nowhere to write and V4's six treatments would be authored twice.

**Deferred to P1d:** view compiler, shared compiler pipeline, `showcase` false-negative fix, Mermaid import, scan-first agent contract.

---

## Corrections to the spec, found by reading the code

Verified against `main` @ `2d2cd09`. Where spec and code disagree, **the code is authoritative**.

| Spec claim | Verified reality | Consequence |
|---|---|---|
| Row 2.4 reads as "add `sources` to connections" | `sources` exists in **one schema of five** (`architecture.schema.json:97`), on components only, and is **inline** — not a `$def`. Four diagram types have no evidence support at all | Task 3 promotes `sources` to `common.schema.json` `$defs` and `$ref`s it from all five. This is five new implementations, not one extension |
| Roadmap P1.11 implies a rewrite for host-agnostic evidence | Verification in `repository-evidence.mjs` is **already** host-agnostic — plain `git` operations. Only two things are GitHub-bound: `githubSlug()`'s regex (line 41) and the hard `startsWith('https://github.com/')` rejection at line 107 | Task 8 is a host-adapter extraction, not a rewrite |
| Six-class provenance introduces `authored` and `inferred` as new vocabulary | Both words already exist throughout, meaning **geometry origin**: `authoredToSide`, `authoredPath`, `authoredField`, `authoredStep` (91 occurrences), and `sideOrigin === 'inferred'` (`geometry.mjs:264-293`) | Task 5 must namespace the new vocabulary. See its "naming collision" note — this is the single most likely source of confusion in this plan |
| Rows 2.3, 2.4, 2.5, 4.14, 5.20 are tracked | **None are in `matrix.mjs`.** Only 2.2 exists | Each task registers its row with a `testTitle` matching a test name character-for-character |
| — | The relationship arrays differ per type: `connections` (architecture), `flows` (dataflow), `transitions` (lifecycle), `messages` (sequence), `edges` (workflow). All carry `id`. Sequence also has `segments` and `activations`, which are **structural, not relationships** | Task 3 attaches `sources` to the five relationship arrays only |
| — | Edges are already marked in the SVG with `data-edge-id`, `data-edge-from`, `data-edge-to`, `data-edge-key`, `data-edge-label` | Task 4's beacons have an existing anchor; no new identity scheme needed |

---

## Global Constraints

- **Commit identity:** author and committer are `Hasan-Laraib <lxh417bham@gmail.com>`. **Never add a `Co-Authored-By: Claude` trailer.**
- **Zero runtime dependencies** in every workspace package (`delivery.test.mjs` row 6.9). `marked` goes in **root `devDependencies`** only.
- **Platform floor:** Node 18/20/22/24 × ubuntu/macos/windows. All 13 CI jobs green.
- **`npm run check` is the gate**, and it now chains: `lint → check:changelog → status:check → typecheck → test → test:golden → check:template → check:drift → test:conformance → check:artifacts → check:size → check:audit`.
- **The core-integrity gate.** `check:drift` is the present-tense gate (`scripts/core-manifest.json`); re-baseline it deliberately with `--update` and confirm only intended paths moved. Its CR-byte guard will refuse to hash a file containing `\r`.
- **Line endings are LF.** A text-mode write poisoned a manifest in P1a. `docs/` is not covered by the CR guard — verify at byte level before committing anything you generated.
- **`testTitle` must match a test name character-for-character.** The harness proves a row only on an exact TAP `ok` match; a mismatch reads as "not proved" while looking registered.
- **Skipped is not passed.** Browser rows report *browser-deferred* without `MIROFY_CHROME`, never proved.
- **Every gate must be observed failing.** Before a task is done, break the thing its new gate guards, watch it fail naming the cause, restore, watch it pass. Record the transcript. Every gate in P1a earned its place this way.
- **Never regress** the eight load-bearing properties in `36-VISUAL-SYSTEM.md` §4 — in particular **truth before spectacle**: no visual may imply a relationship or an evidence class the document does not carry.
- **Conventional commits**, one behaviour each, with `Refs: <row>`. A task is 5–20 commits.
- **Do not push.** The operator merges.

---

## File Structure

**New — operator tooling (Task 1):**

| Path | Responsibility |
|---|---|
| `scripts/gallery.mjs` | Renders 5 types × 5 presets + an index page into `preview/` |
| `scripts/status.mjs` | Generates `docs/IMPLEMENTATION-STATUS.md` from `matrix.mjs` + the roadmap; `--check` fails when stale |
| `scripts/docs-pdf.mjs` | Regenerates the analysis PDFs from their `.md` sources via Chrome CDP `Page.printToPDF` |
| `docs/IMPLEMENTATION-STATUS.md` | Generated. Every capability, its state, its phase, its proof |

**New — evidence (Tasks 3–8):**

| Path | Responsibility |
|---|---|
| `packages/core/renderers/shared/evidence-provenance.mjs` | The six-class vocabulary, its ordering, and its resolution rules |
| `packages/core/renderers/shared/hosts.mjs` | Host adapters: slug parsing + blob-URL templates per forge |
| `packages/viewer/src/js/06-source-evidence.js` | Extended: beacons on edges as well as nodes |
| `packages/conformance/test/evidence.test.mjs` | Rows 2.4, 2.5, 2.3 |
| `packages/conformance/test/provenance-visual.test.mjs` | Row 4.14 — non-colour-dependence proven by simulation |
| `packages/conformance/test/evidence-passport.browser.test.mjs` | Row 5.20 |

**Modified:** all five `packages/core/schemas/*.schema.json` · `common.schema.json` · `repository-evidence.mjs` · `renderers/*/render-*.mjs` (5) · `renderers/shared/cli.mjs` · `packages/viewer/src/js/{06-source-evidence,07-focus}.js` · `packages/viewer/src/css/01-structure.css` · `packages/viewer/src/tokens/tokens.mjs` · `packages/conformance/src/matrix.mjs` · `package.json` · `docs/`

---

## Task 1: Operator tooling — status file, gallery, PDF regeneration

**Files:**
- Create: `scripts/gallery.mjs`, `scripts/status.mjs`, `scripts/docs-pdf.mjs`
- Create: `docs/IMPLEMENTATION-STATUS.md` (generated)
- Modify: `package.json` (scripts + `marked` devDependency), `.gitignore` (ignore `preview/`)

**Interfaces:**
- Consumes: `IMPORTED_ROWS` from `packages/conformance/src/matrix.mjs`; `MODES`, `renderFixture`, `fixturesRoot` from `packages/conformance/src/render.mjs`; `ChromeVisualBrowser`, `findChrome` from `packages/core/bin/visual-check.mjs`.
- Produces: `npm run gallery`, `npm run status`, `npm run status:check`, `npm run docs:pdf`.

> **Why this is Task 1.** The operator asked for three things: a living record of what is built, a way to *see* each feature after it lands, and docs that stay in sync. Building them first means every later task in this plan updates the record and refreshes the gallery as part of its own definition of done, rather than a documentation sweep at the end that nobody reads.

- [ ] **Step 1: Write `scripts/gallery.mjs`**

```js
// Renders every diagram type in every visual preset into preview/, with an
// index page. This is the operator's "what does it look like now" surface:
// run after any change that could alter rendered output.
//
// Deliberately renders from fixtures/sources rather than committed examples --
// the committed examples were removed in P1a as build output, and fixtures are
// what the golden digests and conformance suite already use, so the gallery
// shows the same inputs the gates reason about.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, renderFixture, fixturesRoot } from '../packages/conformance/src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outRoot = path.join(repoRoot, 'preview');
const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito'];

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(outRoot, '.src-'));

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
    renderFixture(mode, src, path.join(outRoot, file));
    made.push({ mode, preset, file, bytes: fs.statSync(path.join(outRoot, file)).size });
  }
}
fs.rmSync(scratch, { recursive: true, force: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const groups = MODES.map(({ mode }) => {
  const cards = made.filter((m) => m.mode === mode).map((m) =>
    `<a class="card" href="${m.file}"><div class="p">${esc(m.preset)}</div>`
    + `<div class="m">${(m.bytes / 1024).toFixed(0)} KB</div></a>`).join('\n');
  return `<h2>${esc(mode)}</h2>\n<div class="grid">\n${cards}\n</div>`;
}).join('\n\n');

fs.writeFileSync(path.join(outRoot, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Mirofy preview</title>
<style>
 body{font:15px/1.55 ui-sans-serif,system-ui,sans-serif;margin:0;padding:2rem;background:#f7f6f3;color:#1a1a1a}
 @media (prefers-color-scheme:dark){body{background:#14161a;color:#f2f2f2}}
 .wrap{max-width:1000px;margin:0 auto}
 h2{font-size:1rem;margin:1.8rem 0 .6rem;border-bottom:1px solid #8884;padding-bottom:.3rem}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.5rem}
 a.card{display:block;padding:.7rem .8rem;border:1px solid #8884;border-radius:7px;text-decoration:none;color:inherit}
 a.card:hover{border-color:#0072b2}
 .p{font-weight:600;font-size:.9rem}.m{opacity:.65;font-size:.78rem}
</style>
<div class="wrap"><h1>Mirofy preview</h1>
<p>Press <kbd>S</kbd> inside a diagram to cycle presets. Click a node to open the Semantic Passport.</p>
${groups}</div>\n`);

console.log(`gallery: ${made.length} artifacts in ${path.relative(repoRoot, outRoot)}/`);
console.log(`open ${path.join(outRoot, 'index.html')}`);
```

- [ ] **Step 2: Run it**

Run: `node scripts/gallery.mjs`
Expected: `gallery: 25 artifacts in preview/`. Open the printed path and confirm all 25 render.

- [ ] **Step 3: Write `scripts/status.mjs`**

It generates `docs/IMPLEMENTATION-STATUS.md` from the conformance matrix, which is the only machine-readable record of what is actually proved. For each row emit: id, name, origin, phase, state, and proof.

State is **derived, not asserted**: a row with `proof: null` is `UNPROVEN`; a row with `browser: true` is `SHIPPED (browser-proved)`; anything else with a proof is `SHIPPED`. Rows named in the roadmap but absent from the matrix are listed separately under `PLANNED` — that list is where P1b's own rows sit until their tasks land, which is what makes the file honest rather than aspirational.

Support `--check`: regenerate into memory, compare with the committed file, exit 1 with a diff hint when they differ. Wire `status:check` into `npm run check` so the status file cannot go stale silently.

- [ ] **Step 4: Prove `--check` catches staleness**

Run: `node scripts/status.mjs` then commit-nothing; hand-edit one line of `docs/IMPLEMENTATION-STATUS.md`; run `node scripts/status.mjs --check`.
Expected: exit 1 naming the file. Regenerate, confirm exit 0. Record the transcript.

- [ ] **Step 5: Add `marked` as a devDependency**

Run: `npm install --save-dev --save-exact marked@14.1.3`
Then: `npm run check:audit` — expected `found 0 vulnerabilities`. Confirm it landed in **root** `devDependencies`, not a workspace.

- [ ] **Step 6: Write `scripts/docs-pdf.mjs`**

Regenerates the analysis PDFs from their `.md` sources so they can never drift again. Uses `marked` for Markdown→HTML and the repository's existing Chrome CDP client for HTML→PDF — **no new runtime dependency, and no second browser stack**.

```js
// Markdown -> HTML -> PDF via the Chrome client the repo already drives for
// visual-check and the axe gate. The PDFs were previously produced by an
// unknown external tool and had no reproducible path; from here they are
// generated artifacts with a committed source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const visualCheck = pathToFileURL(path.join(repoRoot, 'packages/core/bin/visual-check.mjs')).href;
const { ChromeVisualBrowser, findChrome } = await import(visualCheck);

/** @type {Array<[string, string, string]>} */
const DOCS = [
  ['System-Intelligence-Plan', 'docs/analysis', 'Mirofy — System Intelligence Plan'],
  ['System-Intelligence-Corpus', '<private corpus, not migrated into this repo>', 'Mirofy — Analysis Corpus'],
];
```

The generator concatenates the source `.md` files for each PDF in a declared order, renders through `marked`, wraps the result in a print stylesheet (A4, sensible margins, `page-break-inside: avoid` on tables and code blocks), and drives `Page.printToPDF`. Fail with a clear message when Chrome is unavailable rather than emitting a partial PDF — a silently truncated PDF is worse than none.

Take the ordered file list for each PDF from the existing PDFs' structure; if that cannot be recovered, use `00-INDEX.md`'s reading order, which is the document that defines it.

- [ ] **Step 7: Regenerate and compare**

Run: `MIROFY_CHROME=<path> node scripts/docs-pdf.mjs`
Expected: both PDFs written. Open each and confirm headings, tables and code blocks survive, and that the content matches the current `.md` sources. Report page counts before and after in the task report.

- [ ] **Step 8: Wire the scripts and ignore `preview/`**

Add to root `package.json` `"scripts"`: `"gallery"`, `"status"`, `"status:check"`, `"docs:pdf"`. Insert `status:check` into the `check` chain immediately after `lint`. Add `preview/` to `.gitignore` — 17 MB of regenerable artifacts must never be committed; that is the exact debt P1a removed.

- [ ] **Step 9: Full gate and commit**

Run: `npm run check` → exit 0, with `check:size` unchanged (nothing new is tracked beyond three scripts and one generated doc).

Commit as three: the gallery, the status file plus its gate, and the PDF generator. `Refs: 6.9`.

---

## Task 2: Clear P1a's debt

**Files:**
- Modify: `packages/core/renderers/shared/cli.mjs` (the static `role`), `packages/viewer/src/js/07-focus.js` (remove the now-redundant boot patch), `packages/viewer/src/css/01-structure.css` (print block specificity + comment), `packages/conformance/test/viewer-modules.test.mjs` (the palette-block allowlist)
- Modify: `scripts/core-manifest.json` (re-baseline), `fixtures/golden/manifest.json` (re-baseline)

**Interfaces:**
- Consumes: `emitPalette()`, `BLOCKS` from `packages/viewer/src/tokens/tokens.mjs`.
- Produces: no new interfaces.

> **Why before the evidence work.** Task 4 edits the same renderers, and Tasks 6–7 edit the same CSS and token model. Clearing debt first keeps those diffs about evidence instead of tangled with unrelated corrections.

- [x] **Step 1: Write the failing test for the static role**

The gate added in P1a scans the **post-boot** DOM and therefore cannot see the renderer's static output. This test reads the rendered HTML directly, so it can:

```js
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
```

- [x] **Step 2: Run it to verify it fails**

Run: `node --test packages/conformance/test/accessibility.browser.test.mjs`
Expected: FAIL — the static markup still says `role="img"`.

- [x] **Step 3: Fix the renderer**

In `packages/core/renderers/shared/cli.mjs`, change the emitted `role="img"` to `role="graphics-document"`. Update the comment added in P1a: it currently records that the defect is corrected only at viewer boot, and that is no longer true.

- [x] **Step 4: Remove the now-redundant boot-time patch**

In `packages/viewer/src/js/07-focus.js`, remove the runtime role assignment. Leave a one-line comment noting the renderer now emits the correct role. Two mechanisms for one invariant is how they drift apart.

- [x] **Step 5: Verify both, and re-baseline**

Run: `node --test packages/conformance/test/accessibility.browser.test.mjs` → passes, and with `MIROFY_CHROME` set the five axe rows still pass.
Run: `npm run build:template`, then `node scripts/check-template.mjs` → byte-identical.
Run: `npm run check:drift` → FAILS naming `cli.mjs` and `assets/template.html`. Re-baseline with `node scripts/check-core-drift.mjs --update` and confirm **only those two** hashes moved.
Run: `npm run test:golden` → fails; verify the cause is the role attribute only, then `node scripts/golden.mjs --update` (25 entries).

- [x] **Step 6: Fix the print block's specificity bug**

`packages/viewer/src/css/01-structure.css` line ~2618 opens `@media print { :root, [data-theme="dark"], [data-theme="light"] { … } }` setting 27 custom properties, and its comment claims it forces the light palette for print. It does not: `[data-preset="X"][data-theme="Y"]` is specificity (0,2,0) and `[data-theme="light"]` is (0,1,0); `@media` adds none. Printing from dark theme in `signal-flow`, `blueprint`, `editorial` or `okabe-ito` puts the **preset's dark palette on white paper**.

Add `html[data-preset][data-theme]` to the block's selector list. That is (0,2,1) — an element plus two attributes — which outranks every preset-qualified palette selector. Correct the comment to describe what the rule actually does and why the extra selector is required.

- [x] **Step 7: Prove the print fix**

Write a test asserting that, for each of the five presets, the print block's selector list contains a selector whose specificity exceeds that preset's palette selector. Compute specificity in the test rather than asserting a literal string, so a future selector edit is evaluated rather than pattern-matched.

Run it before the fix to see it fail for four presets, then after to see it pass. Record both.

- [x] **Step 8: Close the eleventh-block hole**

`viewer-modules.test.mjs`'s leak assertion checks one literal selector, and P1a recorded a mitigation — "backstopped by the count assertion" — that the final review proved false. Neither check can see a palette block already living in structural CSS, and the print block is the standing counter-example.

Replace it: scan `01-structure.css` for **any** rule declaring four or more `--` custom properties, and assert the set of such selectors matches a documented allowlist, each entry carrying a written reason. The print block is the one legitimate entry. A twelfth block then fails the gate instead of arriving unseen.

- [x] **Step 9: Prove that gate is not decorative**

Add a second palette-like block to `01-structure.css` temporarily; confirm the test fails naming its selector; remove it; confirm it passes. Record the transcript.

- [x] **Step 10: Full gate, gallery, status**

Run `npm run check` → exit 0. Run `npm run gallery` and open `preview/index.html`; print-preview one dark-theme `editorial` diagram (Ctrl+P) and confirm the palette is now light on paper. Run `npm run status`.

Commit as four: the renderer role fix, the boot-patch removal, the print-block fix, the leak-gate replacement. `Refs: 5.19, 4.12`.

> **Deliberately NOT in this task: token-model deduplication.** P1a's final review noted the model stores all ten blocks verbatim rather than deduplicating. I considered folding the print block into the token model to fix both at once and rejected it: moving that block out of `01-structure.css` changes CSS source order, and cascade order is exactly what the specificity bug above is about — fixing a cascade bug with a cascade-affecting refactor in the same task would make the result unverifiable. Deduplication also has no payoff yet, because V4's provenance treatments (Task 6) are structural rather than per-palette. Revisit when something needs six treatments × ten palettes.

---

## Task 3: `sources` on relationships, across all five schemas

**Files:**
- Modify: `packages/core/schemas/common.schema.json` (add `$defs.sources`), `architecture.schema.json` (use the `$ref`, add to `connections`), `dataflow.schema.json` (`flows`), `lifecycle.schema.json` (`transitions`), `sequence.schema.json` (`messages`), `workflow.schema.json` (`edges`)
- Modify: `packages/core/renderers/shared/generated-validators.mjs` (regenerated, never hand-edited)
- Create: `packages/conformance/test/evidence.test.mjs`
- Create: fixtures under `fixtures/sources/` carrying edge evidence
- Modify: `packages/conformance/src/matrix.mjs` (row 2.4)

**Interfaces:**
- Consumes: the existing inline `sources` shape at `architecture.schema.json:97` — `{path (required), line, end_line, label}`, `minItems: 1`, `maxItems: 3`.
- Produces: `$defs.sources` in `common.schema.json`, referenced as `{"$ref": "common.schema.json#/$defs/sources"}` from six sites (five relationship arrays plus architecture components).

- [ ] **Step 1: Write the failing test**

```js
// Row 2.4. The differentiator: every relationship can answer "why do I believe
// this?". Asserted per diagram type, because evidence existed for exactly one
// of the five before this task and a single-type test would have passed while
// four types silently had no support at all.
const RELATIONSHIP_ARRAY = {
  architecture: 'connections',
  dataflow: 'flows',
  lifecycle: 'transitions',
  sequence: 'messages',
  workflow: 'edges',
};

for (const [mode, arrayName] of Object.entries(RELATIONSHIP_ARRAY)) {
  test(`[2.4] ${mode} accepts sources on its ${arrayName} and rejects a malformed entry`, () => {
    const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, FIXTURE[mode]), 'utf8'));
    const rels = source[arrayName];
    assert.ok(Array.isArray(rels) && rels.length, `${mode} fixture has no ${arrayName}`);

    // Accepted: a well-formed evidence entry on the first relationship.
    rels[0].sources = [{ path: 'src/api/routes.ts', line: 12, end_line: 20, label: 'route table' }];
    assert.equal(validate(mode, source).ok, true, validate(mode, source).message);

    // Rejected: `path` is required, so an entry without it must fail validation
    // rather than being silently dropped -- evidence that vanishes quietly is
    // worse than evidence that was never claimed.
    rels[0].sources = [{ line: 12 }];
    assert.equal(validate(mode, source).ok, false, `${mode} accepted a source with no path`);
  });
}
```

Add a `validate(mode, doc)` helper that writes the document to a temp file and shells out to `mirofy validate <mode> <file> --json`, returning `{ok, message}` parsed from the receipt. Use the CLI rather than importing the validator directly, so the test exercises the path a user actually takes.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test packages/conformance/test/evidence.test.mjs`
Expected: all five FAIL — `sources` is not permitted on any relationship array today. (Architecture will fail too: `sources` exists on components, not connections.)

- [ ] **Step 3: Promote `sources` into `common.schema.json`**

Move the inline definition from `architecture.schema.json:97` into `common.schema.json` under `$defs.sources`, verbatim — same `minItems`, `maxItems`, `required`, `additionalProperties: false`, and the same property constraints. Changing any of them here would silently loosen validation for components, which already ship.

- [ ] **Step 4: Reference it from all six sites**

Replace the architecture component's inline block with `{"$ref": "common.schema.json#/$defs/sources"}`, and add the same `$ref` to `connections`, `flows`, `transitions`, `messages` and `edges`. Do **not** add it to sequence's `segments` or `activations` — those are lifeline structure and activation bars, not relationships.

- [ ] **Step 5: Regenerate the validators**

Regenerate `generated-validators.mjs` with the repository's own generator (`packages/core/scripts/generate-validators.mjs`). Never hand-edit it.

**Cross-file `$ref` is the established pattern here, not new ground** — verified before this plan was dispatched: the five schemas already carry **106** cross-file `$ref`s into `common.schema.json` (`legendEntry` alone is referenced 32 times), resolved by `ajv.addSchema()` at `generate-validators.mjs:20`. Your `$defs.sources` reference is one more of the same kind. Treat a resolution failure as a mistake in your edit, not as a limitation of the toolchain.

- [ ] **Step 6: Run the test**

Run: `node --test packages/conformance/test/evidence.test.mjs`
Expected: 5/5 pass.

- [ ] **Step 7: Add evidence to the fixtures**

Add a `sources` entry to at least one relationship in each of the five fixture documents, pointing at real paths in this repository so the evidence is verifiable rather than decorative.

- [ ] **Step 8: Register row 2.4 and re-baseline**

Add row `2.4` to `matrix.mjs` — `origin: 'N'`, `phase: 'P1b'`, `proof: 'evidence.test.mjs'`, `testTitle: '[2.4] architecture accepts sources on its connections and rejects a malformed entry'`. Verify it reports proved via `node scripts/conformance.mjs`, not by eye.

`check:drift` will fail for the schemas and validators; re-baseline and confirm only those moved. Golden will move if the fixtures changed; verify the cause first.

- [ ] **Step 9: Full gate, gallery, status, commit**

`npm run check` → exit 0. `npm run gallery`, `npm run status`. Commit as three: the `$defs` promotion, the five `$ref` sites, the test and row registration. `Refs: 2.4`.

---

## Task 4: Render evidence on edges

**Files:**
- Modify: the five `packages/core/renderers/*/render-*.mjs`, `renderers/shared/repository-evidence.mjs` (resolve edge sources), `packages/viewer/src/js/06-source-evidence.js` (beacons on edges)
- Modify: `packages/conformance/test/evidence.test.mjs`, `matrix.mjs` (row 2.2 extended)

**Interfaces:**
- Consumes: `$defs.sources` (Task 3); existing `data-edge-id` / `data-edge-from` / `data-edge-to` markup.
- Produces: `data-source-evidence-count` and `data-source-evidence-beacon` on edge elements, mirroring the node contract that already exists.

- [ ] **Step 1: Write the failing test** — assert that a rendered artifact carries a resolved evidence payload for an *edge*, and that the payload's path and line match the fixture. Assert per diagram type.

- [ ] **Step 2: Run it, watch it fail.** Evidence resolution today walks components only.

- [ ] **Step 3: Extend `repository-evidence.mjs`** to resolve `sources` on the five relationship arrays as well as components, reusing the existing verification path — the same git checks, the same failure codes. Verification is already relationship-agnostic; only the traversal needs widening.

- [ ] **Step 4: Extend the viewer's beacon installer.** `06-source-evidence.js` currently queries `[data-node-id]`. Add `[data-edge-id]`, positioning the beacon at the edge's label anchor. Keep one code path — two beacon implementations would drift.

- [ ] **Step 5: Prove the beacon appears on an edge in a real browser**, in the browser suite, with `MIROFY_CHROME` set. Row 2.2 currently proves beacons on nodes; extend it rather than adding a parallel row, and update its `testTitle` if the name changes — verifying via the conformance harness.

- [ ] **Step 6: Gallery check.** Run `npm run gallery` and open an architecture diagram: the edge with fixture evidence must show `SRC n`, and clicking it must not throw. Record what you saw.

- [ ] **Step 7: Full gate, re-baselines, status, commit.** `Refs: 2.4, 2.2`.

---

## Task 5: Six-class provenance — the data model

**Files:**
- Create: `packages/core/renderers/shared/evidence-provenance.mjs`
- Modify: `packages/core/schemas/common.schema.json` (`$defs.provenance`), the five schemas, `generated-validators.mjs`
- Modify: `packages/conformance/test/evidence.test.mjs`, `matrix.mjs` (row 2.5)

**Interfaces:**
- Produces: `PROVENANCE_CLASSES` (ordered array of the six), `isProvenanceClass(value)`, `resolveProvenance(subject, fallback)` from `evidence-provenance.mjs`.

> **The naming collisions — read this before writing any code. There are three, and the third is the largest.**
>
> **1. `authored`** — 133 occurrences in renderer/bin/viewer code, meaning *the human wrote this geometry*: `authoredToSide`, `authoredPath`, `authoredField`, `authoredStep`, `authoredSlug`.
>
> **2. `inferred`** — 9 occurrences, as `sideOrigin === 'inferred'` in `geometry.mjs:264-293`, meaning *we guessed which side an edge attaches to*.
>
> **3. `provenance` itself — 113 occurrences, and it already means two other things.** This one was missed in an earlier draft of this plan, which declared the namespace free. It is not:
> - **Asset provenance** — `brand-marks.mjs`, `generated-brand-marks.mjs`, `generate-brand-marks.mjs` and `references/brand-marks.md` use it for *where a brand logo came from* (source URL + SHA-256 per mark, across 107 brands). This accounts for most of the 113.
> - **Document provenance** — `architecture-delta.mjs:274` computes `provenanceChanged`, meaning *the repository metadata differs between base and head*.
>
> Neither is evidence provenance, and none of the three words may be renamed — all are load-bearing and widely referenced.
>
> **What this means for your naming:**
> - **`data-provenance` is FREE** — verified, zero occurrences repo-wide. It is the DOM carrier; use it.
> - **Name the module `evidence-provenance.mjs`, not `provenance.mjs`.** A bare `provenance.mjs` sitting beside 107 brand-mark provenance records is a trap for the next reader, and `git grep provenance` already returns brand-mark noise before anything you write.
> - **Keep the six class names exactly as the spec defines them** — `authored`, `source-backed`, `statically-derived`, `config-derived`, `runtime-observed`, `inferred`. They are the published vocabulary the docs depend on. Disambiguation comes from the carrier, not from renaming the classes.
> - **Export every constant from that module**; never define a class name inline. A reader must be able to tell which `inferred` they are looking at from the surrounding token alone.
>
> State all three collisions in the module's header comment, so the next person greps with them in mind.

- [ ] **Step 1: Write `evidence-provenance.mjs`** with the ordered class list, a membership predicate, and the resolution rule: a relationship or component with no explicit `provenance` but with verified `sources` resolves to `source-backed`; with neither, `authored`. Order matters — it is the display order in the legend and the Passport, and it runs from strongest evidence to weakest.

- [ ] **Step 2: Write the failing tests** — the six classes are exactly these six in this order; an unknown class fails validation; the resolution rule produces `source-backed` for a subject with verified sources and `authored` for one without; and no class name collides with a geometry field on the same object.

- [ ] **Step 3: Run them, watch them fail.**

- [ ] **Step 4: Add `$defs.provenance`** to `common.schema.json` as an enum of the six, and permit it on components and the five relationship arrays. It is **optional** — a document that does not claim a provenance class is not malformed; it resolves to `authored`, which is the truthful default for hand-written documents.

- [ ] **Step 5: Regenerate validators; run the tests; register row 2.5** with an exact `testTitle`.

- [ ] **Step 6: Prove the enum bites** — a document claiming `provenance: "vibes"` must fail validation naming the field. Record it.

- [ ] **Step 7: Full gate, status, commit.** `Refs: 2.5`.

---

## Task 6: The evidence-first visual language (V4)

**Files:**
- Modify: the five renderers (emit `data-provenance`), `packages/viewer/src/css/01-structure.css` (six treatments), `packages/viewer/src/js/06-source-evidence.js`
- Create: `packages/conformance/test/provenance-visual.test.mjs`
- Modify: `matrix.mjs` (row 4.14)

**Interfaces:**
- Consumes: `PROVENANCE_CLASSES` (Task 5); `simulateCvd`, `deltaE2000` from `packages/conformance/src/color-science.mjs` (built in P1a).

> **The binding constraint, from `36-VISUAL-SYSTEM.md` V4:** the six treatments must be distinguishable **without colour**, because provenance is a trust signal. Use stroke treatment, texture and markers — dash patterns, marker shapes, opacity — and let colour reinforce rather than carry. This is why the treatments live in structural CSS rather than the palette: they must survive all five presets and both themes unchanged.

- [ ] **Step 1: Write the failing test** — assert all six classes render with **distinct** non-colour treatments. Concretely: for each class, extract the computed `stroke-dasharray`, `marker-end` and `stroke-width` of an edge carrying it, and assert the six tuples are pairwise distinct. A test that only checked colour would pass a design that fails the spec's central requirement.

- [ ] **Step 2: Add a colour-independence assertion** — render the six, convert each treatment's colour to greyscale (luminance only), and assert the six are *still* pairwise distinguishable by their non-colour attributes alone. Reuse `color-science.mjs` for the luminance conversion rather than writing a second implementation.

- [ ] **Step 3: Run both, watch them fail.**

- [ ] **Step 4: Emit `data-provenance`** on nodes and edges from all five renderers, using `resolveProvenance` so an unclaimed subject still carries its resolved class.

- [ ] **Step 5: Implement the six treatments** in `01-structure.css`, keyed on `[data-provenance="…"]`. Verify each survives all five presets and both themes — the gallery is the fastest way to check this.

- [ ] **Step 6: Prove non-vacuity** — make two classes share a dash pattern; confirm the distinctness test fails naming the colliding pair; restore; confirm it passes.

- [ ] **Step 7: Register row 4.14. Full gate, re-baselines, gallery, status, commit.** `Refs: 4.14, 2.5`.

---

## Task 7: The Evidence Passport for edges

**Files:**
- Modify: `packages/viewer/src/js/07-focus.js` (edge selection → Passport), `06-source-evidence.js`
- Create: `packages/conformance/test/evidence-passport.browser.test.mjs`
- Modify: `matrix.mjs` (row 5.20)

**Interfaces:**
- Consumes: everything from Tasks 3–6; the browser helper at `packages/conformance/test/helpers/browser.mjs`.

- [ ] **Step 1: Write the failing browser test** — click an edge carrying evidence; the Passport opens and reports the file path, the line range, the revision, and the provenance class. Assert against the *fixture's* values, not merely that the panel is non-empty.

- [ ] **Step 2: Run it with `MIROFY_CHROME`, watch it fail** — today only nodes open the Passport.

- [ ] **Step 3: Make edges focusable and selectable**, mirroring the node interaction: keyboard-reachable, visible focus, and the same deep-link behaviour. The accessibility floor in `36-VISUAL-SYSTEM.md` §4 applies — a mouse-only edge Passport is a regression, and the axe gate from P1a will be watching.

- [ ] **Step 4: Render the evidence** — path, line range, revision, provenance class, and the host link built by Task 8's adapter. Strip it from canonical exports, as node evidence already is (`36-VISUAL-SYSTEM.md` §4.4, *canonical clean*).

- [ ] **Step 5: Prove the export stays clean** — assert an exported SVG carries no Passport markup and no beacon.

- [ ] **Step 6: Register row 5.20** with `browser: true` so it defers rather than falsely passes without Chrome. Verify both accountings.

- [ ] **Step 7: Full gate both ways, gallery, status, commit.** `Refs: 5.20`.

---

## Task 8: Host-agnostic evidence

**Files:**
- Create: `packages/core/renderers/shared/hosts.mjs`
- Modify: `packages/core/renderers/shared/repository-evidence.mjs`
- Modify: `packages/conformance/test/evidence.test.mjs`, `matrix.mjs` (row 2.3)

**Interfaces:**
- Produces: `detectHost(url)` → `{id, slug, blobUrl(revision, path, line, endLine)}` or `null`; `HOSTS` (the supported adapter list).

> **Smaller than it reads.** Verification in `repository-evidence.mjs` is already host-agnostic — it runs `git` against a real checkout. Only two things are GitHub-bound: the `githubSlug()` regex at line 41, and the hard `startsWith('https://github.com/')` rejection at line 107. This task extracts those into adapters and deletes the rejection.

- [ ] **Step 1: Write the failing test** — for each supported host, a repository URL parses to the right slug and produces the correct blob URL shape:

| Host | Blob URL |
|---|---|
| GitHub | `{repo}/blob/{rev}/{path}#L{line}-L{end}` |
| GitLab | `{repo}/-/blob/{rev}/{path}#L{line}-{end}` |
| Bitbucket | `{repo}/src/{rev}/{path}#lines-{line}:{end}` |
| Gitea / Gitee | `{repo}/src/commit/{rev}/{path}#L{line}-L{end}` |
| Azure DevOps | `{repo}?path={path}&version=GC{rev}&line={line}&lineEnd={end}` |

Assert the exact strings. A test asserting only "a URL was produced" would pass every wrong template.

- [ ] **Step 2: Run it, watch it fail** — `hosts.mjs` does not exist.

- [ ] **Step 3: Write `hosts.mjs`** with one adapter per host: a URL matcher, a slug extractor, and a blob-URL builder. Keep `ssh://`, `git@` and `https://` forms working for each, as the GitHub matcher already does.

- [ ] **Step 4: Rewire `repository-evidence.mjs`** to call `detectHost()`, and **delete** the `startsWith('https://github.com/')` rejection. Keep every existing failure code and message for the GitHub path — a user on GitHub must see no behaviour change, and the existing tests are the check.

- [ ] **Step 5: Prove an unknown host fails honestly** — a URL matching no adapter must produce a clear diagnostic naming the supported hosts, not a silently wrong link. Assert the message lists them.

- [ ] **Step 6: Confirm GitHub is unchanged** — run the full existing evidence suite and confirm no GitHub-path assertion changed. Record the before/after counts.

- [ ] **Step 7: Register row 2.3. Full gate, status, commit.** `Refs: 2.3`.

---

## Task 9: Close out P1b

**Files:**
- Create: `docs/P1B-BUILD-LEDGER.md`
- Modify: `docs/IMPLEMENTATION-STATUS.md` (regenerated), `docs/P1A-BUILD-LEDGER.md` (debt disposition), `README.md`, `CONTRIBUTING.md`, the analysis `.md` sources and their PDFs

- [ ] **Step 1: Write the P1b ledger** in the style of `docs/P1A-BUILD-LEDGER.md`: what was decided, why, and what it costs if wrong. Carry forward every defect found in *this plan* by an implementer or reviewer — P1a's ledger records nine, and that record proved more useful than any success narrative in it.

- [ ] **Step 2: Record the P1a debt disposition** in `docs/P1A-BUILD-LEDGER.md`: the static `role="img"` — **fixed** at the renderer (Task 2); the print palette block — **specificity corrected and the false mitigation replaced** (Task 2); token deduplication — **still deferred**, with the reason.

- [ ] **Step 3: Update the analysis sources and regenerate the PDFs.** `32-PARITY-AND-FEATURE-MATRIX.md` must reflect the rows now shipped; `33-MASTER-ROADMAP.md` must show P1.8–P1.11 complete. Then `npm run docs:pdf`, and confirm the regenerated PDFs carry the updated content.

- [ ] **Step 4: Regenerate the status file and the gallery**, and confirm `npm run status:check` passes.

- [ ] **Step 5: Final verification** — `npm run check` exit 0 both with and without `MIROFY_CHROME`; report both. Do **not** push; the operator merges.

---

## Definition of done for P1b

- [ ] All five diagram types accept `sources` on their relationship array, via one shared `$defs.sources`
- [ ] Evidence resolves and renders on edges as well as nodes, verified against a real repository
- [ ] Six provenance classes exist, are validated, and resolve by a documented rule
- [ ] The six treatments are **pairwise distinct without colour**, proven by simulation, across 5 presets × 2 themes
- [ ] Clicking an edge opens the Passport with file, lines, revision and provenance — keyboard-reachable, and stripped from canonical exports
- [ ] Five forges supported; an unknown host fails with a diagnostic naming the supported list
- [ ] Rows 2.3, 2.4, 2.5, 4.14, 5.20 registered and proved, each `testTitle` matching character-for-character; no previously-proved row lost
- [ ] P1a debt cleared: static role fixed at the renderer, print block correct, leak gate replaced with a real one
- [ ] `npm run gallery`, `npm run status`, `npm run docs:pdf` all work; `status:check` is in the `check` chain
- [ ] Every new gate has been observed failing on a deliberate break, with the transcript recorded
- [ ] `npm run check` exit 0 with and without Chrome; all 13 CI jobs green
- [ ] No commit carries a `Co-Authored-By: Claude` trailer

---

## Self-review

**1. Spec coverage.** Row 2.4 → Tasks 3–4. Row 2.5 → Task 5. Row 4.14 → Task 6. Row 5.20 → Task 7. Row 2.3 → Task 8. P1a debt → Task 2. Operator tooling → Task 1. Close-out → Task 9. **Deliberate gaps:** rows 2.7 (evidence graph), 2.8–2.10 (adapters) and 2.17 (coverage report) are P1c and named as such in Scope — this plan builds the place evidence lives, not the machinery that discovers it. `36-VISUAL-SYSTEM.md`'s visual contact sheet remains deferred, as in P1a: `visual-check` reports `visualReview: 'pending'` by design and automating it would automate a judgement the spec says stays human.

**2. Placeholder scan.** Tasks 4–8 give step intent plus the exact assertion targets rather than full code bodies, because each depends on interfaces created earlier in the same plan and transcribing them here would fossilise signatures the earlier task should own. Every one names the file, the assertion, and the failure to demonstrate. Tasks 1–3 carry complete code because they have no such dependency. No step says "add error handling", "write tests for the above", or "similar to Task N".

**3. Type consistency.** `$defs.sources` (Task 3) is consumed by Tasks 4, 7, 8. `PROVENANCE_CLASSES` / `resolveProvenance` (Task 5) are consumed by Tasks 6, 7. `detectHost` (Task 8) is consumed by Task 7's Passport link — **Task 7 precedes Task 8**, so Task 7 must render the link through a seam Task 8 fills; its Step 4 says so explicitly. `simulateCvd` / `deltaE2000` come from P1a's `color-science.mjs` and are used unchanged. `data-provenance` is the single DOM carrier throughout.

**4. Ordering.** Debt (2) precedes the renderer and CSS work that would tangle with it. Schema (3) precedes rendering (4). The data model (5) precedes its visual language (6) and its Passport (7). Task 8 trails Task 7 by design — noted above and handled by a seam.
