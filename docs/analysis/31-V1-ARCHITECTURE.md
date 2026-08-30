# 31 · V1 Architecture

**Principle:** new spine, imported organs. The pipeline that makes it evidence-first is
rebuilt; the subsystems that make output trustworthy and beautiful are imported as working
MIT-licensed code.

---

## 1. The pipeline

```
┌─ repositories ─────────────────────────────────────────────────────────┐
│  source · package manifests · routes · OpenAPI · IaC · compose · k8s   │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [1] SCANNER ──────────────────────────────────────────── NEW ─────────┐
│  Independent adapters. Each emits typed FACTS with provenance.          │
│  Never guesses. Reports what it could not analyse.                      │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [2] EVIDENCE GRAPH ───────────────────────────────────── NEW ─────────┐
│  Append-only store of facts. Every fact: subject, predicate, object,    │
│  provenance class, source location, revision, deriving adapter.          │
│  Queryable. The audit trail for everything downstream.                   │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [3] SYSTEM MODEL ─────────────────────────────────────── NEW ─────────┐
│  The source of truth. Components, relationships, boundaries, owners,     │
│  regions — each carrying evidence refs + provenance. Stable IDs.         │
│  Diagrams are VIEWS of this; the model is never a view.                  │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [4] VIEW COMPILER ────────────────────────────────────── NEW ─────────┐
│  Selects a bounded subset + AI abstraction (naming, grouping,           │
│  main-path selection, what to omit) → typed view IR.                    │
│  AI authors INTENT here: group · rank · mainPath · adjacency.           │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [5] LAYOUT SOLVER ────────────────────────────────────── NEW ─────────┐
│  Adaptagrams: cola::Lock pins authored positions, AlignmentConstraint / │
│  SeparationConstraint, setAvoidNodeOverlaps, libavoid orthogonal        │
│  routing. DEV-TIME ONLY (WASM/port) → artifact stays zero-dependency.   │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [6] VALIDATOR ───────────────────────────────────── IMPORTED ─────────┐
│  geometry.mjs + all gates + diagnostics[] with supportedFixes.          │
│  + repair --safe (makeFeasible pattern) + calibrated thresholds.        │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [7] RENDERERS ───────────────────────────────────── IMPORTED ─────────┐
│  5 typed renderers → refactored onto ONE shared pass pipeline.          │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [8] VIEWER ──────────────────────────────────────── IMPORTED ─────────┐
│  Full interaction model, modularized from the 693 KB template.          │
│  + evidence-first Passport (edges, 6 provenance classes).               │
└────────────────────────────┬───────────────────────────────────────────┘
                             ▼
┌─ [9] INTERFACES ────────────────────────────── NEW + IMPORTED ─────────┐
│  CLI · exports (imported) · CI action (new) · MCP server (new)          │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. The import boundary

| Stage | Origin | Notes |
|---|---|---|
| 1 Scanner | **New** | The hardest new work. Adapter-per-source, all independent |
| 2 Evidence graph | **New** | Store + query. Provenance is a first-class column, never a flag |
| 3 System model | **New** | Descends from the source project's system-model-file concept, built properly from the start |
| 4 View compiler | **New** | Where the AI lives — and the only place it lives |
| 5 Solver | **New** | Adaptagrams verified: `cola::Lock(id,X,Y)` exists and is used per-iteration. **ELK ruled out** — `elk.position` under `layered` is consumed as a sort key and discarded |
| 6 Validator | **Imported** | `geometry.mjs` (1,334 LOC, 38 exports) + `diagnostics.mjs`. Thresholds calibrated later, logic imported now |
| 7 Renderers | **Imported** | 5 renderers, ~3,358 LOC. Refactored to shared passes in P1 |
| 8 Viewer | **Imported** | `template.html` — verified portable: zero path/package references, zero external URLs beyond fonts |
| 9 Interfaces | **Both** | Delivery, receipts, exports imported; CI action and MCP new |

**Import rule:** imported code arrives *unmodified* in P0 with the MIT notice preserved, and
is refactored only in later phases against golden tests. Never both at once.

## 3. Module contracts

Each unit answers *what does it do · how is it used · what does it depend on.*

### Scanner adapter
```
input:   repo root + revision
output:  Fact[]  — {subject, predicate, object, provenance, location{path,lines}, revision, adapter}
         Gap[]   — what it could not analyse and why
