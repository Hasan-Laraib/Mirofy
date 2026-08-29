# Contributing

## Non-negotiables

1. **Every feature has a test.** Every row in the parity matrix — harvested,
   rebuilt, or new — carries at least one automated test before it is
   delivered. A test file covering many rows must let each row fail on its
   own: `scripts/conformance.mjs` verifies a named `testTitle` per row inside
   a shared suite, not just that the suite's process exited 0. See
   `packages/conformance/src/matrix.mjs`'s header comment for why that
   distinction matters and the incident that established it.
2. **Small conventional commits.** `<type>(<scope>): <subject>`, one behaviour
   per commit, `Refs: <row>` where a matrix row applies. A task is many
   commits.
3. **Every check green before merge.** `npm run check` locally; CI is the
   gate. Run it once more with `PRODUCT_CHROME` set to a Chrome executable so
   the 14 browser-only conformance rows are exercised too — CI's `browser`
   job does this on every push and pull request.
4. **A skipped test is skipped.** Never reported as passing, in a PR or a
   receipt. A browser row deferred for lack of `PRODUCT_CHROME` is reported
   by id, not folded into the proved count. A row with no real proof is
   `proof: null` with a `note` explaining why — never silently marked
   covered.
5. **`packages/core/` is harvested code.** Do not refactor it during P0.
   Import unmodified, prove parity, refactor in P1 — never both at once.
6. **Do not rename `ARCHIFY_*` environment variables.** The product name is
   parked; renaming is a P1 task.

## Test types

- New behaviour → TDD: failing test, then implementation.
- Harvested code → characterisation test first, locking current behaviour.
- Rebuilt behaviour → characterisation, then new test, then a migration test.

## Running the gates

```bash
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm run test              # node:test suites outside the conformance matrix
npm run test:golden       # digest parity against the ancestor's renders
npm run test:conformance  # the 55-row parity matrix
npm run check:artifacts   # deterministic rebuild, --check mode
npm run check:size        # 10 MB tracked-tree budget
npm run check:audit       # npm audit --audit-level=high
npm run check             # all of the above, in order
```

## Scope and constraints

- Node `>=18`, pure ESM throughout.
- Zero runtime dependencies (`dependencies` absent from every workspace
  `package.json` — this is itself a proved conformance row, 6.9).
- The product name is a placeholder (`<PRODUCT>`, scope `@product/*`) pending
  an owner decision (P0.8, parked). Do not invent or substitute a name.
- Nothing under `packages/core/` is modified as part of ordinary feature
  work. If a fix there is genuinely required, it needs its own explicit,
  reviewed exception — not a drive-by edit alongside unrelated work.
