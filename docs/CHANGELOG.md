# Changelog

Reverse-chronological record of *what changed and when*. This is narrative,
not machine-derived — for *what is built*, see the conformance matrix at
`docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md`. (A generated
`docs/IMPLEMENTATION-STATUS.md` and its `scripts/status.mjs` arrive with the P1b
evidence spine and are not on `main` yet — do not link them from here until they
are.) `npm run check:changelog`
enforces exactly one thing: that the newest entry below cites a commit
reachable from `HEAD`. It catches a changelog quietly going stale while
commits keep landing; it cannot and does not judge whether the prose is
any good, complete, or well written — that is left to review.

Every task updates this file before its final commit (see `CONTRIBUTING.md`).

## 2026-08-30 — P1e: the view compiler and its planner seam

**Commits:** `3bee34d..` on `p1e-view-compiler`.

The model becomes a **bounded** view carrying intent — `group`, `rank`,
`mainPath`, `adjacency` — with no coordinates, under a contract the compiler
enforces rather than assumes.

**The AI lives behind a planner seam, and the seam ships before the model
that fills it.** Operator decision: seam plus a deterministic default
planner, no LLM call. That is the honest v1 — the contract becomes
enforceable and testable without a network dependency, which row 6.9 forbids
anyway, and an LLM planner later implements the same `plan(model, request)`
interface and is policed by the same compiler.

**Every contract assertion runs against a planner written specifically to
violate it.** A contract proven only against the well-behaved default is not
proven at all: the default planner is the one implementation guaranteed not
to be the problem. So a planner proposing an edge the model does not contain
makes `compileView` **throw**, naming the invention. Filtering it out quietly
would have been easier and worse — a planner emitting relationships that do
not exist is broken, and a compiler that tidies up after it hides the
breakage forever.

Omissions are recorded whoever decided them, including edges the *compiler*
dropped because an endpoint was not selected. And the "no coordinates" rule
is asserted by walking the whole IR rather than checking a known field list,
so a positional field added later cannot slip in.

Against this repository: a 62-component model compiles to a 12-node view
with 11 edges — 50 components and 60 relationships omitted, **each with a
recorded reason**. `mainPath` was verified against the live model: every
consecutive pair is a real relationship. That is the 12-node ceiling being
answered by bounded views rather than a denser canvas.

