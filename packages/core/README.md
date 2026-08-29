# @mirofy/core — harvested

Harvested from an MIT-licensed ancestor project, named with its revision in
`/NOTICE`, and proved byte-identical to it up to the provenance anchor recorded
in `/docs/harvest.md`. From the commit after that anchor the code carries
Mirofy's own identifiers while remaining MIT-derived from that ancestor; the
upstream copyright notice is retained verbatim in `LICENSE` beside this file.

## Rules for this directory

- **Do not refactor here during P0.** Parity is proved first (golden +
  conformance), refactoring happens in P1 against those proofs.
- `MIROFY_*` is the environment-variable namespace. The ancestor's prefix was
  retired in P1; do not reintroduce it.
- Beyond the P1 identifier rename, the only P0 modification is `package.json`
  scripts, which referenced the ancestor's repo-root build scripts.
