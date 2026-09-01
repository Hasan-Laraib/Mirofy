<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <img src="assets/logo.png" alt="Mirofy — connect, model, insight" width="380">
  </picture>
</p>

<p align="center">
  <strong>Diagrams of your system that cite their sources — and say what they could not see.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square" alt="MIT licensed">
  <img src="https://img.shields.io/badge/runtime%20dependencies-0-7c3aed?style=flat-square" alt="Zero runtime dependencies">
  <img src="https://img.shields.io/badge/conformance-79%20rows%20proved-3b82f6?style=flat-square" alt="79 conformance rows proved without a browser">
  <img src="https://img.shields.io/badge/output-one%20HTML%20file-7c3aed?style=flat-square" alt="Output is one HTML file">
</p>

<p align="center">
  <a href="https://hasan-laraib.github.io/Mirofy/self-model.html"><img src="assets/self-model.svg" alt="Mirofy's own architecture, derived from its own source code" width="880"></a>
</p>

<p align="center">
  <em>That diagram is not a mock-up. It is this repository, scanned by itself —
  every box citing the manifest it came from, every arrow citing the import
  lines that produced it.</em>
  <br>
  <strong><a href="https://hasan-laraib.github.io/Mirofy/self-model.html">Open the live one ↗</a></strong> — click any
  node for the file, line range and commit behind it.
</p>

---

## What it is

Point Mirofy at a repository. It reads the code into an **evidence graph**,
builds a **model** from that graph, and compiles the model into **one HTML
file** you can open, search, share and check.

Every relationship it draws can answer one question: *what is the evidence for
this?* Each carries the file, the line range and the commit it came from. Where
nothing is known, the diagram **says so** instead of filling the gap.

<p align="center">
  <img src="assets/pipeline.svg" alt="scan to model to compile to layout to render" width="880">
</p>

## Install

**Nothing to install** — one command, and a diagram opens:

```bash
npx mirofy-cli demo     # a finished artifact, to see what this produces
npx mirofy-cli init     # a starter document of your own to edit
npx mirofy-cli validate architecture architecture.json
npx mirofy-cli render architecture architecture.json
```

`npx mirofy-cli guide "show an API request with a cache miss"` picks the
diagram type for you if you are not sure which one you want.

**As a CLI you keep** — `npm install -g mirofy-cli`. The command it installs is
**`mirofy`**; the package carries the `-cli` suffix because npm refused the bare
name as too close to the existing `minify`.

**From source** — no install at all, because there is nothing to install:

```bash
git clone https://github.com/Hasan-Laraib/Mirofy.git
node Mirofy/packages/core/bin/mirofy.mjs demo
```

That works on a bare checkout with no `npm install`, because every package here
has zero runtime dependencies.

**As an agent skill** — build the bundle and copy it where your agent looks:

```bash
git clone https://github.com/Hasan-Laraib/Mirofy.git
cd Mirofy && npm install && npm run build:skill

cp -r dist/mirofy ~/.claude/skills/      # Claude Code
cp -r dist/mirofy ~/.agents/skills/      # Codex CLI, opencode
```

Then ask: `Use mirofy to map this repository's runtime architecture.`

The bundle is 2.8 MB and named for the skill inside it — copying `packages/core`
instead installs a skill called `core` that says in its own frontmatter it is
called `mirofy`, and drags the test suite along with it. Before writing the
bundle, `build:skill` copies it somewhere with no repository around it and
renders a diagram: a bundle that only works inside its own checkout is not a
bundle.

Nothing is downloaded at runtime and nothing phones home — there is no update
check, because a tool that reaches the network to tell you about itself is a
tool that reaches the network.

## Try it in five commands

```bash
npm run scan                    # repository  → evidence graph
npm run model -- --from-graph --graph scan/evidence-graph.json
npm run compile                 # model       → a bounded view
npm run layout                  # view        → positioned document
node packages/core/bin/mirofy.mjs render architecture scan/diagram.json out.html --repo-root .
```

Against **this repository** it records **1,052 facts** across **190 files**,
with **10 gaps** it could not read; derives **19 components and 24
relationships** — every one citing the file and line it came from — and draws
**twelve**, recording what it left out and why.

