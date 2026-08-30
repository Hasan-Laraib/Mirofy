# P1e: The View Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the system model into a **bounded** view IR carrying intent — `group`, `rank`, `mainPath`, `adjacency` — with no coordinates, under a contract the compiler cannot break: it may select, group, name and omit, but it may **not** invent a relationship absent from the model, and its omissions are recorded rather than silent. Roadmap item **P1.7**.

**Architecture:** A new dependency-free workspace package `packages/compile/`, per `31-V1-ARCHITECTURE.md` §5. The AI lives behind a **planner seam**: `compileView` takes a planner, validates whatever the planner proposes against the model, and refuses anything the model does not contain. This phase ships the seam plus a **deterministic default planner** — operator decision, 2026-08-30. That is the honest v1: the contract becomes enforceable and testable without a network dependency, and row 6.9 forbids one anyway.

**Tech Stack:** Node ≥18, zero runtime dependencies (row 6.9), `node:test`.

**Spec:** `31-V1-ARCHITECTURE.md` §3 (View compiler contract, verbatim below), §5; `33-MASTER-ROADMAP.md` P1.7; `32-PARITY-AND-FEATURE-MATRIX.md` rows 1.14 (the model it consumes) and **1.18, new** (see below).

> **The contract, verbatim:**
> ```
> input:   system model + view request (type, scope, audience)
> output:  typed view IR with intent (group/rank/mainPath/adjacency), no coordinates
> depends: system model; LLM
> rule:    may select, group, name, and omit. May NOT invent a relationship absent
>          from the model. Omissions are recorded, not silent.
> ```

## P1.7 has no matrix row — this plan adds one

The roadmap's rows column for P1.7 is `—`. Nothing would register this work as proved, and a capability delivered without a row is invisible to every gate downstream of the matrix — the exact blind spot that left row 5.16 sitting in PLANNED for a full phase after it shipped.

**Row `1.18` — "View compiler (bounded view IR with intent)"**, origin `N`, phase `P1`. `1.18` is the next free id in the 1.x block (1.17 is the highest in use). Added to `docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md` in Task 4, so the roadmap and the matrix agree.

## Global Constraints

- **Commit identity:** author and committer are `Hasan-Laraib <lxh417bham@gmail.com>`. **Never add a `Co-Authored-By: Claude` trailer.**
- **Zero runtime dependencies** in every workspace package (row 6.9). **No LLM call in this phase** — the seam only.
- **A new workspace package needs `npm install` committed with it**, verified with `npm ci --dry-run` before pushing.
- **The compiler validates the planner, never trusts it.** Every assertion about "cannot invent" must hold against a *deliberately malicious* planner, not merely against the default one. A contract proven only against a well-behaved implementation is not proven.
- **Omissions are recorded, not silent** — including omissions the planner did not ask for, such as an edge dropped because its endpoint was not selected.
- **No coordinates** anywhere in the IR. Position is the solver's job (P2), and emitting one here would quietly move that boundary.
- **Every gate must be observed failing** before its task closes.
- **`testTitle` matches character-for-character**; skipped is not passed.
- **Do not push; the operator merges** (or explicitly delegates).

## File Structure

| Path | Responsibility |
|---|---|
| `packages/compile/package.json` | `@mirofy/compile`, zero deps |
| `packages/compile/src/request.mjs` | `assertViewRequest(request)` — type, scope, audience, budget |
| `packages/compile/src/compile.mjs` | `compileView(model, request, {planner})` — validates the plan, assembles the IR, records omissions |
| `packages/compile/src/planners/deterministic.mjs` | The default planner: degree-ranked selection, boundary grouping, longest-chain mainPath |
| `packages/compile/bin/compile.mjs` | `npm run compile` → writes `view.json` |
| `packages/conformance/test/view-compiler.test.mjs` | Row 1.18 |

---

## Task 1: The view request and the planner seam

