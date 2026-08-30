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