Those figures are checked, not remembered — see
[the numbers on this page](#what-is-proved) below.

Those commands reproduce the diagram at the top of this page. It is checked in
under `assets/` as documentation; the interactive artifacts are built, never
stored.

No repository? Author a JSON document, or convert a Mermaid diagram:

```bash
node packages/core/bin/mirofy.mjs import mermaid design.mmd
node packages/core/bin/mirofy.mjs render architecture design.json out.html
node packages/core/bin/mirofy.mjs validate architecture design.json --json
```

## What you get

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/meridian.png" alt="An architecture diagram in the meridian preset" width="100%">
<p align="center"><em>Six presets, light and dark. <code>meridian</code> keeps
arrows graphite so colour means <strong>what a node is</strong>.
<a href="https://hasan-laraib.github.io/Mirofy/gallery/architecture--meridian.html">Open ↗</a></em></p>
</td>
<td width="50%" valign="top">
<img src="assets/sequence.png" alt="A sequence diagram with lifelines and messages" width="100%">
<p align="center"><em>Five diagram types — architecture, workflow, sequence,
dataflow, lifecycle.
<a href="https://hasan-laraib.github.io/Mirofy/gallery/sequence--meridian.html">Open ↗</a></em></p>
</td>
</tr>
</table>

<p align="center">
  <img src="assets/self-model.png" alt="The interactive viewer with search, tracing and evidence panels" width="880">
</p>

<p align="center">
  <em>One file. Opens offline, from disk, with no server and no network.</em>
  <br>
  <strong><a href="https://hasan-laraib.github.io/Mirofy/">All thirty are live ↗</a></strong> — five types × six
  presets, rebuilt from every commit.
</p>

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

## The number we would rather not publish

A benchmark asks one question: hand a model a written brief, and how often does
the diagram it writes come out **usable on the first attempt**?

Right now, over eight briefs authored by Claude Code: **2 of 8**.

```bash
node scripts/benchmark.mjs --author "<your command>" --model "<id>" --keep benchmarks/corpus/mine
node scripts/benchmark.mjs --replay benchmarks/corpus/mine
```

That is not a good number and it is the real one. Three things make it worth
printing anyway.

**Usable means clean, not accepted.** A warning is the diagram telling you it
needs a second look, which is exactly what a first-pass rate is supposed to
exclude. Two more documents in that set validate with zero errors and are still
not counted.

**It is measured against a saved corpus, not a fresh one.** `--keep` stores what
the model produced; `--replay` re-runs the tool over those exact documents
without calling the model again. Without that split, every re-run changes both
the documents and the tool, and any movement can be attributed to either — which
is why the rate sat at zero for weeks without anyone being able to say what was
wrong. A replay cannot even claim a different author: the model is read from the
saved manifest, and `--model` is refused if it disagrees.

**It moves for reasons you can name.** The last change to the layout engine took
the same eight documents from 0 of 8 to 2 of 8, and total composition errors
from 121 to 34, because a diagnostic that said *"shorten the label or widen
size"* was asking an author to rename part of their system to fit a box the
renderer had picked. The renderer now widens the box.

If you compare this to a number published elsewhere, check what was measured.
A rate for an agent that can call a validator and repair its own output, reviewed
by a person at the end, is a different measurement from a blind single-shot
model — not a worse one, a different one. Ours is the second kind.

---

## Inside the artifact

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

```bash
npm run gallery      # every type in every preset → preview/index.html
npm run build:site   # the same, plus this repo's self-model → site/
```

The second is what CI publishes to
**[hasan-laraib.github.io/Mirofy](https://hasan-laraib.github.io/Mirofy/)** on every commit. Nothing
is committed: the site is built from the code at the commit it describes, so it
cannot go on quietly describing an older one.

## Taking it elsewhere

The interactive file is ~720 KB and earns it. None of that survives a README, a
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

The conformance matrix has **99 rows**. **79 are proved without a browser**;
19 more need headless Chrome (`MIROFY_CHROME`), bringing the total to 98.

```bash
npm run check    # lint, types, 1,000+ tests, golden parity, conformance, size, audit
```

Every row names a test, and the title must match character-for-character — a row
whose proof file passes while its own test was renamed counts as **unproven**,
never as passing. One row (6.10, deterministic ZIP packaging) is UNPROVEN and
counted as such rather than quietly dropped.

**Skipped is not passed.** Browser rows never count toward the proved total
unless a browser actually ran them.

And the numbers on this page are checked too:

```bash
node scripts/check-readme-claims.mjs
```

It counts the matrix, reads the tool list the MCP server serves, renders an
artifact to measure it, and re-runs the benchmark. This exists because a review
found three numbers here wrong at once — none of them dishonest, all of them
true when written and left behind by the repository. A page that argues for
checking claims has no business making unchecked ones.

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
| `benchmark` | first-pass usable rate, over a saved corpus |
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
