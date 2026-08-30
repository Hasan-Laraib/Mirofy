# P1c Build Ledger — Evidence Discovery

What P1c decided, why, and what each decision costs if it turns out wrong.

P1b built the place evidence lives. P1c built the machinery that finds it:
an append-only evidence graph, three scanner adapters, and a coverage report
that refuses to flatter itself.

Unlike P1a (nine plan defects) and P1b (eight), this plan held up: it was
written immediately after executing P1b, against specification sections that
had just been read rather than remembered. The defects this phase produced
were **implementation** defects, caught by tests and by CI. That is the
pattern worth noting — a plan written close to the code it plans is a
better plan.

---

## The rule that shaped everything

From `31-V1-ARCHITECTURE.md` §3, verbatim:

> **NEVER guess. An unanalysable file is a Gap, not an omission.**

Every adapter test therefore has two halves: the facts it must find, and the
Gap it must record where analysis honestly stops. An adapter shown only to
emit facts has not been shown to obey the rule, so a Gap test sits beside
every fact test — computed import specifiers, unresolvable relative paths,
malformed manifests, computed route paths, multi-line route registrations.

The scanner earned that discipline in the most direct way available. Run
mid-phase against this repository, it reported twelve gaps. Nine were
genuine `await import(pathToFileURL(...))` sites. The other three were the
test suite importing `adapters/routes.mjs` — **which did not exist yet,
because it was the next task**. The scanner's first real output included an
honest report of this plan's own incompleteness, and those three gaps
healed when Task 4 landed.

---

## Rulings

**Append-only is structural, not conventional.** There is no update or delete
method on `EvidenceGraph` to misuse; stored facts are frozen copies, so
mutating the caller's object after `append` reaches nothing and mutating a
query result throws; `supersede` marks the old fact with its replacement's id
and never touches its content. The tests exercise every observable route to
mutation and expect a dead end. **Cost if wrong:** a fact could be edited in
place, and the graph's central promise would be a comment rather than a
property.

**Scanners may claim exactly two of the six provenance classes.**
`statically-derived` for code analysis, `config-derived` for manifests and
convention. `authored` from a scanner would be a lie about a human;
`inferred` a guess dressed as a finding, the one thing the scanner rule
forbids; `runtime-observed` requires having run the system, which no static
adapter has; `source-backed` is the *resolution* of supplied evidence, not a
discovery. The refusal names the permitted pair, because a rejection that
does not say what is allowed is a dead end.

**The import extractor is a tokenizer, not a parser.** Row 6.9 forbids
runtime dependencies and a hand-rolled full parser would be a larger
liability than the honesty rule allows. The line is drawn exactly where the
rule draws it: a literal specifier is a fact, anything else is a Gap.
**Cost if wrong:** exotic syntax produces gaps instead of facts — under-
reporting, which the coverage report then states out loud. The failure mode
points the right way.

**Route receivers are a conservative list** (`app`, `router`, `server`,
`api`, `fastify`, `express`). A missed exotic receiver is invisible noise; a
false route is a lie about the system's surface.

**Coverage is a partition, and no percentage appears anywhere.** Analysed,
gapped and not-analysed sum to the universe, and the test fails on an
uncounted file. A gap outranks a clean pass by a different adapter, because
a partial analysis is not a complete one. The not-analysed files are
**named** — a summary ("37 files skipped") is where omissions go to hide.
"82% covered" silently claims its denominator is the whole system; a count
with a stated denominator carries the same information honestly.

**The inventory records examination, not yield.** A file scanned and found to
expose nothing is analysed, and the coverage denominator must be able to say
so. This was wrong in the first draft of the routes adapter and fixed before
commit.

---

## Implementation defects, caught by tests and CI

**The Fastify branch read values from the wrong string.** `method: 'PUT'` was
matched against the comment-and-string-stripped line, where string *bodies*
are blanked. Positions must come from the stripped line (so a commented-out
`method:` cannot match) and values from the original. Caught by the row 2.10
test, not by review.

**The lockfile knew one new package and not the other.** `npm ci` failed on
all 13 CI jobs with `EUSAGE`. Locally everything ran, because node resolves
workspace symlinks without consulting the lockfile — `npm ci` is the command
that checks. A new workspace package needs `npm install` committed with it.

**Row 6.3's long intermittent finally named its cause — twice.** The
instrumentation added on `main` two occurrences earlier did exactly its job:
the next failure reported `Runtime.evaluate: timed out after 15000ms`. Raising
that one call's timeout was not enough — the very next run failed with
`Target.getTargets` naming the same 15s. Two different calls tripping one
limit settles the diagnosis: a cold Chrome on a loaded runner can take more
than 15s to answer *anything*, and per-call fixes are whack-a-mole. The
transport default is now 60s for `send` and `waitFor`, with the per-call
override folded back in so there is one source of truth for the number.

A gate should prefer slow failure on a dead browser over false failure on a
healthy one. This closes an intermittent that had been open across three
occurrences and two phases.

---

## An accounting blind spot, found while scoping this phase

Four P1a deliveries were unmarked on the roadmap, and one of them — row 5.16,
the modularized viewer — had **never been registered in the conformance
matrix at all**. Its three proof tests were written in P1a, titled `(5.16)`,
and had passed ever since. The row simply did not exist, so a delivered
capability sat in PLANNED for a full phase.

`status:check` can only catch drift in rows that exist. A capability
delivered without its row is invisible to every gate downstream of the
matrix. Registered against the existing tests during this phase's scoping.

---

## Verification

- `npm run check` exit 0 **with and without** `MIROFY_CHROME`
- Conformance: **71 rows**, 70/70 proved with Chrome, 51/51 without, 0
  browser-deferred with Chrome, 0 title-check failures
- `docs/IMPLEMENTATION-STATUS.md`: 70 SHIPPED, 1 UNPROVEN, 48 PLANNED
- The single UNPROVEN row remains 6.10 (deterministic ZIP packaging),
  unchanged since P0 and still out of scope
- Rows registered this phase: **2.7, 2.8, 2.9, 2.10, 2.17**, plus 5.16 from
  the accounting fix above
- `npm run scan` against this repository: 919 facts, 9 gaps, 190 files, 0 not
  analysed, ~300 ms
- CI 13/13 on PR #10 (run 33310938667) and 13/13 on `main` at the merge
  commit `211fc05` (run 33311068463)
- No commit carries a `Co-Authored-By: Claude` trailer
