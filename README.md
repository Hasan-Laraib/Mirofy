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

The harvested conformance matrix has 55 rows. 40 are proved without a browser;
14 more require headless Chrome (`PRODUCT_CHROME`) and bring the total to 54.
One row (6.10, deterministic ZIP packaging) is UNPROVEN — its source was never
part of this harvest's scope, so there is nothing here to prove parity
against. See `docs/harvest.md` for the full accounting.

| Gate | Command |
|---|---|
| Renderer parity with the ancestor | `npm run test:golden` |
| Harvested capability conformance | `npm run test:conformance` |
| Deterministic rebuild | `npm run check:artifacts` |
| Tracked-tree size budget (10 MB) | `npm run check:size` |
| Dependency audit | `npm run check:audit` |

`npm run check` runs the full gate chain in order: `lint → typecheck → test →
test:golden → test:conformance → check:artifacts → check:size → check:audit`.
Run `PRODUCT_CHROME=/path/to/chrome npm run check` to also exercise the 14
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
