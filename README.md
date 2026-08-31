# Mirofy

**Diagrams of your system that cite their sources — and say what they could not see.**

Point Mirofy at a repository. It reads the code into an evidence graph, builds a
model from that graph, and compiles the model into a self-contained HTML file
you can open, search, share and check.

Every relationship it draws can answer one question: *what is the evidence for
this?* Each carries the file, the line range and the commit it came from. Where
nothing is known, the diagram says so instead of filling the gap.

```bash
npm install
npm run scan                    # repository  → evidence graph
npm run model -- --from-graph --graph scan/evidence-graph.json
npm run compile                 # model       → a bounded view
npm run layout                  # view        → positioned document
node packages/core/bin/mirofy.mjs render architecture scan/diagram.json out.html --repo-root .
```

Run against **this repository**, that reads **230 files into 987 facts and 8
gaps**, derives **19 components and 21 relationships** from them — every one
citing the file and line it came from — and draws twelve of them, recording
what it left out and why.

Those five commands produce `preview/self-model.svg` — Mirofy's own
architecture, derived from Mirofy's own code. It is not committed: generated
artifacts are built, never stored (row 7.1), so the way to see it is to run
the pipeline.

No repository? Author a JSON document, or convert a Mermaid diagram:

```bash
node packages/core/bin/mirofy.mjs import mermaid design.mmd
node packages/core/bin/mirofy.mjs render architecture design.json out.html
node packages/core/bin/mirofy.mjs validate architecture design.json --json
```

---

## What it does that a diagram tool doesn't

### It refuses to guess

A file the scanner cannot parse becomes a recorded **gap**, never a silent
omission. Every fact is labelled with one of six provenance classes, so
`source-backed` and `inferred` never look alike.

The same rule holds where a decision has to be made that evidence cannot
settle. A derived component's kind is `package` — the scanner knows a manifest
exists, not whether something is a "backend". 734 imports of `node:fs` are
*counted and named*, not drawn and not dropped in silence. A citation with no
pinned commit to verify against is discarded rather than shown, because a
citation nobody can check is worse than none.

### It answers questions about your system

```bash
npm run explain -- callers api     # what points at api
npm run explain -- impact api      # what is downstream of it
npm run explain -- find payment    # id, label, kind or metadata match
npm run explain -- gaps            # what the scan could not read
```

Every answer names the unread files that could change it. *"Nothing calls
PaymentService"* is useful if the scanner read everything and reckless if six
files failed to parse — so an empty result means **not found**, never **does not
exist**.

`impact` answers as *reachability* and refuses to be more. What is connected is
a fact about the graph; whether a change breaks it is a judgement about a
running system, and Mirofy has no evidence for that.

### Your agent can ask too

The same queries over MCP — nine tools, the same engine, not a second
implementation that could disagree with the CLI:

```json
{ "mcpServers": { "mirofy": { "command": "node", "args": ["packages/mcp/bin/mcp.mjs"] } } }
```

The incompleteness warning is in the **prose** an agent reads, not only the
JSON. Most clients feed the text to the model and drop the rest.

### It checks architecture rules — with three outcomes, not two

```bash
npm run assert     # reads architecture-rules.json
```

`pass`, `fail`, and **`unproven`**. A rule that found no violation over a scan
with unread files has not been *shown* to hold, so it never counts as passing.
Turning a gap into a green check is the one failure this project exists to
avoid.

Some gaps are permanent — a dynamic import whose base path is a variable cannot
be resolved without guessing. Those can be **acknowledged**, one path at a
time, quoting the gap's reason and carrying a written argument. An
acknowledgement written for a dynamic import stops applying the day that file
fails to parse instead. And a rule that passes on the strength of one says so:

```
[ok  ] no-cycles — No violation. 8 unread file(s) are acknowledged as unable
       to hide one; this rests on that judgement, not on a complete scan.

2 passed, 0 failed, 0 unproven of 2
2 of those rule(s) rest on acknowledged gaps, not on evidence.
```

### It tells you what is moving

```bash
npm run timeline                                # cited-file churn, newest first
npm run drift -- --base a.json --head b.json    # what two scans say differently
```

Drift reports changed facts and nothing else — no score, no risk label, no merge
recommendation. It runs on every pull request and can never fail one.

---

## The artifact

One HTML file. Opens offline, from disk, with no server and no network.

- **Node Finder**, **Semantic Lens**, **Semantic Radar** — search, filter and
  overview a diagram too large to read at once
- **Route Probe** — resolve a directed path and see it traced, hop by hop
- **Semantic Passport** — click a node for its type, tags and cited evidence,
  with a **Verified Source Beacon** on anything backed by a pinned commit
