# P1c: Evidence Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the machinery that *discovers* evidence — the evidence graph, three scanner adapters, and the honest coverage report — so that facts about a real repository can flow into the evidence spine P1b built.

**Architecture:** Two new workspace packages, exactly as `31-V1-ARCHITECTURE.md` §5 lays them out: `packages/scanner/` (adapter-per-source, each independent and separately testable) and `packages/evidence/` (append-only graph store, query, coverage reporting). Nothing in `packages/core` changes — P1c is entirely additive, so `check:drift` and golden never move. The user-facing entry point is `npm run scan` via `packages/scanner/bin/scan.mjs`, not a new verb in `mirofy.mjs`.

**Tech Stack:** Node ≥18, zero runtime dependencies (row 6.9 binds every workspace package), `node:test`.

**Spec:** `docs/analysis/31-V1-ARCHITECTURE.md` §3 (module contracts), §4 (data flow); `docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md` rows 2.7, 2.8, 2.9, 2.10, 2.17; `docs/analysis/33-MASTER-ROADMAP.md` P1.1–P1.5.

## Global Constraints

- **Commit identity:** author and committer are `Hasan-Laraib <lxh417bham@gmail.com>`. **Never add a `Co-Authored-By: Claude` trailer.**
- **Zero runtime dependencies** in every workspace package (row 6.9). The TS/JS scanner is a tokenizer-level extractor, not a parser dependency.
- **The scanner rule, verbatim from the spec:** *NEVER guess. An unanalysable file is a Gap, not an omission.*
- **The graph rule, verbatim:** *append-only per revision. A fact is never edited, only superseded.*
- **The coverage rule, verbatim:** *What was derived, inferred, and not analysed. Never a fabricated percentage.*
- **Fact shape, verbatim:** `{subject, predicate, object, provenance, location{path,lines}, revision, adapter}`.
- **Provenance classes come from `packages/core/renderers/shared/evidence-provenance.mjs`** — the published six. Scanners emit `statically-derived` (code analysis) or `config-derived` (manifest/config analysis); they never emit `authored`, `runtime-observed` or `inferred`.
- **Every gate must be observed failing** before its task closes.
- **`testTitle` matches character-for-character**; skipped is not passed.
- **`npm run check` is the gate**; P1c adds `test` coverage through the existing `scripts/run-tests.mjs` glob — verify new test files are picked up rather than assuming.
- **Do not push; the operator merges** (or explicitly delegates).

## File Structure

| Path | Responsibility |
|---|---|
| `packages/evidence/package.json` | `@mirofy/evidence`, zero deps |
| `packages/evidence/src/fact.mjs` | Fact/Gap shape validation: `assertFact`, `assertGap`, `FACT_PROVENANCE` (the two classes scanners may claim) |
| `packages/evidence/src/graph.mjs` | `EvidenceGraph`: `append`, `supersede`, `facts({subject, predicate, provenance})`, `gaps()`, serialisation |
| `packages/evidence/src/coverage.mjs` | `coverageReport(graph, inventory)` → per-file: analysed-by / gap / not-analysed |
| `packages/scanner/package.json` | `@mirofy/scanner`, zero deps |
| `packages/scanner/src/adapter.mjs` | The adapter contract: `runAdapter(adapter, {repoRoot, revision})` → `{facts, gaps, inventory}` with shape enforcement |
| `packages/scanner/src/adapters/workspace.mjs` | package.json workspaces → package/topology facts |
| `packages/scanner/src/adapters/imports.mjs` | TS/JS import extraction → module dependency facts |
| `packages/scanner/src/adapters/routes.mjs` | Express/Fastify calls + Next file routes → HTTP surface facts |
| `packages/scanner/bin/scan.mjs` | `npm run scan [-- <repoRoot>]` → writes `evidence-graph.json` + `coverage.md` |
| `packages/conformance/test/evidence-graph.test.mjs` | Rows 2.7, 2.17 |
| `packages/conformance/test/scanners.test.mjs` | Rows 2.8, 2.9, 2.10 |

---

## Task 1: Fact contract and the append-only evidence graph (row 2.7)

**Interfaces produced:** `assertFact(fact)`, `assertGap(gap)`, `EvidenceGraph` with `append(fact) → id`, `supersede(oldId, fact) → id`, `facts(filter)`, `gaps()`, `addGap(gap)`, `toJSON()/fromJSON()`.

- [ ] Step 1: failing tests — a valid fact appends and is queryable by subject, by predicate, and by provenance; an invalid provenance class is refused naming the two permitted; **append-only bites**: no API mutates or removes a fact, and `supersede` leaves the old fact retrievable with `supersededBy` set; queries are total (unknown subject → `[]`, never a throw); round-trips through JSON.
- [ ] Step 2: watch them fail (module absent).
- [ ] Step 3: implement `fact.mjs` + `graph.mjs`.
- [ ] Step 4: tests pass; prove the append-only gate by attempting an edit path and watching the test name it.
- [ ] Step 5: commit.