**Interfaces produced:** `assertViewRequest({type, scope, audience, budget})`; the planner contract `plan(model, request) → {select: string[], groups: [{label, members}], rank: string[][], mainPath: string[]}`.

- [ ] **Step 1: failing tests** — a well-formed request validates; a request with an unknown `type` is refused naming the permitted set; `budget` defaults to a documented number and a budget below 1 is refused; the planner contract's shape is validated so a planner returning nonsense is caught at the seam rather than downstream.
- [ ] **Step 2:** watch them fail.
- [ ] **Step 3:** implement `request.mjs`.
- [ ] **Step 4:** pass; commit.

## Task 2: `compileView` and the contract it enforces

This is the task the phase exists for. The three assertions below are the contract, and each must be proven against a planner **written specifically to violate it**.

- [ ] **Step 1: failing tests**
  - a planner proposing an edge absent from the model causes `compileView` to **throw**, naming the invented relationship — not to drop it quietly, because a compiler that silently discards a planner's output hides a broken planner;
  - a planner selecting a node absent from the model throws, naming it;
  - every relationship in the emitted IR exists in the model, asserted by set containment over a real model rather than by inspecting the default planner's behaviour;
  - the IR contains **no** coordinate-like field (`pos`, `x`, `y`, `size`, `route`, `via`) at any depth — asserted by walking the emitted object, so a field added later cannot slip in;
  - an edge whose endpoint was not selected appears in `omissions` with a reason, and never in `edges`.
- [ ] **Step 2:** watch them fail.
- [ ] **Step 3:** implement `compile.mjs`.
- [ ] **Step 4:** pass.
- [ ] **Step 5: prove the contract bites** — remove the invented-relationship check and confirm the malicious-planner test fails; restore. Record the transcript.

## Task 3: The deterministic default planner

- [ ] **Step 1: failing tests** — with a budget smaller than the model, the planner selects the highest-degree nodes and the rest are **recorded as omissions** with a reason naming the budget; grouping follows model boundaries; `mainPath` is a real path in the model (every consecutive pair is a model relationship), not a plausible-looking sequence; the same model and request produce the same view twice.
- [ ] **Step 2–4:** fail → implement `planners/deterministic.mjs` → pass.
- [ ] **Step 5: prove `mainPath` is verified, not asserted** — make the planner emit a path with a non-adjacent pair and confirm the test fails naming the pair. Restore. Commit.

## Task 4: `npm run compile`, row 1.18, close-out

- [ ] **Step 1:** `packages/compile/bin/compile.mjs` reads `scan/model.json` (or `--model`), takes `--type`/`--scope`/`--budget`, writes `view.json`, prints selected/omitted counts.
- [ ] **Step 2:** run against this repository's own model; record the counts, including how many objects the budget omitted.
- [ ] **Step 3:** add row 1.18 to `docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md` **and** register it in `matrix.mjs` with an exact testTitle; verify via `scripts/conformance.mjs`.
- [ ] **Step 4:** `npm install` committed and `npm ci --dry-run` verified; `npm run status`; changelog **with its Commits line**; roadmap P1.7 marked; `npm run docs:pdf`; ledger.
- [ ] **Step 5:** full gate both ways; PR; merge on green.

## Definition of done for P1e

- [ ] A planner cannot cause an invented relationship to reach the IR — proven against a deliberately malicious planner, not the default one
- [ ] The IR carries `group`, `rank`, `mainPath` and `adjacency`, and **no coordinates** at any depth
- [ ] Every omission is recorded with a reason, including edges dropped because an endpoint was not selected
- [ ] `mainPath` is verified to be a real path in the model
- [ ] The default planner is deterministic: same model and request, same view
- [ ] Row 1.18 exists in the matrix document **and** in `matrix.mjs`, and is proved
- [ ] Zero runtime dependencies; no network call anywhere in the package
- [ ] Every new gate observed failing
- [ ] `npm run check` exit 0 both ways; CI 13/13 before merge
