# `Mirofy`

> System intelligence for codebases. Point it at a repository and it builds a
> living, evidence-backed model of the system.

**Status: P0 Foundation.** The rendering and validation core is harvested from
an MIT-licensed ancestor project — named, with its revision, in `NOTICE` — and
was proved byte-identical to it at the provenance anchor recorded in
`docs/harvest.md`. The evidence-first spine lands in P1.

## Quick start

```bash
npm install
npm run check      # lint, types, tests, golden parity, conformance, artifacts, size, audit
npm run build      # render every fixture into .artifacts/ (gitignored)
```

## What is proved today

The harvested conformance matrix has 56 rows. 39 are proved without a browser;
16 more require headless Chrome (`MIROFY_CHROME`) and bring the total to 55.
One row (6.10, deterministic ZIP packaging) is UNPROVEN — its source was never
part of this harvest's scope, so there is nothing here to prove parity
against. See `docs/harvest.md` for the full accounting.

| Gate | Command |
|---|---|
| Renderer parity with the ancestor | `npm run test:golden` |
| Harvested capability conformance | `npm run test:conformance` |
| `npm run build`'s own output reproduces the same golden digests | `npm run check:artifacts` |
| Tracked-tree size budget (10 MB) | `npm run check:size` |
| Dependency audit | `npm run check:audit` |

`test:golden` and `check:artifacts` both compare the same five renders
against the same `fixtures/golden/manifest.json` digests — they are not
independent coverage of two different things. What `check:artifacts` adds is
narrower: it runs the build through the actual `npm run build` code path
(writing real files into `.artifacts/`, gitignored) and checks that *that*
output path is still reproducible, rather than re-proving renderer parity a
second time.

`npm run check` runs the full gate chain in order: `lint → typecheck → test →
test:golden → check:provenance → test:conformance → check:artifacts →
check:size → check:audit`. `check:provenance`
(`scripts/check-provenance.mjs`) proves the founding claim in CI. It no longer
compares the working tree — since the identifier rename the code carries this
product's own names, so byte-identity with the ancestor is deliberately no
longer true. Instead it verifies the *historical* claim against an immutable
anchor commit recorded in `scripts/harvest-manifest.json`: that all 163 files
were byte-identical to the ancestor at that commit. Run
`MIROFY_CHROME=/path/to/chrome npm run check` to also exercise the 16
browser-only rows.

## Layout

- `packages/core/` — the harvested rendering and validation core. Imported
  unmodified and now carrying the product's own identifiers; see
  `docs/harvest.md` for what changed on import, and for the provenance anchor
  up to which it was byte-identical to the ancestor.
- `packages/conformance/` — the parity matrix and its test suites, proving
  each harvested row still works after the move.
- `fixtures/` — golden, source, and negative fixtures used by the golden and
  conformance harnesses.
- `scripts/` — the gate scripts wired into `npm run check`.

## Attribution

Substantial portions derive from an MIT-licensed ancestor project, named in
`NOTICE`. See `NOTICE` and `LICENSE`.
