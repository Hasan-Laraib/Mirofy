# 33 · Master Roadmap — Implementation Plan

**Route:** Import — new spine, imported organs, feature parity as a hard constraint.
**Source project:** MIT-licensed @ `12106be` · **Matrix:** [32](32-PARITY-AND-FEATURE-MATRIX.md) · **Architecture:** [31](31-V1-ARCHITECTURE.md)

---

## Phase gates

Each phase has an exit criterion that is **testable, not judged**. No phase begins before its
predecessor's gate passes. The one exception is P3, which runs parallel to P2 because it
touches export paths and docs rather than the pipeline.

```
P0 Foundation ──► P1 Spine ──► P2 Quality ──┬──► P4 Breadth ──► P5 Living+Agent ──► P6
   2-3 wks         6-8 wks       6 wks       │      8 wks           8 wks
                                             └──► P3 Reach (parallel, 4 wks)
```

---

# P0 · Foundation — parity established
**2–3 weeks** · Goal: a new repository whose visuals and validation are provably identical to the source project's.

| # | Task | Matrix | Effort |
|---|---|---|---|
| P0.1 | **New repo, clean from birth.** No committed artifacts; source + `gallery.manifest.json` of `{source, sha256, checkCount}`; CI rebuilds and asserts. Deterministic ZIP → release asset | 7.1, 6.10 | M |
| P0.2 | **Import — unmodified.** Copy `renderers/`, `schemas/`, `assets/template.html`, `delta/`, `brand-marks/`, `bin/` with MIT notice preserved and an explicit attribution line. **No refactoring in this step** | 1.1–1.9, 3.1–3.10, 4.1–4.10, 5.1–5.14, 6.1–6.10 | M |
| P0.3 | **Golden tests green.** The 7 frozen v1-baseline fixtures render byte-identically. All 5 modes × 8 preset/theme combinations. All 6 export formats + 3 share-card variants | 4.4, 6.4, 6.5 | M |
| P0.4 | **Conformance suite.** One test per **H** row in the matrix. CI fails on any regression — *this is the "nothing missed" guarantee, mechanised* | 7.6 | L |
| P0.5 | **Cross-platform green.** Windows/macOS/Linux. `.gitattributes eol=lf`; symlink tests skip with reasons, never fail. *(The source project fails 25/746 on Windows today)* | 7.2 | S |
| P0.6 | **Browser tests in CI from day one.** 23 pre-existing skipped viewer tests run on every PR | 5.18 | M |
| P0.7 | **Hygiene at birth.** ESLint + JSDoc `checkJs`; `SECURITY.md`; SHA-pinned actions; zero CVEs; size budget gate | 7.3, 7.4, 7.7 | S |
| P0.8 | **Naming sprint.** A structured decision process — 50–80 candidates → eliminate → score → 5 finalists → pick — held privately | — | M |
| P0.9 | **Roadmap + thesis published** | 7.5 | S |
| P0.10 | **Spike: Miro API fidelity.** Before committing to 6.23, verify what `@mirohq/miro-api` can actually create — shape types, connector binding, frames, notes — and what fidelity is achievable. Output is an answer, not kept code | 6.23 | S |
| P0.11 | **Engineering standards in force.** Test-per-feature, conventional commits, and the full check suite wired before the first feature lands. See [37](37-ENGINEERING-STANDARDS.md) | — | S |

**Exit gate:** conformance suite green · golden SVGs byte-identical · a `visual-check` contact
sheet from the new repo visually indistinguishable from the source project's · CI green on 3 platforms ·
a chosen name.

---

# P1 · Spine — evidence-first, end to end
**6–8 weeks** · Goal: `<product> .` on a real TypeScript repo produces a trustworthy, evidence-backed architecture view.

> **This phase is the thesis.** If it works, everything after is expansion. If it doesn't, nothing after matters.

