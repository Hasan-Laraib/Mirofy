# P1b Build Ledger — The Evidence Spine

What P1b decided, why, and what each decision costs if it turns out wrong.

The most useful part of the P1a ledger was not its account of what worked; it
was the nine plan defects it recorded. This ledger is written on that basis.
P1b's plan carried **eight** defects that reached execution, and one of them
inverted the size of an entire task. They are listed first, before anything
that went well, because they are the part a reader can act on.

---

## The plan defects

Eight, in the order they were hit. Every one was found by executing the plan,
not by reviewing it — which is the argument for gates over inspection.

### 1. Task 7 of the repository-identity plan: "no overlap with the paths this operation touched"

The rebase was described as a clean replay of four commits. Three of the four
conflicted, on `.gitignore` and on `package.json` — because **every** P1b
commit appends its own script and rewrites the whole `check` chain to do it.

Worse, one break did *not* conflict. `scripts/status.mjs` was written before
the origin category was renamed and imported the old export name;
`matrix.mjs` had renamed it. The two files never overlap, so git merged them
cleanly into a module that threw at load — and because `status:check` sits in
the gate chain, `npm run check` died at import.

**Lesson:** a rebase across a rename needs a build, not a conflict count.

### 2. `check:roadmap` was to be promoted into the gate chain

The plan said the drift problem "is now solved" by reading the roadmap live,
and then said to wire the snapshot-vs-live differ into `npm run check`. Both
cannot hold. Once the snapshot *is* the live file, that differ compares a
thing to itself.

**Ruling:** deleted, not promoted. `status:check` already regenerates
`IMPLEMENTATION-STATUS.md` from the roadmap and fails when the committed file
no longer matches, which is the gate that bites. Proved by mutating roadmap
row 6.23 and watching the build fail naming the row.

This would have been the **fifth** unconditionally-passing gate this project
has caught before it landed.

### 3. Task 5: "the order runs from strongest evidence to weakest"

It does not, and cannot. `authored` heads the published list while being the
class a subject resolves to when it has **no** evidence at all — which the
same step defines two sentences later.

Both specification documents publish the same order and neither calls it a
ranking.

**Ruling:** keep the published order; document in the module and the row that
it is DISPLAY order, not confidence, so that nobody "fixes" it by sorting.
The test asserts the sequence rather than the set for exactly that reason.
**Cost if wrong:** the legend reads in a different order than the docs.

### 4. Task 6 Steps 1 and 2 were the same test

Step 1 asserts the six non-colour tuples are pairwise distinct. Step 2 asks to
greyscale the colours and assert the six are "still distinguishable by their
non-colour attributes alone" — which cannot fail if Step 1 passes, because
greyscaling does not change a dash pattern.

**Ruling:** replaced Step 2 with an assertion Step 1 does not imply — the
distinctness holds across **all five presets and both themes**. Presets change
colour, and a treatment that accidentally leaned on a palette variable could
collapse in one preset only.

The sixth unconditionally-passing gate, caught before it landed.

### 5. Task 6: `simulateCvd` does not exist

The plan's Interfaces block names `simulateCvd` from `color-science.mjs`. That
module exports `hexToRgb`, `CVD_TYPES`, `hexToLab(hex, cvdType)`,
`contrastRatio` and `deltaE2000`. CVD simulation is a *parameter* of
`hexToLab`, not a separate function. Recorded pre-flight; the replacement test
did not need it.

### 6. Task 7 Step 3 was already satisfied

It budgeted for making edges focusable, keyboard-reachable and selectable,
warning that a mouse-only edge Passport would be an accessibility regression.
They already were: the relationship hit-target overlay gives every
relationship `role="button"`, a roving tabindex, `aria-label`,
`aria-describedby` and focus rails. Verified before writing anything. **No
interaction code was added.**

The real defect was narrower and worse than the plan described: selecting a
relationship focuses its SOURCE NODE, so the Passport rendered that node's
evidence under an edge selection. Not a missing feature — a panel confidently
attributing evidence to the wrong subject.

