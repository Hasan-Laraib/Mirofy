# Analysis Corpus — Index

**Product:** `Mirofy` · **Route:** Import — new spine, imported organs, feature parity as a
hard constraint. **Constraint:** feature parity is mandatory; nothing the source baseline has
is lost.

This is the working subset of the analysis corpus that is active and tracked in this
repository. The remainder of the corpus (frozen evidence base, superseded reasoning, and
plans held for a later phase) is kept privately outside this repository.

---

## Read in this order

| # | Document | What it gives you |
|---|---|---|
| **1** | [**30 · Product Thesis**](30-PRODUCT-THESIS.md) | What this is, who it's for, what it refuses to become |
| **2** | [**32 · Parity & Feature Matrix**](32-PARITY-AND-FEATURE-MATRIX.md) | **118 capabilities** — imported / rebuilt / new, with phases. The "nothing missed" guarantee |
| **3** | [**33 · Master Roadmap**](33-MASTER-ROADMAP.md) | The implementation plan, P0 → P6, with testable phase gates |
| **4** | [**36 · Visual System**](36-VISUAL-SYSTEM.md) | Why the visuals are **identical at P0 and better from P2** — verified, not promised |
| 5 | [31 · V1 Architecture](31-V1-ARCHITECTURE.md) | The 9-stage pipeline, import boundary, module contracts, testing |
| 6 | [37 · Engineering Standards](37-ENGINEERING-STANDARDS.md) | Test-per-feature, commit granularity, and the required checks |
| **▶** | [**P1b Implementation Plan**](plans/2026-08-30-p1b-evidence-spine.md) | **Paused.** 9 tasks — the evidence spine. Resumes once rebased onto this repository |

---

## The plan in one table

| Phase | Weeks | Delivers |
|---|---|---|
| **P0 Foundation** | 2–3 | New repo, import, **conformance suite green**, golden SVGs byte-identical, 3-platform CI, name chosen |
| **P1 Spine** ⭐ | 6–8 | Scanner (TS/JS) → evidence graph → system model → view compiler. **Edge evidence + six-class provenance.** `mirofy .` works |
| **P2 Quality** | 6 | Constraint solver, `repair --safe`, calibrated thresholds |
| **P3 Reach** *(parallel)* | 4 | Attribution, `svg-static`, playground, `publish`, npm, nudge-to-patch, **Miro board export** |
| **P4 Breadth** | 8 | 4 more view types, hierarchical navigation, more adapters and languages |
| **P5 Living + Agent** | 8 | CI drift action, **MCP server**, `assert`, `explain`, `timeline` |
| **P6 Monetise-ready** | — | Org layer; compliance gated on the evidence pass |

**≈8 months to end of P5 for one maintainer.** P1 is the thesis and cannot be compressed.

## Headline facts

| Signal | Value |
|---|---|
| Capabilities planned | **118** — 54 imported (parity), 2 H→R, 6 rebuilt, 56 new. **Every row carries a test** |
| Visual parity | **Verified portable**: template has zero path/package refs; renderers have zero third-party imports |
| Visual surface inherited | 4 presets × 2 themes · 23 keyframe animations · 6 export formats · 0 SVG filters |
| Structural moat | Every verified rival emits **Mermaid**, which has **no coordinate primitive** |

## The thesis

> **Point it at a codebase and it builds a living, evidence-backed model of the system — then
> lets humans and agents understand, explore, explain, and review that system through
> beautiful, trustworthy views where every important fact can say why it is believed.**