| # | Task | Matrix | Effort |
|---|---|---|---|
| P1.1 | ✅ **SHIPPED (P1c)** · **Evidence graph.** Append-only fact store: `{subject, predicate, object, provenance, location, revision, adapter}`. Queryable. Conflict-preserving | 2.7 | L |
| P1.2 | ✅ **SHIPPED (P1c)** · **Scanner adapter 1 — TS/JS imports.** Module graph from real source. Emits Facts **and Gaps** | 2.8 | L |
| P1.3 | ✅ **SHIPPED (P1c)** · **Scanner adapter 2 — workspace topology.** `package.json` workspaces, monorepo structure | 2.9 | M |
| P1.4 | ✅ **SHIPPED (P1c)** · **Scanner adapter 3 — HTTP routes.** Express/Fastify/Next → frontend↔backend edges | 2.10 | L |
| P1.5 | ✅ **SHIPPED (P1c)** · **Honest coverage report.** Derived / inferred / **not analysed**. Never a fabricated percentage | 2.17 | M |
| P1.6 | ✅ **SHIPPED (P1d)** · **System model.** Components, relationships, boundaries with `evidenceRefs[]`. **Mandatory stable IDs for every object.** Human overrides recorded as `authored` | 1.14, 1.12, 1.17, 1.15 | L |
| P1.7 | **View compiler + AI abstraction.** Model → bounded view IR with intent (`group`/`rank`/`mainPath`/`adjacency`). **Contract test: cannot emit a relationship absent from the model** | — | L |
| P1.8 | ✅ **SHIPPED (P1b)** · ⭐ **Evidence on relationships.** `sources` on connections; then messages, flows, transitions | **2.4** | L |
| P1.9 | ✅ **SHIPPED (P1b)** · ⭐ **Six-class provenance.** Carried independently of the fact, on nodes *and* edges | **2.5** | M |
| P1.10 | ✅ **SHIPPED (P1b)** · **Evidence Passport + visual language.** Click an edge → file, lines, revision, derivation, provenance. Six distinguishable treatments, **not colour-dependent** | 5.20, 4.14 | L |
| P1.11 | ✅ **SHIPPED (P1b)** · **Host-agnostic evidence.** Verification decoupled from link generation → GitLab, Gitee, Bitbucket, GHES, Azure DevOps | 2.3 | M |
| P1.12 | **Shared compiler pipeline.** Five renderers → one pass pipeline | 4.11 | XL |
| P1.13 | ✅ **SHIPPED (P1a)** · **Modularize the viewer.** 693 KB monolith → `viewer/src/{core,camera,inspect,trace,story,motion,export,radar}` + build. Template becomes generated, with `check:template`. **Golden tests guard every extraction** | 5.16 | XL |
| P1.14 | ✅ **SHIPPED (P1a)** · **`contract.mjs`.** All 202 `data-*` attributes + CSS classes as one checked source of truth. Resolves the label-colour ambiguity as a written rule | 5.17 | M |
| P1.15 | ✅ **SHIPPED (P1a)** · **Generated design tokens + colour-blind preset.** 8 palette combos from the design system; Okabe–Ito ships as proof | 4.12, 4.13 | M |
| P1.16 | **`showcase` false-negative fix.** Boundary overlap + collinear frames | 3.11 | M |
| P1.17 | ✅ **SHIPPED (P1a)** · **axe-core gate** | 5.19 | S |
| P1.18 | **Mermaid import** | 1.13 | M |
| P1.19 | **Scan-first agent contract.** `SKILL.md` rewritten; skill install becomes optional, not required | 1.10 | M |

**Exit gate:** `<product> .` on three real open-source TypeScript repos produces architecture
views that a human reviewer judges **correct and readable**, every edge carries evidence or an
explicit `inferred`/`authored` provenance class, the coverage report honestly names what was
not analysed, and the conformance suite is still green.

---

# P2 · Quality — solver-driven composition
**6 weeks** · Goal: consistent geometry without repair rounds.

