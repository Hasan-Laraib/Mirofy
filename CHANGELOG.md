# Changelog

What changed, and why it was worth changing. Newest first.

There are no releases yet, so entries are dated rather than versioned. Each one
records the decision, not only the diff — a line that says *what* a commit did
is already in `git log`, and a changelog that repeats it is a second copy of
something nobody was struggling to find.

`npm run check:changelog` fails when code has changed since the newest entry
here. A running record that anyone can forget to run is a record that quietly
stops being one.

---

## 2026-08-31

### The layout engine started passing its own gates

Clean Flow makes three demands of a route: leave and arrive through the sides
the endpoints declare, cross no unrelated node, and cross a container's border
rather than run along it. **The routers enforced two of them.**

- **Architecture** was blind to the third, and not by chance: a boundary is
  drawn a fixed pad outside its members, which puts its edge near the middle of
  the gap between a row inside it and a row outside — exactly where a dogleg's
  corridor wants to sit. It now asks the gate's own collector, keeps the natural
  corridor when it is clear, and nudges only when it must.
- **Workflow's cross-lane fallback was returned with no check at all** — no side
  test, no clearance test, unlike every other route it produces. One benchmark
  edge failed six endpoint-side and three edge-through-node assertions from that
  single unchecked drop. The candidate it was missing: an edge leaving a *right*
  side and arriving at a *left* one can only put its vertical leg **between** the
  two x values.
- **Lifecycle's bands were narrower than the schema they serve.** `col` accepts
  0–4; the event and outcome bands offered three slots, and `measureState`
  silently *clamped* an out-of-range column onto its neighbour — so the overlap
  gate reported collisions nobody wrote. Slots are appended at the existing
  pitch, so columns 0–2 keep the exact x they always had.
- **Every lifecycle event lane shared one `y`.** Two lanes with a state in the
  same column landed on the identical point, and the renderer answered *"separate
  them with yOffset"* — asking for a row it could derive. The bundled example
  settles it: a hand-written `yOffset: 78`, precisely one row.

Over the fixed benchmark corpus: **34 composition errors → 15**.

### Boxes grow to their text instead of asking for shorter words

A diagnostic that reads *"shorten the label or widen size"* asks an author to
rename part of the system they are drawing to fit a box the renderer picked.

One rule decided all of it: **grow what the tool chose, never what the author
chose.** Sequence participants, workflow nodes and architecture grid components
now fit their text up to a shared 190px ceiling; workflow columns re-solve when
the defaults cannot hold them; lanes grow for the deepest `yOffset`. An authored
`size`, `width`, `yOffset` or `viewBox` is never overridden.

The workflow column array is worth naming: its gaps were as narrow as **70px**,
and two 92px nodes cannot both sit in 70px. Any document with same-lane nodes in
columns 3 and 4 overlapped by construction.

### Edge labels are solved, not suggested

The old hint moved a label clear of the one obstacle it hit and never checked
whether the new spot was occupied. `label-placement.mjs` walks a ladder of
candidates and takes the first that touches nothing — nodes, other labels, or
routes. **An authored `labelAt`/`labelDx`/`labelDy` is never moved**; automatic
labels route around it.

### `--format svg-static` exports the document's preset

It collected every token block whose selector did not mention `data-preset` —
which is all ten preset blocks. Six presets produced one file, byte for byte.
The same line decided the theme by accident, too: whichever base block came last
won. Both are now resolved through the cascade, and the theme is *chosen*
(light, because a static SVG carries no background and lands on whatever ground
it is pasted onto).

### The benchmark can separate the tool from the model

`--keep` saves what an author produced; `--replay` re-runs the tool over those
exact documents without calling the model again. Until this existed every re-run
changed both the documents and the tool, so **no movement could be attributed to
either** — which is most of why weeks of work produced no number anyone could
point at. A replay cannot claim a different author: the model is read from the
saved manifest and `--model` is refused if it disagrees.

The rate is published in the README under a heading that says we would rather
not: **2 of 8**.

### The `main` lane rule is where an author can read it

A lifecycle diagram must have a lane called `main`. The schema said lanes were
one to four entries with any id, so a document could be schema-valid and then
refused by a rule expressed nowhere reachable. The schema says it now, the
collection's description travels with the error, and
`benchmarks/authors/schema-brief.mjs` — which generates the author's
instructions *from* the schema — carries it.

`04-order-state` is consequently classified **invalid** rather than as a
composition failure. It was always an author error; the harness was charging it
to the layout engine.

### A public proof site, rebuilt from every commit

[hasan-laraib.github.io/Mirofy](https://hasan-laraib.github.io/Mirofy/). The
hero is this repository's own architecture, built by running the real scan
pipeline — so **if scanning this repository ever breaks, the site build fails**.
Nothing is committed: the site is always produced by the code at the commit it
describes.

### Every number in the README is checked

A review found three wrong at once — the matrix had grown from 97 rows to 99 and
from 77 proved to 79, and the test count was 29 behind. None dishonest; all true
when written. `scripts/check-readme-claims.mjs` derives them: it counts the
matrix, reads the tool list the MCP server serves, renders an artifact to measure
it, re-runs the scan, and re-runs the benchmark.

### Also

- `repair` accepts all five diagram types. Only architecture permits node
  `pos`/`size`, so widening and separation are architecture-only **by schema**;
  sequence has neither sides nor geometry and now says so rather than reporting a
  clean run over a document it never touched.
- The Mirofy logo, prepared as light and dark variants by recovering ink colour
  and coverage from the white it was composited over.

### Removed

- **A crossing-avoidance pass.** Correct, and measured over the corpus it changed
  nothing on any document while costing an O(n²) crossing count per candidate on
  every render.
- **A floor for the outcome band.** It could never differ from 450: the schema
  caps lanes at four, and a diagram with an outcome band spends two on `main` and
  `terminal`. Replaced by a guard that becomes reachable if the cap ever rises.

---

## 2026-08-30

- **Ports never aim at a blocked or contested axis** (row 3.16). The first fix
  pinned a fallback port to the side's *centre*, which is the blocked axis; the
  corrected version uses the even-spread slot.
- **The test runner ran `packages/core/test`** instead of skipping all 82 files
  in it.
- **The quarantine was emptied**, and the two real bugs it was hiding were fixed.
  Five of the seven dormant failures were stale exact coordinates; two were real
  Clean Flow rejections.
- **First-pass usable rate measured on a schedule** (row 7.8).

---

## 2026-08-29

The foundation, imported and then made provable.

- **Renderers, schemas, viewer and CLI** imported at a recorded baseline, with
  golden digests pinning renderer parity.
- **The conformance matrix**: one row per imported requirement, each naming the
  test that proves it. A row counts as proved only when its named test passes,
  matched character-for-character — a proof file that exits zero while its own
  test was renamed counts as **unproven**.
- **Per-row title verification** extended to every row after file-level
  accounting let fourteen browser rows read "proved" when only four had a real
  assertion.
- **Real headless Chrome** drives the viewer rows; browser rows never count
  toward the proved total unless a browser actually ran them.
- **CI across three platforms and four Node versions**, with artifact, size and
  audit gates wired into one `check` chain.
- **`check:drift`** pins `packages/core` integrity: the gate does not say a
  change is wrong, it says nobody has said it is right.
