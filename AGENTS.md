# AGENTS.md

Instructions for coding agents working **in** this repository.

If you are an agent trying to *use* Mirofy on somebody else's code, you want
[`packages/core/SKILL.md`](packages/core/SKILL.md) instead — that is the skill
description, and it drives the same CLI a human would run.

---

## What this project is

Mirofy points at a repository, reads it into an **evidence graph**, builds a
**model**, and compiles that into **one self-contained HTML file**.

The whole product rests on one promise: **every relationship it draws can name
the file, the line range and the commit it came from, and anything it could not
read is listed by name rather than quietly dropped.**

Almost every rule below exists to keep that promise true. When a change would
make the tool look better by making that claim weaker, the claim wins.

## The rules that are not negotiable

1. **Never guess.** A construct an adapter cannot analyse is a **Gap** — a
   recorded fact that analysis stopped at a named file and line. It is never an
   omission, and never a plausible edge. `packages/evidence/src/fact.mjs`
   enforces this: a scanner may claim `statically-derived` or `config-derived`
   and nothing else.

2. **Zero runtime dependencies, in every package.** `check:readme` asserts it.
   If you need something a dependency would give you, write the forty lines.

3. **No fabricated numbers.** Counts carry their denominator; there are no
   percentages in the coverage report. A number nobody checks is a number that
   is true until it isn't.

4. **A gate that cannot fail is worse than no gate.** It reads like proof. If
   you find a check that passes unconditionally, that is a bug.

5. **`packages/core/assets/template.html` is generated, never hand-edited.** It
   is built from `packages/viewer/`. Run `npm run build:template` after any
   change under `packages/viewer/`, and `npm run check:template` enforces it.

6. **Never re-baseline a manifest to make a check pass.** `npm run test:golden`
   and `npm run check:drift` both take `--update`, and both refuse to run it in
   CI. A re-baseline is a deliberate, reviewable act with a reason in the diff —
   not a way around a red gate.

7. **Never skip a test to make a suite green.** A test may be skipped only for a
   platform fact that makes it genuinely unrunnable, and the skip must state
   that fact at the test.

## Running the gates

```bash
npm run check     # everything below, in order. This is what CI runs.
```

Individually, when you want a fast loop:

```bash
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm run test              # node:test suites outside the conformance matrix
npm run test:golden       # digest parity against the recorded golden renders
npm run check:template    # the built template matches packages/viewer/
npm run check:drift       # packages/core/ matches its reviewed manifest
npm run test:conformance  # the conformance matrix
npm run check:artifacts   # npm run build reproduces the golden digests
npm run check:size        # tracked-tree budget
npm run check:audit       # dependency advisories
npm run check:readme      # every number in README.md, derived rather than trusted
npm run check:changelog   # CHANGELOG.md covers the newest code change
npm run check:lockfile    # the lockfile agrees with the manifests
```

Two of these surprise people:

- **`check:readme`** re-derives every number in `README.md` by actually running
  a scan. Adding a package moves those numbers, and the gate will tell you so.
  Fix the README or fix the repository — do not delete the claim.
- **`check:audit`** asks a live advisory endpoint, so a commit that was green
  can go red without any code changing. "It passed when I ran it" is not a
  durable claim about this one.

## Running it

```bash
npm run scan      # repository -> scan/evidence-graph.json
npm run model     # evidence graph -> scan/model.json
npm run compile   # model -> scan/view.json
node packages/core/bin/mirofy.mjs map .   # the whole pipeline in one command
```

## Layout

| package | does |
|---|---|
| `scanner` | adapters that read a repository into facts and gaps |
| `evidence` | append-only evidence graph, query, honest coverage |
| `model` | the system model: stable ids, evidence refs, human overrides |
| `compile` | view compiler and the planner seam |
| `explain` | graph queries, architecture rules, drift, timeline |
| `mcp` | the model as agent context |
| `import` | Mermaid into typed documents |
| `export` | draw.io and Excalidraw escape hatches |
| `layout` | constraint layout: intent to coordinates (dev-time) |
| `core` | renderers, schemas, validators, CLI |
| `viewer` | the interactive viewer, built into one template |
| `benchmark` | first-pass usable rate, over a saved corpus |
| `conformance` | the matrix, and the tests every row names |

Tests live in `packages/<name>/test/*.test.mjs` and are discovered
automatically by `scripts/run-tests.mjs`. Pass explicit file paths to
`node --test` — directory mode does not work on the Node versions in the CI
matrix, and the runner says why.

## Conventions

- **ESM only** (`"type": "module"`), Node 20+.
- **Conventional commits**, lowercase, scoped: `fix(viewer): …`,
  `feat(scanner): …`, `docs: …`.
- **Comments explain the decision, not the mechanism.** This codebase is
  unusually heavily commented on purpose: most comments record *why* a thing is
  the way it is, often naming the bug that made it necessary. Match that. A
  comment restating the line below it is noise; a comment naming the failure
  that line prevents is the point.
- **`CHANGELOG.md` records decisions, not diffs.** `git log` already has the
  diff. An entry that only says what changed is a second copy of something
  nobody was struggling to find.

## Before you open a PR

`npm run check` green locally, and a `CHANGELOG.md` entry if anything under
`packages/`, `scripts/`, `.github/`, `fixtures/` or `benchmarks/` changed. If
the change genuinely does not deserve an entry, say so in the entry — "no
behaviour change" is a fact a reader wants, and an absent line is not.
