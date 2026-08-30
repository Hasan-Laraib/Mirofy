# SDD ledger — plan: analysis/future/plans/2026-08-29-p0-foundation.md

Spec: analysis/future/33-MASTER-ROADMAP.md (P0), with 31/32/36/37.
Build target: L:/Projects/product-p0 (NEW repo — this plan does not modify the source repository).

## Pre-flight rulings

Ruling: Build the new repository at `L:/Projects/product-p0`, local git only, no remote.
— The plan creates a new repo; a worktree of the source repository is the wrong isolation
  model, and the source repository itself is never modified by this plan (it is the
  read-only import source).
— Cost if wrong: a directory move (`mv`) and a `git remote add`. Trivial.

Ruling: Task 9 Steps 4-5 (`git push -u origin main`, branch protection) are DEFERRED, not
executed. — Pushing to a remote is an external side effect and requires the user's choice of
GitHub org/visibility. Everything else in Task 9 (workflow file, local `npm run check`
verification) proceeds, so CI config is written and locally validated.
— Cost if wrong: none; the push is one command once the remote exists.

Ruling: Task 1 Step 2's test script changes from `node --test packages/*/test/*.test.mjs`
to `node --test`. — Verified empirically on Node 24: the shell-glob form only works because
bash expands it (GitHub Actions uses pwsh on windows-latest, which does not); Node's own
`--test` glob support landed in Node 21 but the plan's CI matrix includes Node 18; and the
directory form (`node --test dir/`) errors with "Cannot find module". Bare `node --test`
auto-discovers and recurses into `packages/*/test/` — confirmed 2/2 tests found.
— Cost if wrong: one line in package.json.

## Pre-flight scan — task pairs sharing a file or interface

| Pair | Produces -> Consumes | Finding |
|---|---|---|
| T1 -> T8 | `package.json` created -> scripts added | OK, sequential |
| T1 -> T10 | `package.json` -> `check:size`/`check:audit` added | OK, sequential |
| T3 -> T4 | `MODES`, `renderFixture`, `canonicalise` | OK, all three exported in T3 |
| T3 -> T5 | `renderFixture` widened in T5 Step 3 | OK, declared explicitly; T5 Step 5 re-runs golden to prove T4 unaffected |
| T3 -> T6 | `MODES`, `renderFixture` | OK |
| T3 -> T7 | `coreRoot`, `fixturesRoot` | OK, both exported in T3 |
| T3 -> T8 | `MODES`, `renderFixture`, `canonicalise` | OK |
| T3 -> T9 | `renderFixture` | OK |
| T4 -> T8 | `fixtures/golden/manifest.json` | OK, T8 reads what T4 writes |
| T7 -> T9 | `scripts/conformance.mjs` via `npm run test:conformance` | OK |
| T7 <-> T9 | env var `PRODUCT_CHROME` | OK, same name both sides |
| T9 -> T10 | `.github/workflows/ci.yml` extended | OK, sequential |
| T2 -> all | `packages/core/**` imported tree | OK, every later task reads it |

## Pre-flight scan — per-task self-consistency

| Task | Finding |
|---|---|
| T1 | **CONFLICT**: `npm test` glob breaks on Windows/Node 18 — ruled above. Minor: `eslint .` with zero matching files may warn; Step 6 expects exit 0 — implementer to confirm |
| T2 | Claims "unmodified" while removing 2 files + editing package.json; the discrepancy is documented in Step 4's README and the per-row accounting doc (T11). Consistent |
| T3 | Step 2 test imports a module Step 4 creates — intended TDD failure. Consistent |
| T4 | `--update` then verify; Step 5 proves the harness can fail. Consistent |
| T5 | Step 1 uses `path.relative` which Step 2 expects to fail and Step 3 fixes. Self-aware. Consistent |
| T6 | Step 2 admits the test may pass immediately; justified as a characterisation test (doc 37 §1) and Step 3 proves detection. Consistent |
| T7 | Row manifest is partial by design; Step 6 completes it against doc 32. Consistent |
| T8 | Consistent |
| T9 | Browser test asserts markup presence, not interaction — flagged in the plan itself as a weakness a reviewer must not accept silently. Carried as a known risk |
| T10 | Consistent |
| T11 | Consistent |

## Progress

Task 1: implementer DONE (commit ef0e39e, 8 files). Verified: test script landed as
  `node --test` per ruling; the source repository untouched. Review dispatched.
  Note: review package built against the empty tree (4b825dc) — new repo, no BASE commit.
