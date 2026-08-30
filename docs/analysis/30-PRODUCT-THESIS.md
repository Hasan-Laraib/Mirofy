# 30 · Product Thesis

**Product name:** `Mirofy` — decided; the naming rationale is held privately.
**Source project:** MIT-licensed — conceptual source *and* imported component origin.

---

## 1. The one-sentence thesis

> **Point it at a codebase and it builds a living, evidence-backed model of the system — then
> lets humans and agents understand, explore, explain, and review that system through
> beautiful, trustworthy views where every important fact can say why it is believed.**

## 2. The problem

Every architecture diagram in existence has the same terminal failure: **it goes stale, and
then everyone quietly stops trusting it.** Nobody has solved this. The reasons are structural:

1. **Diagrams are authored, not derived.** A human or an LLM decides what is true, and nothing
   checks it against the code.
2. **Nothing connects a diagram to a revision.** When the code moves, the picture doesn't know.
3. **The tools that *are* derived produce diagrams nobody wants to look at.** Auto-layout
   engines optimise for crossings, not for comprehension.
4. **"AI-generated" is not "true."** A model that reads a repository and draws a picture has
   produced a plausible artifact, not a verified one.

## 3. The user

Software engineers, architects, tech leads, reviewers, and **AI coding agents** who need to
understand or explain a system — a codebase, a request path, a data pipeline, a deployment
topology — and need to trust what they are shown.

Concretely, they are trying to:
- onboard onto an unfamiliar codebase
- explain a system in a design review, RFC, or incident
- see what changed architecturally in a pull request
- answer *"what depends on this?"* before making a change
- produce audit or compliance evidence that isn't a stale Visio file

## 4. The pain, in order of severity

| Pain | Today's answer | Why it fails |
|---|---|---|
| "Our diagrams are wrong and nobody knows which parts" | Redraw them manually | Stale again within weeks |
| "I can't tell if this AI-generated diagram is true" | Trust it, or verify by hand | No provenance; verification costs more than drawing |
| "The auto-generated one is unreadable" | Squint at a Mermaid blob | Layout engines optimise the wrong objective |
| "I need to explain this to a person" | Hand-draw in Excalidraw | Beautiful, unverifiable, immediately stale |
| "What changed architecturally in this PR?" | Read the diff | Doesn't exist at architecture level |
| "My agent doesn't understand our system" | Paste files into context | No structured, queryable system model |

## 5. Product category

**System Intelligence for Codebases.**

Deliberately *not*: "AI architecture diagram generator" · "code-to-diagram tool" ·
"prettier Mermaid" · "AI flowchart generator." Those categories are crowded, commoditised,
and low-trust — and the last of them is where verified competitors already sit.

## 6. Value proposition

> **Anyone can generate a diagram of your repo now. This produces the diagram a human would
> have drawn — and a proof of why every fact in it is believed.**

Three claims, each defensible against verified competitive evidence:

1. **Derived, not asserted.** Facts come from deterministic analysis with provenance; the AI abstracts and composes on top of source-derived truth rather than being the source of truth.
2. **Authored quality.** Every verified competitor emits Mermaid, whose syntax has **no primitive for a node coordinate** — they structurally surrender layout to an engine. This product owns composition through a constraint solver under authored intent.
3. **Provable.** Deterministic validation, cryptographic receipts on spec and artifact, revision-pinned evidence on nodes *and edges*, and honest non-claims.

## 7. Why current tools fail

| Tool class | Strength | Structural failure |
|---|---|---|
| **Mermaid / D2 / PlantUML** | Ubiquitous, embeddable | Engine-computed layout; no evidence; no drift detection |
| **CodeBoarding, DeepWiki, GitDiagram** | Real repo scanning | **All emit Mermaid** → layout surrendered; evidence is a source link at best, never on edges |
| **Structurizr / C4** | Model-first, multi-view | Hand-authored model; goes stale; **prices machine consumption** — API calls and iframe embeds count as chargeable users |
| **Excalidraw / draw.io / Lucid** | Direct manipulation | Nothing is derived or verified; stale on day two |
| **Cloudcraft / Hava** | Live cloud topology | Infrastructure only — no code, no relationships, no PR awareness |
| **The source project** | Best-in-class visual quality, taste validator, truth discipline | **Authoring-first**: the agent invents topology and coordinates from a blank file; evidence attaches to nodes only, so every *edge* is an unverified assertion |

## 8. The architectural inversion

```
SOURCE PROJECT                   THIS PRODUCT
──────────────                   ────────────
Agent understands repo           Machine extracts facts
      ↓                                ↓
Agent authors architecture       System builds evidence graph
      ↓                                ↓
Tool validates presentation      AI interprets and abstracts
                                       ↓
                                 Machine verifies
                                       ↓
                                 Human/agent gets architecture
```

**The AI stops being the source of truth and becomes the abstraction and explanation layer on
top of source-derived truth.** This matches the published state of the art: ArchAgent
(ICASSP 2026) wraps the LLM in static analysis, adaptive segmentation, and contextual pruning
rather than prompting it directly, naming architectural drift, missing relations, and LLM
context limits as the three obstacles.

## 9. What this product refuses to become

| Refusal | Why |
|---|---|
| **A WYSIWYG drawing suite** | Editing chrome becomes the product; nudge-to-patch is the bounded escape hatch |
| **A hosted rendering service** | Self-contained zero-dependency output is why it runs inside sandboxed agents, and the defence against every SaaS competitor. Hosting always belongs to the user |
| **Telemetry or accounts** | The audience punishes it, and the trust model forbids it |
| **A 5,000-node code-graph viewer** | Density is the enemy of comprehension. Scale through hierarchy, never through a denser canvas |
| **Generic auto-layout that owns the narrative** | The model owns composition; the machine owns arithmetic. Never the reverse |
| **"AI-powered" ordinary interactions** | Shortest path, reachability, and focus are stronger deterministic. Keep AI out of anything exact graph traversal answers |
| **Calling inferred facts "verified"** | Six provenance classes exist precisely so this never happens |
| **Relicensing the core** | The engine stays MIT permanently. Only organisational features are ever sellable |

## 10. Success criteria for v1

`<PRODUCT> .` on a real, unfamiliar TypeScript repository produces, in under 60 seconds and
with no JSON authoring, no schema knowledge, and no LLM repair loop:

1. A **correct** architecture view — services, routes, datastores, queues, external dependencies
2. **Evidence on edges**, not just nodes — click a relationship, see the exact file, lines, revision, and derivation method
3. **Visual quality indistinguishable from the source project's** — verified by golden tests and a contact sheet
4. An **honest coverage statement** — what was derived, what was inferred, what was not analysed. Never a fabricated percentage

If a reader trusts that artifact enough to paste it into a design review, the thesis holds.
