# mirofy-cli

**Diagrams of your system that cite their sources — and say what they could not see.**

```bash
npx mirofy-cli map .
```

Point it at a repository. It reads the code into an evidence graph, builds a
model from that graph, and writes **one self-contained HTML file** you can open,
search, share and check. Every relationship it draws carries the file, the line
range and the commit it came from.

Zero runtime dependencies. The artifact opens from disk, with no server.

## What it reads

JavaScript and TypeScript imports · Python imports · `package.json` workspaces ·
Express and Next routes · `docker-compose`.

That is the whole list, and the list is the point. Everything else is
**reported, not skipped**: the run writes a `coverage.md` naming every file no
adapter opened, grouped by type, and `map` says so on its way out when the
unread files outnumber the read ones. A repository this cannot read gets an
honest empty answer, never a confident small one.

Where analysis genuinely stops, it stops out loud. An unparseable file is a
recorded **gap**, never a silent omission. A computed import is a gap naming its
line rather than a guess at the target. A Python specifier that matches two
source roots is a gap naming both, because which one wins depends on `sys.path`,
which is configuration and not in the source.

## Commands

```bash
npx mirofy-cli map . [out.html] [--out dir]   # a repository, end to end
npx mirofy-cli demo                           # a finished artifact, to look at
npx mirofy-cli init                           # a starter document to edit
npx mirofy-cli render architecture doc.json   # render a document you wrote
npx mirofy-cli validate architecture doc.json # check one without rendering
npx mirofy-cli guide "an API request with a cache miss"
```

`map --out <dir>` keeps the intermediates out of your repository; without it
they land in `<target>/scan`.

Installed globally with `npm install -g mirofy-cli`, the command is **`mirofy`**.
The package carries the `-cli` suffix because npm refused the bare name as too
close to the existing `minify`.

## More

Full documentation, the live gallery, and the numbers this project publishes
about itself: **https://github.com/Hasan-Laraib/Mirofy**

MIT. `LICENSE` in this directory carries the required copyright notice and must
never be edited.

---

<details>
<summary>Notes for contributors working in this directory</summary>

- **Do not refactor here during P0.** Parity is proved first (golden +
  conformance); refactoring happens in P1 against those proofs.
- `MIROFY_*` is the environment-variable namespace; do not reintroduce any
  earlier prefix.
- Beyond the P1 identifier rename, the only P0 modification is `package.json`
  scripts, which referenced the original project's repo-root build scripts.

</details>
