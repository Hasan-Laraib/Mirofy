# P1d: The System Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One inventory the diagrams become views of — components, relationships and boundaries with stable IDs, `evidenceRefs[]` and provenance, assembled from authored documents plus P1c's evidence graph. This is roadmap item **P1.6**, matrix rows **1.12, 1.14, 1.15, 1.17**.

**Architecture:** A new dependency-free workspace package `packages/model/`, per `31-V1-ARCHITECTURE.md` §5. It consumes authored diagram documents and an `EvidenceGraph`, and produces `model.json`. Nothing renders from the model yet — that is the view compiler (P1.7), deliberately out of scope below. `packages/core` gains only additive schema fields, so golden moves once, verifiably, for the metadata fields alone.

**Tech Stack:** Node ≥18, zero runtime dependencies (row 6.9), `node:test`.

**Spec:** `31-V1-ARCHITECTURE.md` §3 (System model contract), §5 (layout); `32-PARITY-AND-FEATURE-MATRIX.md` rows 1.12, 1.14, 1.15, 1.17; `33-MASTER-ROADMAP.md` P1.6.

## Scope ruling: P1.7 is NOT in this plan

P1.6 and P1.7 are one roadmap line apart and one design conversation apart. The view compiler is *"where the AI lives — and the only place it lives"* (`31-V1-ARCHITECTURE.md` §2), it has **no matrix row** (`—` in the roadmap's rows column, so nothing would register it as proved), and its binding contract — *cannot emit a relationship absent from the model* — needs the model to exist before it can be tested at all. It follows as P1e.

## Global Constraints

- **Commit identity:** author and committer are `Hasan-Laraib <lxh417bham@gmail.com>`. **Never add a `Co-Authored-By: Claude` trailer.**
- **Zero runtime dependencies** in every workspace package (row 6.9).
- **A new workspace package needs `npm install` committed with it** — `npm ci` fails on all 13 CI jobs otherwise, and it is invisible locally (P1c cost a full CI round to this).
- **Human overrides are recorded as `authored` provenance, never disguised as derived** (row 1.17, and `31-V1-ARCHITECTURE.md` §3 verbatim).
- **Provenance classes come from `evidence-provenance.mjs`.** The model may use all six; `authored` is what an override and a hand-written document get.
- **Backward compatibility is not optional.** Existing authored documents must keep validating and rendering byte-identically except where a task deliberately changes output; every schema addition is optional.
- **Every gate must be observed failing** before its task closes.
- **`testTitle` matches character-for-character**; skipped is not passed.
- **Do not push; the operator merges** (or explicitly delegates).

## File Structure

| Path | Responsibility |
|---|---|
| `packages/model/package.json` | `@mirofy/model`, zero deps |
| `packages/model/src/ids.mjs` | `stableId(kind, subject, context)`, `assignIds(diagram)` — authored id wins, derived id is marked |
| `packages/model/src/model.mjs` | `buildModel({documents, graph, overrides})` → `{components, relationships, boundaries, provenanceSummary}` |
| `packages/model/src/overrides.mjs` | `applyOverrides(model, overrides)` — every override re-provenanced `authored` |
| `packages/model/bin/model.mjs` | `npm run model` → writes `model.json` |
| `packages/core/schemas/common.schema.json` | `$defs.engineering` — `owner`, `deployment{regions, networkScope}` |
| `packages/conformance/test/system-model.test.mjs` | Rows 1.12, 1.14, 1.17 |
| `packages/conformance/test/engineering-metadata.test.mjs` | Row 1.15 |

---

## Task 1: First-class engineering metadata (row 1.15)

Today `owner` is smuggled into a component's `tag` and regions are inferred from boundary membership — `engineering-profiles.mjs` says so in its own diagnostics (`ownerField: 'tag'`). Row 1.15 is exactly the fix: real fields.

- [ ] **Step 1: failing tests** — a component may carry `owner: "payments-team"` and `deployment: {regions: ["eu-west-1"], networkScope: "internal"}`; both validate; `networkScope` outside the permitted set is rejected naming the field; a document using neither still validates unchanged (compatibility).
- [ ] **Step 2:** watch them fail.
- [ ] **Step 3:** add `$defs.engineering` to `common.schema.json`; reference `owner` and `deployment` from architecture components. **Optional**, both of them.
- [ ] **Step 4:** teach `deploymentOwnershipDiagnostics` to read `component.owner` first and fall back to `tag`, and `deployment.regions` first, falling back to boundary membership. Update the diagnostic's `evidence.ownerField` to report which it actually used — a diagnostic that lies about where it looked is worse than none.
- [ ] **Step 5:** regenerate validators; prove the enum bites; confirm the existing engineering-profile tests still pass **unchanged** (they are the compatibility check).
- [ ] **Step 6:** re-baseline drift, verify golden is untouched (these fields are additive and no fixture uses them yet), commit.

## Task 2: Stable semantic IDs (row 1.12)

> **The compatibility trap, read this before writing code.** Row 1.12 says IDs are *"mandatory for every object"*. Read as "tighten every schema to require `id`", that breaks every document ever authored, every fixture, and all 25 golden digests — for a capability the model needs and authors do not. Read as "every object in the MODEL has a stable id", it is non-breaking and delivers the same thing.
>
> **Ruling: the model assigns; the schemas stay permissive.** An authored `id` is used verbatim. Where absent, a deterministic id is derived and **marked as derived**, because a derived id is stable only while the content it derives from is: rename the label and it changes. That is a real limitation and the model states it per object rather than hiding it.

- [ ] **Step 1: failing tests** — `assignIds` gives every component, boundary and relationship an id across all five diagram types; an authored id survives verbatim and is marked `authored: true`; a derived id is deterministic (same input, same id, twice) and marked `authored: false`; two objects that differ only in position get **different** ids; an id collision between an authored and a derived id resolves in the authored id's favour and the derived one is re-derived, never silently overwritten.
- [ ] **Step 2–4:** fail → implement `ids.mjs` → pass.
- [ ] **Step 5: prove the derived-id instability is stated, not hidden** — assert the per-object record carries `authored: false` so a consumer can tell. Commit.

## Task 3: The system model (row 1.14)

**Interfaces:** `buildModel({documents, graph, overrides})` → `{schemaVersion, components[], relationships[], boundaries[], provenanceSummary}`; every object carries `{id, kind, label, evidenceRefs[], provenance, sources[]}`.

- [ ] **Step 1: failing tests** — components from two documents that share an id merge into ONE model component carrying both documents' evidence; a relationship's `evidenceRefs` cite fact ids from the evidence graph; a component with no evidence resolves `authored`; one with graph facts resolves the fact's class; `provenanceSummary` counts objects per class and the counts sum to the object total.
- [ ] **Step 2–4:** fail → implement `model.mjs` → pass.
- [ ] **Step 5: prove the merge is not a silent overwrite** — two documents describing the same component with different labels must produce one component whose record shows both, not the last one seen. Commit.

## Task 4: Human overrides as `authored` (row 1.17)

- [ ] **Step 1: failing tests** — an override changing a component's label produces provenance `authored`, **even when the object previously resolved `statically-derived`**; the override record retains the superseded value so the change is inspectable; an override naming an id absent from the model is refused naming the id, not silently ignored — a typo'd override that does nothing is the failure mode.
- [ ] **Step 2–4:** fail → implement `overrides.mjs` → pass.
- [ ] **Step 5: prove the re-provenancing bites** — remove the re-provenance step and confirm the test fails saying an override kept a derived class. Commit.

## Task 5: `npm run model`, rows, close-out

- [ ] **Step 1:** `packages/model/bin/model.mjs` reads diagram documents (arguments or `fixtures/sources/*.json`), optionally a `--graph scan/evidence-graph.json`, optionally `--overrides <file>`, writes `model.json`, prints the object and provenance counts.
- [ ] **Step 2:** run it against this repository's own fixtures plus the scan graph; record the counts.
- [ ] **Step 3:** register rows 1.12, 1.14, 1.15, 1.17 with exact testTitles; verify via `scripts/conformance.mjs`.
- [ ] **Step 4:** `npm install` committed; `npm run status`; changelog **with its Commits line**; roadmap P1.6 marked; `npm run docs:pdf`; ledger.
- [ ] **Step 5:** full gate both ways; PR; merge on green.

## Definition of done for P1d

- [ ] `owner` and `deployment{regions, networkScope}` are real optional fields, and the ownership diagnostics report which source they used
- [ ] Every model object has a stable id; authored ids win; derived ids are marked as derived
- [ ] Components sharing an id across documents merge into one, carrying both documents' evidence
- [ ] Overrides are recorded as `authored` and retain what they superseded; an override for an unknown id is refused
- [ ] Rows 1.12, 1.14, 1.15, 1.17 registered and proved; no previously proved row lost
- [ ] Existing documents validate and render unchanged; golden moves only where a task says so
- [ ] Every new gate observed failing
- [ ] `npm run check` exit 0 both ways; CI 13/13 before merge
