# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It holds the rules, the gates and the
layout, and it is the single copy of them.

This file exists only for what is specific to Claude Code. Everything else
lives in `AGENTS.md` on purpose: two files repeating one set of rules is two
files that drift, and a stale rule read confidently is worse than no rule.

---

## The short version

If you read nothing else:

- **Never guess.** An unanalysable construct is a recorded **Gap** naming a
  file and a line — never an omission, never a plausible edge.
- **Zero runtime dependencies.** `check:readme` enforces it across every
  package.
- **Never re-baseline a manifest or skip a test to make a gate pass.** Both
  `test:golden` and `check:drift` take `--update` and both refuse it in CI,
  because a re-baseline is a reviewable decision rather than a way past a red
  check.
- **`npm run check` is the bar.** It is what CI runs, across nine
  OS-and-Node combinations.

## Working here

`npm run check` takes several minutes — it renders fixtures, drives Chrome for
part of the conformance matrix, and runs a full scan of this repository to
verify the README's numbers. Run the individual gates in `AGENTS.md` for a fast
loop and the full one before you say you are done.

Two gates fail for reasons that are not your diff, and it is worth recognising
them rather than chasing them:

- **`check:readme`** re-derives the README's numbers from a live scan. Adding a
  package moves them. That is the gate working.
- **`check:audit`** queries a live advisory endpoint, so an unchanged lockfile
  can go from green to red overnight.

## The MCP server

`packages/mcp` exposes this repository's own model as agent context:

```bash
npm run mcp
```

In Claude Code the plugin carries both the skill and the server:

```
/plugin marketplace add Hasan-Laraib/Mirofy
/plugin install mirofy@mirofy
```

## Using Mirofy rather than editing it

[`packages/core/SKILL.md`](packages/core/SKILL.md) is the skill description.
It drives the same CLI a person would run — the agent never draws the diagram
itself, which is why nothing it reports can drift from what the CLI reports.