| # | Task | Matrix | Effort |
|---|---|---|---|
| P2.1 | **Constraint solver.** Adaptagrams — `cola::Lock` pins authored positions, `AlignmentConstraint`/`SeparationConstraint`, `setAvoidNodeOverlaps`, `libavoid` orthogonal routing. **Dev-time only** (WASM/port); artifact stays zero-dependency. **ELK ruled out** — verified: `elk.position` under `layered` is consumed as a sort key and discarded | 3.12, 1.11 | XL |
| P2.2 | **`repair --safe`.** `makeFeasible()` pattern — minimise displacement, solve feasibility, report unsatisfiable constraints. Never touches topology, labels, or semantics. Receipt for every nudge | 3.13 | L |
| P2.3 | **Threshold calibration.** Bridging study against the Mooney corpus (447,934 drawings, 10 normalised metrics, published quartiles). Their metrics assume straight-line simple graphs — the transfer to boxed nodes with orthogonal routes **is** the work | 3.14 | L |
| P2.4 | **Straight-route preference.** Fix unnecessary port-spread doglegs via solver port assignment | 3.7 | M |
| P2.5 | **Multi-repo evidence identity** | 2.6 | M |
| P2.6 | **Benchmark harness.** Scheduled trend, release-level gate. **Never a per-PR gate** — external models change with no code change | — | M |

**Exit gate:** measured first-pass usable materially above the 53–67% baseline, reported by the
benchmark. *No target is advertised before it is measured.*

---

# P3 · Reach — parallel to P2
**4 weeks** · Goal: the artifact stops dying on disk.

| # | Task | Matrix | Effort |
|---|---|---|---|
| P3.1 | **Attribution** on viewer footer (dismissible) + Share Cards (permanent). *The source baseline ships zero — every diagram in the wild is untraceable* | 6.12 | S |
| P3.2 | **`--format svg-static`** (~20 KB) + tree-shaken artifacts | 6.13, 4.15 | M |
| P3.3 | **Playground** — fully client-side on GH Pages. Paste JSON or **Mermaid** → live diagram | 6.16 | M |
| P3.4 | **`publish`** → the user's own gh-pages + printed URL | 6.14 | M |
| P3.5 | **npm** (scoped) | 6.15 | S |
| P3.6 | **Nudge-to-patch** | 5.21 | M |
| P3.7 | **Runtime locale switching** | 5.15 | M |
| P3.8 | **Recipe library (100)** | 1.16 | M |
| P3.9 | ⭐ **Miro board export.** System model → live editable Miro board. Shapes, connectors, frames, evidence as attached notes. Scoped by the P0.10 spike | 6.23 | L |

**Exit gate:** a static SVG of the product's own architecture in its own README · a public
playground · a shareable URL · attribution on every export · a real diagram exported to a Miro
board and edited by hand.

---

# P4 · Breadth — the model pays off
**8 weeks** · Goal: more views and more languages from the same evidence graph.

| # | Task | Matrix |
|---|---|---|
| P4.1 | Remaining 4 view types as model views (sequence, dataflow, workflow, lifecycle) | 1.1 |
| P4.2 | Hierarchical navigation: system → service → flow → source | 5.22 |
| P4.3 | Adapters: OpenAPI/gRPC · Compose · Terraform/K8s · DB clients · queues | 2.11–2.15 |
| P4.4 | Languages: Python, Go, Java, C# | 2.16 |

**Exit gate:** one real multi-service repo rendered across ≥3 view types from a single model,
with consistent IDs and evidence across views.

---

# P5 · Living + Agent-native
**8 weeks** · Goal: architecture that maintains itself and answers questions.

