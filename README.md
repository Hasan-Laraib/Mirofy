# `Mirofy`

> System intelligence for codebases. Point it at a repository and it builds a
> living, evidence-backed model of the system — then compiles that model into
> diagrams that can say *why they believe what they show*.

Every relationship a Mirofy diagram draws can answer one question: **what is
the evidence for this?** A connection carries the file, the line range and the
revision it was derived from, and says which of six provenance classes it
belongs to. Where nothing is known, the diagram says so rather than filling
the gap.

## Quick start

```bash
npm install
npm run check      # the full gate: lint, types, tests, golden parity, conformance, artifacts, size, audit
npm run build      # render every fixture into .artifacts/ (git-ignored)
npm run gallery    # 5 diagram types x 5 presets into preview/, then open preview/index.html
```

## The pipeline

Each stage reports what it could **not** determine, and the next stage carries
that forward. A diagram that quietly omits half a system is worse than one
that names what it left out.

```bash
npm run scan       # repository  -> evidence graph   (facts, and a gap for every file it could not analyse)
npm run model      # evidence    -> system model     (one inventory: components, relationships, boundaries)
npm run compile    # model       -> bounded view IR  (intent, no coordinates, every omission recorded)
```

Against this repository, `scan` reads 190 files into 919 facts and 9 gaps, and
`compile` turns a 62-component model into a 12-node view while recording all
110 omissions with reasons.

### Working from a document instead

```bash
node packages/core/bin/mirofy.mjs import mermaid <input.mmd>          # flowchart / sequenceDiagram / stateDiagram
node packages/core/bin/mirofy.mjs render <type> <input.json> <out.html>
node packages/core/bin/mirofy.mjs validate <type> <input.json> --json
node packages/core/bin/mirofy.mjs deliver <type> <input.json> --json  # atomic write + SHA-256 receipt
```

Five diagram types — `architecture`, `dataflow`, `lifecycle`, `sequence`,
`workflow` — render to one self-contained HTML file with inline SVG, no
external requests, and no runtime dependencies.

## What is proved

The conformance matrix has **87 rows. 67 are proved without a browser**; 19
more need headless Chrome (`MIROFY_CHROME`), bringing the total to 86.

One row (6.10, deterministic ZIP packaging) is UNPROVEN — its source was never
part of this import's scope, so there is nothing here to prove parity against.
It is counted as unproven rather than quietly dropped.

`packages/conformance/src/matrix.mjs` holds the full per-row accounting. Every
row names the test that proves it, and the row's `testTitle` must match that
test character-for-character. **A skipped test is never counted as passing.**

| Gate | Command |
|---|---|
| Renderer parity against recorded golden digests | `npm run test:golden` |
| Capability conformance, per row | `npm run test:conformance` |
| Core integrity against a reviewed manifest | `npm run check:drift` |
| Viewer template byte-identical to its source | `npm run check:template` |
| Artifact reproducibility | `npm run check:artifacts` |
| Tracked-tree size budget | `npm run check:size` |
| Dependency audit | `npm run check:audit` |

Every gate here has been observed failing on a deliberate break before it was
trusted. A gate that has never been seen to fail is a decoration.

Re-baseline `check:drift` deliberately — `node scripts/check-core-drift.mjs
--update`, which refuses to run in CI — and commit the manifest diff alongside
the change so the two are reviewed together. Run
`MIROFY_CHROME=/path/to/chrome npm run check` to exercise the browser rows too.

## Evidence and provenance

Six classes describe what kind of knowledge stands behind a node or a
relationship:

`authored` · `source-backed` · `statically-derived` · `config-derived` ·
`runtime-observed` · `inferred`

They are **distinguishable without colour** — by dash pattern, stroke weight
and opacity — because provenance is a trust signal and roughly 8% of men have
colour-vision deficiency. `authored` is deliberately the untouched baseline:
it is what an unclaimed subject resolves to, and giving it a treatment would
restyle every diagram ever authored in order to say "this is normal".

Evidence resolves against **GitHub, GitLab, Bitbucket, Gitea, Gitee and Azure
DevOps**. An unrecognised host is refused *by name*, listing those that are
supported: a wrong URL template still produces a clickable link, and a
confident link to nothing is worse than admitting the host is unknown.

## Packages

| Package | Responsibility |
|---|---|
| `packages/scanner` | Adapters that read a repository into facts and gaps |
| `packages/evidence` | Append-only evidence graph, query, honest coverage report |
| `packages/model` | The system model: stable ids, evidence refs, human overrides |
| `packages/compile` | View compiler and the planner seam |
| `packages/import` | Foreign formats (Mermaid) into typed documents |
| `packages/layout` | Constraint layout: view IR with intent to coordinates (dev-time) |
| `packages/benchmark` | First-pass usable rate, measured on a schedule |
| `packages/core` | Renderers, schemas, validators, CLI |
| `packages/viewer` | The interactive viewer, built into a single template |
| `packages/conformance` | The matrix, and the tests every row names |

**Zero runtime dependencies** in every workspace package. The rendered
artifact ships nothing but itself.

## In the artifact

The rendered `.html` is the product, and it carries more than a picture. It
opens offline, from a file, with no server and no network.

- **Node Finder**, **Semantic Lens** and **Semantic Radar** — search, filter
  and overview a diagram too large to read at once
- **Route Probe** — resolve a directed path between two nodes and see it
  traced, with the ordered hops listed
- **Authored Reachability** — everything upstream or downstream of one node,
  counted
- **Semantic Passport** — click any node for its type, tags, and cited
  evidence, with a **Verified Source Beacon** on anything backed by a pinned
  commit
- **Guided views** — authored chapters that walk a reader through the diagram
- **Presentation stage**, **motion governor** and an **embed mode**
  (`?embed=1`) for slides, docs and pages

Three exports are copied straight to the clipboard, all optional and all
generated from what is already on screen:

| Export | What it is |
|---|---|
| **Copy Share Card** | A 1200×630 PNG for a README, release or social preview, in the current theme and visual preset |
| **Export → Route Share Card** | The exact ordered route a Route Probe resolved — available only after one resolves |
| **Export → Reach Share Card** | The upstream/downstream set a reachability query returned — available only after a non-empty one |

A card shows what the reader actually did. None of them claim validation, and
none are produced from a query that returned nothing.

## Viewer source

`packages/core/assets/template.html` is **generated**, not hand-authored — it
is built from the JS modules, CSS parts and generated design tokens under
`packages/viewer/`. Never edit it directly: edit
`packages/viewer/src/**` and run `npm run build:template`.
`npm run check:template` enforces this by rebuilding from source and failing
if the committed file has drifted.

## Layout

Authored positions are honoured as written. Where a document declares
`layout.mode: "grid"` the renderer places components instead — an importer or
a generator with no positions to give says so, rather than inventing an
arrangement and presenting it as authored intent.

## Attribution

Every rendered artifact says what made it. The viewer carries a small footer
the reader can dismiss — the diagram is theirs, and a banner they cannot close
is an imposition on someone else's document. Share Cards carry a permanent
one, because a card travels without its context and lands where nothing around
it says where it came from.

It names the tool and claims nothing about the diagram, and it carries no URL:
a link baked into every shared artifact outlives the address it points at.

MIT. `packages/core/LICENSE` retains, verbatim, the required third-party
copyright notice for the imported rendering core; the root `LICENSE` covers
this project's own work.
