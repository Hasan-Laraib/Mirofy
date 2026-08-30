# Repository Identity & Corpus Move — Design

**Status:** approved in principle 2026-08-30; awaiting spec review before an implementation plan is written.

**Goal.** Remove every trace of the upstream project's name from the Mirofy repository except the one line MIT compels us to keep, bring the forward-looking analysis corpus under version control inside the repo, and establish a running record that is updated on every commit rather than at the end of a phase.

**Why now.** P1b is paused after Task 1 (4 commits). Every subsequent task generates commits and documents that would themselves need de-referencing later; doing this at 4 commits is trivial, at 40 it is not. The corpus is also currently **entirely untracked** — 27 documents, two PDFs and three implementation plans with no history, no backup and no recovery.

---

## 1. What is removed, and the one thing that stays

### Removed entirely

| Path | Why it exists today | Disposition |
|---|---|---|
| `NOTICE` | Voluntary attribution paragraph naming the upstream project, its URL and revision | **Delete.** MIT imposes no NOTICE requirement — that is Apache-2.0. This file is ours |
| `docs/harvest.md` | The provenance record: what was imported, from where, and the documented deviations | **Delete** |
| `scripts/harvest-manifest.json` | 163 blob hashes + ancestor paths, pinned to the anchor commit | **Delete** |
| `scripts/check-provenance.mjs` | Verifies those 163 hashes at the anchor | **Delete** — it can only attest to an ancestor we no longer name |
| `provenance-anchor` tag | Annotated tag, message: *"packages/core byte-identical to tt-a1i/archify@12106be"* | **Delete** locally and on the remote |
| Root `LICENSE` line 4 parenthetical | `Copyright (c) 2026 tt-a1i (portions derived from tt-a1i/archify)` — our own explanatory text | **Reword** to a bare copyright line (see §1.2) |
| `docs/P0-BUILD-LEDGER.md` (14 refs) | Historical build record | **Rewrite** references to "the upstream baseline" |
| `docs/P1A-BUILD-LEDGER.md` (6 refs) | Historical build record | **Rewrite** likewise |
| `scripts/check-core-drift.mjs` (1 ref) | A comment | **Rewrite** |

### The one line that stays

`packages/core/LICENSE` is the **upstream project's own licence file, harvested verbatim**:

```
Copyright (c) 2026 tt-a1i (Archify)
Copyright (c) 2025 Cocoon AI (original "architecture-diagram-generator")
```

MIT: *"The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."* This file **is** that notice. `packages/core` is unambiguously a substantial portion. Removing or editing it would make the redistribution non-compliant — a licence violation, not a presentation choice.

**This is the entire remaining footprint: two lines, in one file, inside `packages/core/`.** Nothing in the README, the root licence, the docs, the scripts, the gates, the commit history or the tags will name the upstream project.

### 1.2 Root LICENSE after the change

```
MIT License

Copyright (c) 2026 Mirofy contributors
Copyright (c) 2026 tt-a1i
```

The second line is retained deliberately. `packages/core/LICENSE` already carries the full notice, so this is belt-and-braces rather than strictly required — but a root licence that omits a copyright holder whose code ships in the product is the kind of detail that reads badly under scrutiny, and it costs one line.

---

## 2. What replaces the provenance gate

`check:provenance` is deleted. **`check:drift` survives unchanged** and becomes the sole core-integrity gate:

- 160 files under `packages/core/` hashed against `scripts/core-manifest.json`
- CR-byte guard on both the read and `--update` write paths
- Re-baselined deliberately, with the manifest diff as reviewable evidence
- It never referenced the upstream project — its language is "the reviewed manifest"

**What is lost, stated plainly:** the claim *"163 files were byte-identical to the upstream baseline at commit X"* becomes permanently unverifiable, by us and by anyone else. That was a genuine engineering asset — it is the reason the harvest could be trusted. It is being traded for the identity requirement, and the trade is not recoverable once history is rewritten.

---

## 3. The corpus move

`L:\Projects\archify\analysis\future\` → `docs/analysis/` in the repository.

**Moved (tracked, public):**

```
docs/analysis/
  30-PRODUCT-THESIS.md          31-V1-ARCHITECTURE.md
  32-PARITY-AND-FEATURE-MATRIX.md   33-MASTER-ROADMAP.md
  35-NAMING-BRIEF.md            36-VISUAL-SYSTEM.md
  37-ENGINEERING-STANDARDS.md
  reference/                    plans/
  specs/                        pdf/
