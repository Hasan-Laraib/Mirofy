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

JavaScript and TypeScript imports · Python imports · Go imports · Java imports ·
Rust imports · Kotlin imports · `package.json` workspaces · Express and Next
routes · `docker-compose`.

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
npx mirofy-cli mcp                            # serve the map to an agent
```

Once a repository is mapped, four commands read the evidence it produced:

```bash
npx mirofy-cli explain callers api     # what points at something, with citations
npx mirofy-cli explain gaps            # what the scan could not read
npx mirofy-cli assert                  # architecture rules: pass, fail, unproven
npx mirofy-cli timeline                # how often each component's cited files change
npx mirofy-cli drift --base a.json --head b.json   # what two scans say differently
```

`assert` has **three** outcomes, not two. A rule that found no violation over a
scan with unread files has not been *shown* to hold, so `unproven` is its own
result and never counts as passing.

## Give it to your agent

The same tool, reached three other ways. All of them run this package — the
agent never draws the diagram, it runs the command you would have run, so
nothing it reports can drift from what the CLI reports.

**As a skill**, for Claude Code, Cursor, Gemini CLI, Amp and around seventy
others:

```bash
npx skills add Hasan-Laraib/Mirofy
```

**As an MCP server** — nine tools that answer what depends on what, each answer
carrying a file, a line and a commit rather than a recollection. Listed in the
official registry as `io.github.Hasan-Laraib/mirofy`:

```json
{ "mcpServers": { "mirofy": { "command": "npx", "args": ["-y", "mirofy-cli", "mcp"] } } }
```

It reads `./scan` — whatever `map --out ./scan` last wrote — relative to the
directory the client starts it in. `--model` and `--graph` override that.

**As a Claude Code plugin**, which carries the skill and the MCP server together:

```
/plugin marketplace add Hasan-Laraib/Mirofy
/plugin install mirofy@mirofy
```

`map --out <dir>` keeps the diagram and the intermediates out of your
repository; without it the intermediates land in `<target>/scan`. Naming an
output path still wins over both.

Citations need a pinned repository to verify against, which `map` reads from
your `origin` remote. A checkout without one -- a bare `git init`, a mirror --
has no repository to name, so pass `--repo-url` and `--revision` and the
citations are kept instead of dropped.

## Pin it if you build on it

`npx mirofy-cli` resolves to the newest version every time it runs. This is
moving fast enough that two people reviewing the same repository a day apart
reached different conclusions, and the earlier one was already out of date
when it was written. If anything you do depends on the output -- a CI step, a
committed diagram, a comparison over time -- name the version:

```bash
npx mirofy-cli@0.6.0 map .
```

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