### 7. Task 8: "Only two things are GitHub-bound"

The largest defect of the plan, and it inverted the task's size. The plan
called it "smaller than it reads". There were **five** GitHub-bound sites, and
the three it missed were the important ones:

| Site | Why it mattered |
|---|---|
| `sourceHref()` | The blob-URL builder itself — the literal subject of the task |
| `07-focus.js` repository link | `/tree/{rev}` plus a `github.com` prefix strip: a 404 and a full URL where a slug belongs, on every other forge |
| `common.schema.json` `url` pattern | Rejected non-GitHub URLs *before* resolution ran, so the unsupported-host test first failed against a schema error rather than the adapter's |

### 8. Task 3's fixture evidence could not survive Task 4

Task 3 Step 7 adds `sources` to the five golden fixtures. Task 4 then makes
evidence resolution *see* relationship sources — at which point those
fixtures, which carry no `/meta/repository`, stop rendering entirely.

Task 3's step was only ever viable because resolution ignored what it wrote.

**Ruling:** revert the fixture evidence; the tests construct their own
evidenced documents. Pinning a revision into a golden fixture to fix it would
make rendering depend on git history a shallow CI clone does not have.
Caught by the gate, not by review.

---

## Rulings that shaped the result

**`authored` gets no CSS treatment.** It is what every unclaimed subject
resolves to — almost every edge in almost every existing document — so giving
it a treatment would restyle every diagram ever authored in order to say "this
is normal". Its distinctness is being the untouched baseline, which is also
why golden moved only where a class was actually claimed.

**Provenance outranks stylistic variants in the cascade.** The treatments sit
after `.a-security` and `.a-dashed` at equal specificity, so provenance wins.
The variant is how an author chose to draw a line; provenance is what is known
about it. Truth before spectacle (`36-VISUAL-SYSTEM.md` §4).

**Edges get their own screen-reader string.** Sharing the node string would
announce "focus this **node** to inspect" on a connection. That string is the
only thing a screen-reader user gets, so being wrong there is invisible to
everyone else and total for them.

**The provenance class token is displayed verbatim, not localised.** It is
published vocabulary the documentation and the legend both use. The localised
framing lives in the `aria-label` instead. This avoids twelve catalogue
entries whose only job would be to translate a term the docs do not translate.

**Relationships key by array index, not by `id`.** That is already what the
renderers emit as `data-edge-key`, and what the JSON pointer uses. Keying by
`id` would reach only the edges that declare one, and most authored
relationships do not.

**The schema keeps a shape check; `hosts.mjs` owns the host list.** Encoding
six domains in JSON would duplicate the adapter list in a file that cannot
build a URL, and the two would drift.

**An unrecognised forge is refused by name.** `detectHost` returns null rather
than guessing. A wrong URL template still *produces a URL* — a confident,
clickable link to nothing, which is worse than admitting the host is unknown.
The rejection lists the supported forges, because an author cannot guess which
are understood from a refusal that does not say.

---

## Two defects in existing code, found while building on it

**`role="img"` on the diagram SVG.** Every component node carries
`tabindex="0" role="button"`, and `role="img"` declares its own subtree
presentational — a WCAG 4.1.2 defect. It had been corrected at viewer boot
only, which left the static markup wrong for JS-disabled readers and every
non-viewer consumer, and invisible to the axe gate, which scans the post-boot
DOM and so could never see it.

Fixing it broke `compare`, which matched `role="img"` literally when
extracting the primary SVG. Both roles are now accepted — not as a courtesy,
but because `compare` reads a base artifact alongside a head one, and an
artifact rendered before the change is exactly what that tool exists to
handle.

**The print stylesheet never worked.** `@media` contributes no specificity, so
the print palette's `:root, [data-theme=…]` selectors, `(0,1,0)`, lost to
every preset palette's `[data-preset="X"][data-theme="Y"]`, `(0,2,0)`.
Printing from dark theme in signal-flow, blueprint, editorial or okabe-ito put
that preset's **dark** palette on white paper — 8 of the 10 palette blocks
outranked the rule meant to override them.