depends: nothing (each adapter is independent and separately testable)
rule:    NEVER guess. An unanalysable file is a Gap, not an omission.
```

### Evidence graph
```
input:   Fact[] from any adapter
output:  queryable graph; facts by subject/predicate/provenance; coverage report
depends: nothing
rule:    append-only per revision. A fact is never edited, only superseded.
```

### System model
```
input:   evidence graph + optional human overrides
output:  Component[] Relationship[] Boundary[] — each with evidenceRefs[] + provenance
depends: evidence graph
rule:    human overrides are recorded as `authored` provenance, never disguised as derived.
```

### View compiler
```
input:   system model + view request (type, scope, audience)
output:  typed view IR with intent (group/rank/mainPath/adjacency), no coordinates
depends: system model; LLM
rule:    may select, group, name, and omit. May NOT invent a relationship absent
         from the model. Omissions are recorded, not silent.
```

### Layout solver
```
input:   view IR with intent
output:  view IR with coordinates + routes
depends: Adaptagrams (dev-time)
rule:    authored positions are hard constraints; everything else is solved.
```

Validator, renderers, and viewer keep their existing source-project contracts — that is the
point of importing them.

## 4. Data flow example

```
src/orders/checkout.ts:118-132  →  import-adapter
                                   Fact{orders, calls, payments,
                                        provenance: statically-derived,
                                        location: checkout.ts:118-132, rev: 739ac...}
openapi/payments.yaml           →  openapi-adapter
                                   Fact{payments, exposes, POST /authorize,
                                        provenance: config-derived}
                                          ↓ evidence graph
                    Relationship{orders → payments, protocol: HTTPS,
                                 evidence: [both facts], provenance: statically-derived}
                                          ↓ system model → view compiler
                    "Orders calls Payments on the checkout path" (mainPath: true)
                                          ↓ solver → validator → renderer → viewer
                    Click the edge → file, lines, revision, derivation, provenance class
```

## 5. Repository layout

```
<product>/
├── packages/
│   ├── scanner/        adapters/{imports,routes,openapi,compose,terraform,db,queue,workspace}
│   ├── evidence/       graph store, query, coverage reporting
│   ├── model/          system model, IDs, overrides, provenance
│   ├── compile/        view compiler + AI abstraction
│   ├── layout/         solver bindings (dev-time)
│   ├── validate/       ← imported geometry + diagnostics + repair
│   ├── render/         ← imported renderers on shared pipeline
│   ├── viewer/         ← imported template, modularized (src/ + build)
│   ├── cli/            the `<product> .` entry point
│   ├── ci/             GitHub Action
│   └── mcp/            MCP server
├── conformance/        ← the parity suite (see 32)
└── docs/
```

**Zero runtime dependencies** for anything the artifact ships. Solver, linters, and build
tooling are dev-time — exactly the slot `ajv` occupies in the source project today.

## 6. Error handling

| Failure | Behaviour |
|---|---|
| Adapter cannot parse a file | Record a **Gap**; continue. Gaps surface in the coverage report |
| Conflicting facts from two adapters | Keep both; the model records the conflict and downgrades provenance. **Never silently pick one** |
| View compiler proposes an unknown relationship | **Reject.** It may only select from the model |
| Solver cannot satisfy constraints | Return unsatisfiable constraints as `diagnostics[]` — the existing repair protocol |
| Validation fails | Structured diagnostics; artifact not written; previous artifact preserved byte-for-byte |
| Evidence stale against HEAD | Drift annotation. **Never an automatic risk claim** |

## 7. Testing strategy

| Layer | Approach |
|---|---|
| Scanner adapters | Fixture repos per adapter; assert exact facts **and** exact gaps |
| Evidence graph | Property tests: append-only, provenance preserved, queries total |
| System model | Conflict, override, and stable-ID regression |
| View compiler | Contract test — **cannot emit a relationship absent from the model** |
| Solver | Authored pins are never moved; no unsatisfiable-silent-drop |
| Validator/renderers | **Golden tests from the 7 frozen v1-baseline fixtures** — byte-identical after import |
| Viewer | Browser suite in CI on every PR (23 skips inherited from the source project) + axe-core |
| End-to-end | `<product> .` against 3 real open-source repos; human-reviewed |
| Parity | The conformance suite in [32](32-PARITY-AND-FEATURE-MATRIX.md) |

## 8. Key risks

| Risk | Mitigation |
|---|---|
| **Scanner is the hardest part and easy to underestimate** | v1 = TypeScript/JS only, 3 adapters. Breadth is P4, not P1 |
| Adaptagrams is C++ and unversioned ("no official releases yet") | Pin a commit; WASM build; `makeFeasible()` is the narrow entry point actually needed |
| Importing drags in the source project's coupling | Import unmodified first, refactor only against golden tests |
| Scope collapse under one maintainer | Phase gates in [33](33-MASTER-ROADMAP.md); P1 must ship before P4 begins |
| Competitor already ships extraction | True — CodeBoarding, 9 languages. **The differentiator is downstream**: composition, validation, edge evidence |