```

**Not moved — stays outside the repository:**

- `archify-current/` — 7 documents analysing the upstream project
- `38-ARCHIFY-VS-MIROFY.md` — the comparative study
- `34-COMPETITIVE-POSITIONING.md` — the external landscape

These remain at their current location for now. A private repository for them is a separate decision, not part of this work.

### 3.1 Documents needing content changes before they move

| Document | What must change |
|---|---|
| `32-PARITY-AND-FEATURE-MATRIX.md` | The H/R/N legend reads *"Imported as working MIT code"* and *"Does not exist in Archify"*. Reword to reference "the upstream baseline". The framing sentence *"Every feature Archify has, plus every fix"* likewise |
| `33-MASTER-ROADMAP.md` | Check for references; reword |
| `36-VISUAL-SYSTEM.md` | §1 is an argument about porting the ancestor's viewer; reword |
| `00-INDEX.md` | Rebuild for the moved subset; drop entries for documents that stay out |
| `plans/*.md` (3) | P0/P1a/P1b plans reference the harvest, the anchor and `check:provenance` throughout |

### 3.2 What the move fixes — but only after the P1b rebase

> **Sequencing note.** `scripts/docs-pdf.mjs` and `scripts/roadmap-snapshot.mjs` do **not** exist on `main`. They were created by P1b Task 1 and live on the paused `p1b-evidence-spine` branch. An implementer working from `main` will not find them. The two items below are therefore **follow-up work for the P1b rebase (step 6 of §4.3), not part of this operation.**

- `scripts/docs-pdf.mjs` holds **13 absolute paths** into the sibling repository. They become repo-relative once the corpus is in-tree.
- `scripts/roadmap-snapshot.mjs`'s embedded 118-row snapshot exists **only** because CI cannot see the sibling repo. Once the roadmap is a checked-out file, `check:roadmap` can join `npm run check` and the snapshot can be deleted — the drift problem becomes *solved* rather than monitored, retiring the Critical finding from P1b Task 1's review.

Both are recorded here so the rebase does not simply reapply the workaround on top of a repo that no longer needs it.

---

## 4. History rewrite

**15 commits** carry the name in their subject or body; **1 annotated tag** carries it in its message.

### 4.1 Method

`git filter-branch --msg-filter` over `main`, with an explicit phrase mapping — not a token substitution. A blind `s/archify/…/g` produces text like *"harvest renderers … from @12106be"*, which is worse than the original. The mapping rewrites whole phrases:

| Before | After |
|---|---|
| `harvest renderers, schemas, viewer, and CLI from archify@12106be` | `import renderers, schemas, viewer, and CLI at the recorded baseline` |
| `pin renderer parity to archify@12106be by digest` | `pin renderer parity to the recorded baseline by digest` |
| `prove packages/core byte-identity in CI (check:harvest)` | `pin packages/core integrity in CI (check:drift)` |
| `convert the harvest gate to a pinned provenance attestation` | `pin core integrity to a reviewed manifest` |
| `add README, contributing rules, and the harvest boundary` | `add README, contributing rules, and the core boundary` |
| `ARCHIFY_CHROME_NO_SANDBOX` (in bodies) | `MIROFY_CHROME_NO_SANDBOX` |
| any remaining `archify@12106be` | `the recorded baseline` |

The tag is deleted rather than rewritten — its only content is the claim being retired.

### 4.2 Consequences, stated before approval

- **Force-push to a public `main`.** Anyone who has cloned must re-clone; `git pull` will fail with divergent histories.
- **Every SHA changes.** Both build ledgers cite SHAs extensively; those citations must be rewritten **in the same operation**, or the ledgers will reference commits that no longer exist.
- **PR #8's references dangle.** The PR remains merged and readable; its commit links break.
- **`54a1307` ceases to exist**, which is why `check:provenance` must go rather than being repointed.
- **The `p1b-evidence-spine` branch is orphaned** and must be rebased (4 commits, all new files — trivial today).

### 4.3 Ordering

1. Do all content work on `repo-identity`, branched from `main` @ `9ae3f80`
2. Verify: `npm run check` green, zero matches outside `packages/core/LICENSE`
3. Merge to `main` with a merge commit
4. Rewrite history over the merged `main`
5. Force-push `main`; delete the remote tag
6. Rebase `p1b-evidence-spine` onto the new `main`
7. Resume P1b at Task 2

---

## 5. The running record

**`docs/CHANGELOG.md`** — a running record updated as part of every task's definition of done, not at phase end. Each entry: what changed, the commits, which gates moved, and what a reader should look at.

`docs/IMPLEMENTATION-STATUS.md` continues to regenerate from the conformance matrix, and `status:check` already fails the build when it drifts.

**Enforcement.** `docs/CHANGELOG.md` cannot be machine-derived — it is a narrative. Rather than an unenforceable convention, the check is mechanical and modest: a script asserts that the changelog's most recent entry references a commit reachable from `HEAD`. That catches the common failure (shipping several commits without touching the changelog) without pretending to judge whether the prose is good.

---

## 6. Verification

The operation is done when all of the following hold:

```bash
# One match, in one file, and it is the upstream licence notice
git grep -i archify -- . ':!packages/core/LICENSE'      # expect: no output

# History and tags carry nothing
git log --all --grep=archify -i --oneline               # expect: no output
git tag -l | xargs -r git tag -n99 | grep -i archify    # expect: no output

# The product still works
npm run check                                            # exit 0
MIROFY_CHROME=<path> npm run check                       # exit 0
```

Plus: `check:roadmap` runs inside `npm run check`, the embedded snapshot is gone, all 13 CI jobs are green on the rewritten `main`, and both build ledgers cite SHAs that exist.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Force-push loses work | `repo-identity` is merged before the rewrite; a backup ref is kept until CI is green on the new `main` |
| Ledger SHAs go stale | Rewritten in the same operation; §6's verification includes checking they resolve |
| The rewrite misses a body reference | §6's `git log --all --grep` is the check, run after the rewrite, not before |
| A `.md` reference is missed by a case-sensitive search | All searches use `-i` |
| P1b's branch cannot be rebased cleanly | Its 4 commits add only new files under `scripts/` and `docs/`; no overlap with the paths this work touches |
| Losing the provenance attestation is regretted later | **Not mitigable.** Once history is rewritten the anchor is gone. This is the accepted cost of the identity requirement |