Verified in real Chrome under print emulation rather than by reading the
cascade:

```
pre-editorial   print --bg #181611  --frontend-stroke #7fc6c7  DARK
pre-okabe-ito   print --bg #020617  --frontend-stroke #56b4e9  DARK
post-editorial  print --bg #ffffff  --frontend-stroke #0891b2  LIGHT
post-okabe-ito  print --bg #ffffff  --frontend-stroke #0891b2  LIGHT
```

**The palette-leak gate was decorative.** It tested one literal selector, so
it caught only the block someone thought to name. P1a recorded the gap as
"backstopped by the count assertion"; it was not — that count reads the
emitter's output, where a block living in structural CSS never appears.
Neither check could see the 27-property print block that had been sitting in
`01-structure.css` the whole time. It now scans for the *shape* — any rule
declaring four or more custom properties — against an allowlist with written
reasons.

---

## Gates observed failing

Every new gate was broken deliberately before the task closed. A gate that has
never been seen to fail is a decoration.

| Gate | The deliberate break | What it said |
|---|---|---|
| static role (5.19) | — | named the real static markup it found |
| print specificity (4.12) | — | computed `0,1,0`, named all 8 losing preset blocks |
| palette leak (4.12) | planted an eleventh block | named its selector |
| relationship evidence (2.4) | reverted dataflow's schema | `additionalProperty: "sources"` |
| provenance enum (2.5) | `provenance: "vibes"` | named the field |
| treatments (4.14) | gave two classes one dash pattern | `classic/dark: statically-derived and config-derived share "7px, 3px \| 1.5px \| 1"` |
| edge beacon (2.2) | removed the edge sources | named the missing relationship beacon |
| edge Passport (5.20) | removed the edge-evidence call | Passport fell back to the node's evidence |
| roadmap drift (`status:check`) | mutated roadmap row 6.23 | named the row and the exact diff |

---

## Process failures of my own

Recorded because they cost time and would cost it again.

**Committed a whole task under one commit's message.** All of Task 6 went in
with `git add -A` under a message describing only the emission. Split into
three afterwards. The manifest travels with whichever half changed the files
it hashes.

**Edited viewer source and never rebuilt the template**, then spent a Chrome
debugging cycle on an artifact built from the old viewer. The template is a
build artifact; source edits are invisible until it is rebuilt.

**A regex written as `<svg\b…` reached the file as a literal backspace byte
(0x08)**, so it could never match. The test reported "no diagram svg found"
against a file that plainly had one. Escapes that survive a generator are not
the same as escapes that survive being written *by* one.

**Reformatted whole files by round-tripping JSON.** `json.dumps` expanded
every compact object in the schemas and fixtures — 264 changed lines in
`architecture.schema.json` for a 2-line change. Reverted and redone as
surgical text edits: final diffs are 2/16, 16/0, 3/0 ×4, and 1/1 per fixture.
A structural rewrite that happens to be semantically identical is still an
unreviewable diff.

---

## Verification

Measured at the close of Task 9.

- `npm run check` → exit 0
- Conformance: **65 rows**, 19 browser-deferred (never counted as passing)
- `docs/IMPLEMENTATION-STATUS.md`: 64 SHIPPED, 1 UNPROVEN, 54 PLANNED
- The single UNPROVEN row is 6.10 (deterministic ZIP packaging), unchanged
  from P0 and still out of scope
- Rows registered this phase: **2.3, 2.4, 2.5, 4.14, 5.20**; row 2.2 extended
  rather than duplicated, its `testTitle` updated in `matrix.mjs` to match
  character-for-character
- No commit carries a `Co-Authored-By: Claude` trailer
- **CI verified after the operator authorised the push.** This ledger
  first recorded the "13 jobs green" claim as unverified, because the
  branch was deliberately unpushed and a local `npm run check` is a
  weaker claim than 4 Node versions × 3 platforms. Both runs are now on
  record: 33308334550 on PR #9 (13/13) and 33308461167 on `main` at the
  merge commit `744c67f` (13/13).
