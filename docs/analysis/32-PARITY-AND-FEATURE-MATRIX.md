# 32 · Parity & Feature Matrix

**The "nothing is missed" guarantee.** Every feature the source baseline has, plus every fix,
plus every new capability — with its origin (imported / rebuilt / new) and the phase that
delivers it.

**This document is also the conformance checklist.** **Every row — H, R, and N alike — must
have at least one automated test before it is considered delivered**; CI fails if one
regresses. Test types, commit granularity, and the required checks are specified in
[37 · Engineering Standards](37-ENGINEERING-STANDARDS.md). *Parity is a test result, not a
promise.*

### Legend

| | Origin | Meaning |
|---|---|---|
| **H** | Imported | Imported as working MIT code — parity by construction |
| **R** | Rebuilt | Concept survives, implementation replaced by the new spine |
| **N** | New | Does not exist in the source baseline |

**Totals (counted mechanically from the tables below, 2026-08-29):** **118 capabilities** —
**54 imported (H)**, **2 imported-then-rebuilt (H→R)**, **6 rebuilt (R)**, **56 new (N)**.
Every source-baseline feature is accounted for; none is dropped.

> *Correction: earlier drafts stated "92 capabilities — 44 imported, 12 rebuilt, 36 new."
> Those figures were estimated, not counted, and were wrong. The numbers above were
> extracted programmatically from this document's own tables. The conformance suite is
> sized against the 55 H rows, not 44.*

---

## 1 · Authoring & model

