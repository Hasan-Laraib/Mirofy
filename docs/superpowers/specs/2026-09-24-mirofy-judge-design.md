# @mirofy/judge — filling the reserved `inferred` slot

**Date:** 2026-09-24
**Status:** approved

## Why this exists

Mirofy's specification reserves the provenance class `inferred` in two places
and fills it in neither.

1. `packages/core/renderers/shared/evidence-provenance.mjs` publishes six
   provenance classes. `inferred` is the sixth. It is in `common.schema.json`'s
   enum, it is accepted on every connection, and the viewer already paints it:

   ```css
   [data-provenance="inferred"] { stroke-dasharray: 3 5; opacity: 0.55; }
   ```

   No production code path emits it.

2. `packages/evidence/src/coverage.mjs` opens by quoting the specification's
   contract for the coverage report: "What was derived, inferred, and not
   analysed. Never a fabricated percentage." The implementation has three
   buckets — `analysed`, `gapped`, `notAnalysed`. There is no `inferred` bucket.

The slot is empty for a principled reason. `packages/evidence/src/fact.mjs`
restricts a scanner to two provenance classes and says why:

> `inferred` would be a guess dressed as a finding, which is the one thing the
> scanner rule forbids.

That rule is correct and this package does not weaken it. The scanner still
never guesses. `@mirofy/judge` is a separate, opt-in component permitted to
guess **because it attaches a probability and a receipt to every guess**. The
scanner stays honest by never guessing; the judge stays honest by never
concealing that it did.

## What it judges

Not arbitrary pairs. Only what the scanner explicitly recorded that it could
not see.

`packages/scanner/src/adapters/imports.mjs` and its siblings emit gaps like:

```
computed import specifier at line 169; the target cannot be known statically
import of "./thing" at line 135 resolves to no file
relative import at line 282 climbs above the repository root
import at line 258 names X, and package ...
```

A computed import is the exemplary case. The scanner read `import(someVar)`,
could not resolve it, and said so. The target is unknowable *statically* — but
it is often obvious to a reader. That is the judgment this package asks for, and
it is one a System One model can make and a parser cannot.

A gap whose reason is `unreadable: ...` is never a candidate: there is nothing
to judge.

## Architecture

Five units, one direction of flow, no cycles.

```
scan/model.json ----------+
scan/evidence-graph.json -+  (gaps)
                          |
                          v
              src/gaps.mjs         pure. gap reasons -> unresolved-import records
                          v
              src/questions.mjs    pure. records + model -> candidates -> noul questions
                          v
              src/client.mjs       fetch, one dialect, typed errors. knows nothing of Mirofy
                          v
              src/judge.mjs        orchestration. the client is INJECTED
                          v
              src/annotate.mjs     pure. judgments + model -> annotated model
                          v
              bin/judge.mjs        CLI
```

`judge.mjs` receives its client as a parameter. Tests inject a fixture client;
the suite never opens a socket.

## Decisions, and what forced each

| # | Decision | Forced by |
|---|----------|-----------|
| D1 | Use the `noul` primitive only. Never `choice` or `score`. Never print the word "confidence". | `confidence` is documented only as a probability-*spread* statistic, closed form `(3 x p_max - 1) / 2`. Vercel's AI SDK docs warn it "is not the selected option's probability or a portable confidence measure". `noul` returns a genuine probability and carries no `confidence` field at all. |
| D2 | Pin `jev-1.13.0`. Never send `jev-latest`. | TypeSafe's models page advises pinning a version ID rather than the alias. |
| D3 | One question per HTTP call. | Partial-failure semantics for batched questions are undocumented. One-per-call makes the question moot. |
| D4 | State per question is minimal: the cited line, a little surrounding context, and the two names. Never the whole repository. | TypeSafe publishes a per-version "jaggedness" page; `jev-1.13`'s known defects include "large state full of irrelevant detail" and "indirection". |
| D5 | Zero dependencies. Hand-rolled `fetch`, not `@typesafe-ai/sdk`. | `scripts/check-readme-claims.mjs` asserts no package here declares a runtime dependency. |
| D6 | Target exactly one wire dialect — direct TypeSafe `POST /v1/systemone` — and name it in the source. | At least three incompatible dialects exist for the same model. Vercel's native path renames `noul` to `boolean`, the answer field `noul` to `probability`, and `input_tokens` to `inputTokens`. |
| D7 | Every judgment records the resolved model version, `request_id`, the verbatim question, a SHA-256 of the state, and a timestamp. | There is no seed and no temperature; run-to-run determinism is undocumented. A number that cannot be reproduced must at least be attributable. |
| D8 | The probability rides in the relationship's existing `labels[0]`, alongside `provenance: "inferred"`. | Every schema object sets `additionalProperties: false`, so a new `confidence` field would mean editing `packages/core/schemas/`, tripping `check:drift`. `compile.mjs` already passes `labels[0]` to `connection.label` and `provenance` to `connection.provenance` verbatim, so the existing pipeline renders it with no change. |
| D9 | Candidates come only from unresolved-import gaps, crossed with components actually named in the gapped file. | The judge never invents a pair. The Gap already pointed at a file and a line. |
| D10 | Refuse to run without `TYPESAFE_API_KEY`. No silent fallback, no cached guess. | A gate that reports success when it did not run is worse than no gate. |

## Output vocabulary

An accepted hypothesis renders as a faded dashed edge labelled:

```
may import · p 0.62
```

No new vocabulary is invented. `p` is a probability, which is what `noul`
returns. The word "confidence" appears nowhere, because nothing Jev returns
supports it.

## Limits

`--limit` defaults to 25 candidates per run. `--min` defaults to 0.5;
judgments below it are recorded but not drawn. `judgments.json` always records
how many candidates existed and how many were judged, so a truncated run says
so rather than implying it saw everything.

## Blast radius

Untouched: `scanner`, `model`, `compile`, `layout`, `viewer`, every renderer,
every schema, every fixture, all of `packages/core/`.

Golden digests are unaffected: no fixture renders a judgment, and by D3/D7 a Jev
number is not reproducible, so none may ever enter a digest.

Two edits are forced by existing gates, and only two:

- `README.md` must list `judge` in the package table — `check:readme`
  enumerates `packages/*` and requires each name to appear in backticks.
- `package-lock.json` must be regenerated — `check:lockfile` fails every CI job
  on a workspace missing from the lock.

## Testing

Tests live in `packages/judge/test/` and are discovered automatically by
`scripts/run-tests.mjs`.

- gap-reason classification, including the reasons that must NOT match
- candidate construction from gaps and components, including the empty case
- wire encoding and response decoding against the documented shape
- error mapping: 401, 422, 429, 529
- `annotate` purity — the input model is not mutated
- threshold behaviour at, above and below `--min`
- refusal when `TYPESAFE_API_KEY` is absent
- a full offline end-to-end through the fixture client

**Honesty note on the fixtures.** They are hand-written to the *documented* wire
shape. No live authenticated request was executed while researching this design.
They prove the adapter matches the published contract; they cannot prove the
published contract matches the server. The fixture file says so in its header.