- **Guided views**, presentation mode, motion governor, and `?embed=1`
- Three exports, copied straight to the clipboard:
  - **Export → Share Card** — a 1200×630 PNG in the current theme and preset
  - **Export → Route Share Card** — the exact route a Route Probe resolved
  - **Export → Reach Share Card** — the set a reachability query returned

A card shows what the reader actually did. None of them claim validation, and
none are produced from a query that returned nothing.

Five diagram types — `architecture`, `workflow`, `sequence`, `dataflow`,
`lifecycle` — in six visual presets, light and dark.

```bash
npm run gallery    # every type in every preset → preview/index.html
```

## Taking it elsewhere

The interactive file is ~715 KB and earns it. None of that survives a README, a
pull request or a Notion page, though — all of them strip scripts. So:

```bash
# 19 KB standalone SVG: no scripts, no stylesheet needed
node packages/core/bin/mirofy.mjs render architecture in.json out.svg --format svg-static

# or open it in an editor you already own
npm run export -- drawio     architecture in.json
npm run export -- excalidraw architecture in.json
```

| where it goes | how |
|---|---|
| README, pull request, Notion, Confluence | `svg-static` |
| Figma, Canva, Illustrator, Sketch | `svg-static` — styling is written as attributes, so it arrives with its colours |
| diagrams.net · draw.io VS Code extension | `drawio` — real shapes and connectors |
| Excalidraw · Obsidian · VS Code | `excalidraw` — bound arrows, movable boxes |

The SVG carries its styling **twice**: in a stylesheet and on the elements. In
SVG a stylesheet outranks an attribute, so a browser renders from the CSS, and
the attributes speak only where the CSS is ignored — which is exactly what
Figma, Canva and Illustrator do. Without them the diagram imports shape-correct
and colour-dead.

Both editor exports say exactly what they lost, computed from *your* document
rather than recited as a disclaimer. A diagram you can only edit in the tool
that made it is a diagram held hostage.

## What is proved

The conformance matrix has **97 rows. 77 are proved without a browser**; 19 more
need headless Chrome (`MIROFY_CHROME`), bringing the total to 96.

```bash
npm run check    # lint, types, 978 tests, golden parity, conformance, size, audit
```

Every row names a test, and the title must match character-for-character — a row
whose proof file passes while its own test was renamed counts as **unproven**,
never as passing. One row (6.10, deterministic ZIP packaging) is UNPROVEN and
counted as such rather than quietly dropped.

**Skipped is not passed.** Browser rows never count toward the proved total
unless a browser actually ran them.

## Evidence and provenance

Six classes, never blurred:

| class | means |
|---|---|
| `authored` | a human wrote it |
| `source-backed` | read out of a cited file and line range |
| `statically-derived` | computed from code without running it |
| `config-derived` | read from a manifest — configuration, not code |
| `runtime-observed` | seen in a real run |
| `inferred` | a guess, and labelled as one |

Source citations verify against a pinned 40-character commit in a real local
checkout before they render. A path that does not exist at that revision is an
error, not a broken link.

Several repositories can be declared at once, and a citation names which one it
belongs to. Verifying against *a* repository rather than *the right one* is how
a path from a sibling repo passes as evidence for this one.

## Packages

| package | does |
|---|---|
| `scanner` | adapters that read a repository into facts and gaps |
| `evidence` | append-only evidence graph, query, honest coverage |
| `model` | the system model: stable ids, evidence refs, human overrides |
| `compile` | view compiler and the planner seam |
| `explain` | graph queries, architecture rules, drift, timeline |
| `mcp` | the model as agent context |
| `import` | Mermaid into typed documents |
| `export` | draw.io and Excalidraw escape hatches |
| `layout` | constraint layout: intent to coordinates (dev-time) |
| `core` | renderers, schemas, validators, CLI |
| `viewer` | the interactive viewer, built into one template |
| `benchmark` | first-pass usable rate, measured on a schedule |
| `conformance` | the matrix, and the tests every row names |

**Zero runtime dependencies** in every package. The artifact ships nothing but
itself.

`packages/core/assets/template.html` is **generated** from `packages/viewer/`.
Never edit it directly — edit the source and run `npm run build:template`.
`npm run check:template` rebuilds from source and fails if the committed file
has drifted.

## Attribution

Every artifact says what made it. The viewer footer is **dismissible** — the
diagram is yours, and a banner you cannot close is an imposition on someone
else's document. Share Cards carry a **permanent** one, because a card travels
without its context and lands where nothing says where it came from.

It names the tool and claims nothing about the diagram, and carries no URL: a
link baked into every shared artifact outlives the address it points at.

MIT. `packages/core/LICENSE` retains, verbatim, the required third-party
copyright notice for the imported rendering core; the root `LICENSE` covers this
project's own work.