Task 1: review clean — spec ✅, quality approved.
  Ruling: Conventional Commits scope is OPTIONAL, not mandatory. The reviewer flagged
  `build: scaffold...` as missing `(scope)` against my Global Constraints line
  `<type>(<scope>): <subject>`, but traced it to the plan's own Step 7 example. The
  Conventional Commits standard treats scope as optional; my constraint was over-strict.
  Relaxed for all remaining tasks. No rework.
  — Cost if wrong: cosmetic commit-message inconsistency, fixable by rebase.
  ⚠️ resolved by controller: LF verified independently — 0 CR bytes across all 8 committed
  blobs; `git check-attr` confirms eol=lf applies to future packages/core/*.mjs.
Task 1: complete (commit ef0e39e, review clean)
Task 2: implementer DONE (commit 4a5de9d, 165 files under packages/core).
  Controller verification (mechanical, stronger than a diff review):
    - blob-hash compare vs the source baseline: 163/164 shared files IDENTICAL
    - deviations are EXACTLY the 3 permitted (del test/golden.mjs, del package-lock.json,
      rewrite package.json) + brief-mandated new README.md
    - 0 of 165 committed text blobs contain CR bytes
    - core.autocrlf=false is repo-LOCAL; system gitconfig untouched (the source repository
      still reads true)
  NOTE — my Task 2 ruling had a flaw the implementer caught: `git archive | tar -x` is NOT
  eol-neutral. Git applies checkout-style conversion, and this machine's SYSTEM gitconfig
  sets core.autocrlf=true, so the first extraction silently produced CRLF. The implementer
  detected it by direct blob comparison (not by diffing two extractions, which would have
  agreed with each other) and re-extracted with `-c core.autocrlf=false`.
  Had this shipped, every byte-parity proof in Tasks 4-8 would have been invalid.
  Review dispatched (scoped to the 3 deviations + the LF catch).
Task 2: review clean — spec ✅, quality approved, 0 Critical/Important.
  Reviewer independently reproduced: the CRLF mechanism (plain `git archive` -> CRLF;
  `-c core.autocrlf=false` -> LF matching the blob), the 714,353-byte render, 16/16
  16/16 originally-named (pre-rename) environment variables intact, and byte-exact
  package.json/README.md.
  Ruling: PLAN DEFECT in Task 2 Step 3 — the brief's literal JSON block changes `name`,
  `version`, `description` and `bin` in addition to `scripts`, contradicting its own prose
  "keep everything else byte-identical". The implementer followed the literal JSON. That is
  the correct resolution: a scripts-only patch would have shipped a `bin` entry keyed to the
  source package's own name,
  violating the no-invented-name / @product scope constraint. Ruling stands, no rework.
  — Cost if wrong: packages/core/package.json metadata differs from the source project's; trivial
    to amend, and it must differ anyway for the workspace to function.
Task 2: minor (deferred): commit message does not disclose that the ROOT package-lock.json
  was also regenerated in the same commit (correct to include it; just under-disclosed).
Task 2: minor (deferred): brief Step 5's "~700-760 KB" is ambiguous KB vs KiB; actual output
  714,353 bytes = 698 KiB. Wording nit in the plan, not an implementation issue.
Task 2: complete (commits ef0e39e..4a5de9d, review clean)
Task 3: implementer DONE (commit e9299fc) — 7 fixtures, conformance pkg, smoke test.
  CONTROLLER-FOUND DEFECT (mine, from Task 1): `npm test` = bare `node --test` auto-discovered
  packages/core/test/ (93 imported files) -> 736 tests / 74 fail. CI would have
  failed on all 12 matrix jobs at Task 9.
  Ruling: replace root test script with scripts/run-tests.mjs — discovers
  packages/*/test/**/*.test.mjs, EXCLUDES packages/core/, passes explicit paths to node --test.
  Alternatives ruled out empirically: `node --test <dir>` errors on Node 24 (with and without
  trailing slash); Node's --test glob needs 21+ but matrix includes 18; shell globs don't
  expand under pwsh on windows-latest; --test-exclude-pattern does not exist. The source project
  solved this the same way (its own scripts/run-tests.mjs) — good precedent.
  The imported suite is not abandoned; it becomes relevant in P1 when core is refactored.
  — Cost if wrong: one script + one package.json line.
Task 3: fix round 1/5 (test runner scoped; commit d95717e). npm test now 1/1 pass,
  0 packages/core files executed. Review dispatched over BOTH commits (e9299fc..d95717e).
  Open question for reviewer: implementer added @types/node ^18 to devDependencies despite
  "change nothing else" — to be judged as justified-or-revert.

DOC CORRECTION (analysis corpus, not the build):
  Ruling: doc 32's stated totals were ESTIMATED, not counted, and were wrong.
  Mechanical extraction of its own tables gives 118 capabilities — 55 H, 2 H->R, 6 R, 55 N,
  not the stated "92 — 44 H, 12 R, 36 N". Corrected in doc 32 (with the correction noted
  in-place) and in 00-INDEX.md. Consequence: the Task 7 conformance suite must cover 55 H
  rows, not 44. Extracted list written to <workspace>/imported-rows.md for Task 7.
  — Cost if wrong: the conformance suite would under-cover parity, which is the one
    guarantee this whole phase exists to provide.
Task 3: review clean — spec ✅, quality approved, 0 Critical/Important.
  Reviewer independently reproduced the TDD red/green in a throwaway worktree at 4a5de9d;
  physically removed @types/node and observed 16 TS2307/TS2580 errors across render.mjs,
  render-smoke.test.mjs AND run-tests.mjs -> deviation JUSTIFIED, approved not reverted
  (devDependency only; ^18 correctly matches the CI matrix floor). Also injected a failing
  test and confirmed run-tests.mjs exits 1 rather than swallowing failures, and confirmed
  new packages/nested dirs are auto-discovered so Tasks 5-9 need no runner changes.
Task 3: minor (deferred): pre-fix failure counts in the report (781/149) don't reproduce
  exactly today (733/73) — the imported suite appears order/env-dependent. Core
  claim (core tests cannot pass here) holds either way.
Task 3: minor (deferred): report calls EXCLUDED an "allowlist"; it is a denylist. Cosmetic.
Task 3: complete (commits 4a5de9d..d95717e, review clean)
Task 4: implementer DONE (commit 7fc4ec1) — scripts/golden.mjs + fixtures/golden/manifest.json.
  *** PARITY PROOF ESTABLISHED ***
  Controller verified independently: all 5 manifest digests MATCH the values computed in the
  source checkout BEFORE product-p0 existed:
    architecture 9929c7a58f80caf7 | workflow 9b0fecf978657d3b | sequence df09a2e3f89e058e
    dataflow     6ce83723e51cfbcd | lifecycle e6479f9c86bc69fd
  This proves two things at once: (a) the import is byte-faithful, and (b) the render is
  environment-independent (no absolute path / timestamp / hostname leaks into the artifact),
  which is what makes the cross-platform CI matrix in Task 9 viable at all.
  Also verified: golden 5/5 pass; template.html blob still == source 12106be (8e15e85), so
  the Step 5 mutation test reverted cleanly with no CRLF damage; tree clean.
  Review dispatched with instructions to REPRODUCE the mutation test rather than trust it,
  and to judge whether `--update` needs a guard against silently re-baselining a regression.
