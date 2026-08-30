# `Mirofy`

> System intelligence for codebases. Point it at a repository and it builds a
> living, evidence-backed model of the system.

**Status: P0 Foundation.** The rendering and validation core is proved, by
`check:drift`, to still match a deliberately re-baselined manifest of
`packages/core/`. The evidence-first spine lands in P1.

## Quick start

```bash
npm install
npm run check      # lint, types, tests, golden parity, conformance, artifacts, size, audit
npm run build      # render every fixture into .artifacts/ (gitignored)
```

## What is proved today

The conformance matrix has 56 rows. 39 are proved without a browser;
16 more require headless Chrome (`MIROFY_CHROME`) and bring the total to 55.
One row (6.10, deterministic ZIP packaging) is UNPROVEN — its source was never
part of this import's scope, so there is nothing here to prove parity
against. See `packages/conformance/src/matrix.mjs` for the full per-row
accounting.

| Gate | Command |
|---|---|
| Renderer parity against the recorded golden digests | `npm run test:golden` |
| Imported capability conformance | `npm run test:conformance` |
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
test:golden → check:template → check:drift → test:conformance →
check:artifacts → check:size → check:audit`. A historical byte-identity gate
(`check:provenance`) used to run here too, verifying an immutable anchor
commit against its own byte-identity manifest: that all 163 imported files
were byte-identical to their source at that commit. It has since been
retired along with its manifest — since the identifier rename the code
carries this product's own names, so byte-identity with the source is
deliberately no longer true, and that historical claim is no longer asserted
anywhere in this repo.

The gate that remains, `check:drift`
(`scripts/check-core-drift.mjs`), makes the present-tense claim instead:
every file under `packages/core/` still matches `scripts/core-manifest.json`,
the last state someone deliberately re-baselined. `test:golden` renders only
five fixtures, so an edit on a path no fixture exercises moves no digest;
`check:drift` is what catches it. It is re-baselineable on purpose —
`packages/core/` is expected to change — with `node scripts/check-core-drift.mjs
--update`, which refuses to run in CI. Run
`MIROFY_CHROME=/path/to/chrome npm run check` to also exercise the 16
browser-only rows.

## Viewer source

`packages/core/assets/template.html` is **generated**, not hand-authored — it
is built from the JS modules, CSS parts, and generated design tokens under
`packages/viewer/`. Never edit `template.html` directly; edit its source
under `packages/viewer/src/` and run `npm run build:template` to regenerate
it. `npm run check:template` is the check that enforces this: it rebuilds
the template from source and fails if the committed file has drifted from
what that source now produces.

## Layout

- `packages/core/` — the rendering and validation core. Imported unmodified
  and now carrying the product's own identifiers; `packages/core/LICENSE`
  carries the required third-party copyright notice for the imported code.
- `packages/conformance/` — the parity matrix and its test suites, proving
  each imported row still works after the move.
- `fixtures/` — golden, source, and negative fixtures used by the golden and
  conformance harnesses.
- `scripts/` — the gate scripts wired into `npm run check`.

## Attribution

`packages/core/LICENSE` retains, verbatim, the required third-party copyright
notice for the imported code under `packages/core/`. See also the root
`LICENSE`.
