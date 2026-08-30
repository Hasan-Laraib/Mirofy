# 37 · Engineering Standards

**Non-negotiable for every phase.** A feature without tests is not delivered. A task is many
small commits, never one. Every check must be green before merge.

These standards are wired in **P0.11**, before the first feature lands — retrofitting
discipline onto an existing codebase is how the source project ended up with 25 failing tests, an
untested 693 KB viewer, and 24 unreviewable PRs.

---

## 1. Test-per-feature — the rule

> **Every row in [32 · Parity & Feature Matrix](32-PARITY-AND-FEATURE-MATRIX.md) — imported,
> rebuilt, or new — carries at least one automated test before it is considered delivered.**

All 92 capabilities. No exceptions, no "we'll add tests later."

### Test type by origin

| Origin | Approach | Why |
|---|---|---|
| **H** Imported | **Characterisation test first.** Capture current behaviour *before* touching the code, then refactor against it | You cannot TDD code that already works. You can lock its behaviour so a refactor cannot silently change it |
| **R** Rebuilt | Characterisation test on the old behaviour → new test for the new behaviour → migration test proving the contract holds | Rebuilding is where parity is most likely to be lost |
| **N** New | **TDD.** Failing test → implementation → green → refactor | Standard discipline for new behaviour |

### Test type by layer

| Layer | Test kind | What it proves |
|---|---|---|
| Scanner adapters | Fixture repos | Exact facts **and exact gaps** — an adapter that silently omits is worse than one that fails |
| Evidence graph | Property tests | Append-only holds; provenance is never lost; queries are total |
| System model | Unit + regression | Conflicts preserved; overrides marked `authored`; IDs stable across runs |
| View compiler | **Contract test** | Cannot emit a relationship absent from the model. This is the anti-hallucination gate |
| Solver | Invariant tests | Authored pins never move; unsatisfiable constraints are reported, never silently dropped |
| Validator | Golden + unit | The 7 frozen v1-baseline fixtures render byte-identically |
| Renderers | Golden SVG | Byte-identical output across the 5 modes × 8 preset/theme combinations |
| Viewer | Browser (real Chrome) | Interaction actually works — not that a string appears in HTML |
| Exports | Smoke + pixel | All 6 formats + 3 share-card variants produce non-empty, correctly-sized output |
| CLI | End-to-end | `<product> .` on fixture repos produces a valid artifact |
| Accessibility | axe-core | The commitments the design system makes are kept |
| Whole product | Conformance suite | Every matrix row still passes |

### What does not count as a test

- A snapshot nobody reads when it changes
- A test that asserts a string exists in generated HTML when the behaviour is interactive
- A browser test that **skipped** because Chrome was unavailable — *skipped is not passed*
- A test that would pass if the feature were deleted

---

## 2. Commits — small, frequent, conventional

> **One behaviour per commit.** A roadmap task is typically **5–20 commits**, never one.

### Format — Conventional Commits

```
<type>(<scope>): <subject>

<body: why, not what>

Refs: <matrix row(s)>
```

**Types:** `feat` · `fix` · `test` · `refactor` · `perf` · `docs` · `build` · `ci` · `chore`
**Scopes:** `scanner` · `evidence` · `model` · `compile` · `layout` · `validate` · `render` ·
`viewer` · `cli` · `ci` · `mcp` · `conformance`

Every commit that implements a matrix row references it: `Refs: 2.4`.

### Granularity — worked example

`P1.8 Evidence on relationships` (matrix 2.4) is not one commit. It is roughly:

```
test(model): characterise current node-only evidence resolution
feat(model): add sources[] to the relationship type
test(model): failing test for edge evidence resolution
feat(model): resolve edge evidence refs against the graph
test(render): failing test for SRC beacon on an edge
feat(render): render the evidence beacon on relationships
test(viewer): failing browser test for edge click → Passport
feat(viewer): open the Passport from a relationship
test(conformance): assert matrix row 2.4
docs(model): document edge evidence in the schema reference
```

Ten commits, each independently reviewable and revertible. **If a commit cannot be described
in one line without "and", split it.**