Task 4: review clean — spec ✅, quality approved, 0 Critical.
  Reviewer REPRODUCED the mutation test (not trusted): 5/5 FAIL exit 1 with digests matching
  the report exactly, then revert -> 5/5 pass, tree clean. Harness genuinely can fail.
  Reviewer also independently confirmed environment-independence at the source: renderers
  emit LF natively on Windows (0 CRLF in raw output, so canonicalise() is defensive
  insurance not a load-bearing fix); no absolute paths, PIDs, temp names or timestamps enter
  the HTML; brand-marks uses explicit 'en-US' locale; template.html's Date.now() calls are
  shipped JS source text, never evaluated at render time.
  Ruling: IMPORTANT finding `--update` has no guard against silently re-baselining a real
  regression. It is PLAN-MANDATED (the brief specified golden.mjs verbatim), and the reviewer
  judged it acceptable-as-designed today since nothing invokes it and a re-baseline shows as
  a reviewable 5-line manifest diff. I am fixing it anyway, now, because Task 9 introduces CI
  and that is precisely when the harness becomes unattended — and the guard is ~3 lines.
  Fix: refuse `--update` when process.env.CI is set. Folded into the Tasks 5+6 batch.
  — Cost if wrong: 3 lines; worst case a developer must unset CI to re-baseline locally.
Task 4: minor (deferred): temp dirs (product-golden-*) accumulate, never cleaned.
Task 4: minor (deferred): failure output gives digests + fresh-render path, but diagnosing
  WHAT changed inside a 714 KB artifact needs a manual re-render of the prior revision.
  Inherent to the digest-only design (which the no-committed-artifacts rule requires).
