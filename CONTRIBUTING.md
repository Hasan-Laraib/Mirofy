# Contributing

## Non-negotiables

1. **Every feature has a test.** Every row in the parity matrix — imported,
   rebuilt, or new — carries at least one automated test before it is
   delivered. A test file covering many rows must let each row fail on its
   own: `scripts/conformance.mjs` verifies a named `testTitle` per row inside
   a shared suite, not just that the suite's process exited 0. See
   `packages/conformance/src/matrix.mjs`'s header comment for why that
   distinction matters and the incident that established it.
2. **Small conventional commits.** `<type>(<scope>): <subject>`, one behaviour
   per commit, `Refs: <row>` where a matrix row applies. A task is many
   commits.
3. **Every check green before merge.** `npm run check` locally, and CI runs
   the same chain on every push across three platforms and four Node
   versions. Run it once more with `MIROFY_CHROME` set to a Chrome
   executable so the browser-only conformance rows are exercised too; CI's
   `browser` job does this on every push and pull request.

   `npm run check` passing locally is necessary and not sufficient — it can
   pass on a machine where the project would not install at all, which is
   why `check:lockfile` exists. If CI disagrees with your laptop, CI is
   describing a clean clone and your laptop is not.
4. **A skipped test is skipped.** Never reported as passing, in a PR or a
   receipt. A browser row deferred for lack of `MIROFY_CHROME` is reported
   by id, not folded into the proved count. A row with no real proof is
   `proof: null` with a `note` explaining why — never silently marked
   covered.
5. **`packages/core/` changes are reviewed as changes.** It began as
   imported code and is now edited like the rest of the repository, but
   `scripts/check-core-drift.mjs` keys every file there by digest: a change
   fails the gate until the manifest is re-baselined in the same commit.
   The gate does not say a change is wrong — it says nobody has said it is
   right yet.
6. **`MIROFY_*` is the environment-variable namespace.** Do not reintroduce
   any earlier prefix.
7. **`packages/core/assets/template.html` is generated, never hand-edited.**
   It is built from `packages/viewer/`; `npm run check:template` enforces
   this by rebuilding from source and failing on drift. Edit design-token
   values in `packages/viewer/src/tokens/tokens.mjs`, never in palette CSS —
   the palette itself is generated from the token model. Run
   `npm run build:template` after any change under `packages/viewer/` so the
   committed template stays in sync with its source.
8. **`packages/conformance/src/matrix.mjs` is the record of what is built.**
   Every capability has a row naming the test that proves it, and the row's
   `testTitle` must match that test character-for-character. A capability
   without a row is invisible to the gates, so add the row in the same change
   as the code.

## Test types

- New behaviour → TDD: failing test, then implementation.
- Imported code → characterisation test first, locking current behaviour.
- Rebuilt behaviour → characterisation, then new test, then a migration test.

## Running the gates

```bash
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm run test              # node:test suites outside the conformance matrix
npm run test:golden       # digest parity against the recorded golden renders
npm run check:drift       # packages/core/ matches its reviewed manifest
npm run test:conformance  # the 56-row parity matrix
npm run check:artifacts   # npm run build's own output reproduces the golden digests
npm run check:size        # 10 MB tracked-tree budget
npm run check:audit       # npm audit --audit-level=high
npm run check:readme      # every number in README.md, derived rather than trusted
npm run check:changelog   # CHANGELOG.md covers the newest code change
npm run check:lockfile    # package-lock.json agrees with the manifests
npm run check             # all of the above, in order
```

## Scope and constraints

- Node `>=18`, pure ESM throughout.
- Zero runtime dependencies (`dependencies` absent from every workspace
  `package.json` — this is itself a proved conformance row, 6.9).
- The product is `mirofy` on npm and `Mirofy` in prose. The originating
  project's name survives only in `packages/core/LICENSE`, its required
  third-party copyright notice — do not rename it there.
- Every number in `README.md` is derived by `scripts/check-readme-claims.mjs`,
  and `CHANGELOG.md` fails the gate when code changes without an entry. If you
  state a figure in either, expect to be asked where it came from — by a
  script, on every run.