### Rules

- **Every commit leaves `main` green.** No "will fix in the next commit"
- **No commit mixes refactor with behaviour change.** Refactor, then change — separately
- **Imported code arrives in its own commit**, unmodified, before any adaptation
- Commit messages explain **why**; the diff already shows what

---

## 3. The check suite

Every check must be green before merge. Nothing is skipped, ignored, or `--no-verify`'d.

| # | Check | Gate | Notes |
|---|---|---|---|
| 1 | **Lint** — ESLint flat config | PR | `no-undef`, `no-unused-vars`, `no-implicit-globals` |
| 2 | **Types** — `tsc --noEmit` with `checkJs` | PR | JSDoc-annotated; no TypeScript migration |
| 3 | **Unit tests** | PR | Per-package |
| 4 | **Golden SVG** | PR | 5 modes × 8 preset/theme combos, byte-identical |
| 5 | **Conformance suite** | PR | Every matrix row. **The parity guarantee** |
| 6 | **Browser suite** (real Chrome) | PR | Never skipped in CI; skips allowed only locally |
| 7 | **Accessibility** (axe-core) | PR | |
| 8 | **Export smoke** | PR | 6 formats + 3 share cards, non-empty and correctly sized |
| 9 | **Cross-platform** | PR | Windows · macOS · Linux, Node 18/20/22/24 |
| 10 | **Size budget** | PR | Tracked tree and artifact size ceilings; fails on regression |
| 11 | **Artifact reproducibility** | PR | Rebuild from source, assert the manifest digest |
| 12 | **Link check** | PR | No broken internal doc links |
| 13 | **Security** — audit + SHA-pinned actions | PR | Zero high/critical |
| 14 | **Benchmark** (first-pass rate) | **Scheduled + release** | ⚠️ **Never a per-PR gate** — external model behaviour changes with no code change in the repo |

**Branch protection:** no direct pushes to `main`; checks 1–13 required; CI runs automatically
on PRs from returning contributors *(the source project's ~20-of-24 PRs with zero CI runs is
the failure mode being avoided)*.

---

## 4. Definition of done

A matrix row is delivered only when **all** of these hold:

- [ ] Tests exist and are green — the type matched to its origin (§1)
- [ ] Conformance suite includes it
- [ ] All 13 PR checks pass
- [ ] Committed as multiple small conventional commits, each referencing the row
- [ ] Documented where a user or agent would look for it
- [ ] For visible changes: `visual-check` contact sheet inspected, and visual review reported truthfully as `passed` / `failed` / `skipped` — **never upgraded**
- [ ] For imported rows: golden output still byte-identical
- [ ] No `H` row regressed

## 5. Inherited failure modes being designed out

Each row is a verified defect in the source project (documented privately) and the standard
that prevents it.

| Source-project defect | Prevented by |
|---|---|
| 25 tests failing on a clean Windows checkout | Check 9 from day one |
| 23 browser tests skipped by default | Check 6 — never skipped in CI |
| ~20 of 24 PRs with zero CI runs | Branch protection + auto-run on PRs |
| Unreviewable +106k-line PRs | §2 commit granularity + check 11 (artifacts built, not committed) |
| 22.8 MB of committed build output | Check 10 + check 11 |
| No lint, no types anywhere | Checks 1–2 |
| 202 unchecked `data-*` attributes | Contract test (matrix 5.17) in the conformance suite |
| `showcase` false negatives | Check 5 — a gate that passes wrongly is worse than no gate |
| Behaviour drift across five renderers | Check 4 across all mode × preset combinations |

## 6. Working agreement

- **TDD for new behaviour.** Red → green → refactor. Not "tests after."
- **Characterise before you refactor.** Imported code gets its behaviour locked first.
- **A skipped test is skipped.** Never described as passing, in a PR or a receipt.
- **Truthful receipts.** A non-zero exit is never reported as success — the source project's discipline, kept.
- **Fix the gate, not the test.** If a check is wrong, change the check deliberately in its own commit with a reason.
