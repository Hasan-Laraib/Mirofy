# P1e Build Ledger — The View Compiler

What P1e decided, why, and what each decision costs if it turns out wrong.

P1d built the inventory. P1e turns it into a **bounded** view carrying intent
— `group`, `rank`, `mainPath`, `adjacency` — with no coordinates, under a
contract the compiler enforces rather than assumes. Roadmap **P1.7**; new
matrix row **1.18**.

---

## The decision that shaped the phase

`31-V1-ARCHITECTURE.md` §2 says the view compiler is *"where the AI lives —
and the only place it lives"*, and §3 lists `LLM` among its dependencies.

**Operator decision, 2026-08-30: ship the seam plus a deterministic default
planner; no LLM call this phase.**

That is the honest v1, and not merely the cheap one:

- The contract becomes **enforceable and testable today**, against a planner
  that cannot be excused for being probabilistic.
- Row 6.9 forbids runtime dependencies, so a network client could not ship
  here anyway.
- An LLM planner later implements the same `plan(model, request)` interface
  and is policed by the same compiler. Nothing about it is provisional.

**Cost if wrong:** the deterministic planner's selection heuristic (degree)
is not the one an LLM would choose, so the default view may be less
*interesting* than an AI-planned one. It is not less *correct*, and the
contract is indifferent to which planner produced the plan.

---

## Why every contract test targets a hostile planner

The compiler's rule, verbatim:

> may select, group, name, and omit. May NOT invent a relationship absent
> from the model. Omissions are recorded, not silent.

A contract proven only against the well-behaved default planner is not
proven at all — the default planner is the one implementation *guaranteed*
not to be the problem. So the tests use planners written specifically to
violate it: one that proposes an edge between two real nodes with no
relationship between them, one that selects a node that does not exist.

This matters more here than anywhere else in the codebase, because the
planner is the one component in this system that will eventually be
probabilistic. The contract has to hold when the planner is **wrong**, not
only when it is right.

---

## Rulings

**An invented relationship throws; it is not filtered out.** Quietly dropping
it would have been fewer lines and worse. A planner emitting relationships
the model does not contain is broken, and a compiler that silently cleans up
after it hides the breakage forever — which is exactly the failure an LLM
planner would produce, at scale, without anyone noticing.

**Omissions are recorded whoever decided them.** The rule does not
distinguish between "the planner chose not to include this" and "the
compiler dropped this because an endpoint was not selected". Both are things
missing from a view that the reader would otherwise assume complete, so both
are recorded with a reason.

**"No coordinates" is asserted by traversal, not by a field list.** The test
walks the entire emitted IR looking for anything positional. Checking a known
set of field names would pass the day someone adds a new one. Layout is the
solver's job (P2), and a position emitted here would quietly move that
boundary.

**`edges: null` is a meaningful third state**, distinct from an empty array
and from a malformed value. Null means "every model relationship between the
nodes I selected" — a planner that chose the nodes is not thereby in the
business of hiding edges between them, and requiring it to restate them
would make the common case verbose and the omission of one invisible.

**`mainPath` is verified, not asserted.** The default planner finds the
longest simple chain by exhaustive depth-first search over the *selected*
subgraph — exhaustive is affordable precisely because the view is
budget-bounded. The test then checks every consecutive pair against the
model independently, so a planner returning a plausible-looking sequence
fails regardless of how it was produced.

**The budget lives in the request.** A view that grows with the model stops
being a view. The default is 12 — the ceiling the source project hit, and
the number row 1.14 names when it says the model "kills the 12-node ceiling".
It kills it by making twelve a *per-view* bound the compiler enforces
honestly, not a limit the whole system runs into.

---

## Row 1.18 was created with the capability

P1.7's rows column in the roadmap reads `—`. Nothing would have registered
this work as proved.

That is not a paperwork problem. A capability delivered without a row is
invisible to every gate downstream of the matrix: `status:check` can only
catch drift in rows that exist. It is precisely how row 5.16 — the
modularized viewer, shipped in P1a with three passing tests — sat in PLANNED
for a full phase until this session's roadmap sync noticed.

So row 1.18 was added to `matrix.mjs` **and** to
`docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md` in the same phase as the
code, and the roadmap and matrix now agree.

---

## What it produced

`npm run compile` against this repository's own model:

```
62 components, 71 relationships in the model
view holds 12 nodes, 11 edges (budget 12, planner deterministic)
omitted 50 components and 60 relationships, each with a recorded reason
mainPath api_a -> redis -> api -> web -> edge
```

Verified against the live model, not only the fixture: every consecutive
pair of `mainPath` is a real relationship, every one of the 110 omissions
carries a reason, and the emitted view contains no positional field.

---

## Defects

Both were caught by the gate rather than by review, and both were mine:

**An unused constant** left over from copying the model test's shape —
caught by lint.

**A `catch`-less type narrowing.** The request test inspects a thrown error's
`message`; under `tsc` a thrown value is `unknown`. Narrowed with an
`instanceof Error` check rather than a cast, so the test still behaves
correctly if something that is not an Error is ever thrown.

---

## Verification

- `npm run check` exit 0 **with and without** `MIROFY_CHROME`
- Conformance: **76 rows**, 56/56 proved without Chrome, 0 title-check
  failures, UNPROVEN still only 6.10
- `docs/IMPLEMENTATION-STATUS.md`: 75 SHIPPED, 1 UNPROVEN, 44 PLANNED
- Gates observed failing: the invention check (replaced with a silent
  filter → the hostile-planner test fails), and `mainPath` verification
  (planner emits a sorted list → the test names the non-adjacent pair)
- CI 13/13 on PR #12 (run 33314125402) and 13/13 on `main` at the merge
  commit `b626836` (run 33314263512)
- No commit carries a `Co-Authored-By: Claude` trailer

## Next

The P1 spine is now complete end to end: **scan → evidence graph → system
model → bounded view IR**. What remains in P1 is `P1.12` (shared compiler
pipeline, XL), `P1.16` (showcase false-negative fix), `P1.18` (Mermaid
import) and `P1.19` (scan-first agent contract) — none of which depend on
each other.

The natural next step for the spine itself is **P2's layout solver**, which
consumes this view IR and is the first thing that turns intent into
coordinates. It is also the first phase needing a real dependency
(Adaptagrams, dev-time), so row 6.9's boundary — runtime versus dev-time —
will need stating explicitly before it starts.