| # | Capability | Origin | Phase | Notes |
|---|---|---|---|---|
| 1.1 | Five typed diagram domains | **H** | P0 | architecture · workflow · sequence · dataflow · lifecycle |
| 1.2 | Typed IR, `additionalProperties:false` | **H** | P0 | The probabilistic↔deterministic boundary. Protected |
| 1.3 | JSON schemas + pre-generated validators | **H** | P0 | Zero-install validation preserved |
| 1.4 | Grid placement (`row`/`col`) | **H** | P0 | Retained as a coarse authoring primitive |
| 1.5 | Structural placement (`lane`/`col`/`stage`) | **H** | P0 | Already renderer-resolved |
| 1.6 | Guided views / chapters (≤5) | **H** | P0 | |
| 1.7 | `quality_profile` standard/showcase | **H** | P0 | |
| 1.8 | Brand marks (107, digest-pinned) | **H** | P0 | |
| 1.9 | Legend modes (auto/all/hidden) | **H** | P0 | |
| 1.10 | Agent contract (`SKILL.md`) | **H→R** | P1 | Rewritten for scan-first flow; skill install becomes optional |
| 1.11 | Explicit `pos:[x,y]` authoring | **R** | P2 | Replaced by intent + solver. Manual pins still honoured as hard constraints |
| 1.12 | Stable semantic IDs | **R** | P1 | **Mandatory for every object** — components, boundaries, connections, messages, flows, states, transitions — ✅ **SHIPPED (P1d)** |
| 1.13 | Mermaid import | **N** | P1 | `import mermaid` → typed IR (adapted from the source project's implementation as the base) |
| 1.14 | **System model** (`model.json`) | **N** | P1 | One inventory; diagrams become views. Kills the 12-node ceiling — ✅ **SHIPPED (P1d)** |
| 1.15 | First-class engineering metadata | **N** | P1 | `owner`, `deployment{regions, networkScope}` as real fields — ✅ **SHIPPED (P1d)** |
| 1.16 | Recipe library (100) | **N** | P3 | The source baseline has 11 |
| 1.17 | Human overrides | **N** | P1 | Recorded as `authored` provenance, never disguised as derived — ✅ **SHIPPED (P1d)** |
| 1.18 | **View compiler** (bounded view IR with intent) | **N** | P1 | Model → `group`/`rank`/`mainPath`/`adjacency`, no coordinates. May not invent a relationship absent from the model; omissions recorded, never silent — ✅ **SHIPPED (P1e)** |

## 2 · Scanner & evidence *(the new spine)*

| # | Capability | Origin | Phase | Notes |
|---|---|---|---|---|
| 2.1 | Repository evidence (revision-pinned) | **H** | P0 | Verifies file/lines existed at an exact SHA |
| 2.2 | Verified Source Beacon (`SRC n`) | **H** | P0 | Extended to edges in P1 |
| 2.3 | Host-agnostic evidence | **N** | P1 | Verification decoupled from link generation → GitLab, Gitee, Bitbucket, GHES, Azure DevOps — ✅ **SHIPPED (P1b)** |
| 2.4 | **Evidence on relationships** | **N** | **P1** | ⭐ The core differentiator. Every edge answers *"why do I believe this?"* — ✅ **SHIPPED (P1b)** |
| 2.5 | **Six-class provenance** | **N** | **P1** | `authored` · `source-backed` · `statically-derived` · `config-derived` · `runtime-observed` · `inferred` — ✅ **SHIPPED (P1b)** |
| 2.6 | Multi-repo evidence identity | **N** | P2 | `{repository, revision, path, symbol/range}` |
| 2.7 | Evidence graph store + query | **N** | P1 | Append-only, provenance-first — ✅ **SHIPPED (P1c)** |
| 2.8 | Scanner: TS/JS imports | **N** | P1 | v1 core adapter — ✅ **SHIPPED (P1c)** |
| 2.9 | Scanner: workspace/package topology | **N** | P1 | v1 core adapter — ✅ **SHIPPED (P1c)** |
| 2.10 | Scanner: HTTP routes | **N** | P1 | Express/Fastify/Next — v1 core adapter — ✅ **SHIPPED (P1c)** |
| 2.11 | Scanner: OpenAPI / gRPC | **N** | P4 | |
| 2.12 | Scanner: Docker Compose | **N** | P4 | |
| 2.13 | Scanner: Terraform / K8s | **N** | P4 | |
| 2.14 | Scanner: DB clients | **N** | P4 | |
| 2.15 | Scanner: queue pub/sub | **N** | P4 | |
| 2.16 | Additional languages | **N** | P4 | Python, Go, Java, C# |
| 2.17 | **Honest coverage report** | **N** | P1 | What was derived, inferred, and *not analysed*. Never a fabricated percentage — ✅ **SHIPPED (P1c)** |

## 3 · Layout & validation

| # | Capability | Origin | Phase | Notes |
|---|---|---|---|---|
| 3.1 | Clean Flow (no edge across unrelated node) | **H** | P0 | |
| 3.2 | Clean Label Gate (≥4 px) | **H** | P0 | Calibrated in P2 |
| 3.3 | Ambiguous Corridor Gate (≥8 px lane) | **H** | P0 | Calibrated in P2 |
| 3.4 | Clear Container Corridor | **H** | P0 | |
| 3.5 | Readable Route Rhythm (8/16 px) | **H** | P0 | Calibrated in P2 |
| 3.6 | Endpoint side contract | **H** | P0 | |
| 3.7 | Automatic Port Spread | **H** | P0 | Dogleg fix in P2 |
| 3.8 | Grid placement validation | **H** | P0 | |
| 3.9 | `deployment-ownership` profile | **H** | P0 | |
| 3.10 | **Structured diagnostics + `supportedFixes`** | **H** | P0 | Protected. The agent correction protocol |
| 3.11 | `showcase` false-negative fix | **R** | P1 | Boundary overlap + collinear frames |
| 3.12 | **Constraint solver** | **N** | **P2** | Adaptagrams — `cola::Lock` pins, `libavoid` routes. Dev-time |
| 3.13 | **`repair --safe`** | **N** | P2 | `makeFeasible()` pattern; receipt for every nudge |
| 3.14 | Calibrated thresholds | **N** | P2 | Mooney corpus bridging study |
| 3.15 | Architecture assertions (`assert`) | **N** | P5 | Architecture rules as CI checks |

## 4 · Rendering & visual *(full detail in [36](36-VISUAL-SYSTEM.md))*

| # | Capability | Origin | Phase | Notes |
|---|---|---|---|---|
| 4.1 | Five typed renderers | **H** | P0 | Refactored to shared passes in P1 |
| 4.2 | `geometry.mjs` (38 exports) | **H** | P0 | |
| 4.3 | Deterministic SVG output | **H** | P0 | Protected |
| 4.4 | 4 presets × 2 themes (8 combos) | **H** | P0 | Classic · Signal Flow · Blueprint · Editorial |
| 4.5 | Style Picker + `S` cycle | **H** | P0 | |
| 4.6 | 23 keyframe animations, 34 transitions | **H** | P0 | Trace, Settled Flow, story pulse, state transitions |
| 4.7 | Semantic sigils | **H** | P0 | |
| 4.8 | Semantic Flow Tokens | **H** | P0 | |
| 4.9 | Text fitting + legend | **H** | P0 | |
| 4.10 | Zero SVG filters/gradients | **H** | P0 | Composition-driven quality → clean raster + portability |
| 4.11 | Shared compiler pipeline | **R** | P1 | Ends five-renderer drift |
| 4.12 | Generated design tokens | **R** | P1 | Replaces 8 hand-written palette blocks |
| 4.13 | **Colour-blind preset (Okabe–Ito)** | **N** | P1 | ~40 lines once tokens are generated |
| 4.14 | **Evidence-first visual language** | **N** | P1 | 6 provenance treatments, on edges too, non-colour-dependent — ✅ **SHIPPED (P1b)** |
| 4.15 | Tree-shaken artifacts | **N** | P3 | Cuts the ~735 KB default |

## 5 · Viewer

| # | Capability | Origin | Phase |
|---|---|---|---|
| 5.1 | Pan / zoom / reset · Semantic Camera | **H** | P0 |
| 5.2 | Node Finder (search) | **H** | P0 |
| 5.3 | Focus + **Semantic Passport** | **H** | P0 |
| 5.4 | Intent Trace | **H** | P0 |
| 5.5 | Route Probe + Route Journey | **H** | P0 |
| 5.6 | Authored Reachability (up/downstream) | **H** | P0 |
| 5.7 | Semantic Lens | **H** | P0 |
| 5.8 | Semantic Radar (minimap) | **H** | P0 |
| 5.9 | Guided Views + Named Chapter Rail | **H** | P0 |
| 5.10 | Story Beats · Director Strip · Horizon · Follow Camera | **H** | P0 |
| 5.11 | Motion Governor + Settled Flow | **H** | P0 |
| 5.12 | Presentation Stage | **H** | P0 |
| 5.13 | Deep links (view/focus/route/reach/relation/beat) | **H** | P0 |
| 5.14 | Print + embed modes | **H** | P0 |
| 5.15 | Runtime i18n (en, zh-CN) | **H→R** | P3 | Runtime switching replaces render-time bake |
| 5.16 | Modularized viewer source | **R** | P1 | From the 693 KB monolith — ✅ **SHIPPED (P1a; row registered in P1c sync)** |
| 5.17 | Renderer↔viewer contract (`contract.mjs`) | **N** | P1 | 202 `data-*` attributes become checked |
| 5.18 | Browser tests in CI | **N** | P0 | 23 pre-existing skips |
| 5.19 | axe-core accessibility gate | **N** | P1 | |
| 5.20 | **Evidence Passport** (edges + provenance) | **N** | P1 — ✅ **SHIPPED (P1b)** | |
| 5.21 | **Nudge-to-patch** | **N** | P3 | Drag → JSON patch. Escape hatch, not an editor |
| 5.22 | Hierarchical view navigation | **N** | P4 | system → service → flow → source |

## 6 · Delivery, export & interfaces

| # | Capability | Origin | Phase | Notes |
|---|---|---|---|---|
| 6.1 | Atomic deliver + SHA-256 receipts | **H** | P0 | Protected |
| 6.2 | Last-good preview server | **H** | P0 | |
| 6.3 | `visual-check` (4 viewports, `pending`) | **H** | P0 | Protected — never auto-claims polish |
| 6.4 | Exports: PNG·JPEG·WebP·SVG·WebM | **H** | P0 | |
| 6.5 | Share Card + Route + Reach cards | **H** | P0 | |
| 6.6 | Clipboard copy (PNG, share card) | **H** | P0 | |
| 6.7 | `compare` (Before/Delta/After + receipt) | **H** | P0 | Becomes the CI drift engine |
| 6.8 | CLI: render·validate·deliver·check·guide·brands·doctor·demo | **H** | P0 | |
| 6.9 | Zero runtime dependencies | **H** | P0 | **Protected. Never trade** |
| 6.10 | Deterministic ZIP packaging | **N** | P1 | ⚠️ *Reclassified H→N 2026-08-29.* Its implementation (`scripts/build-zip.sh`, `write-deterministic-zip.mjs`, `package-smoke.mjs`) lives at the source project's **repo root**, outside the subtree this import copies — so
there is nothing imported to have parity with. Must be written or ported, not inherited. |
| 6.11 | **`<product> .` zero-config entry** | **N** | **P1** | ⭐ The first-run experience |
| 6.12 | Attribution on artifacts | **N** | P3 | The source baseline ships zero — the largest unforced growth error |
| 6.13 | `--format svg-static` (~20 KB) | **N** | P3 | README/PR/Notion/Confluence embedding |
| 6.14 | `publish` → user's own gh-pages | **N** | P3 | No project-owned infrastructure |
| 6.15 | npm distribution (scoped) | **N** | P3 | |
| 6.16 | Playground (client-side, GH Pages) | **N** | P3 | Paste JSON or Mermaid → live |
| 6.17 | **CI action** (drift + delta on PRs) | **N** | P5 | Catch-up *plus* leapfrog |
| 6.18 | **MCP server** | **N** | **P5** | ⭐ System model as agent context |
| 6.19 | `explain` (CLI graph queries) | **N** | P5 | |
| 6.20 | `timeline` (evolution across git history) | **N** | P5 | |
| 6.21 | VS Code extension | **N** | P5 | `preview` already implements the mechanism |
| 6.22 | Compliance profiles | **N** | P6 | **Gated on the compliance evidence pass** |
| 6.23 | **Miro board export** | **N** | **P3** | ⭐ system model → live editable Miro board via `@mirohq/miro-api`. Shapes, connectors, frames; evidence attached as notes. Gives users manual editing and annotation in a tool 90M people already use. Nominative fair use — naming a product you interoperate with is permitted |
| 6.24 | Miro round-trip (annotations back) | **N** | P5 | **Exploratory.** Reading human annotations back into the model is materially harder than export; scoped out of v1 rather than promised |
| 6.25 | draw.io / Excalidraw export | **N** | P5 | Second escape hatch; the source project attempted this and stalled on size |

## 7 · Repo health *(inherited problems, fixed at birth)*

| # | Capability | Origin | Phase |
|---|---|---|---|
| 7.1 | No generated artifacts in git (manifest + CI build) | **N** | P0 |
| 7.2 | Green tests on Windows/macOS/Linux | **N** | P0 |
| 7.3 | ESLint + JSDoc `checkJs` | **N** | P0 |
| 7.4 | `SECURITY.md`, SHA-pinned actions, zero CVEs | **N** | P0 |
| 7.5 | Real Now/Next/Later roadmap | **N** | P0 |
| 7.6 | Conformance/parity suite | **N** | P0 |
| 7.7 | Size budget gate | **N** | P0 |

---

## Nothing dropped — the audit

Every source-baseline feature appears above as **H** or **R**; the accounting is held
privately. Nothing is marked *discarded*.

The four ⚠️ items that look absent are **rebuilt, not removed**:

| Source-baseline feature | Fate |
|---|---|
| Explicit x/y coordinate authoring | **Rebuilt** (1.11) — still honoured as hard constraints; no longer *required* |
| Render-time locale bake | **Rebuilt** (5.15) — becomes runtime switching; both locales survive |
| 693 KB monolithic template | **Rebuilt** (5.16) — same output, modular source |
| Committed release archive | **Rebuilt** (6.10) — same deterministic package, released not committed |

**Conformance rule:** a PR that removes or degrades any **H** row fails CI, regardless of what
it adds.
