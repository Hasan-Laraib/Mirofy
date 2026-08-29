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
   rewritten": `name` (`archify` → `@mirofy/core`), `version`
   (`2.16.0-dev.0` → `2.16.0`), `description`, and `bin` (`archify` →
   `product`) were all changed to fit the workspace's placeholder naming
   convention, in addition to `scripts` being rewritten because the ancestor's
   entries invoke repo-root build scripts (`../scripts/*`, `docs/` output)
   that don't exist in this workspace. `devDependencies` is unchanged.

**Every other file — all 163 remaining tracked files in `packages/core/`,
including every renderer, schema, template, test, and script — is byte-for-byte
identical to the ancestor at `12106be` (matching git blob hash).** Not a
single renderer, schema, or template byte was touched. (163, not 164: of the
164 ancestor files carried over unremoved, only 163 — everything except
`package.json` — are identical; `package.json` is the one whose content was
deliberately changed, above. `packages/core/` holds 165 tracked files in
total once the added `README.md`, which has no ancestor counterpart to be
"identical" to, is counted back in: 163 identical + 1 changed + 1 added.)

This is enforced in CI, not just asserted here: `npm run check:provenance`
(`scripts/check-provenance.mjs`) recomputes the git blob hash of every one of
these 163 files and compares it against the manifest of ancestor hashes plus
the four deviations above, committed at `scripts/harvest-manifest.json`. It
runs offline and fails if the recorded history stops supporting the claim.

### The provenance anchor

The check reads its bytes from a pinned commit rather than from the working
tree, because the working tree no longer holds them.

`packages/core/` was byte-identical to the ancestor, as described above, up to
and including commit `54a130780cb41d6096b337f23f2c7cb933cbcf0d` — recorded as
`provenanceAnchor` in `scripts/harvest-manifest.json`. From the very next
commit the code carries this product's own identifiers: the ancestor's
namespace, CSS prefixes, custom properties, environment variables and CLI
binary name were all replaced with `Mirofy`/`mirofy`/`MIROFY_` equivalents.
That change was proved identifier-only — a fixture rendered on either side of
it is byte-identical once the identifiers are substituted back — but it does
move every one of the 163 blob hashes, so present-tense byte-identity is
deliberately no longer true and is no longer what the check asserts.

The code remains MIT-derived from the ancestor named at the top of this
document, and the attribution required by that licence is retained verbatim in
`/LICENSE`, `/NOTICE` and `packages/core/LICENSE`. The anchor makes the
historical claim permanently checkable by hand:

```bash
git show 54a1307:packages/core/renderers/shared/utils.mjs | git hash-object --stdin
```

## How parity is proved

`scripts/golden.mjs` renders all five v1-baseline fixtures, canonicalises line
endings, and compares SHA-256 digests against `fixtures/golden/manifest.json`
— the digests the ancestor produces at `12106be`. `npm run test:conformance`
(`scripts/conformance.mjs`) additionally proves the 56-row harvested
capability matrix (`packages/conformance/src/matrix.mjs`) still holds after
the move: 55 of 56 rows are provable (39 without a browser, 16 more with
`MIROFY_CHROME`); row 6.10 (deterministic ZIP packaging) is UNPROVEN because
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

## Known debt: inherited, uninvoked `test/` directory

`packages/core/test/` carries 92 files (~933 KB: 82 `*.test.mjs` suites plus
8 JSON fixtures they load), harvested unmodified along with everything else.
None of it is excluded from `check:provenance`'s or `test:golden`'s scope, but
none of it is *run* by anything in this workspace either — `npm run test`
(`scripts/run-tests.mjs`) only discovers suites under
`packages/conformance/test/`, and nothing in `package.json` or
`packages/core/package.json` invokes `node --test packages/core/test`. It is
excluded from every gate and every run by nothing: not by design, just by
absence of wiring.

This mirrors the `examples/` debt above in cause (kept for byte-identity, not
because it is used) and is disclosed here for the same reason: `packages/core/`
carries real weight — 3.4 MB of generated HTML plus 933 KB of unrun tests,
together over half the tracked tree — that this harvest did not need and does
not exercise. **This is also explicit P1 debt.** Either wire
`packages/core/test/` into a real gate (proving the ancestor's own test
suite still passes post-harvest, which today's conformance matrix does not
claim to do) or remove it during the P1 refactor, once `packages/core/` is no
longer required to match the ancestor byte-for-byte.
