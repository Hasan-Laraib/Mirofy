# @mirofy/core

Rendering and validation core: five diagram renderers, their schemas, the
interactive viewer, and the CLI. `packages/core/LICENSE` carries this
package's required copyright notice; do not edit it.

## Rules for this directory

- **Do not refactor here during P0.** Parity is proved first (golden +
  conformance), refactoring happens in P1 against those proofs.
- `MIROFY_*` is the environment-variable namespace; do not reintroduce any
  earlier prefix.
- Beyond the P1 identifier rename, the only P0 modification is `package.json`
  scripts, which referenced the original project's repo-root build scripts.
