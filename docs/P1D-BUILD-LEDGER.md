# P1d Build Ledger — The System Model

What P1d decided, why, and what each decision costs if it turns out wrong.

P1c built the machinery that finds evidence. P1d built the inventory that
evidence attaches to: components, relationships and boundaries with stable
ids, `evidenceRefs[]` and provenance. Roadmap **P1.6**; rows 1.12, 1.14,
1.15, 1.17.

---

## The reading that made row 1.12 non-breaking

Row 1.12 says stable semantic IDs are **"mandatory for every object"**.

Read as *tighten the five authored schemas to require an id*, that breaks
every document ever written, every fixture, and all 25 golden digests — for
a capability the **model** needs and authors do not. Read as *every object in
the model has a stable id*, it is non-breaking and delivers the same thing.

**Ruling: the model assigns; the schemas stay permissive.**

- An authored id is used verbatim, and authored ids are claimed **first**, so
  a derived id can never displace one by merely appearing earlier in a
  document. First-come-first-served in document order would let position
  decide identity, which is arbitrary.
- Otherwise an id is derived deterministically and **marked
  `authoredId: false`**.

The mark is the part that makes this honest. A derived id is stable only
while the content it derives from is: rename the label and the id changes,
and anything holding the old one now points at nothing. That is a real
limitation of deriving identity from content, and the model states it per
object rather than presenting every id as equally durable. An author who
needs a durable id supplies one.

**Position is part of the derivation.** Two components sharing a type and a
label and differing only in where they sit are two real things; a derivation
keyed on content alone would collapse them into one id and silently merge
them.

**Cost if wrong:** authors wanting truly durable ids must author them, which
the documentation should say plainly.

---

## Rulings

**`owner` and `deployment` are optional, and the fallbacks stay.** Row 1.15's
fields were smuggled before — the ownership profile read a team name out of a
component's display `tag` (its own diagnostic said the owner field was `tag`)
and inferred regions from boundary membership. Making the new fields
*required* would break every engineering-profile document at once. Additive
was the only compatible shape, and **golden being untouched is the proof**.

What did change: the diagnostics now report which fields they **checked**
rather than asserting the answer came from `tag`. A diagnostic that lies
about where it looked is worse than none. And a component that declares
`deployment.regions` is no longer reported as region-ambiguous for being
wrapped by several boundaries — it said where it runs, and a declaration
outranks an inference.

**A merge keeps every label.** The same component described by two documents
becomes one model component carrying both documents' evidence *and* both
labels. Keeping only the last label seen is a silent overwrite dressed as
consolidation, and the test asserts both survive.

**An object with no evidence is `authored`.** Not "unknown", not a weaker
derived class. A hand-written document *is* authored, and saying so is more
truthful than inventing something stronger for it.

**Overrides re-provenance unconditionally.** An override is a person
disagreeing with the analysis. If the overridden object kept saying
`statically-derived`, a human decision would be wearing the authority of
machine evidence. What the override replaced stays on record, so the
disagreement is inspectable rather than erased.

**An override naming an unknown id throws.** A typo'd override that quietly
does nothing is the failure mode worth preventing: the author believes they
corrected the model, the model disagrees, and nothing says so.

---

## What the model actually produced, and why it is all `authored`

`npm run model -- --graph scan/evidence-graph.json` against this repository:

```
7 documents -> 62 components, 71 relationships, 6 boundaries
0 component ids derived, 62 authored
provenance {"authored": 139}
```

Every object resolved `authored` **and that is the correct answer, not a
bug**. The fixtures describe a hypothetical shop (`orders`, `cache`, `db`);
the scan analysed this repository's own source (`src/a.js depends-on
src/b.js`). The two describe different systems, so the join between them is
empty by construction.

Recording it because the shape of the finding matters: making that join
non-empty is the **scanner's subject-naming problem**, not the model's. An
adapter that emits facts about `src/orders/checkout.ts` cannot attach them to
a component called `orders` without a mapping neither side currently has.
That is real work, and it belongs to whichever phase teaches adapters to
speak in component identities.

---

## Defects, and one that did not recur

**A vacuous assertion I wrote and caught.** The engineering-metadata test
asserted that a message did not contain "does not name its owner" — on a
document the schema *rejected outright* for using the not-yet-existing field.
It passed while proving nothing. Strengthening it to "must validate" then
over-corrected: the fixture legitimately fails the ownership profile for
unrelated reasons (security-group boundaries, connection mechanisms). The
right shape asserts the profile **ran** and produced its other complaints,
then asserts the owner complaint is gone.

**The lockfile lesson held.** P1c lost a full CI round to a new workspace
package the lockfile did not know — invisible locally, because node resolves
workspace symlinks without consulting it. This phase committed `npm install`
with the package and verified `npm ci --dry-run` before pushing. CI passed
13/13 on the first attempt.

**Row 6.3 did not recur.** The 60s CDP transport default from P1c held across
this phase's runs.

---

## Verification

- `npm run check` exit 0 **with and without** `MIROFY_CHROME`
- Conformance: **75 rows**, 55/55 proved without Chrome, 0 title-check
  failures, UNPROVEN still only 6.10
- `docs/IMPLEMENTATION-STATUS.md`: 74 SHIPPED, 1 UNPROVEN, 44 PLANNED
- Golden 25/25 **unchanged** — the schema additions are additive
- CI 13/13 on PR #11 (run 33311930856) and 13/13 on `main` at the merge
  commit `23e2840` (run 33312026336)
- No commit carries a `Co-Authored-By: Claude` trailer

## Next

**P1.7, the view compiler** — model to bounded view IR with intent
(`group` / `rank` / `mainPath` / `adjacency`), and the contract test that it
*cannot emit a relationship absent from the model*. It has no matrix row, so
registering one is part of that phase. It is also where the AI abstraction
lives, and the honest v1 is the seam plus a deterministic default: the
contract is enforceable without a network dependency, and row 6.9 forbids one
anyway.
