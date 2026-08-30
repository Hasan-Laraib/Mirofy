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

## 2026-08-30 — Retire the last inherited identifiers; make row 6.3 say why it failed

**Commits:** `a74ab8c..27b6372`.

The root `LICENSE` carried a second copyright line naming the source
project's author. It was belt-and-braces — `packages/core/LICENSE` already
carries the notice the MIT terms actually require — so the root file now
names only this project's contributors. `packages/core/LICENSE` is
unchanged and stays byte-identical to its harvest state; it is the single
permitted reference and must never be edited.

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