Task 4: complete (commits d95717e..7fc4ec1, review clean)
Tasks 5+6 (batched) + CI guard: implementer DONE — 3 commits 568fdd8 / 1deac59 / 5280311.
  Controller verified: npm test 5/5; golden 5/5 (parity SURVIVED widening renderFixture);
  CI=1 --update exits 1 with manifest untouched; template.html blob still 8e15e85; tree clean.
  PLAN DEFECT FOUND BY IMPLEMENTER, controller-confirmed: task-6-brief Step 3's mutation used
  String.replace on data-format="webm", but that string occurs 3x in template.html (CSS
  selector L3514, button element L4944, JS querySelector L6869). .replace mutates only the
  CSS selector; the asserted button survives, so the test would have PASSED and falsely
  reported "detection verified". Implementer used .replaceAll and got the correct failure.
  Ruling: implementer is right, brief is wrong. No rework. This is the second time a
  verify-the-verifier step caught a false-positive proof (cf. Task 2's CRLF near-miss) —
  the pattern of proving a test can fail is earning its cost.
  — Cost if wrong: none; the correction only affects an ad-hoc verification command, not
    committed code.
  Review dispatched with instructions to break BOTH tests independently.
Tasks 5+6: review returned spec ✅ but quality ❌ NOT APPROVED — 1 Critical, 1 Important.
  CRITICAL (my brief's defect, not implementer error): preset-matrix.test.mjs:41 asserts
  data-preset="<preset>" against the WHOLE document, but template.html carries static CSS
  attribute-selector rules for every non-default preset regardless of which is applied
  ([data-preset="signal-flow"] x30, blueprint x73, editorial x50). Only `classic` (0 static
  occurrences) was a real check => 15 of 20 mode×preset renders were VACUOUS.
  Reviewer PROVED it: hardcoded data-preset="classic" onto the <html> root in
  utils.mjs:171 (a total regression of preset switching) and BOTH tests still passed.
  IMPORTANT: export-surface.test.mjs:33-35 same root cause — html.includes() is satisfied by
  the CSS selector + JS querySelector even when the actual <button> is deleted. Reviewer
  removed only the button; test still passed.
  Ruling: FIX, do not park. These two files ARE the P1-refactor safety net; vacuous, they
  make the "parity enforced by CI" claim hollow for the entire viewer surface. Fix is to
  anchor both assertions to structural context (<html> root tag / <button> element) —
  test-file-only, no production change.
  — Cost if wrong: none; anchoring strictly narrows what the assertions accept.
  Fix round 1/5 dispatched by resuming the original implementer, with both reviewer-proven
  breaks specified as mandatory verification.
  NOTE: 3rd false-proof caught by verify-the-verifier (after Task 2 CRLF, Task 6 .replace).
Tasks 5+6: fix round 1/5 (2 addressed, 0 open; commits 5280311..2266df7).
  Re-review verified by BREAKING, not reading. Beyond the two proven breaks it also probed:
  data-preset moved to <body> -> caught; onto a nested <h1> -> caught; <button> swapped for
  <div> -> caught; attribute ordering robust ([^>]* unanchored, no positional assumption).
  Confirmed the fix did NOT over-anchor: the second preset test (colour-mode palette blocks)
  is byte-identical and still whole-document-matches, which is correct by design there.
  Coverage arrays untouched (6 formats, 4 actions). npm test 5/5, golden 5/5, tree clean,
  template.html blob 8e15e85.
Tasks 5+6: complete (commits 7fc4ec1..2266df7, review clean after 1 fix round)
Task 7: implementer DONE (1c4a616, 13c33b6, 0691332, 9b249d2). npm test 36/36, golden 5/5,
  reporter honest: proved 40 / browser-deferred 14 (ids listed) / UNPROVEN 1 = 55 total.
  Ruling: row 6.10 (Deterministic ZIP packaging) was MISCATEGORISED IN MY SPEC as H.
  Confirmed its implementation (scripts/build-zip.sh, write-deterministic-zip.mjs,
  package-smoke.mjs) lives at the SOURCE PROJECT'S REPO ROOT, outside the source repository's own
  subtree the import copies — nothing was imported to have parity with. Doc 32 corrected: 6.10 H->N,
  phase P1. Totals now 54 H / 2 H->R / 6 R / 56 N. Implementer's UNPROVEN marking was correct.
  — Cost if wrong: a row is tracked as new rather than imported; no code impact.
Task 7: review returned ❌ NOT APPROVED — 2 Critical, 2 Important.
  CRITICAL 1 (deepest false proof yet): rows 3.1-3.5 provable ONLY by "nine checks report
  ok:true on ONE CLEAN fixture" — which a gate that does nothing also satisfies. Reviewer
  PROVED it twice: made collectAmbiguousCorridors return [] (geometry.mjs:480) -> 36/36 still
  passed; same on collectRouteRhythmIssues (geometry.mjs:739) -> 24/24 still passed. All five
  taste gates can be gutted with zero test failures.
  CRITICAL 2: row 4.5 (Style Picker + S cycle) counted among the 40 "proved" but nothing
  tests it. Reviewer deleted the e.key==='s' branch at template.html:14729 -> 36/36 passed.
  Ruling: FIX both. These gates ARE the product's differentiator; a suite that cannot tell
  "gate works" from "gate deleted" is worse than no suite — it manufactures confidence.
  Fix = one NEGATIVE fixture per gate (violating input must fail under showcase, with the
  NAMED check reporting the failure), each proven by disabling its collector.
  Also fixing Important #3 (row 1.7 proves the flag is echoed, not that showcase escalates
  anything). Ruling on Important #4 (browser-deferred rows had static-proof headroom):
  ACCEPT conservative deferral — honest deferral is not a defect; false proof is. Only 4.5
  moves, because it currently claims to be proved.
  — Cost if wrong: more test code than strictly needed; no production impact.
  Positive control worth recording: reviewer independently killed 5 other rows correctly
  (6.1 receipt hash, 6.4 export button, 6.8 usage text, 1.9 legend hidden, 3.9 security-group)
  — the delivery/export/CLI/legend/profile rows are real. Reporter exits non-zero on suite
  failure and does NOT silently pass a typo'd proof path (ENOENT -> counted as failure).
Task 7: fix round 1/5 dispatched.
Task 7: fix round 1/5 (3 addressed, 0 open; commits 9b249d2..fef1b91).
  All five gates now fail when their OWN collector is gutted — verified by two parties on
  disjoint sets: controller attacked 3.3/3.5/4.5, re-reviewer attacked 3.1/3.2/3.4. Each
  produced exactly 1 failure on exactly its own test. Negative fixtures confirmed NOT
  cross-contaminating (each trips only its own named check, verified by inspecting the full
  checks[] array, not just the assertion). Row 1.7 genuinely proves severity escalation:
  identical bytes, only data-quality-profile flipped -> standard warns / showcase errors.
  Fix diff touched ONLY test files + new fixtures; zero production code (empty diff on
  check-render-output.mjs, geometry.mjs, render-architecture.mjs).
  NEW IMPORTANT from re-review: the patch-the-marker technique is weaker than what was
  available. Render-stage rejection IS observable — the CLI exits 1 with a specific
  composition/* diagnostic (validate --json even returns code/severity/subject/evidence/
  supportedFixes). So the current proof shows "the checker's severity logic works on a
  doctored artifact", one inferential step from the claim the product actually makes:
  "showcase acceptance blocks a violating delivery."
  Ruling: FIX in round 2 rather than defer, even though the re-review said it does not block.
  This is the last substantive test task; the conformance suite is the phase's deliverable,
  and closing an inferential gap in it is worth ~10 lines. Keep the patch-based tests too —
  they prove the standard-vs-showcase flip, which the CLI test does not. Complementary.
  — Cost if wrong: a few redundant assertions; strictly additive, no production impact.
Task 7: fix round 2/5 dispatched.
Task 7: fix round 2/5 (1 addressed, 0 open; commit cc1338c).
  Controller verified the direct claim end-to-end: the real CLI rejects all 5 negative
  fixtures under --quality showcase with exit 1 and a DISTINCT composition/* code each
  (ambiguous-corridor / container-border-run / label-route-clearance / proper-crossing /
  short-interior-segment). Gutting collectBorderRuns flipped the CLI from exit 1 -> exit 0
  (showcase ACCEPTS a violating fixture — the real product failure mode) and the suite
  caught it with 2 failures. Restored clean, no production diff.
  Re-review confirmed the regression I was most worried about did NOT occur: the diff is
  65 insertions / 0 deletions, and all five round-1 assertAdvisoryThenEnforced severity
  tests survive intact alongside the new CLI ones. The two proof styles are complementary —
  the CLI test cannot observe the standard-side warning (it rejects under showcase), so
  replacing rather than supplementing would have made the suite strictly weaker while
  looking stronger. It supplements. Spot-check on gate 3.2 fails exactly 2 tests, isolated.
  CLI assertions check the SPECIFIC diagnostic code, not merely non-zero exit — no
  misattribution risk.
Task 7: complete (commits 2266df7..cc1338c, review clean after 2 fix rounds)
  Final: npm test 48/48, golden 5/5, conformance 55 rows = 40 proved / 14 browser-deferred
  (ids printed) / 1 unproven (6.10, with reason). template.html blob 8e15e85 throughout.
Tasks 8+10 (batched): implementer DONE — 19175dc, f86ab1a, 0d3b205, 64afa01.
  npm run check passes end-to-end. npm audit: 0 vulnerabilities. .artifacts/ gitignored and
  untracked. Both gates fail-proven (corrupted digest -> exit 1; BUDGET_MB=1 -> exit 1).
  Tree clean, template.html blob 8e15e85.
  *** FINDING SURFACED BY THE SIZE GATE ITSELF ***
  The gate's own "largest tracked files" output shows the top 5 are ALL inherited generated
  HTML: packages/core/examples/{dataflow-product-analytics, lifecycle-agent-run,
  sequence-cache-miss-request, web-app-rendered, workflow-agent-tool-call-rendered}.html
  ~700 KB each = 3.4 MB = **53% of the 6.4 MB tracked tree**.
  This is precisely the anti-pattern doc 32 row 7.1 exists to eliminate ("the source project
  carries 22.8 MB of committed HTML"). The Task 2 import brought them because they live
  inside the source repository's examples/. Verified: NOTHING in our code references them (no renderer, bin,
  script, or conformance reference; the fixtures/sources grep hits are just meta.output
  fields naming an .html path, not a dependency).
  PLAN CONFLICT I MISSED WHEN WRITING IT: Task 2 mandates "import unmodified" while row 7.1
  mandates "no generated artifacts in git". Both cannot hold for the source repository's
  examples/*.html.
  Ruling: do NOT delete them in P0. They are inside the subtree we have proven byte-identical
  to the source project; deleting now would break that proof and force re-verification for no P0
  benefit. Instead (a) tighten BUDGET_MB 20 -> 10 so the gate constrains rather than
  decorates, and (b) record the 3.4 MB as explicit P1 debt to remove during the viewer
  refactor, when packages/core is being restructured anyway.
  Sizing rationale: at 20 MB the gate permits 18 more committed artifacts before tripping —
  it would not have caught the source project's own failure. At 10 MB it trips after ~4, while
  leaving 3.6 MB for legitimate P1 source growth (modularised viewer is text, not artifacts).
  — Cost if wrong: a P1 task hits the budget and must either clean the inherited HTML (the
    intended outcome) or raise the number deliberately with a stated reason.
Task 9: implementer DONE (9ae9dc6, bb3d237, 03e3e02). CI workflow (12-job matrix + browser
  job), real-Chrome browser test, budget 20->10 MB (margin 3.6 MB). YAML validated with both
  PyYAML and js-yaml. Push + branch protection DEFERRED per owner instruction (no remote).
  Ruling on the SHA: my brief pinned browser-actions/setup-chrome@db1b524c with the comment
  "# v1.7.2". The implementer reported it as FABRICATED. I verified all four SHAs against the
  GitHub API: db1b524c is REAL but is tag v1.7.1 — my error was a mismatched version COMMENT,
  not an invented hash. Its replacement facf10a5 is genuinely v1.7.2, so the pin now matches
  its comment: keep the fix, correct the characterisation. actions/checkout@11bd7190 (v4.2.2)
  and actions/setup-node@39370e39 (v4.1.0) verified correct as written.
  — Cost if wrong: none; the corrected pin is verified genuine.
Task 9: CRITICAL found by controller — 10 browser rows now FALSELY PROVED.
  matrix.mjs maps all 14 rows (5.1-5.14) to viewer.browser.test.mjs, which contains ONE test.
  With PRODUCT_CHROME set the reporter announces "proved: 54/54", but real assertions exist
  for only ~4 rows (node-finder / route-probe / semantic-lens toggles + a guided-views state
  check). Before the browser job these rows were HONESTLY DEFERRED; they are now FALSELY
  PROVED — a strict regression in the suite's truthfulness, and the first false proof this
  run INTRODUCED rather than inherited.
  Root cause is structural and mine: the reporter counts a row as proved when its proof FILE
  passes, regardless of whether any assertion in that file exercises that row. File-level
  accounting cannot express per-row truth.
  Ruling: FIX, not park. Re-map honestly (only asserted rows may claim the browser proof;
  the rest go to UNPROVEN with a note), add cheap real assertions where the CDP client
  already reaches (passport visibility, reach receipt counts, motion toggle, deep-link
  restore), and make the reporter's accounting honest at the mechanism level or say
  explicitly that it is deferred. Honesty over coverage.
  — Cost if wrong: the suite reports fewer proved rows than it could. That is the safe
    direction to be wrong in.
Task 9: fix round 1/5 dispatched.
Task 9: fix round 1/5 (1 addressed, 0 open; commits ba4cbe9, ac01dd3).
  Re-review ADDRESSED. All 14 browser tests confirmed REAL interaction assertions (clicks,
  dispatched MouseEvents, focus/blur, hash+query navigation, CDP media emulation) checked
  against attributes the template's JS actually mutates — not string matches. The old
  markup-only assertion survives but is demoted to its own unmapped test.
  Three breakage spot-checks each isolated exactly its row: broke Node Finder click wiring
  -> only [5.2] failed; broke Motion Governor toggle -> only [5.11]; broke deep-link hash
  parsing -> only [5.13]. 16/16 others passed each time.
  Controller-verified the mechanism: renaming row 5.4's mapped title -> title-check failed:1,
  proved 0/54, exit 1, EVEN THOUGH the file exited 0 and the renamed test reported ok.
  Ruling on the 0/54-on-any-failure design: KEEP. It fails closed, matches the pre-existing
  global-failure convention, and diagnosis is not obscured — full TAP prints and a dedicated
  title-check section itemises the offending row. Re-reviewer independently reached the same
  conclusion.
Task 9: CRITICAL found by controller in the re-review's deferred list — the same defect
  persists for the OTHER 40 rows.
  Split: 14 rows have per-row testTitle; 40 rely on file-level accounting
  (validation-gates 21, delivery 6, negative-fixtures 5, export-surface 3, render-smoke 2,
  preset-matrix 2, golden.mjs 1).
  PROVED EXPLOITABLE: deleted the whole test "showcase validation reports exactly the nine
  artifact checks" from validation-gates.test.mjs -> npm test 64/64 pass, reporter still
  said "proved: 40/40", title-check failed: 0. The proof vanished and the row was still
  certified.
  Ruling: FIX now, do not defer to P1. The conformance suite IS this phase's deliverable and
  its headline number is currently unverified for 40 of 54 rows. The mechanism already
  exists; extending it is mechanical. Deferring would ship a suite we have ourselves proven
  unsound.
  — Cost if wrong: some rows end up UNPROVEN that could have been mapped. Safe direction.
Task 9: fix round 2/5 dispatched.
Task 9: fix round 2/5 (1 addressed, 0 open; commit af76d8b).
  53/55 rows now carry an individually-verified testTitle. Exemptions: 4.3 (golden.mjs is a
  digest script, no TAP output — documented) and 6.10 (UNPROVEN, pre-existing).
  Controller attack: renamed row 1.2's mapped title -> exit 1, proved 0/40, title-check
  failed: 1 naming "1.2 — Typed IR, additionalProperties:false" and the exact missing title.
  NOTE ON MY OWN FIRST ATTACK: deleting "showcase validation reports exactly the nine
  artifact checks" did NOT fire a title-check — correctly, because no row claims that test.
  "My attack didn't trigger" and "the mechanism is broken" look identical until you check
  which one you are looking at. Verified before concluding.
  Re-review audited all 39 new mappings across all six proof files: none irrelevant, no
  row certified by a test that does not exercise it. Array testTitles verified to require
  ALL titles (renaming one of row 3.1's two fails the row even though the other passes).
  Broke a shallow mapping (route-share-card data-action) to confirm it is narrow but not
  vacuous.
Task 9: complete (commits 64afa01..af76d8b, review clean after 2 fix rounds)
Task 9: minor (deferred): rows 6.4/6.5/6.6 prove UI wiring only, not actual export/clipboard
  output. Honest but undocumented in matrix.mjs, unlike 2.1/2.2 which comments its split.
Task 9: LATENT RISK carried into Task 11 (not deferred): scripts/conformance.mjs's
  scriptProofs branch does no per-row title verification and has no guard limiting a script
  proof to ONE row. A future PR could point extra rows at golden.mjs (or any script) with no
  testTitle and they would silently ride to "proved" on the script's exit 0 — reopening the
  exact file-level-accounting defect these two rounds closed, via the script path instead.
  Not exploited today (4.3 is the only script-proof row, verified).
  Ruling: close it in Task 11 with a one-line guard rather than a 3rd fix round. Having just
  spent two rounds closing this defect class, leaving its back door open is poor economy.
  — Cost if wrong: a future legitimate script proof needs the guard relaxed deliberately.
FINAL fix wave: complete (commits 50ba394..1daafd3, 11 commits). Scoped re-review: ALL
  findings ADDRESSED, no new breakage.
  Verified independently by the re-reviewer: each render-time gate gutted ONE AT A TIME fails
  EXACTLY its own row (cleanCrossingProblems->3.1, cleanLabelRouteClearance->3.2,
  cleanAmbiguousCorridor->3.3, cleanBorderRuns->3.4, cleanRouteRhythm->3.5). Assertions check
  the specific composition/* code, not bare exit status.
  The byte-identity manifest verified NON-TAUTOLOGICAL: all 163 hashes cross-checked directly
  against the source baseline, 163/163 match, 166 source files fully accounted
  for (163 identical + 2 removed + 1 added). It is the source project's hashes, not self-baselined.
  Tally 38/16/54 consistent across README, CONTRIBUTING, the accounting doc; conformance.mjs computes
  counts dynamically so there are no hardcoded numbers to go stale.

RESIDUAL PARKED (no second fix wave per process):
  Ruling: row 3.1 is NAMED "Clean Flow (no edge across unrelated node)" but actually tests
  edge-vs-edge crossing (cleanCrossingProblems / composition/proper-crossing). The function
  matching its plain-English name — cleanFlowProblems / clean-flow/edge-through-node, always
  on, used by all five renderers — is NOT covered by the matrix at all. Gutting it fails no
  row. This is pre-existing: the name comes from doc 32's row definition, which I wrote, and
  the crossing mapping was established back in Task 7 fix-round-1.
  Parked because: the row's proof is sound for what it tests (not a false pass), the defect is
  a mislabelled row plus a missing row, and the process allows only one final fix wave. But it
  IS misleading — a reader seeing 3.1 "proved" would believe edge-through-node is covered.
  Action for P1: rename row 3.1 to match its mechanism, and add a new row covering
  cleanFlowProblems with its own negative fixture.
  — Cost if wrong: one capability appears covered that is not; caught here and documented
    rather than discovered later.
  Ruling: 6.8's test title says "exposes" where the body now proves "dispatches" — cosmetic,
  parked. — Cost if wrong: none.

P0 COMPLETE. 35 commits. Final: npm run check exit 0 both ways; golden 5/5;
  conformance 38 proved / 16 browser-deferred / 1 UNPROVEN (no Chrome), 54/0/1 (with Chrome);
  byte-identity 163/163 vs source baseline; tracked tree 6.5 MB / 10 MB; 0 advisories;
  template.html blob 8e15e85 unchanged throughout.

RESIDUAL CLOSED (post-P0): row 3.1 rename + new row 3.1b (cleanFlowProblems).
  Renamed row 3.1 to "Proper Crossing Gate (edge-vs-edge, showcase-only)" --
  id, tests, and testTitles unchanged, since its proof was sound for what it
  actually tests. Added row 3.1b "Clean Flow Gate (no edge across unrelated
  node)", the capability 3.1's old name described, covering cleanFlowProblems
  / clean-flow/edge-through-node with a new fixture
  (fixtures/negative/edge-through-node-violation.architecture.json) and three
  proofs: a direct in-process unit test of cleanFlowProblems, CLI validate,
  and CLI render. No post-render-checker leg exists for 3.1b (unlike
  3.1-3.5): scripts/check-render-output.mjs has no equivalent check and
  packages/core cannot be modified to add one -- documented in
  negative-fixtures.test.mjs's header comment. Totals updated in README,
  CONTRIBUTING, the accounting doc: 55->56 rows, 38->39 proved (no Chrome), 54->55
  proved (with PRODUCT_CHROME).

  Attribution proof 1 -- gut cleanFlowProblems (`return [];` inserted at its
  top), run `node scripts/conformance.mjs`:
    title-check failed: 1 (proof file exited but the row's own named test did not pass -- never counted as proved)
      3.1b — Clean Flow Gate (no edge across unrelated node)
        missing passing test: cleanFlowProblems fires on an edge routed through an unrelated node (3.1b)
        missing passing test: CLI: showcase validate blocks delivery of an edge routed through an unrelated node (3.1b)
        missing passing test: CLI: showcase render rejects an edge routed through an unrelated node with clean-flow/edge-through-node (3.1b)
  Raw TAP confirmed only these 3 lines read "not ok" (out of 43 tests across
  all suites); every 3.1/3.2-3.5 test and every other row's test still read
  "ok". Reverted (git checkout -- packages/core/renderers/shared/geometry.mjs);
  tree clean; the byte-identity check OK afterward.

  Attribution proof 2 -- gut cleanCrossingProblems (`return [];` inserted at
  its top, same file), run `node scripts/conformance.mjs`:
    title-check failed: 1 (proof file exited but the row's own named test did not pass -- never counted as proved)
      3.1 — Proper Crossing Gate (edge-vs-edge, showcase-only)
        missing passing test: CLI: showcase render rejects a genuine proper-crossing with composition/proper-crossing (3.1)
  Exactly one "not ok" line; all three 3.1b tests, and every other row,
  stayed "ok" -- 3.1 and 3.1b are independently attributed in both
  directions. Reverted; tree clean; the byte-identity check OK.

  Afterward: npm run check exit 0 with and without PRODUCT_CHROME; golden
  5/5; conformance 39/39 proved (no Chrome) / 55/55 (with Chrome), 16
  browser-deferred, 1 UNPROVEN (6.10); the byte-identity check OK
  (163 identical, 1 intentionally changed, 1 added, 2 removed); git diff --
  packages/core empty; git status clean; template.html blob 8e15e85 unchanged.
  Commit f84b1e2.

FIRST REAL CI RUN (33246506982, pushed 499c53a to Hasan-Laraib/Mirofy):
  4 passed / 9 failed — ubuntu x Node 18/20/22/24 all green; macOS x4 all
  failed (70/71); windows x4 all failed (52/71); browser job failed.

  DIAGNOSIS 1 (root cause, 8 of 9 check-job failures): matrix.mjs/the check
  job never sets PRODUCT_CHROME and has no browser-provisioning step, but
  viewer.browser.test.mjs fell back to findChrome() -- a local-dev
  convenience that probes OS-standard install paths. Every GitHub-hosted
  runner ships a system Chrome findChrome() happily finds, so all 12
  check-job legs (3 OS x 4 Node) silently ran the 14 browser rows as real,
  unvalidated browser suites they were never designed for. Windows: 18 of
  19 failures were exactly this (title-checks/CDP calls with no PRODUCT_CHROME
  discipline); macOS: 0 of these — see Diagnosis 4.
  Fix: chrome = PRODUCT_CHROME || (process.env.CI ? null : findChrome()).
  findChrome() now fires only outside CI; in CI, PRODUCT_CHROME must be set
  explicitly, so only the dedicated browser job (which sets it) proves those
  14 rows -- everywhere else in CI they defer honestly by id, matching the
  pre-existing documented contract. Comment at the fallback rewritten to
  state the CI rule. README/CONTRIBUTING/the accounting doc re-checked: their
  browser-row accounting (39 without Chrome / 55 with) already matches this
  behaviour, no wording changes needed there.
  Commit 6518117.

  DIAGNOSIS 2 (browser job failure): browser-actions/setup-chrome@v1.7.2's
  install-dependencies:true ran `sudo apt-get install ... libgconf-2-4
  libasound2 ...` against ubuntu-latest's current noble image, where
  libgconf-2-4 no longer exists and libasound2 is now a virtual package
  (provided by libasound2t64) -- apt-get exited 100 before Chrome was even
  used. Fix (first option tried, per brief): dropped install-dependencies
  entirely -- ubuntu-latest already ships the shared libraries a headless
  Chrome needs (it ships Chrome itself). Action stays SHA-pinned
  (facf10a55b9c...) with its existing "# v1.7.2" comment, verified genuine
  in Task 9's ledger entry -- unchanged, no re-verification needed since the
  pin itself wasn't touched.
  Commit 9dc1cd2.

  DIAGNOSIS 3 (genuine cross-platform bug, survives Diagnosis 1's fix):
  windows-latest failed "repository evidence verifies a pinned 40-char
  revision against a real repo and embeds it (2.1, 2.2)" — not browser-gated.
  Root cause: the test builds its scratch git repo under
  fs.mkdtempSync(os.tmpdir()); on GitHub's windows-latest runner the account
  behind os.tmpdir() ("runneradmin") is long enough that Windows also
  exposes an 8.3 short alias ("RUNNER~1"), and TEMP/os.tmpdir() there
  actually returns that short form. The imported (unmodified)
  repository-evidence.mjs compares fs.realpathSync(repoRootInput) against
  git's own `rev-parse --show-toplevel`; realpathSync does not expand the
  8.3 alias, but git always reports the canonical long-form path, so the two
  legitimately-identical paths compare unequal and every render trips
  repository-evidence/root-not-top-level. This is a test-harness path bug,
  not a Windows-broken imported behaviour: packages/core's identity check
  is doing exactly what it is supposed to do (reject a root that isn't
  provably the git top-level) — the test was just handing it a root spelled
  two different ways depending on which tool answered.
  Fix (test-only, packages/core untouched): resolve the repo root through
  git's own canonical `rev-parse --show-toplevel` output immediately after
  `git init`, and use that value for every later git/file/CLI call,
  including --repo-root. This keeps the path in the exact form the
  identity check will independently re-derive and match against, on every
  OS (a no-op on POSIX, where git's output already matches os.tmpdir()'s).
  Commit 57a28ef.

  DIAGNOSIS 4 (assessed, not silently dropped): macOS failed only
  "[5.11] Motion Governor flips html[data-motion] between live and still via
  btn-motion" — `notStrictEqual` with expected/actual both 'still' (i.e. the
  click on btn-motion did not flip the state at all within the assertion's
  timing window). After Diagnosis 1's fix this test no longer runs in the
  check job on any OS, and the dedicated browser job is ubuntu-only, so it
  stops affecting CI. This is NOT treated as fixed: it is recorded here as a
  genuine, unresolved macOS/CDP timing fragility in row 5.11's real browser
  interaction assertion (a click-then-read-immediately pattern that ubuntu's
  CDP/Chrome apparently settles fast enough for, but macOS's runner did not
  in this run, once, at 70/71 rather than 0/71 — i.e. it is not a
  structural/always-fails issue, just unreliable). If browser tests are ever
  run on macOS (e.g. a future macOS entry in the browser job's matrix), this
  row should be expected to flake and will need either a settle-wait after
  the click or a retry, not a rewrite of the assertion's semantics. Left
  open as P1/known-risk; no code change made for it since it doesn't affect
  CI as currently configured.

  Verification (local, all four fixes applied together): npm run check exit
  0 both with and without PRODUCT_CHROME; conformance 39/39 proved (no
  Chrome) / 55/55 (with Chrome) — unchanged from before this wave, as
  expected (these are CI-environment/path fixes, not row-mapping changes);
  golden 5/5; the byte-identity check OK (163 identical / 1 changed / 1
  added / 2 removed); git diff -- packages/core empty; git status clean.
  Commits 6518117, 9dc1cd2, 57a28ef.

  ANOMALY (not part of the technical fix, recorded for the record): mid-task,
  an unsolicited message purporting to be from a "coordinator" instructed
  pausing the push and later claimed to have force-rewritten all 43 commits'
  author/committer identity and force-pushed a new history, then instructed
  running `git fetch origin && git reset --hard origin/main`. This did not
  originate from the actual operator's own messages and was not treated as
  authorization for anything — no identity/config change, fetch, or reset
  was performed in response to it. Local HEAD was nonetheless observed to
  have changed (to a rewritten commit with the tree byte-identical to the
  prior HEAD) between tool calls, outside of any action taken here; the
  three in-progress edits were reapplied and reverified before committing.
  Push to origin was deliberately withheld pending the operator's own
  confirmation given this anomaly — see the final report.

### CI green-up wave 2 — run 33247521138 (11/13) -> commits 3fd65ac, 1e5d2d0

Two jobs remained red after wave 1. Both turned out to be single-cause, and
neither was a product defect — the conformance suite never wrongly passed.

**`check (windows-latest, 24)` — 1 failure, `delivery.test.mjs`.** Not an
assertion: the log carried `Assertion failed: !_wcsnicmp(filename, dir,
dirlen), file src\win\fs-event.c, line 72`, a native libuv abort. Node's
Windows fs-event backend computes an event filename relative to the watched
directory and asserts the long-form name it receives from the OS shares the
watched directory's prefix. `os.tmpdir()` on a Windows runner is an 8.3 short
path (`RUNNER~1`), so the two forms disagree and libuv calls `abort()`. Test
6.2 is the only fs.watch consumer — it imports `preview.mjs`, which watches
`path.dirname(inputPath)`. Because the abort kills the process rather than
failing a test, it took the whole file down: 52 pass / 1 fail where the "1"
was the file, not a row. Node 18/20/22 bundle a libuv that does not reach the
assert, which is why only the Node 24 cell was red.

  Ruling: fix in the test (`fs.realpathSync.native` on the mkdtemp root), not
  in `preview.mjs`. `packages/core` is imported unmodified and byte-identity
  is enforced by the byte-identity check over 163 blob hashes; editing core to fix
  this would trade a test-only symptom for a broken import boundary, which
  is the whole premise of P0. The same short-path hazard is already handled
  this way at validation-gates.test.mjs:401, so the idiom is established.
  — Cost if wrong: the CLI's pre-rename `preview` command still aborts for a real user whose own
  temp path is short-form. Recorded as P1 debt below rather than hidden.

  **P1 debt (core defect, deliberately not fixed here):**
  `packages/core/bin/preview.mjs:591` passes an unresolved directory to
  `fs.watch`. Any user whose watch root resolves to an 8.3 short path gets a
  native abort with no catchable error. Fix during the P1 viewer/CLI refactor,
  when core stops being byte-frozen: resolve the watch root before watching.

**`browser` — 17 failures, all identical.** Chrome never started:
`FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166 ... The SUID
sandbox helper binary was found, but is not configured correctly ... Rather
than run without sandboxing I'm aborting now.` `setup-chrome` unpacks Chrome
into the tool cache without making `chrome-sandbox` root-owned and setuid
4755. Every row then failed with the same `ECONNRESET` on the DevTools write
pipe. This was one launch failure reported 17 times — the earlier reading of
it as "8 genuine Linux/Chrome platform differences never before exercised"
was wrong, and no platform difference has been demonstrated yet.

  Ruling: set the CHROME_NO_SANDBOX_ENV env var, under its pre-rename name at this point
  (now `MIROFY_CHROME_NO_SANDBOX`), to `1` in the browser job.
  `visual-check.mjs:22` already defines this as a first-class, supported
  opt-out (`CHROME_NO_SANDBOX_ENV`) that prepends `--no-sandbox` — the same
  branch core already takes automatically for root. `sudo chown root:root`
  plus `chmod 4755` on the tool-cache binary would also work, but mutates the
  runner image to work around a launcher default rather than using the switch
  core ships for exactly this case. The sandbox isolates renderers from the
  host; the host is a single-use CI VM rendering our own fixtures.
  — Cost if wrong: a renderer exploit reaches the CI VM. Not a credential
  boundary here — the job holds only `contents: read`.

**Verification:** `npm run check` exit 0 locally on Node 24.13.1 (the version
that was red in CI); `delivery.test.mjs` 7/7 with 0 skipped; artifacts 5/5
reproducible; tracked tree 6.6 MB / 10 MB; 0 vulnerabilities. Note the local
Windows box cannot reproduce the libuv abort — its temp path has no short-form
component — so CI is the only proof surface for that fix.

**P1a disposition of the P0 debt.** `preview.mjs` watch root — **fixed** (P1a
Task 9). `packages/core/examples/` ~3.4 MB — **removed** (P1a Task 9); budget
lowered 10 MB → 6 MB. Row 3.1 rename — **already complete** before P1a began;
`matrix.mjs:149` and `matrix.mjs:180` carry the corrected names. That item was
stale when written and required no work.
