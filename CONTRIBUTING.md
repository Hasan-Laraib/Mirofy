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
3. **Every check green before merge.** `npm run check` locally. The CI
   workflow (`.github/workflows/ci.yml`) defines this same gate and its
   steps pass locally, but as of P0 the workflow has not yet executed on a
   runner — until it has, a clean local `npm run check` is the actual bar,
   not "CI is the gate". Run it once more with `MIROFY_CHROME` set to a
   Chrome executable so the 16 browser-only conformance rows are exercised
   too — CI's `browser` job is intended to do this on every push and pull
   request once it runs for real.
4. **A skipped test is skipped.** Never reported as passing, in a PR or a
   receipt. A browser row deferred for lack of `MIROFY_CHROME` is reported
   by id, not folded into the proved count. A row with no real proof is
   `proof: null` with a `note` explaining why — never silently marked
   covered.
5. **`packages/core/` is harvested code.** Do not refactor it during P0.
   Import unmodified, prove parity, refactor in P1 — never both at once.
6. **`MIROFY_*` is the environment-variable namespace.** The ancestor's
   prefix was retired in P1; do not reintroduce it.

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
npm run check:provenance  # the harvest claim, verified at the recorded anchor
npm run check:drift       # packages/core/ matches its reviewed manifest
npm run test:conformance  # the 56-row parity matrix
npm run check:artifacts   # npm run build's own output reproduces the golden digests
npm run check:size        # 10 MB tracked-tree budget
npm run check:audit       # npm audit --audit-level=high
npm run check             # all of the above, in order
```

## Scope and constraints

- Node `>=18`, pure ESM throughout.
- Zero runtime dependencies (`dependencies` absent from every workspace
  `package.json` — this is itself a proved conformance row, 6.9).
- The product name is `Mirofy`, scope `@mirofy/*` (P0.8, decided). The
  ancestor's name survives only in `LICENSE`, `NOTICE`, `packages/core/LICENSE`,
  `docs/harvest.md` and `docs/P0-BUILD-LEDGER.md`, where it is attribution or
  historical record rather than product identity — do not rename it there.
- Nothing under `packages/core/` is modified as part of ordinary feature
  work. If a fix there is genuinely required, it needs its own explicit,
  reviewed exception — not a drive-by edit alongside unrelated work.