## Task 2: The adapter contract and the workspace topology scanner (row 2.9)

The simplest adapter goes first because it fixes the contract the other two obey.

**Interfaces produced:** `runAdapter(adapter, {repoRoot, revision})`; adapter = `{id, scan({repoRoot, revision}) → {facts, gaps, inventory}}` where `inventory` lists every file the adapter *looked at* (coverage needs the denominator).

- [ ] Step 1: failing tests against a constructed fixture repo (workspaces with two packages, one depending on the other): facts include `package-a depends-on package-b` with `config-derived` provenance and a location pointing at the dependent's `package.json`; a malformed `package.json` becomes a **Gap naming the parse error**, not a throw and not an omission.
- [ ] Step 2: watch them fail.
- [ ] Step 3: implement `adapter.mjs` + `adapters/workspace.mjs`.
- [ ] Step 4: pass; prove the Gap path by breaking the fixture's JSON.
- [ ] Step 5: commit.

## Task 3: TS/JS import scanner (row 2.8)

- [ ] Step 1: failing tests against a fixture source tree: static `import x from './b.js'`, `export … from`, `require('./c.js')` and literal dynamic `import('./d.js')` each produce a `module depends-on module` fact with `statically-derived` provenance and the exact line; a **computed specifier** (`import(prefix + name)`) produces a Gap naming the file and line; an unresolvable relative specifier produces a Gap, never a guessed fact; bare package specifiers resolve to `package:<name>` objects rather than fabricated paths.
- [ ] Step 2: watch them fail.
- [ ] Step 3: implement `adapters/imports.mjs` — line-scanning tokenizer, comment- and string-aware enough not to match imports inside comments or template strings; anything beyond it is a Gap.
- [ ] Step 4: pass; run the adapter against **this repository** and record the fact/gap counts in the commit message — the numbers are evidence the extractor does real work.
- [ ] Step 5: commit.

## Task 4: HTTP routes scanner (row 2.10)

- [ ] Step 1: failing tests: `app.get('/users/:id', …)` / `router.post(…)` / `fastify.route({method, url})` fixtures each yield `module exposes GET /users/:id` facts with lines; Next.js file-based routes (`pages/api/x.ts`, `app/y/route.ts`) yield facts with `config-derived` provenance (the path *is* the config); a computed path (`app.get(base + '/x')`) is a Gap.
- [ ] Step 2: watch them fail.
- [ ] Step 3: implement `adapters/routes.mjs`.
- [ ] Step 4: pass; prove the Gap path.
- [ ] Step 5: commit.

## Task 5: The honest coverage report (row 2.17)

- [ ] Step 1: failing tests: given a graph + inventories, the report buckets every file into exactly one of `analysed` (with the adapters that did), `gap` (with reasons), or `not analysed`; the three buckets **sum to the inventory** — an uncounted file is the test's failure mode; the report never contains a percentage figure unless every term of the denominator is named in the same section (assert the rendered text).
- [ ] Step 2–4: fail → implement `coverage.mjs` → pass; prove the sum gate by hiding a file from the buckets.
- [ ] Step 5: commit.

## Task 6: `npm run scan`, row registration, close-out

- [ ] Step 1: `packages/scanner/bin/scan.mjs` runs all three adapters against a repo root (default: cwd), assembles the graph, writes `evidence-graph.json` + `coverage.md` to `--out` (default `./scan/`, git-ignored here), prints the fact/gap/coverage summary.
- [ ] Step 2: run it against this repository; keep the output as the operator-visible artifact and record the counts.
- [ ] Step 3: register rows 2.7, 2.8, 2.9, 2.10, 2.17 with exact testTitles; verify via `scripts/conformance.mjs`, not by eye.
- [ ] Step 4: `npm run status` (5 rows move PLANNED → SHIPPED), gallery unchanged, changelog entry **with its Commits line**, roadmap P1.1–P1.5 marked, `npm run docs:pdf`.
- [ ] Step 5: full gate both ways; ledger updates; commit.

## Definition of done for P1c

- [ ] Facts are append-only per revision; supersede preserves; queries total (row 2.7)
- [ ] Three adapters emit Facts **and Gaps** under "never guess", each proven against fixtures and run against this repository (rows 2.8–2.10)
- [ ] Coverage buckets sum to the inventory and fabricate no percentage (row 2.17)
- [ ] All five rows registered and proved; no previously proved row lost
- [ ] Zero runtime dependencies in both new packages
- [ ] Every new gate observed failing on a deliberate break
- [ ] `npm run check` exit 0 both ways; CI 13/13 after the operator-authorised push