**Row 1.18 was created with the capability.** P1.7 shipped with no matrix row
(the roadmap's rows column reads `—`), and a capability delivered without a
row is invisible to every gate downstream of the matrix — exactly how row
5.16 sat in PLANNED for a full phase after it shipped.

## 2026-08-30 — P1d merged to main

**Commits:** merge commit `23e2840` (PR #11).

The system model is on `main`. CI 13/13 on the PR (run 33311930856) and
13/13 on `main` after the merge (run 33312026336) — green on the first
attempt, because the lockfile discipline P1c paid for in a lost CI round was
applied up front and verified with `npm ci --dry-run`.

75 conformance rows, 55/55 proved without Chrome, golden 25/25 unchanged.
`docs/P1D-BUILD-LEDGER.md` records the phase, including why every model
object resolved `authored`: the fixtures describe a hypothetical shop while
the scan analysed this repository's source, so the join between them is
empty by construction. Making it non-empty is the scanner's subject-naming
problem, not the model's.

## 2026-08-30 — P1d: the system model

**Commits:** `67347f0..` on `p1d-system-model`.

One inventory the diagrams become views of — components, relationships and
boundaries with stable ids, `evidenceRefs[]` and provenance, assembled from
authored documents plus P1c's evidence graph. Roadmap **P1.6**; rows 1.12,
1.14, 1.15, 1.17.

**Row 1.12 said IDs are "mandatory for every object".** Read as tightening
the five authored schemas, that breaks every document ever written, every
fixture and all 25 golden digests — for a capability the *model* needs and
authors do not. So the model assigns: an authored id is used verbatim and
claimed first, so a derived id can never displace one; a derived id is
**marked as derived**, because it is stable only while the content it
derives from is. Rename the label and it changes. That is a real limitation
of deriving identity from content, and the model states it per object rather
than presenting every id as equally durable.

**`owner` and `deployment{regions, networkScope}` are real fields now**
(1.15). They were smuggled before — owner read out of a component's display
`tag`, regions inferred from boundary membership — which works and is legible
to nobody. Optional, with the fallbacks kept, and the diagnostics now report
which fields they *checked* rather than asserting the answer came from `tag`.
Golden is untouched, which is the proof they are additive.

**Overrides re-provenance to `authored`** (1.17). An override is a person
disagreeing with the analysis; if the object kept saying `statically-derived`
a human decision would wear the authority of machine evidence. What the
override replaced stays on record. An override naming an unknown id throws —
a typo'd override that quietly does nothing is the failure mode.

`npm run model` against this repository's fixtures: 7 documents → 62
components, 71 relationships, 6 boundaries. Every object resolves `authored`,
and that is the honest answer rather than a bug: the fixtures describe a
hypothetical shop while the scan analysed *this* repo's source, so the join
between them is empty by construction. Making it non-empty is the scanner's
subject-naming problem, not the model's.

**Not in this phase:** P1.7, the view compiler. It is "where the AI lives",
it has no matrix row, and its binding contract — *cannot emit a relationship
absent from the model* — needed the model to exist first.

## 2026-08-30 — P1c merged to main

**Commits:** merge commit `211fc05` (PR #10).

Evidence discovery is on `main`. CI 13/13 on the PR (run 33310938667) and
13/13 on `main` after the merge (run 33311068463).

Two CI failures were fixed on the PR, both invisible locally. `npm ci` broke
all 13 jobs because the lockfile knew `packages/evidence` but not
`packages/scanner` — node resolves workspace symlinks without the lockfile,
so `npm ci` is the command that checks.

And row 6.3's long-running intermittent is **closed**. The instrumentation
added two occurrences ago did its job: the failure finally named itself,
`Runtime.evaluate: timed out after 15000ms`. Raising that one call was not
enough — the next run failed with `Target.getTargets` naming the same limit.
Two different calls tripping one timeout settles it: a cold Chrome on a
loaded runner can take over 15s to answer anything, and per-call fixes are
whack-a-mole. The CDP transport default is now 60s. A gate should prefer
slow failure on a dead browser over false failure on a healthy one.

71 conformance rows, 70/70 proved with Chrome. `docs/P1C-BUILD-LEDGER.md`
records the phase.

## 2026-08-30 — P1c: evidence discovery

**Commits:** `38027bd..` on `p1c-evidence-discovery` (plan, graph, three
adapters, coverage, the `scan` entry point).

The machinery that discovers evidence, now that P1b built the place it
lives. Two new workspace packages, both dependency-free, nothing in
`packages/core` touched — the phase is entirely additive, so drift and
golden never moved.

**The evidence graph** (row 2.7) enforces "append-only per revision" 
structurally: no update or delete method exists, stored facts are frozen
copies, and `supersede` marks the old fact rather than touching it.
Scanners may claim exactly two of the six provenance classes —
`statically-derived` and `config-derived`. `authored` from a scanner would
be a lie about a human; `inferred` a guess dressed as a finding.

**Three adapters** (rows 2.8–2.10), each tested in both directions: the
facts it must find, and the Gap it must record where analysis honestly
stops. The import extractor is tokenizer-level, not a parser — row 6.9
forbids the dependency, and the honesty rule makes the trade cheap.

**The coverage report** (row 2.17) is a partition — analysed / gapped /
not-analysed sum to the universe, the test fails on an uncounted file —
and contains no percentage anywhere, asserted against the rendered text.

`npm run scan` runs the lot. Against this repository: 919 facts, 9 gaps,
190 files, 0 not analysed, ~300 ms. Every gap was verified genuine by
hand, and three of them told the truth in an unexpected way: mid-phase,
the import scanner reported the test suite's imports of
`adapters/routes.mjs` as unresolvable — because that adapter did not exist
yet. The scanner's first real finding was this plan's own incompleteness,
and the gaps healed when Task 4 landed.

## 2026-08-30 — Roadmap sync: a shipped capability was invisible to the accounting

**Commits:** `91f58ec`.

While scoping P1c against the roadmap, four P1a deliveries turned out to be
unmarked (P1.13 modularized viewer, P1.14 contract.mjs, P1.15 generated
tokens, P1.17 axe gate) — and one of them, row 5.16, had never been
registered in the conformance matrix at all. Its three proof tests were
written in P1a, titled `(5.16)`, and have passed ever since; the row simply
did not exist, so a delivered capability sat in PLANNED for a full phase.

The lesson is about the accounting gate's blind spot: `status:check` can
only catch drift in rows that exist. A capability delivered without its row
is invisible to every gate downstream of the matrix. Row 5.16 is now
registered against the existing tests — 66 rows, 46/46 proved without
Chrome — and the roadmap marks match the matrix.

## 2026-08-30 — P1b merged to main

**Commits:** merge commit `744c67f` (PR #9, 39 commits).

The evidence spine is on `main`. CI 13/13 on the PR (run 33308334550) and
13/13 again on `main` after the merge (run 33308461167) — the one claim the
close-out could not verify locally, now verified both places it matters.

64 of 65 conformance rows proved with Chrome, 0 deferred, 0 title-check
failures; the single UNPROVEN row (6.10, deterministic ZIP packaging) is
unchanged since P0 and out of scope. `docs/IMPLEMENTATION-STATUS.md` reads
64 SHIPPED / 1 UNPROVEN / 54 PLANNED.

## 2026-08-30 — P1b Task 8: evidence from any supported host

**Commits:** `9f578fa..31ca6fb` on `p1b-evidence-spine`.

Evidence now resolves against GitHub, GitLab, Bitbucket, Gitea, Gitee and
Azure DevOps. Verification itself never needed changing — it runs `git`
against a real checkout, and git does not care where the remote lives.

The plan said "only two things are GitHub-bound". There were **five**: the
slug regex; an outright rejection of any URL not starting with
`https://github.com/`; `sourceHref`, which hardcoded GitHub's
`/blob/{rev}/{path}#L{a}-L{b}`; the viewer's repository link, which appended
`/tree/{rev}` and stripped a `github.com` prefix — right for one forge, a
404 and a full-URL slug on every other; and the schema's `url` pattern,
which rejected non-GitHub URLs before resolution ever ran.

The line-range fragment is where forges genuinely disagree, and it is the
detail worth getting right: GitLab omits the second `L` (`#L4-9`),
Bitbucket uses `#lines-4:9`, Azure DevOps addresses files by query string
entirely and its slug is four segments with a load-bearing `_git` marker
rather than owner/name. A wrong template still produces a URL — a
confident, clickable link to nothing, which is worse than admitting the host
is unknown. So `detectHost` returns null rather than guessing, and the
rejection **names** the supported forges: an author cannot guess which are
understood from a refusal that does not say.

The schema keeps a shape check and the adapter owns the host list.
Duplicating the forges in JSON would drift from the module that actually
builds the URLs.

GitHub behaviour is unchanged, and that was checked rather than assumed:
evidence 21/21, validation-gates 25/25, the Passport browser rows 2/2.

## 2026-08-30 — P1b Task 7: the Evidence Passport for relationships

**Commits:** `3bbe832..867afa6` on `p1b-evidence-spine`.

Selecting a relationship focuses its **source node**, so the Passport was
showing that node's evidence while the user believed they were inspecting
the edge. Evidence attributed to the wrong subject is worse than no
evidence at all: the panel looked populated and authoritative while
describing something else entirely. The edge's own sources and class now
replace it.

`renderSourceEvidence` takes the resolved sources and class rather than a
node id, so one renderer serves both subjects. Two would let a node and an
edge drift into reporting evidence differently, which is the one thing a
trust panel must not do.

No new interaction was needed. The plan's Step 3 called for making edges
focusable and selectable; they already were — the hit-target overlay gives
every relationship `role="button"`, a tabindex and an accessible label.
Worth recording, because the plan budgeted for an accessibility change that
turned out to be already met.

Row 5.20 asserts the fixture's **exact** values — path, line range,
revision, class — never that the panel is non-empty. A panel rendering the
wrong file's evidence is non-empty too, and that is the defect it exists to
catch.

Its second test separates two things easy to conflate. The beacon is viewer
chrome: installed at runtime, stripped on export, and it must never sit in
the static artifact. `data-provenance` is renderer-emitted *semantics* and
must **survive**, because the six treatments are keyed on it — stripping it
would silently flatten every provenance distinction in an exported SVG
while leaving the diagram looking fine. Asserting only "the export is
clean" would be satisfied by stripping both.

## 2026-08-30 — P1b Task 6: the evidence-first visual language

**Commits:** `ee80484..b19fdf4` on `p1b-evidence-spine`.

`data-provenance` is now emitted by all five diagram types from one place —
wired into `focusNodeAttrs` and `focusEdgeAttrs` rather than into five
renderers — and every node and edge carries a class. Including subjects that
claimed nothing: those resolve to `authored`. A trust signal that is simply
*absent* when unclaimed is indistinguishable from one the viewer failed to
read, which is the wrong thing for a trust signal to be ambiguous about.

Five treatments, using stroke-dasharray, stroke-width and opacity.
36-VISUAL-SYSTEM.md's V4 constraint is that the classes stay legible
**without colour**, because provenance is a trust signal and roughly 8% of
men have colour-vision deficiency. Colour may reinforce; it never separates
two classes, and the test measures only the non-colour channels for exactly
that reason.

`authored` deliberately has no rule. It is what almost every edge in almost
every existing document resolves to, so giving it a treatment would restyle
every diagram ever authored in order to say "this is normal". Its
distinctness is being the untouched baseline — which is also why golden
moved only where a class was actually claimed.

The rules share specificity with `.a-security` and `.a-dashed` and sit after
them, so provenance wins over a stylistic variant. That is deliberate: the
variant is how an author chose to draw a line, provenance is what is known
about it, and truth outranks spectacle.

Row 4.14 reads **computed styles from a real browser**, not the stylesheet
text. Parsing the CSS would prove a rule was written, not that it wins the
cascade — precisely where P1a's print-palette bug lived. It runs across all
five presets and both themes, and was observed failing: giving
`config-derived` the same dash pattern as `statically-derived` fails naming
both classes and the tuple they share.

## 2026-08-30 — P1b Task 5: the six-class provenance vocabulary

**Commits:** `bbfe407..fe0ed05` on `p1b-evidence-spine`.

`authored` · `source-backed` · `statically-derived` · `config-derived` ·
`runtime-observed` · `inferred` — what kind of knowledge stands behind a node
or a relationship. Optional in the schema: a document claiming no class is
not malformed, it resolves to `authored`, which describes a hand-written
document truthfully rather than flatteringly.

The module is `evidence-provenance.mjs`, not `provenance.mjs`, because the
word already means two other things here: where a brand logo came from
(source URL and SHA-256 across 107 marks — most occurrences of the word in
this repository), and whether repository metadata differs between a delta's
base and head. `authored` and `inferred` collide as well; both already
describe *layout* elsewhere. Nothing may be renamed, so the header states
all three collisions and every class name is exported rather than written
inline.

The published order is preserved and asserted as a sequence. It is the
legend's display order, **not** a confidence ranking: `authored` leads while
being the weakest of the six, since it is what a subject with no evidence
resolves to. The plan described it as "strongest to weakest", which
contradicts both specification documents and the resolution rule itself.
The specification won, and the test pins the sequence so that sorting it
into an apparent ranking cannot silently reorder the legend.

Worth recording about an existing gate: row 5.17's `data-*` contract scans
renderer sources as raw **text**, comments included. Naming an attribute in
a comment beside code that does not emit it reads as an emission nothing
consumes — which is what the new module's header did on first write. Crude
by design, and the crudeness is what makes it catch real defects; but it
means comments in `renderers/` are part of that gate's input.

## 2026-08-30 — P1b Task 4: evidence reaches the edges

**Commits:** `e60734c..ac4b8e7` on `p1b-evidence-spine`.

Task 3 taught the schema to accept `sources` on a relationship. Nothing
read them. Resolution walked components only, so an authored edge citation
validated cleanly and then disappeared — and not quietly: with no component
source left to count, the render failed claiming `/meta/repository` required
a *component* source reference.

Three architecture-only restrictions stood in the way, where the plan
anticipated one. `hasRepositoryEvidence` returned false for every other
diagram type; the CLI refused `--repo-root` outside architecture; and
`/meta/repository` existed only in architecture's schema. The CLI's guard
now reads `supportsRepositoryEvidence()` from the evidence module instead of
keeping its own list, so a sixth diagram type added without evidence support
is rejected loudly rather than silently ignoring the flag.

Components and relationships share one verification path. Only the JSON
pointer differs — `/components/…` against `/connections/…`, `/flows/…`,
`/transitions/…`, `/messages/…`, `/edges/…` — because an author fixing an
error must be sent to the place in *their* document where the mistake is.
The failure codes are unchanged; they are a contract consumers match on.

Relationships key by their index in the authored array, which is already
what the renderers emit as `data-edge-key`. Keying by `id` would have
reached only the edges that declare one, and most do not.

In the viewer, one beacon builder serves nodes and edges; only the anchor is
a parameter. The accessible label is deliberately **not** shared: the node
string reads "focus this node to inspect", which is untrue on a connection,
so `beaconEdge` is its own catalogue entry in both locales. A screen reader
is the only audience for that string, and getting it wrong there is
invisible to everyone else.

Verified in real Chrome across all five diagram types: one beacon each,
marker `SRC 1`, label "1 verified source; focus this connection to inspect".

The Task 3 fixture evidence was reverted. A document carrying `sources` must
also carry `/meta/repository`, so once resolution began seeing relationship
sources those fixtures stopped rendering at all — caught by the gate, not in
review. Pinning a revision into a golden fixture would make rendering depend
on git history a shallow CI clone does not have, so the tests construct
their own evidenced documents instead.

## 2026-08-30 — P1b Task 3: relationships can carry evidence

**Commits:** `2ea5302..b10149b` on `p1b-evidence-spine`.

Evidence could be attached to an architecture component and to nothing
else. A relationship — the claim that two things are connected — could not
answer "why do I believe this?" in any of the five diagram types. That is
the differentiator this phase exists for, and four of five types had no
support for it at all.

The `sources` shape moved verbatim from architecture's inline component
definition into `common.schema.json` `$defs`, and is referenced from six
sites: components (now a `$ref`), plus `connections`, `flows`,
`transitions`, `messages` and `edges`. One definition, so components and
relationships cannot drift into two subtly different evidence shapes.
Deliberately NOT added to sequence's `segments` or `activations` — lifeline
structure and activation bars are not relationships.

Row 2.4 is asserted once per diagram type, not once overall, precisely
because support existed for one of the five: a single-type test would have
passed while four types silently had nothing. Each test also asserts that a
source without `path` is REJECTED — evidence that is silently dropped is
worse than evidence never claimed.

The five fixtures now cite real files in this repository with checked line
ranges. Golden is unchanged, correctly: nothing renders edge evidence yet.

One gate caught a real staleness during this task. Adding row 2.4 moved it
from PLANNED to SHIPPED, and `status:check` failed the build naming the
totals line — the gate wired in Task 7, doing its job unprompted.

## 2026-08-30 — P1b Task 2: P1a's debt cleared

**Commits:** `495a230..4a6b520` on `p1b-evidence-spine`.

**The diagram svg now declares `role="graphics-document"`, not `role="img"`.**
Every component node carries `tabindex="0" role="button"`, and `role="img"`
declares its own subtree presentational — a WCAG 4.1.2 defect
(axe-core: nested-interactive). It was corrected at viewer boot only, which
left the static markup wrong for JS-disabled readers and every non-viewer
consumer, and invisible to the axe gate, which scans the post-boot DOM and
so could never see it. The new test reads rendered HTML directly and needs
no Chrome. The boot-time assignment is gone: two mechanisms for one
invariant is how they drift apart.

That change broke `compare`. `extractArchitectureSvg` matched `role="img"`
literally, so every comparison against a freshly rendered artifact failed
with `delta/svg-missing`. It now accepts both roles — not as a courtesy,
but because `compare` reads a base artifact alongside a head one, and a
base rendered before the change is exactly what the tool exists to handle.

**The print stylesheet did not do what its comment claimed.** `@media`
contributes no specificity, so the print palette's `:root, [data-theme=…]`
selectors, `(0,1,0)`, lost to every preset palette's
`[data-preset="X"][data-theme="Y"]`, `(0,2,0)`. Printing from dark theme in
signal-flow, blueprint, editorial or okabe-ito put that preset's **dark**
palette on white paper — 8 of the 10 palette blocks outranked the rule meant
to override them. Adding `html[data-preset][data-theme]`, `(0,2,1)`, wins.

Verified in real Chrome under print emulation, not by reading the cascade:
before, editorial printed `--bg: #181611` with `#7fc6c7` strokes; after,
`#ffffff` with `#0891b2`. All five presets now resolve to a white ground.

**The palette-leak gate was decorative.** It tested one literal selector, so
it caught only the block someone thought to name; P1a recorded it as
"backstopped by the count assertion", which was false — that count reads
the emitter's output, where a block living in structural CSS never appears.
Neither check could see the 27-property print block sitting in
`01-structure.css` the whole time. It now scans for the shape (any rule
declaring 4+ custom properties) against an allowlist with written reasons,
and was observed failing on a planted eleventh block.

## 2026-08-30 — P1b rebased onto the rewritten main; the roadmap is read live

**Commits:** `7ad8e09..d83c344` on `p1b-evidence-spine`.

The four paused P1b commits (gallery, status generator, PDF generator,
roadmap drift check) now sit on the current `main`. The rebase was not the
clean replay it was planned as, and what it surfaced is worth recording.

Three of the four commits conflicted, on `.gitignore` and on `package.json`
— every one of them rewrites the whole `check` chain to append its own
script. Resolved by keeping `main`'s chain and carrying over each commit's
new entry, so no gate was silently dropped.

Worse, one break did *not* conflict. `scripts/status.mjs` was written
before the origin category was renamed, and still imports that category's
old export name, which `matrix.mjs` no longer provides. The two files never overlap, so git merged
them cleanly into a module that throws at load — and because `status:check`
is in the gate chain, `npm run check` failed at import. A rebase across a
rename can produce a textually clean merge that does not run.

The roadmap is no longer a frozen 118-row copy. That copy existed because
the document lived outside the repository; it is now tracked in-tree, so
`scripts/roadmap.mjs` parses it live and reports the same 118 rows.
`check:roadmap`, which existed only to diff the copy against the live file,
is deleted rather than promoted into the gate chain — once the copy is the
live file, that diff compares a thing to itself. `status:check` already
covers it, proved by mutating a roadmap row and watching the build fail.

The PDF generator's absolute external paths could not simply be made
repo-relative: most of its sources are held privately and were never
brought in-tree. It now renders the six in-tree analysis documents only.

## 2026-08-30 — Retire the last inherited identifiers; make row 6.3 say why it failed

**Commits:** `a74ab8c..27b6372`.

The root `LICENSE` carried a second copyright line naming the source
project's author. It was belt-and-braces — `packages/core/LICENSE` already
carries the notice the MIT terms actually require — so the root file now
names only this project's contributors. `packages/core/LICENSE` is
unchanged and stays byte-identical to the state it was imported in; it is
the single permitted reference and must never be edited.

Six URLs in `packages/core` still pointed at the source repository's owner
and would 404: the `SKILL.md` author field and five rename-artifact
assertions across four tests. Repointed at this repository. Drift
re-baselined for the five edited files.

Conformance row 6.3 skips when Chrome is undetected, but a Chrome that
resolves and then fails mid-capture takes the other branch, where the
empty-viewport default surfaced as a bare `0 !== 4` — twice in CI, on two
different platforms, with the real message sitting unread in the receipt
the test had already parsed. It now asserts on `receipt.error` first. This
is diagnosis, not a fix: the underlying intermittent failure is not
reproducible locally and remains open, but its next occurrence will name
its own cause.

## 2026-08-30 — Repository identity: drop the source repo's own references, retire provenance

**Commits:** `97b2c13..97608d8` (Task 1, remove the repository's own
references to its source — `LICENSE`, `NOTICE`, the provenance record,
the provenance manifest, and `scripts/check-provenance.mjs`; Task 2,
copy the active analysis corpus in-tree at `docs/analysis/` and
de-reference it). Task 3 (this changelog and its freshness gate) continues
the same operation and follows in later commits on this branch.

**What changed:** `LICENSE` no longer names the source project; the
provenance-attestation script and its manifest were deleted outright — the
byte-identity guarantee they encoded is now carried by `check:drift` alone
(`scripts/check-core-drift.mjs` + `scripts/core-manifest.json`).
`docs/analysis/` gained its own in-tree copy of the private planning corpus
that `docs/P0-BUILD-LEDGER.md` and `docs/P1A-BUILD-LEDGER.md` had only ever
referenced by path into a sibling repository; every reference to that
sibling repository, and every now-defunct issue-tracker citation, was
rewritten by meaning rather than deleted. `test:conformance`'s origin
category was renamed to `Imported`.

**Gates moved:** `check:provenance` removed from the `check` chain entirely
(retired, not disabled) — the chain became `lint → typecheck → test →
test:golden → check:template → check:drift → test:conformance →
check:artifacts → check:size → check:audit`, and gains `check:changelog`
after `lint` in this same operation. `check:drift` unaffected, still
160/160 (`packages/core/` was not touched by this operation).
`test:conformance` row count unchanged — only the origin label changed.

**Look at:** `.superpowers/sdd/2026-08-30-repository-identity/task-1-report.md`
and `task-2-report.md` for the full per-file accounting; the repository retains
no reference to its source outside `packages/core/LICENSE`.

## 2026-08-29 — P1a: viewer & design-system spine

**Commits:** `8a5a733..0b394f9` (38 commits on `p1a-viewer-design-system`),
merged to `main` at `2d2cd09`.

**What changed:** `packages/core/assets/template.html` stopped being
hand-maintained and became a generated artifact, built from a new
`packages/viewer/` source tree (19 JS modules; one authored CSS file plus a
generated design-token palette covering 10 blocks, including a new
Okabe–Ito colour-blind-safe preset). A `contract.mjs` check now gates all
three consumer surfaces of that source tree. `packages/core/bin/preview.mjs`'s
`fs.watch` short-path abort (P0 debt) was fixed, and the ~3.4 MB
`packages/core/examples/` tree was removed, lowering the tracked-tree size
budget from 10 MB to 6 MB.

**Gates moved:** `check:template` byte-identical at 683,160 bytes;
`check:drift` 160/160 (manifest re-baselined only for the paths this phase
actually touched); `test:golden` 25/25 (5 modes × 5 presets, all digests
distinct); `test:conformance` grown to 60 rows, 42/42 proved without
Chrome / 59/59 with `MIROFY_CHROME` set (row 6.10 remains unproven —
pre-existing, out of import scope); `check:size` 3.9 MB / 6 MB;
`check:audit` 0 vulnerabilities; `check:provenance` 163/163 at the time
(that gate has since been retired — see the entry above).

**Look at:** `docs/P1A-BUILD-LEDGER.md` for the full record, including the
Bisectability table (7 of 38 commits fail `check` from a clean checkout —
a CRLF-poisoned baseline entry, fixed and then hardened) and the P1b debt
this phase left open (an eleventh, unmodelled print-media palette block in
`01-structure.css`).

## 2026-08-29 — P0: foundation import

**Commits:** `4379f9a..8a5a733`.

**What changed:** New repository scaffolded (`Mirofy`, `@mirofy/*` scope,
Node `>=18`, pure ESM, zero runtime dependencies). Renderers, schemas,
viewer, and CLI imported from the source baseline; golden digest parity
pinned against it. A 56-row conformance matrix was established with a
named `testTitle` per row inside a shared suite — not just a passing exit
code. CI was brought green across a Windows-only `fs.watch` libuv abort
(short-form 8.3 temp paths defeat a native path-prefix assertion) and a
Linux sandboxed-Chrome launch failure (`setup-chrome`'s unpacked binary
left non-root/non-setuid).

**Gates moved:** established from nothing — `check:template`
byte-identical; `test:golden` 5/5; `test:conformance` 39/39 proved without
Chrome / 55/55 with `PRODUCT_CHROME` (this env var's pre-rename name) set;
`check:artifacts` 5/5 reproducible; `check:size` 6.6 MB / 10 MB;
`check:audit` 0 vulnerabilities; `check:provenance` 163/163 (that gate has
since been retired — see the entry above).

**Look at:** `docs/P0-BUILD-LEDGER.md` for the full record, including the
pre-flight rulings (Windows `--test` glob behaviour vs. CI's pwsh) and the
two-wave CI green-up diagnosis.
