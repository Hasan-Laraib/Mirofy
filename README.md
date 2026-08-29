# `<PRODUCT>`

> System intelligence for codebases. Point it at a repository and it builds a
> living, evidence-backed model of the system.

**Status: P0 Foundation.** The rendering and validation core is harvested from
[Archify](https://github.com/tt-a1i/archify) (MIT, `12106be`) and proved
byte-identical. The evidence-first spine lands in P1.

## Quick start

```bash
npm install
npm run check      # lint, types, tests, golden parity, conformance, artifacts, size, audit
npm run build      # render every fixture into .artifacts/ (gitignored)
```

## What is proved today

The harvested conformance matrix has 55 rows. 38 are proved without a browser;
16 more require headless Chrome (`PRODUCT_CHROME`) and bring the total to 54.
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
test:golden → check:harvest → test:conformance → check:artifacts → check:size
→ check:audit`. `check:harvest` (`scripts/check-harvest-identity.mjs`) proves
the founding claim in CI: it compares every file under `packages/core/`
against a committed manifest of the ancestor's blob hashes, offline, so a
drive-by change to `packages/core/` that doesn't happen to move a golden
digest can no longer land unnoticed. Run
`PRODUCT_CHROME=/path/to/chrome npm run check` to also exercise the 16
browser-only rows.

## Layout

- `packages/core/` — the harvested rendering and validation core. Imported
  unmodified; see `docs/harvest.md` for exactly what changed on import and
  why. Do not modify it during P0 — see `CONTRIBUTING.md`.
- `packages/conformance/` — the parity matrix and its test suites, proving
  each harvested row still works after the move.
- `fixtures/` — golden, source, and negative fixtures used by the golden and
  conformance harnesses.
- `scripts/` — the gate scripts wired into `npm run check`.

## Attribution

Substantial portions derive from Archify under MIT. See `NOTICE`.
