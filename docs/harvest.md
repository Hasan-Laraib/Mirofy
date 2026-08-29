# The harvest boundary

`packages/core/` is imported from `tt-a1i/archify@12106be`, MIT licensed. The
ancestor's `archify/` subtree at that revision was compared file-by-file
against `packages/core/` here — by git blob hash, not a working-tree diff, so
the comparison isn't polluted by local line-ending checkout settings — and
this document reports exactly what differs.

## Why `packages/core/`

The harvested code resolves its own root with
`path.resolve(rendererDir, '../..')`. Placing it at `packages/core/` makes
that resolve to `packages/core/`, so every internal path works with **zero
edits**. Any other location requires patching the harvested source, which
would break parity proofs.

## What was changed on import

Of 166 files in the ancestor's `archify/` subtree (excluding `node_modules/`,
which is untracked in both repositories):

1. **`test/golden.mjs` — removed.** It asserts the ancestor's repository
   structure (README version badges, `docs/index.html` labels, triplicated
   `examples/`), not renderer correctness. Replaced by `scripts/golden.mjs`.
2. **`package-lock.json` — removed.** The workspace root owns the lockfile.
3. **`README.md` — added.** New file, not present in the ancestor's
   `archify/` subtree. States the harvest rules for this directory (see
   `packages/core/README.md`).
4. **`package.json` — content differs.** Verified diff, not just "scripts
   rewritten": `name` (`archify` → `@product/core`), `version`
   (`2.16.0-dev.0` → `2.16.0`), `description`, and `bin` (`archify` →
   `product`) were all changed to fit the workspace's placeholder naming
   convention, in addition to `scripts` being rewritten because the ancestor's
   entries invoke repo-root build scripts (`../scripts/*`, `docs/` output)
   that don't exist in this workspace. `devDependencies` is unchanged.

**Every other file — all 164 remaining tracked files in `packages/core/`,
including every renderer, schema, template, test, and script — is byte-for-byte
identical to the ancestor at `12106be` (matching git blob hash).** Not a
single renderer, schema, or template byte was touched.

## How parity is proved

`scripts/golden.mjs` renders all five v1-baseline fixtures, canonicalises line
endings, and compares SHA-256 digests against `fixtures/golden/manifest.json`
— the digests the ancestor produces at `12106be`. `npm run test:conformance`
(`scripts/conformance.mjs`) additionally proves the 55-row harvested
capability matrix (`packages/conformance/src/matrix.mjs`) still holds after
the move: 54 of 55 rows are provable (40 without a browser, 14 more with
`PRODUCT_CHROME`); row 6.10 (deterministic ZIP packaging) is UNPROVEN because
its source — `scripts/build-zip.sh`, `scripts/package-smoke.mjs`,
`.github/workflows/release.yml` in the ancestor — was never part of this
harvest's scope, so there is nothing in this repository to prove parity
against.

## Known debt: inherited generated HTML in `examples/`

`packages/core/examples/` contains 5 generated HTML files, harvested
unmodified along with everything else:

| File | Size |
|---|---|
| `dataflow-product-analytics.html` | ~704 KB |
| `workflow-agent-tool-call-rendered.html` | ~704 KB |
| `sequence-cache-miss-request.html` | ~700 KB |
| `web-app-rendered.html` | ~698 KB |
| `lifecycle-agent-run.html` | ~697 KB |

That's **~3.4 MB total, roughly 53% of the ~6.4 MB tracked tree** — committed,
generated build output. Nothing in `packages/core/` or the workspace
references them; they are exactly the anti-pattern the no-committed-artifacts
rule (`check:size`, `.gitignore`'s `.artifacts/`) exists to prevent.

They were **deliberately not deleted in P0**, because they sit inside the
subtree that `scripts/golden.mjs` and the blob-hash comparison above prove
byte-identical to the ancestor at `12106be`. Deleting them would mean
`packages/core/` is no longer a faithful, provably-unmodified import — a
bigger cost than the size they carry today (the tracked tree is well under
its 10 MB budget even with them included).

**This is explicit P1 debt.** Remove `packages/core/examples/` (or replace it
with something generated on demand, not committed) during the P1 viewer
refactor, once `packages/core/` is no longer required to match the ancestor
byte-for-byte.
