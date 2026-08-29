# @product/core — harvested

Imported **unmodified** from [tt-a1i/archify](https://github.com/tt-a1i/archify)
at revision `12106be`, MIT licensed. See `/NOTICE`.

## Rules for this directory

- **Do not refactor here during P0.** Parity is proved first (golden + conformance),
  refactoring happens in P1 against those proofs.
- **Do not rename `ARCHIFY_*` environment variables.** The product name is parked;
  renaming is a P1 task.
- The only P0 modification is `package.json` scripts, which referenced the
  ancestor's repo-root build scripts.
