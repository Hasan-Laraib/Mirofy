# P1a Build Ledger — Viewer & Design System Spine

Plan: `L:\Projects\archify\analysis\future\plans\2026-08-29-p1a-viewer-design-system.md`
Controller ledger (full detail): `.superpowers/sdd/2026-08-29-p1a-viewer-design-system/progress.md`
Repo: `L:\Projects\product-p0` · branch `p1a-viewer-design-system` off `main` @ `fed9236` (CI 13/13 green)

This is the condensed record, in the style of `docs/P0-BUILD-LEDGER.md`: what was
decided, why, and what it costs if wrong. The controller ledger above is the
full transcript (30 rulings, 9 plan defects found by implementers/reviewers
rather than by the plan's author); this document pulls forward what a later
reader needs without re-deriving it.

## Pre-flight rulings (selected)

**Ruling 1 — work on a branch, not `main`.** P0 ran on `main` by explicit
operator direction; nine tasks of refactor against a currently-green `main`
warranted a branch instead, with the merge left as a separate, visible
decision. Cost if wrong: one extra merge step.

**Ruling 2/3 — Task 6 retargets, rather than drops, the Task 3 palette test.**
Task 3 added a test reading `src/css/00-palette.css`; Task 6 deletes that file
in favour of a generated token model. Repointed the test at `emitPalette()`
output so the "all 8 blocks present" assertion survives the file's deletion.
Matrix row 4.12 was set exactly once, in Task 6, against `tokens.test.mjs` —
not in Task 4 against a test Task 6 removes.

**Ruling 4/20 — the palette generator must emit the *committed* banner
bytes, not invented text.** Verified from the source: a 3-line comment with a
U+2014 em-dash at CSS lines 1–3, exact indentation (4 spaces then 7), one
blank line between blocks, properties at 6 spaces / closing braces at 4. Two
defects in the plan's own generator code were caught by this before dispatch:
the derive regex dropped `:root,` (multi-line selector), and `emitPalette()`
never referenced `BANNER` at all. Cost if wrong: `check:template` fails
loudly at Task 6 Step 6 — self-correcting but wasteful.

**Ruling 5 — Task 7's original verification snippet used CommonJS `require`**
in a `"type": "module"` package and would have thrown before checking
anything. Replaced with `git show HEAD:… | grep -c okabe-ito` (expect 0) then
the same grep on the working tree (expect >0).

**Ruling 17 — restore a present-tense drift gate, don't reduce provenance to
a historical-only claim.** The rename (see below) converted the old
`check:harvest` into `check:provenance`, a constant function of immutable
history that can never fail on a code change. But Tasks 6/7/9 legitimately
change `packages/core` — a gate phrased as "tree == ancestor modulo
substitutions" would fail on correct work and get disabled within a task.
Chosen form: `scripts/check-core-drift.mjs` + `scripts/core-manifest.json`,
re-baselineable via `--update` (refused under CI), mirroring the existing
`scripts/golden.mjs` pattern. Unplanned proof of its value: commit `ce8eea6`
touched 12 files under `packages/core`; golden stayed 5/5 green **and blind**,
while drift named all 12 — precisely the hole this ruling exists to close,
demonstrated by accident rather than argument.

**Ruling 18 — the plan text for Tasks 4–9 was written pre-rename** and
referenced `check:harvest`, `PRODUCT_CHROME`, `harvest-manifest.json`, and
`archify preview` throughout. Repaired before dispatch; Task 7's "graduation"
step in particular had been "watch check:harvest fail, then reclassify the
manifest entry" — a gate that no longer behaves that way, aimed at a file
that is now immutable. An implementer handed the old text would have
hand-edited the immutable provenance record to make a gate pass.

**Ruling 23 — the Okabe–Ito light palette was Critical-broken** (Task 7):
each hue had been darkened independently to hit a 4.5:1 *text* contrast
target, destroying the lightness axis Okabe–Ito's discrimination rides on.
Two colour pairs were indistinguishable to a person with the exact colour
vision deficiency the preset exists to serve. Re-derived against the
WCAG 1.4.11 graphics floor (3:1) with two verified exceptions kept at 4.5:1
where the colour is genuinely used as text. Required a pairwise CIEDE2000
regression test across 4 simulated vision models, demonstrated failing on the
original values before passing on the fix.

**Ruling 25/26 — Task 9's pre-dispatch size and stop-condition corrections**
(this task; see below).

## Byte-identity chain, Tasks 1–6, and the graduation commit

`packages/core/assets/template.html` was proved byte-identical across the
whole extraction, at every task boundary, by `check-template.mjs` comparing a
fresh `packages/viewer` build against the committed file:

| Boundary | Commit | template.html |
|---|---|---|
| Task 1 (workspace + rebuild) | `fed9236..328024f` | 678,398 bytes, byte-identical on the first run |
| Task 2 (19 JS modules) | `328024f..726499c` | 678,398 bytes, unchanged |
| Task 3 (CSS split, extractor retired) | `726499c..54a1307` | 678,398 bytes, unchanged — `54a1307` tagged `provenance-anchor` |
| Rename (plan's Task 10, executed 4th) | `54a1307..ce8eea6` | all 163 blob hashes move (identifier substitution); proved *reversible*, not byte-frozen in the harvest sense — this is why `check:harvest` became `check:provenance` (a historical claim pinned to `54a1307`) paired with the new `check:drift` |
| Task 4 (golden → 20 digests) | `ce8eea6..bf86b63` | template.html untouched |
| Task 5 (`contract.mjs`) | `bf86b63..88a667d` | template.html untouched |
| Task 6 (generated tokens) | `88a667d..6eea6f4` | self-consistent, byte-identical to its own prior committed form |
| **Task 7 — graduation** | **`31f5b18`** (`build: reclassify template.html as generated and re-baseline goldens`) | **first commit where core bytes move for a genuine content reason** (not a rename): the okabe-ito palette blocks, preset registration, and style-picker option land in `template.html`, five schemas gain the `okabe-ito` enum value, `i18n.mjs` gains its locale pair, and `generated-validators.mjs` regenerates — 8 files, all traced and confirmed necessary (Ruling 22) |
| Task 7 fix round 1 | `80d7132` | light-mode palette re-derived (Ruling 23) |
| Task 8 | `7c31f14`, `2aaca68` | svg `role` fix + boot-time-only documentation |
| Task 9 | `ee56e27`, `a470a18` | `preview.mjs` watch-root fix; five committed examples removed |

Everything from Task 1 through Task 6 held `packages/core` byte-frozen in the
strict sense the plan's Global Constraints define ("Tasks 1–6 must leave
every one of the 163 blob hashes unchanged"); the rename is a distinct,
identifier-only move that the plan explicitly separates from this chain and
that motivated splitting `check:harvest` into `check:provenance` +
`check:drift` (Ruling 17).

## Task 5 Step 6 — the contract-test canary

Required to prove `contract.mjs`'s test is non-vacuous before trusting it.
Verbatim outcome (`task-5-report.md`):

**Canary present** — `data-contract-canary="1"` added to `svgRootAttrs()` in
`packages/core/renderers/shared/cli.mjs`:
```
✖ every data-* a renderer emits has a declared consumer (5.17)
  AssertionError: renderers emit attributes nothing consumes:
    data-contract-canary
tests 3 / pass 2 / fail 1
```
FAIL, naming the injected attribute exactly.

**Canary reverted** — `git checkout -- packages/core/renderers/shared/cli.mjs`:
```
tests 3 / pass 3 / fail 0
```
PASS. Verified before continuing: `git diff -- packages/core` empty;
`check:drift` reported 165/165.

## RESERVED attributes (`packages/viewer/src/contract.mjs`)

Every attribute a renderer emits with no runtime consumer must carry a
written reason a reviewer can disagree with:

| Attribute | Reason |
|---|---|
| `data-brand-mark` | brand-mark badge provenance stamp; asserted by `test/brand-marks.test.mjs`. No runtime surface reads it. |
| `data-brand-sha256` | supply-chain provenance stamp for a captured brand asset; asserted by `test/brand-marks.test.mjs`. No runtime surface reads it. |
| `data-brand-status` | "preset" vs "captured" brand-mark provenance, asserted by `test/brand-marks.test.mjs`. No runtime surface reads it. |
| `data-brand-title` | brand-mark provenance title (source host/name), asserted by `test/brand-marks.test.mjs`. No runtime surface reads it. |
| `data-node-brand-source` | node-level brand provenance; asserted by `test/brand-marks.test.mjs` for captured marks with a live source URL. No runtime surface reads it. |
| `data-legend-baseline` | legend swatch layout geometry (y baseline); asserted by `test/legend-contract.test.mjs`. No runtime surface reads it. |
| `data-legend-width` | legend swatch layout geometry (width); asserted by `test/legend-contract.test.mjs`. No runtime surface reads it. |
| `data-legend-x` | legend swatch layout geometry (x position); asserted by `test/legend-contract.test.mjs`. No runtime surface reads it. |
| `data-legend-semantic-kind` | legend swatch semantic-kind tag, verified by `test/legend-contract.test.mjs`; distinct from the viewer-read `data-legend-kind` container attribute. |
| `data-segment-id` | sequence-diagram segment index; asserted by `test/layout-rules.test.mjs`. No runtime surface reads it. |
| `data-semantic-sigil` | semantic icon kind; asserted by `test/animation.test.mjs` and `test/geometry.test.mjs`. The viewer styles via the `.semantic-sigil` class, not this attribute. |
| `data-flow` | not an attribute at all — a regex false-positive matching the prose substring "data-flow" ("A data-flow diagram…") in `render-dataflow.mjs` and `i18n.mjs`. |
| `data-brand-source` | unclassified at P1a; deletion candidate — no consumer, not even a test |
| `data-node-brand-id` | unclassified at P1a; deletion candidate — no consumer, not even a test |
| `data-node-brand-status` | unclassified at P1a; deletion candidate — no consumer, not even a test |

The last three satisfy the `>=20`-character guard as filler and are flagged
in the controller ledger as a known weakness of that guard against
deliberate filler, deferred rather than fixed (does not change the row's
soundness — no false pass results from it).

## Axe EXPECTED_INCOMPLETE entries (`accessibility.browser.test.mjs`)

The gate asserts `violations` is empty (serious/critical floor) and that the
`incomplete` bucket's rule-id **set** matches this list exactly — a new
incomplete id fails; a known, undeterminable one is acknowledged with node
counts printed as a diagnostic every run:

- **`color-contrast`** — axe cannot compute a background colour for the
  toolbar chrome: affected elements sit over a CSS gradient (or are
  overlapped by another painted element), and axe's contrast check requires
  a single flat background colour to sample.
- **`aria-valid-attr-value`** — `aria-controls` on the preset/export toggle
  buttons (`aria-haspopup`) points at a real element (`#preset-menu` /
  `#export-menu`) that exists in the DOM but is closed (hidden) at scan
  time, since neither menu opens until its button is activated; axe cannot
  confirm an ID reference resolves to a genuine, present target while that
  target is hidden.

Three `moderate`-impact violations are real, present in every preset, and
deliberately left unenforced (this row's floor is serious/critical only):
`heading-order` (1 node), `landmark-one-main` (1 node, no `<main>`
landmark), `region` (4 nodes: `.toolbar`, `.header`, `.diagram-nav`,
`.cards` uncontained by a landmark). Seen, not silently missed.

**Boot-time boundary (Ruling 29):** the fix for the WCAG 4.1.2 violation this
gate found (Task 8) corrects the diagram's ARIA role only after
`packages/viewer`'s boot-time JS runs; `packages/core/renderers/shared/cli.mjs`
still statically emits `role="img"` pre-boot. The gate structurally cannot
see this, since it always scans the post-boot DOM. Documented as explicit
P1b debt rather than widening Task 8.

## The six spec corrections (plan header table), verified figures

| Spec claim | Verified reality |
|---|---|
| `36-VISUAL-SYSTEM.md` §2.1: "37 CSS custom properties per combination" | **32** distinct property names across all 8 blocks (confirmed again by Task 6's generator: 32,32,30,27,32,32,32,32) |
| Implied: all 8 palette blocks are complete | `signal-flow` dark defines **30** properties, light defines **27** — genuine partial overrides inheriting the rest from `:root`, preserved intentionally by Task 6's token model |
| `36-VISUAL-SYSTEM.md` §5: golden = "5 modes × 8 preset/theme combinations" | Theme is a **runtime** toggle, not a render-time input; only `meta.visual_preset` varies at render time. Golden widened to 5 modes × **5 presets** (4 in Task 4, +okabe-ito in Task 7) = **25** digests, all distinct, still byte-covering all 8 palette blocks |
| `33-MASTER-ROADMAP.md` P1.13: "693 KB monolith" | `assets/template.html` was **678,398 bytes / 14,787 lines** pre-rename; **683,160 bytes** at the close of P1a (post rename, post-tokens, post-okabe-ito) |
| Matrix 5.17: "202 `data-*` attributes become checked" | 202 distinct in `template.html`; **49** distinct emitted by renderers; **229** union; **27** emitted by renderers but absent from `template.html` — not dead, consumed by three surfaces: `scripts/check-render-output.mjs`, `delta/architecture-delta.mjs`, `bin/visual-check.mjs`. `contract.mjs` is designed around all three |
| `P0-BUILD-LEDGER.md`: "Action for P1: rename row 3.1" | **Already complete before P1a began.** `matrix.mjs:149` = `Proper Crossing Gate (edge-vs-edge, showcase-only)`; `matrix.mjs:180` = `Clean Flow Gate (no edge across unrelated node)`. Stale debt, struck from `P0-BUILD-LEDGER.md` in Task 9 (see below) |

## Per-task summary

**Task 1** — `packages/viewer` workspace, byte-identical rebuild. Clean,
0 Critical/Important. One deviation: a JSDoc annotation added to satisfy
`tsc --noEmit` under `checkJs` (array-of-tuples widening — the first of
several instances of this exact trap across the plan).

**Task 2** — 19 JS modules. Clean after review. Two deviations, both
adjudicated sound: an ESLint flat-config rule-merge fix, and explicit
`Set`/`Node` globals (both config objects hand-list every global; ecmaVersion
has no bearing). **Ruling 14** fixed one misplaced module boundary
(`07-focus.js` opened with the prior module's trailing statement) before
Task 3 deleted the extractor and the module files became the sole source of
truth.

**Task 3** — CSS split, extractor retired. Reviewed clean, 1 Minor deferred.
**Plan defect found by the implementer:** `PALETTE_END` was specified as 319;
the true seam is 308 (an 11-line error from an unverified closing-brace
guess). Two further brief snippets needed re-anchoring for the same root
cause (4-space CSS indentation inherited from the `<style>` tag).

**Rename (plan's Task 10, executed 4th)** — every `Archify`/`archify`/
`ARCHIFY_` identifier replaced with `Mirofy`/`mirofy`/`MIROFY_` across 4,823
occurrences. **Four plan defects found by the implementer:** a fourth
protected attribution file (`packages/core/LICENSE`, third-party copyright);
75 missed `<!-- ARCHIFY:SVG_SLOT_START -->` colon-form render-slot markers;
`harvest-manifest.json` had to stay unrenamed (it resolves paths *at the
anchor commit*); a fabricated GitHub org leaked into 6 schema `$id`s and
their generated validators. **Ruling 16:** the "identifier-only" proof was
weaker than claimed — it proves *reversibility*, not correctness, and cannot
see any change expressible as the same three substitutions (which is exactly
how the fabricated `$id` hid inside it). **Ruling 17** restored the
present-tense drift gate (see above). Five commits of fix rounds; review
clean after.

**Task 4** — golden widened to 20 digests (5 modes × 4 presets). **Ruling
19:** the plan's own Step 4 expected a failure that could never occur —
`JSON.stringify` drops an `undefined` key, so an absent preset and explicit
`"classic"` render identically; 5/5 old digests reappear as each mode's
classic entry. Replaced with two demonstrations that do work: a corrupted
digest naming its mode/preset, and all-4-presets-per-mode distinctness via
`Set`. Review clean, 0 Critical/Important, distinctness independently
re-verified.

**Task 5** — `contract.mjs`, three consumer surfaces. Canary result above.
Review clean; VIEWER_OWNED's 11 names independently confirmed to return zero
hits against `packages/core/renderers/`.

**Task 6** — generated design tokens. **Plan defect:** the brief's
props-only emitter could never have reproduced the real palette (mid-block
comments, blank lines, column alignment, inter-block banners). **Ruling 21:**
the first fix left two unchecked representations of the same data (`body`
verbatim + a hand-pasted `props` array) — mutation-tested and found that
editing `props` alone was caught by *nothing*. Fixed by deriving `props` from
`body` at load time, deleting 249 pasted lines, making disagreement
impossible by construction rather than tested-for. Review clean after one
fix round.

**Task 7** — the Okabe–Ito preset; core's graduation point (`31f5b18`).
**Ruling 22:** the "exactly one hash may change" instruction was wrong — 8
hashes moved, all traced and required (schemas needed the new enum value
before the preset would even pass validation). **Ruling 23 (Critical):** the
light palette failure described above, re-derived against the 3:1 graphics
floor. Two further minors fixed in round 1 rather than deferred, since they
were defects in the *guard itself*: a false "external is never used as text"
claim (it is, at two call sites, inert only because the actual contrast was
already sufficient) and a hardcoded `#ffffff` surface in the contrast test
(the real surface is derived from the token model, `panelSurfaceOf()`,
verified to throw rather than silently default). Review clean after two fix
rounds.

**Task 8** — axe-core accessibility gate. One real WCAG 4.1.2 defect found
and fixed (diagram `<svg role="img">` declared over real focusable
controls) — verified the rule was genuinely exercised (`passes`, not
`inapplicable`) before and after. **Ruling 28:** the initial "empty
allowlist" framing was pointed at the wrong gap — rule *breadth* was fine;
the gap was that `violations`-only reading silently discarded the
`incomplete` bucket, which held real serious/critical entries on a live
render. Fixed with the reserved-attribute pattern (`EXPECTED_INCOMPLETE`,
above) rather than asserting the bucket empty (which would be permanently
red — axe genuinely cannot resolve those cases). **Ruling 29** documents the
fix's boot-time boundary as explicit P1b debt rather than widening the task.
Accounting both ways: 42/42 proved without Chrome, 59/59 with.

**Task 9 (this task)** — see the task-9 report for full step-by-step detail.
Summary: `preview.mjs` watch-root fix landed (`ee56e27`); five committed
rendered examples removed, tree 7.3 MB → measured **3.9 MB**, budget
lowered 10 MB → 6 MB (`a470a18`); this document and the P0-ledger closing
note follow.

## Verification (measured at the close of Task 9, before push)

- `check:template`: byte-identical, 683,160 bytes.
- `check:provenance`: 163/163 at the pinned `provenance-anchor` tag
  (`54a1307`), unchanged by P1a.
- `check:drift`: 160/160 against a manifest re-baselined only for
  `bin/preview.mjs` (Task 9), the five removed examples (Task 9), and the
  Task 7 graduation set (`template.html`, `i18n.mjs`, 5 schemas,
  `generated-validators.mjs`) — every re-baseline diff was read and confirmed
  to move only the intended paths.
- `test:golden`: 25/25, 5 modes × 5 presets, all digests distinct.
- `test:conformance`: 60 rows — 42/42 proved without Chrome, 17
  browser-deferred by id, 1 UNPROVEN (6.10, pre-existing, out of harvest
  scope); 59/59 proved with `MIROFY_CHROME` set.
- `check:size`: 3.9 MB / 6 MB budget.
- `check:audit`: 0 vulnerabilities.
- Every commit on the branch: authored and committed
  `Hasan-Laraib <lxh417bham@gmail.com>`, 0 `Co-Authored-By: Claude` trailers
  (spot-checked at a mid-flight branch health check and again per-commit
  through Task 9).

## Definition of done for P1a — final status

- `template.html` generated from `packages/viewer/`, proven byte-identical by
  `check:template` — **met**.
- 19 JS modules (largest 1,713 lines, under the 2,000 ceiling); CSS is 1
  authored file (`01-structure.css`) plus a generated palette (Task 6
  deleted `00-palette.css` in favour of the token emitter — corrected from
  an earlier "2 CSS parts" statement of this line, per **Ruling 30**) —
  **met**.
- `contract.mjs` checks all three consumer surfaces, observed to fail on a
  canary — **met** (see above).
- Palette generated from 32 tokens; `signal-flow`'s partial blocks (30/27)
  preserved and encoded as intentional — **met**.
- Okabe–Ito preset renders, cycles, appears in the style picker, uses the
  published CVD-safe hues (re-derived per Ruling 23) — **met**.
- axe-core: no serious/critical violations in any of 5 presets, every
  allowlist entry justified in writing — **met**.
- `check:provenance` 163/163 at the anchor, unchanged; `check:drift` clean
  against a manifest re-baselined only for the paths actually touched —
  **met**.
- Golden is 25 digests (5 modes × 5 presets) — **met**.
- Tracked tree 3.9 MB against a 6 MB budget — **met**.
- `test:conformance` proves rows 5.16, 5.17, 4.12, 4.13, 5.19, no previously
  proved row lost — **met**.
- All 13 CI jobs green; `npm run check` exits 0 both with and without
  `MIROFY_CHROME` — verified locally in Task 9 (see task-9-report.md);
  **CI itself not run** — the branch is deliberately unpushed pending the
  operator's own merge decision.
- No commit carries a `Co-Authored-By: Claude` trailer; every commit
  authored `Hasan-Laraib <lxh417bham@gmail.com>` — **met**.
