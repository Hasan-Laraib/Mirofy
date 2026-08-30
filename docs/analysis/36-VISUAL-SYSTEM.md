# 36 · Visual System — Parity Guarantee & Advances

**The question:** will the new product have at least Archify's visuals, or better?
**The answer:** **identical by construction at P0, strictly better from P2 onward** — and the
parity half is verified, not promised.

---

## 1. Why parity is guaranteed, not hoped for

The visual layer is not being re-implemented. It is being **imported as working code** under
MIT. Three portability facts, verified against the source on 2026-08-29:

| Check | Result |
|---|---|
| Does `assets/template.html` reference Archify paths, packages, or hosts? | **No.** Every `archify*` occurrence is an internal CSS class, `@keyframes` name, or DOM id — `archify-node-pulse`, `archify-edge-flow`, `archify-i18n-data`, `archify-radar-live`. Zero file paths, zero package references |
| External network dependencies in the template? | **Only Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`) plus the W3C SVG namespace. Nothing else |
| Third-party imports in the five renderers? | **None.** Only sibling modules plus `node:path` / `node:url` |

The template is a **self-contained string artifact** and the renderers are a **dependency-free
module tree**. Moving them to a new repository is a file copy plus an import-path update.
Renaming the internal `archify-*` prefix is cosmetic and mechanical.

> **This is the whole argument for the Harvest route.** The visual system is the most
> expensive thing Archify owns and the cheapest thing to carry across.

---

## 2. The inherited visual surface (verified inventory)

Everything below arrives in the new product on day one.

### 2.1 Presets and themes

**4 visual presets × 2 colour modes = 8 combinations**, verified in the template:

| Preset | Character |
|---|---|
| **Classic** *(default)* | Midnight console; the reference identity |
| **Signal Flow** | Atmospheric — canvas lift shadow, glow on active focus |
| **Blueprint** | Glow-free, squared materials, precise corners — the exact review surface |
| **Editorial** | Warm paper, deep ink, ruled structure, restrained vermilion accent |

Presets and colour mode are **independent axes** — switching Light/Dark preserves the chosen
preset. Selected through a keyboard-accessible Style Picker (`S` cycles). 37 CSS custom
properties per combination.

### 2.2 Motion — 23 keyframe animations, 34 transition rules

All finite and reader-controlled by contract:

- **Trace animation** (`meta.animation: "trace"`, opt-in) with **Settled Flow** — one finite ambient pass, then permanent settle for that document generation
- **Motion Governor** — reader-controlled Live / Still
- **Semantic Flow Tokens** — five inline SVG cues distinguishing calls, data, events, security boundaries, lifecycle state changes, following the real authored path
- **Story motion** — 780 ms beat pulse, Story Follow Camera (320 ms move, 64 px padding, 1.65× cap, ≥1100 ms dwell)
- **State transitions** — 140–200 ms throughout
- `prefers-reduced-motion` honoured; embeds, print, and canonical exports stay static

### 2.3 Semantic visual vocabulary

- **7 component colours** as *meaning*, never decoration: Verified Cyan (frontend), Proof Green (backend), Repository Violet (database), Cloud Amber, Boundary Rose (security), Transit Orange (messagebus), External Slate
- **Semantic sigils** — one quiet inline SVG role stamp per node (window, brackets, cylinder rings, cloud, shield, transit rails, external portal; lifecycle: start, pulse, hourglass, check, cross)
- **107 brand marks** on neutral plates that never recolour the semantic vocabulary
- **Verified Source Beacon** (`SRC n`) on evidence-backed nodes, stripped from canonical exports
- Mono-forward typography (JetBrains Mono), four-level hierarchy, flat-at-rest elevation

### 2.4 Zero SVG filters or gradients

Verified: **0** `<filter>`, `<linearGradient>`, `<radialGradient>`, or `feGaussianBlur` in the
template. The visual quality comes entirely from **composition, spacing, and colour
discipline**. Three consequences that matter:

1. Rasterisation is exact — no filter artefacts in PNG/JPEG/WebP export
2. The SVG stays small, portable, and editable in other tools
3. It ports to a new codebase with no rendering-stack risk

### 2.5 Export surface

**6 formats** verified in the template — `png` · `jpeg` · `webp` · `svg` · `webm` ·
`share-card` — plus Route Share Card, Reach Share Card, Copy PNG, and Copy Share Card. All
canonical exports strip viewer state, focus glow, camera transform, and temporary marks.

### 2.6 Interaction visuals

Pan/zoom · Semantic Camera framing · Node Finder · Focus + Semantic Passport · Intent Trace ·
Route Probe + Route Journey · Authored Reachability (violet upstream / green downstream) ·
Semantic Lens · Semantic Radar minimap · Guided Views + Named Chapter Rail · Story Beats +
Director Strip + Story Horizon · Presentation Stage · deep links for every state.

---

## 3. Where the new product's visuals get **better**

Parity is the floor. Seven advances, each tied to a roadmap phase.

### V1 · Solver-driven composition — **P2**
Today the model hand-places coordinates, and the measured cost is a **53–67% first-pass
usable rate** with failures concentrated in geometry. With the constraint solver
(`cola::Lock` pins authored intent; `libavoid` routes orthogonally around fixed obstacles),
the model owns composition and the machine owns arithmetic.

**Visual effect:** consistent spacing, no cramped hooks, no accidental doglegs, no
label-on-route collisions — on *every* diagram, not only the ones that survived repair
rounds. **This is the single largest visual improvement available.**

### V2 · Empirically calibrated quality thresholds — **P2**
Archify's gates use thresholds chosen by judgement: 4 px label clearance, 8 px shared-lane,
8/16 px segment rhythm. The Mooney/Purchase/Wybrow/Kobourov corpus publishes median and
quartile distributions for **10 normalised layout metrics across 447,934 drawings from 16,768
graphs**, with dataset and code released, and the authors explicitly endorse calibration use.

**Visual effect:** thresholds justified by distribution rather than taste — and the claim
*"empirically calibrated diagram quality"*, which no competitor can make. *(Their metrics
assume straight-line simple graphs; the bridging study to boxed nodes with orthogonal routes
and containers is real work, scoped in P2.)*

### V3 · Colour-blind-safe preset (Okabe–Ito) — **P1**
Upstream declined this on a maintenance cost that **only exists because the palette is
hand-written 8 times**. Once tokens are generated from the design system, a CVD-safe preset is
roughly a 40-line data change. ~8% of men have colour-vision deficiency and the entire
semantic vocabulary is colour-coded — this is a real accessibility gap, closed cheaply.

### V4 · Evidence-first visual language — **P1**
The genuinely new visual work. Six provenance classes need six distinguishable treatments —
`authored` · `source-backed` · `statically-derived` · `config-derived` · `runtime-observed` ·
`inferred` — applied to **edges as well as nodes**, and legible in both themes, all four
presets, and every export. **Never one green tick.**

Design constraint: provenance must be readable **without colour alone** (texture, stroke
treatment, or marker), because it is a trust signal.

### V5 · Hierarchical views — **P4**
Today a diagram is capped at ~12 primary nodes and larger systems have nowhere to go. With
the system model, scale happens through **hierarchy** — system → service → flow → source —
where each view stays bounded and beautiful. The answer to a 200-service estate is *more
views*, never a denser canvas.

### V6 · Smaller artifacts — **P3**
Every artifact today is ~735 KB because the whole viewer inlines. After the viewer is
modular, tree-shake per diagram type (a sequence diagram needs no boundary-composition code),
and add `--format svg-static` (~20 KB) for embedding. **The full interactive artifact stays
the default** — the light formats are additions, not replacements.

### V7 · Nudge-to-patch — **P3**
Drag a node; the artifact changes nothing; it emits `{"api":{"pos":[340,120]}}` to paste back
into source. Fixes the likeliest quit moment — a 3-pixel error currently costs another LLM
round-trip. An escape hatch, not an editor.

---

## 3b. Visual identity vs. capability parity — resolving the tension

Two requirements look contradictory:

- *"Nothing from Archify should be missed"* → harvest the viewer → **identical visuals**
- *"It shouldn't look like a copy of Archify"* → **distinct visuals**

They resolve on one distinction:

> **Parity is capability, not appearance.**

The conformance suite tests *what the product can do* — 8 preset/theme combinations render, all
6 export formats work, Route Probe traces, the Passport opens. It does **not** require any
particular palette, typeface, or chrome layout.

So once design tokens are generated from the design system (**P1.15**), visual identity becomes
a **token swap**: new palette, new typography scale, new chrome proportions — while every
harvested capability stays intact and the conformance suite stays green.

### What can change without touching capability

| Layer | Changeable | Notes |
|---|---|---|
| Palette (37 custom properties × 8 combos) | ✅ fully | Semantic *roles* must survive; the hues need not |
| Typography | ✅ fully | Mono-forward is a design choice, not a contract |
| Chrome layout, spacing, corner radii, elevation | ✅ fully | |
| Preset names and identities | ✅ fully | Four presets is a capability; *which* four is not |
| Motion timing and easing | ⚠️ within limits | Must stay finite and reader-controlled (§4.2) |
| Semantic colour **roles** | ❌ | Colour must map to meaning — the rule survives any repaint |
| Interaction model | ❌ | That *is* the capability |

### Direction

A lighter, canvas-first surface — warmer neutrals, softer chrome, more spatial and less
"midnight console" — reads as a genuinely different product while keeping every behaviour.
Borrow the *sensibility* of modern canvas tools without copying any specific interface.

**Constraint:** the identity work happens **after P1.15**, never during the harvest. Changing
appearance while extracting modules would make golden tests useless exactly when they are most
needed.

## 4. What must never regress

These are load-bearing. Any change that weakens one is a regression regardless of what it adds.

1. **Truth before spectacle** — no visual implies a relationship or activity absent from the model
2. **Motion has one bounded owner** — finite, reader-controlled; static meaning stays complete
3. **Semantic colour rule** — every saturated colour maps to a meaning; no decorative accents
4. **Canonical clean** — viewer glow, focus, overlays, and camera state never enter exports
5. **Theme parity** — light/dark and all presets preserve category identity and information priority
6. **Flat at rest** — a shadow must explain layering or state, never decorate
7. **One voice** — mono-forward; no display font inside a generated artifact
8. **Accessibility floor** — keyboard access, visible focus, non-colour state cues, `prefers-reduced-motion`

## 5. How parity is enforced

Not by memory — by CI:

| Gate | What it proves |
|---|---|
| **Golden SVG tests** | The 7 frozen v1-baseline fixtures render byte-identically after the harvest |
| **Preset × theme matrix** | All 8 combinations render for all 5 diagram types |
| **Export smoke** | All 6 formats + 3 share-card variants produce non-empty, correctly-sized output |
| **Browser suite in CI** | The 23 currently-skipped viewer tests run on **every** PR |
| **Visual contact sheet** | `visual-check` at 1440×900 / 1600×1000 / 1920×1080 / 2048×1320, light + dark |
| **axe-core** | The accessibility commitments the design system already makes |
| **Contract test** | Every CSS class a renderer emits exists; every `data-*` the viewer reads is emitted |

**Definition of done for P0:** the golden tests pass against the harvested renderers, and a
contact sheet from the new repo is visually indistinguishable from upstream's. Parity is a
test result, not a claim.

---

## 6. Summary

| Phase | Visual state |
|---|---|
| **P0** | **Identical** — same renderers, same template, same 8 preset×theme combinations, verified by golden tests |
| **P1** | **+** colour-blind preset · evidence-first visual language (6 provenance classes on nodes *and* edges) · **distinct visual identity via token swap** (§3b) |
| **P2** | **+** solver-driven composition (the big one) · empirically calibrated thresholds |
| **P3** | **+** smaller artifacts · `svg-static` embedding · nudge-to-patch · **Miro board export** (matrix 6.23) — the diagram becomes a live editable board a whole team can annotate |
| **P4** | **+** hierarchical views for large systems |

At no point are the visuals worse than Archify's, because at no point are they rewritten from
scratch.