| # | Task | Matrix |
|---|---|---|
| P5.1 | **CI action** — evidence drift annotation + architecture delta comment on PRs. *Reports changed facts; never claims risk or merge safety* | 6.17 |
| P5.2 | ⭐ **MCP server** — the system model as agent context. *"What calls PaymentService?"* · *"What changes if I modify AuthService?"* · *"Which components touch PII?"* — structured, evidence-backed answers | **6.18** |
| P5.3 | `assert` — architecture rules as CI checks | 3.15 |
| P5.4 | `explain` — CLI graph queries | 6.19 |
| P5.5 | `timeline` — evolution across git history | 6.20 |
| P5.6 | VS Code extension | 6.21 |
| P5.7 | Miro round-trip (annotations back into the model) — *exploratory* | 6.24 |
| P5.8 | draw.io / Excalidraw export | 6.25 |

**Exit gate:** the product's own repo has a diagram a bot keeps honest on every PR, and a
coding agent can query the model through MCP and receive evidence-backed answers.

---

# P6 · Monetisation-ready
**Open-ended** · Only after P4 and P5.

| # | Task | Notes |
|---|---|---|
| P6.1 | **Close the compliance evidence gap** | **Do this before building anything here.** Three research passes produced *zero* verified claims on PCI-DSS 1.2.3/1.2.4 control text, whether SOC 2 mandates a diagram at all, whether auditors accept generated artifacts, or consultant rates |
| P6.2 | Compliance profiles (`soc2-dataflow`, `pci-segmentation`, `gdpr-data-map`) | Gated on P6.1 |
| P6.3 | Org layer — fleet drift, policy, audit history as a GitHub App | Core stays MIT forever |

**Verified anchors:** the market pays **$30–100/seat/month** (IcePanel $40/$80 per *editor*,
**viewers free and unlimited**; Cloudcraft $40.83/$100; Port $30/$40; Eraser $15/$45), and
Structurizr's self-hosted server starts at **£3,600/yr** while counting **iframe embeds, image
embeds, and API calls as chargeable users**. Copy IcePanel's shape: charge whoever authors and
governs, never whoever reads.

**Never:** relicense the core · hosted rendering SaaS · telemetry · accounts.

---

## Calendar

| Phase | Weeks | Cumulative |
|---|---|---|
| P0 Foundation | 2–3 | ~3 |
| P1 Spine | 6–8 | ~11 |
| P2 Quality | 6 | ~17 |
| P3 Reach *(parallel with P2)* | 4 | ~17 |
| P4 Breadth | 8 | ~25 |
| P5 Living + Agent | 8 | ~33 |

**≈8 months to end of P5 for one maintainer.** Compress by adding reviewers, not by
parallelising a single person. P1 is the only phase that cannot be compressed — it is the
thesis.

## Engineering discipline

Non-negotiable for every phase, specified in full in [37 · Engineering Standards](37-ENGINEERING-STANDARDS.md):

- **A feature is not delivered until it has tests.** Every row in [32](32-PARITY-AND-FEATURE-MATRIX.md) — imported, rebuilt, or new — carries at least one automated test.
- **Small, frequent, conventional commits.** One behaviour per commit; a task in this roadmap is many commits, never one.
- **Every check green before merge.** Lint · types · unit · golden · conformance · browser · a11y · size budget · link check.
- **TDD for new behaviour**; characterisation tests first for imported code.

## Intake filter — every new feature must answer

1. **Which core problem?** evidence · comprehension · quality · distribution · agent-native
2. **Deterministic or probabilistic?** (decides how it is tested)
3. **Does it alter truth claims?** If yes, provenance must be explicit
4. **What must land before it?**
5. **Does it regress an `H` row?** If yes, it does not ship.
6. **What tests prove it works?** Named before implementation starts.

## Never build

Generic auto-layout that owns the narrative · a WYSIWYG editor · hosted rendering or telemetry ·
a dedicated mobile product · an unbounded icon marketplace · a 5,000-node graph viewer · AI in
interactions exact graph traversal can answer · "verified" applied to inferred facts ·
fabricated coverage percentages.
