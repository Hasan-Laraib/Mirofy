// One entry per imported (H) row in analysis/future/32-PARITY-AND-FEATURE-MATRIX.md,
// as extracted mechanically into
// .superpowers/sdd/2026-08-29-p0-foundation/imported-rows.md: 55 pure-H rows,
// plus row 3.1b (added post-P0 to close the mislabelled-row-plus-coverage-gap
// residual recorded in the build ledger) -- 56 rows total.
// Row 1.10 is H->R (rebuilt in P1) and is intentionally absent from this list.
//
// `proof` names the test file (or script) that guarantees the row.
// `browser: true` means the proof runs only in the CI browser job (Task 9),
// against packages/conformance/test/viewer.browser.test.mjs. Such rows are
// never counted as passing by scripts/conformance.mjs until MIROFY_CHROME
// is set.
// `proof: null` marks a row P0 genuinely cannot prove yet; `note` says why.
// A row with no real proof is never silently listed as covered.
//
// `testTitle`: the exact node:test title (or array of titles, all of which
// must pass) of the test(s) in `proof` that assert THIS row's mechanism.
// scripts/conformance.mjs runs that suite once with --test-reporter=tap and
// requires a passing (non-skipped) `ok` line matching each named title
// before counting the row as proved -- it is not enough for the file to
// exit 0.
//
// History: fix-round-1 (Task 9) added this for the 14 browser rows after
// file-level accounting let all 14 read "proved" once MIROFY_CHROME was
// set, though only 4 had a real assertion (see viewer.browser.test.mjs's
// header comment). fix-round-2 extended it to the remaining 40 rows after
// the coordinator proved the same defect at file scale: deleting
// validation-gates.test.mjs's "showcase validation reports exactly the
// nine artifact checks" test left `npm test` and the conformance tally
// both green, because none of that file's 21 rows were individually
// falsifiable. Every row below now either names a real, individually
// verified test, is explicitly `proof: null` (UNPROVEN, with a reason), or
// -- for the one row backed by a script rather than a node:test file --
// stays file-level with that exemption spelled out in its own comment.
//
// A shared `testTitle` across two rows is legitimate when the same test
// genuinely asserts both (e.g. 1.1/4.1: one smoke test proves both "five
// typed domains" and "five typed renderers" by rendering all five). It is
// never used to paper over a row with no real, distinct coverage.
export const IMPORTED_ROWS = [
  // Phase 1 — Authoring surface
  {
    id: '1.1',
    name: 'Five typed diagram domains',
    proof: 'render-smoke.test.mjs',
    // Shared with 4.1: the one smoke test renders all five domains through
    // all five renderers in the same loop -- there is no separate test
    // that isolates "domain" from "renderer" and none is needed to prove
    // this row honestly.
    testTitle: 'all five diagram modes render from their v1-baseline fixture',
  },
  {
    id: '1.2',
    name: 'Typed IR, additionalProperties:false',
    proof: 'validation-gates.test.mjs',
    testTitle: 'the IR schema rejects any additional top-level property (1.2)',
  },
  {
    id: '1.3',
    name: 'JSON schemas + pre-generated validators',
    proof: 'validation-gates.test.mjs',
    testTitle: 'pre-generated AJV-standalone validators exist for all five types and reject drift (1.3)',
  },
  {
    id: '1.4',
    name: 'Grid placement (row/col)',
    proof: 'validation-gates.test.mjs',
    testTitle: 'layout.mode "grid" places components deterministically by row/col (1.4)',
  },
  {
    id: '1.5',
    name: 'Structural placement (lane/col/stage)',
    proof: 'validation-gates.test.mjs',
    // Two distinct diagram types share this row (workflow lane/col,
    // dataflow stage/row) and each has its own dedicated test; both must
    // pass for the row's full claim to hold.
    testTitle: [
      'workflow lane order drives vertical stacking and col drives horizontal order (1.5)',
      'dataflow stage/row drives a left-to-right, top-to-bottom grid (1.5)',
    ],
  },
  {
    id: '1.6',
    name: 'Guided views / chapters (≤5)',
    proof: 'validation-gates.test.mjs',
    testTitle: 'guided views round-trip into the rendered artifact and are capped at 5 (1.6)',
  },
  {
    id: '1.7',
    name: 'quality_profile standard/showcase',
    proof: 'validation-gates.test.mjs',
    // The first test only proves the flag is echoed back; the second
    // proves it actually changes enforcement (warning under standard,
    // error under showcase, same real violation both times). Both are
    // required -- echoing alone proves nothing about behaviour.
    testTitle: [
      'the --quality flag is echoed as the reported composition profile on a clean fixture (1.7)',
      'quality_profile actually escalates a real violation from warning to error, not just an echoed label (1.7)',
    ],
  },
  {
    id: '1.8',
    name: 'Brand marks (107, digest-pinned)',
    proof: 'validation-gates.test.mjs',
    testTitle: 'exactly 107 brand marks are catalogued and pinned to one Simple Icons version (1.8)',
  },
  {
    id: '1.9',
    name: 'Legend modes (auto/all/hidden)',
    proof: 'validation-gates.test.mjs',
    // Shared with 4.9: this one test is also the legend half of "text
    // fitting + legend".
    testTitle: 'legend mode "hidden" omits the legend; "all" includes kinds absent from the diagram (1.9, 4.9)',
  },

  // Phase 2 — Evidence
  {
    id: '2.1',
    name: 'Repository evidence (revision-pinned)',
    proof: 'validation-gates.test.mjs',
    // This proves the pinned-revision verification and the embedded
    // evidence payload the Verified Source Beacon (2.2) reads at runtime --
    // it does not touch the beacon's own on-screen affordance. See 2.2
    // below, which used to (wrongly) claim this same test covered it too:
    // the beacon is a runtime-installed SVG element (installBeacons() in
    // template.html, gated on real getBBox() layout), so it needs an
    // actual browser and has its own dedicated browser test now.
    testTitle: 'repository evidence verifies a pinned 40-char revision against a real repo and embeds it (2.1, 2.2)',
  },
  {
    id: '2.2',
    name: 'Verified Source Beacon (SRC n)',
    proof: 'viewer.browser.test.mjs',
    // Previously shared 2.1's title with a comment claiming the on-screen
    // affordance was covered by row 5.3 -- it was not: 5.3 is Focus +
    // Semantic Passport, which never touches `.source-evidence-beacon` or
    // asserts anything about it. That was an unproved affordance
    // misdescribed as proved. It now has its own real, browser-verified
    // assertion: navigates to an artifact rendered with real repository
    // evidence and checks the runtime-installed beacon's marker text
    // ("SRC 1"), its absence on a node with no sources, and the aria-label
    // update -- see viewer.browser.test.mjs's "[2.2]" test.
    browser: true,
    testTitle: '[2.2] Verified Source Beacon renders "SRC n" on a node and on a relationship with verified repository evidence, and stays off ones without it',
  },

  {
    id: '2.4',
    name: 'Evidence on relationships (all five diagram types)',
    // Evidence could be attached to architecture COMPONENTS since P0, and to
    // nothing else. A relationship -- the claim that two things are connected
    // -- could not answer "why do I believe this?" in any of the five types.
    // The `sources` shape is now a single $defs in common.schema.json,
    // referenced from six sites, so components and relationships cannot drift
    // apart into two subtly different evidence shapes.
    //
    // Proved per diagram type on purpose: support existed for exactly one of
    // the five before this task, so a single-type test would have passed
    // while four types silently had no support at all. Each test also asserts
    // the REJECTION of a source with no `path`, because evidence that is
    // silently dropped is worse than evidence never claimed.
    origin: 'N',
    phase: 'P1b',
    proof: 'evidence.test.mjs',
    testTitle: '[2.4] architecture accepts sources on its connections and rejects a malformed entry',
  },

  {
    id: '2.5',
    name: 'Six-class evidence provenance',
    // The vocabulary that says what KIND of knowledge stands behind a node or
    // a relationship: authored, source-backed, statically-derived,
    // config-derived, runtime-observed, inferred. Optional in the schema on
    // purpose -- a document that claims no class is not malformed, it
    // resolves to `authored`, which is the truthful description of a
    // hand-written document rather than a flattering one.
    //
    // The row's testTitle pins the ORDER, which is the published display
    // order for the legend and Passport and is NOT a confidence ranking:
    // `authored` leads the list while being the weakest of the six. Sorting
    // it "properly" would silently reorder the legend, so the test asserts
    // the sequence rather than the set.
    origin: 'N',
    phase: 'P1b',
    proof: 'evidence.test.mjs',
    testTitle: '[2.5] the six provenance classes are exactly these six, in the published order',
  },

  {
    id: '2.6',
    name: 'Multi-repo evidence identity',
    // A system rarely lives in one repository. With a single
    // /meta/repository every citation was implicitly "in that repo", so a
    // component whose code lives elsewhere either cited a path that does not
    // exist or went uncited. Both are worse than naming the repository.
    //
    // /meta/repositories declares several, each with its own url and
    // revision, and a source names which one it belongs to. That decides BOTH
    // the checkout it is verified against and the link it produces --
    // verifying against "a" repository rather than the right one is how a
    // path that exists in a sibling repo passes as evidence for this one, and
    // the gate was observed failing on exactly that shortcut.
    //
    // The single-repository form keeps working untouched; a migration nobody
    // asked for is a bug. Declaring both is refused rather than silently
    // preferring one, because whichever a reader assumed would be right half
    // the time.
    origin: 'N',
    phase: 'P2',
    proof: 'multi-repo-evidence.test.mjs',
    testTitle: '[2.6] evidence is verified against the right repository, not merely a repository',
  },

  {
    id: '2.3',
    name: 'Host-agnostic evidence (GitHub, GitLab, Bitbucket, Gitea, Gitee, Azure DevOps)',
    // Verification was never host-bound -- it runs `git` against a real
    // checkout, and git does not care where the remote lives. FIVE things
    // were: the slug regex, an outright rejection of anything not on
    // github.com, the blob-URL builder, the viewer's repository link, and the
    // schema's url pattern. All five now go through hosts.mjs.
    //
    // The blob URL shapes are asserted as exact strings per forge, because
    // they genuinely disagree -- GitLab omits the second "L", Bitbucket uses
    // #lines-a:b, Azure addresses files by query string. A test that only
    // checked "a URL was produced" would pass every wrong template, and a
    // wrong template is the worst failure available here: a confident,
    // clickable link to nothing.
    //
    // An unrecognised host is refused BY NAME rather than guessed at, and the
    // rejection lists the supported forges -- an author cannot guess which
    // are understood from a refusal that does not say.
    origin: 'N',
    phase: 'P1b',
    proof: 'evidence.test.mjs',
    testTitle: '[2.3] github repository URLs resolve to the right slug and blob URL',
  },

  {
    id: '2.7',
    name: 'Evidence graph store + query',
    // 31-V1-ARCHITECTURE.md's contract verbatim: "append-only per revision. A
    // fact is never edited, only superseded." Enforced structurally -- no
    // update or delete method exists, stored facts are frozen copies, and
    // supersede marks the old fact rather than touching it. The tests
    // exercise every observable mutation route and expect a dead end.
    origin: 'N',
    phase: 'P1c',
    proof: 'evidence-graph.test.mjs',
    testTitle: 'a fact appends and is queryable by subject, predicate and provenance (2.7)',
  },
  {
    id: '2.8',
    name: 'Scanner: TS/JS imports',
    // A tokenizer-level extractor, dependency-free (row 6.9). The honesty
    // line is exactly where the scanner rule draws it: literal specifier ->
    // fact with its line; computed specifier -> Gap with its line;
    // unresolvable literal -> Gap, never a fabricated path. Against this
    // repository at registration: 181 files, ~900 facts, every gap verified
    // genuine by hand.
    origin: 'N',
    phase: 'P1c',
    proof: 'scanners.test.mjs',
    testTitle: '[2.8] import scanner reports static, re-export, require and literal dynamic imports with exact lines',
  },
  {
    id: '2.9',
    name: 'Scanner: workspace/package topology',
    // package.json workspaces -> contains-package and depends-on facts,
    // config-derived. One malformed manifest is a Gap naming the parse error
    // while every other package is still analysed; a workspace pattern
    // fancier than <dir>/* is a Gap rather than a half-implemented matcher
    // quietly missing packages.
    origin: 'N',
    phase: 'P1c',
    proof: 'scanners.test.mjs',
    testTitle: '[2.9] workspace scanner reports packages and their dependencies as config-derived facts',
  },
  {
    id: '2.10',
    name: 'Scanner: HTTP routes',
    // Express/Fastify registrations are statically-derived; Next.js
    // file-based routes are config-derived, because the path on disk IS the
    // route. A computed path is a Gap, never a guessed route. Conservative
    // receiver list on purpose: a missed exotic receiver is invisible noise,
    // a false route is a lie about the system's surface.
    origin: 'N',
    phase: 'P1c',
    proof: 'scanners.test.mjs',
    testTitle: '[2.10] route scanner reports Express and Fastify registrations with method, path and line',
  },
  {
    id: '2.17',
    name: 'Honest coverage report',
    // A partition: analysed / gapped / not-analysed sum to the universe, and
    // the test fails on an uncounted file. No percentage anywhere, asserted
    // against the rendered text -- a percentage silently claims its
    // denominator is the whole system. Not-analysed files are NAMED; a
    // summary is where omissions go to hide.
    origin: 'N',
    phase: 'P1c',
    proof: 'evidence-graph.test.mjs',
    testTitle: 'coverage buckets every file exactly once, and the buckets sum to the whole (2.17)',
  },

  {
    id: '1.12',
    name: 'Stable semantic IDs',
    // The row says "mandatory for every object". Satisfied AT THE MODEL, not
    // by tightening the five authored schemas: requiring `id` there would
    // break every document ever written, every fixture and all 25 golden
    // digests, for a capability the model needs and authors do not.
    //
    // An authored id is used verbatim and claimed FIRST, so a derived id can
    // never displace one. A derived id is marked `authoredId: false`, because
    // it is stable only while the content it derives from is -- rename the
    // label and it changes. Position is part of the derivation, so two
    // components sharing a type and label are two ids, not one silent merge.
    origin: 'R',
    phase: 'P1d',
    proof: 'system-model.test.mjs',
    testTitle: '[1.12] every model object gets an id, and an authored id survives verbatim',
  },

  {
    id: '1.10',
    name: 'Agent contract (SKILL.md), scan-first',
    // SKILL.md is read by an agent that then makes promises to a user on its
    // behalf. A capability claimed there and absent from the CLI is not a
    // documentation slip -- it is an agent telling someone the tool can do
    // something it cannot.
    //
    // That was the live state when this row was written: SKILL.md advertised
    // pasted-Mermaid input and "convert/beautify Mermaid" while `grep -rn
    // mermaid packages/core --include=*.mjs` returned nothing at all. The
    // gate is mechanical -- every `mirofy <verb>` the document names must be a
    // verb the CLI dispatches -- so prose stays free to describe and is not
    // free to invent.
    origin: 'R',
    phase: 'P1',
    proof: 'agent-contract.test.mjs',
    testTitle: '[1.10] every capability SKILL.md claims maps to a real CLI verb',
  },
  {
    id: '1.13',
    name: 'Mermaid import',
    // Hand-written, because row 6.9 forbids runtime dependencies. That limits
    // how much syntax it understands, and the honest response is the scanner
    // rule applied unchanged: a line the reader cannot parse becomes a Gap
    // naming the line number, never a silently dropped node and never an
    // invented edge. An importer that quietly discards what it cannot read
    // produces a diagram confidently wrong about the very thing it was asked
    // to convert.
    //
    // flowchart -> architecture (needs no lanes, no positions);
    // sequenceDiagram -> sequence (y from message ORDER, real information);
    // stateDiagram -> lifecycle (one explicit lane, because a state diagram
    // has none and inventing several would invent domain structure).
    //
    // No positions are emitted: architecture imports declare
    // layout.mode "grid" so the renderer places them, rather than the
    // importer inventing an arrangement and presenting it as authored intent.
    origin: 'N',
    phase: 'P1',
    proof: 'mermaid-import.test.mjs',
    testTitle: '[1.13] a flowchart becomes an architecture document that validates',
  },
  {
    id: '1.14',
    name: 'System model (model.json)',
    // One inventory; diagrams become views of it. The same component
    // described by two documents is ONE model component carrying both
    // documents' evidence AND both labels -- a merge that keeps only the last
    // label seen is a silent overwrite dressed as consolidation.
    //
    // Provenance is resolved from cited evidence, and an object with no
    // evidence is `authored` rather than flattered into a stronger class.
    origin: 'N',
    phase: 'P1d',
    proof: 'system-model.test.mjs',
    testTitle: '[1.14] components sharing an id across documents merge into one, keeping both labels',
  },
  {
    id: '1.15',
    name: 'First-class engineering metadata',
    // `owner` and `deployment{regions, networkScope}` as real optional
    // fields. They were smuggled before -- owner read out of a component's
    // display `tag`, regions inferred from boundary membership -- which works
    // and is legible to nobody. Optional, with the fallbacks kept, because
    // every document authored before the fields existed uses the old shape;
    // golden is untouched, which is the proof they are additive.
    origin: 'N',
    phase: 'P1d',
    proof: 'engineering-metadata.test.mjs',
    testTitle: '[1.15] a component carries owner and deployment as real fields',
  },
  {
    id: '1.17',
    name: 'Human overrides recorded as authored',
    // An override is a person disagreeing with the analysis. If the
    // overridden object keeps saying `statically-derived`, a human decision
    // is wearing the authority of machine evidence -- so an override always
    // re-provenances to `authored`, and what it replaced stays on record so
    // the disagreement is inspectable rather than erased.
    //
    // An override naming an unknown id THROWS: a typo'd override that quietly
    // does nothing is the failure mode worth preventing.
    origin: 'N',
    phase: 'P1d',
    proof: 'system-model.test.mjs',
    testTitle: '[1.17] an override is recorded as authored even when it replaces derived provenance',
  },

  {
    id: '1.18',
    name: 'View compiler (bounded view IR with intent)',
    // P1.7 shipped with no matrix row of its own -- the roadmap's rows column
    // reads "--" -- so this row was created with the capability. A capability
    // delivered without a row is invisible to every gate downstream of the
    // matrix, which is exactly how 5.16 sat in PLANNED for a full phase after
    // it shipped.
    //
    // The contract (31-V1-ARCHITECTURE.md section 3): may select, group, name
    // and omit; may NOT invent a relationship absent from the model;
    // omissions are recorded, not silent. Every contract assertion runs
    // against a planner written specifically to VIOLATE it -- the default
    // planner is the one implementation guaranteed not to be the problem, so
    // proving the contract against it proves nothing.
    //
    // The AI lives behind this seam. It is not wired in yet: the seam plus a
    // deterministic default makes the contract enforceable and testable
    // without a network dependency, which row 6.9 forbids anyway.
    origin: 'N',
    phase: 'P1e',
    proof: 'view-compiler.test.mjs',
    testTitle: '[1.18] a planner cannot invent a relationship absent from the model',
  },

  {
    id: '4.14',
    name: 'Evidence-first visual language (six provenance treatments)',
    // 36-VISUAL-SYSTEM.md V4's binding constraint is that the six classes are
    // distinguishable WITHOUT COLOUR, because provenance is a trust signal
    // and roughly 8% of men have colour-vision deficiency. The test therefore
    // measures ONLY the non-colour channels (stroke-dasharray, stroke-width,
    // opacity) and ignores hue entirely: a set of treatments that differed
    // only by colour would pass a casual look and fail the requirement.
    //
    // Computed styles from a real browser, not the stylesheet text. Parsing
    // the CSS would prove a rule was written, not that it wins the cascade --
    // which is precisely where P1a's print-palette bug lived.
    //
    // `authored` carries no rule at all. It is what every unclaimed subject
    // resolves to, so styling it would restyle every document ever authored
    // in order to say "this is normal"; its distinctness is being the
    // untouched baseline.
    origin: 'N',
    phase: 'P1b',
    proof: 'provenance-visual.test.mjs',
    browser: true,
    testTitle: '[4.14] the six provenance treatments are pairwise distinct without colour, in every preset and both themes',
  },

  {
    id: '4.11',
    name: 'Shared compiler pipeline (composition gate parity)',
    // "Ends five-renderer drift", and the drift was already there: four
    // renderers called all seven composition gates while `sequence` called
    // six, silently missing cleanEndpointSideProblems. Nothing recorded
    // whether that was a decision or an oversight, and nothing would have
    // caught a second one.
    //
    // composition-pass.mjs is now the declared table and the renderers are
    // checked against it in BOTH directions: a gate dropped from a renderer
    // fails, and an exemption that is no longer true fails too, so the table
    // cannot rot into a list of excuses. Every exemption must carry a written
    // reason -- "this gate does not apply" is a claim about the diagram's
    // geometry, and writing it down is what separates a considered exemption
    // from a gate someone forgot to wire up.
    //
    // Sequence's exemption is real: messages run horizontally between fixed
    // lifelines at an authored `y`, the schema has no fromSide/toSide field,
    // and the renderer never reads one.
    origin: 'R',
    phase: 'P1',
    proof: 'composition-pass.test.mjs',
    testTitle: '[4.11] every renderer runs every composition gate it is not declared exempt from',
  },

  {
    id: '3.12',
    name: 'Constraint solver (dev-time)',
    // webcola does the force layout and overlap avoidance, as a
    // devDependency of packages/layout alone -- the rendered artifact keeps
    // row 6.9's zero-runtime-dependency promise.
    //
    // It does NOT do the pinning, and that was measured rather than assumed:
    // `node.fixed = 1` drifted a pinned node 100.8px and
    // `Descent.locks.add()` drifted it 123.2px over 60 iterations. `fixed` is
    // read by the d3 drag adaptor rather than by the descent. So pins are
    // enforced after the solve and asserted here; the gate was observed
    // failing by deleting that enforcement, which reproduces the drift.
    origin: 'N',
    phase: 'P2',
    proof: 'layout-solver.test.mjs',
    testTitle: '[3.12] the same view solves to the same coordinates twice',
  },

  {
    id: '3.13',
    name: 'repair --safe (makeFeasible pattern)',
    // Minimise displacement, solve feasibility, report what cannot be
    // satisfied, and NEVER touch topology, labels or semantics. That last
    // clause is what makes this safe to run on someone's file, so it is
    // enforced mechanically: the test strips every position from the input
    // and the output and demands the rest be identical. It was observed
    // failing on the tempting mistake -- a repair that also "tidied" a label.
    //
    // Feasibility means the REAL rule. Repair first separated boxes to zero
    // gap, which the validator still rejects: architecture's component rule
    // is rectsOverlap(a, b, 8), so touching boxes fail it. A repair that
    // reports success while the document still fails validation is the worst
    // possible outcome, so the clearance is targeted explicitly.
    //
    // `--safe` is required, not default: rewriting authored coordinates is a
    // real edit to someone's file and should take an explicit word.
    origin: 'N',
    phase: 'P2',
    proof: 'repair-safe.test.mjs',
    testTitle: '[3.13] repair never touches topology, labels, or semantics',
  },
  {
    id: '3.16',
    name: 'Straight-route port placement',
    // Row 3.7 gave fanned-out relationships distinct ports so they could not
    // collapse into one line. It spread them evenly about the side's centre:
    // correct about separation, indifferent about direction. An edge whose
    // counterpart sat 200px away still left from a port 14px off centre and
    // bent to reach it, and some of those edges could have been straight.
    //
    // So the ports are solved rather than spaced. Each port's ideal is the
    // coordinate that would make ITS edge straight -- where its counterpart
    // sits -- and the solve is the exact least-squares projection of those
    // ideals onto the side's band under a minimum separation. Closed form,
    // not an iteration with a budget, so the same diagram always produces the
    // same ports.
    //
    // Even spread is contained rather than replaced: when every counterpart
    // sits at the same coordinate no port can beat any other, and the
    // solution IS the even spread. A test pins that degenerate case to the
    // exact positions row 3.7 produced.
    //
    // Order is the other half, and it belongs to the sort rather than the
    // solve: endpoints are ordered by counterpart position, which is what
    // stops fan-out edges crossing, and the separation constraint carries
    // that order through. Observed failing on the tempting mistake -- ports
    // spread about the centre again -- which broke both behaviour tests while
    // every invariant test stayed green, since the old code satisfied those
    // invariants too.
    origin: 'N',
    phase: 'P2',
    proof: 'straight-route.test.mjs',
    testTitle: '[3.16] a port that can make its edge straight, does',
  },
  {
    id: '7.8',
    name: 'First-pass usable benchmark (scheduled, never per PR)',
    // The only number in this repo that moves without a commit, because it
    // measures what an external model does with the tool. That one fact
    // drives every requirement on the row.
    //
    // It must never gate a pull request. A contributor cannot see, reproduce
    // or fix a drop caused by a provider changing a model, so a required
    // check would fail them for someone else's deploy. The rule is enforced
    // rather than documented: a test reads the workflow's trigger block and
    // refuses `pull_request` and `push`. Observed failing on a planted
    // pull_request trigger.
    //
    // It must never report a rate it did not measure. When the author fails
    // often enough -- an outage, an expired key, a refusal -- the run comes
    // back `inconclusive` with a null rate rather than a low score, because a
    // depressed number attributed to this repo looks exactly like a
    // regression and someone will go hunting for the commit. Observed failing
    // on a planted `usable / total` that reported 20% during an outage.
    //
    // And it must never blame the tool for the author's failures, or the
    // author for the tool's. Those are separate outcome classes that are
    // never summed. A validation refusal arrives with the same exit code and
    // the same stage whichever it was, so the split is drawn on the
    // diagnostic code namespace -- `schema/*` is a malformed document,
    // anything else is a rejected composition. An end-to-end run caught that
    // one: every overlapping diagram was being filed as malformed, blaming
    // the author for the layout engine's verdict.
    //
    // The rate divides by every task, including ones the author lost, because
    // that is what a user experiences. Dividing by what the author managed to
    // answer would let a model that skipped its hard tasks post a perfect
    // score. Observed failing on exactly that divisor.
    origin: 'N',
    phase: 'P2',
    proof: 'benchmark-harness.test.mjs',
    testTitle: '[7.8] the benchmark workflow is not, and cannot become, a per-PR gate',
  },
  {
    id: '6.12',
    name: 'Attribution on artifacts',
    // The baseline this project forked ships none, and that is its single
    // largest unforced growth error: every diagram it rendered went into a
    // README, a slide or a chat with nothing on it saying what made it.
    //
    // Two surfaces, deliberately different. The viewer footer is DISMISSIBLE
    // -- the artifact belongs to whoever rendered it, and a banner they
    // cannot close is an imposition on someone else's document. The Share
    // Card is PERMANENT, because a card is the one artifact that travels
    // without its context: it lands somewhere nothing around it says where it
    // came from.
    //
    // Permanence is structural, not a promise. The card reserves a band and
    // draws attribution into it AFTER the diagram, so a large diagram cannot
    // paint over it. Observed failing on the reordering.
    //
    // Attribution says what made a diagram and never anything about the
    // diagram: a test refuses the words verified, validated, correct and
    // accurate in either string. It carries no URL either -- a link baked
    // into every shared artifact outlives the address it points at, and a
    // dead link is worse than a name.
    //
    // The footer's failure mode is the interesting one. localStorage throws
    // in sandboxed iframes and with cookies blocked; the catch returns null,
    // which reads as "not dismissed" and SHOWS attribution. Observed failing
    // on a catch that returned the dismissed value instead, which would have
    // turned a storage error into a silently unattributed artifact.
    //
    // The ordering assertion was itself vacuous at first: it matched
    // `ctx.drawImage(img,`, which also matches the plain PNG export earlier
    // in the same file, so it passed however the card was ordered. Anchored
    // on the card's own call.
    origin: 'N',
    phase: 'P3',
    proof: 'attribution.test.mjs',
    testTitle: '[6.12] card attribution is drawn after the diagram, so nothing can cover it',
  },
  {
    id: '6.13',
    name: '--format svg-static',
    // The interactive artifact is ~715 KB and earns it. None of that survives
    // where a diagram most needs to go: GitHub, a pull request, Notion and
    // Confluence all strip scripts and render an image, so the full artifact
    // shows nothing at all.
    //
    // The export is DERIVED from the rendered artifact, never laid out again.
    // A second layout path is a second thing to keep correct, and the first
    // time the two disagreed the static file would quietly stop being the
    // diagram it claims to be.
    //
    // Three things make it a file rather than a fragment: an XML declaration,
    // an explicit SVG namespace (inside HTML the parser supplies one; a file
    // on disk gets no such help and browsers refuse to paint it), and every
    // var(--token) resolved -- there is no :root left, so an unresolved
    // property is an element with no colour. Observed failing on a planted
    // missing namespace, which broke both the document test and the browser
    // test, and on a planted skip of variable resolution.
    origin: 'N',
    phase: 'P3',
    proof: 'svg-static.test.mjs',
    testTitle: '[6.13] the export is a standalone SVG document, not an HTML fragment',
  },
  {
    id: '4.15',
    name: 'Tree-shaken artifacts',
    // 685 of 818 stylesheet rules cannot match anything in the diagram --
    // toolbars, panels, docks, the export menu. Dropping them takes the file
    // from 715 KB to 27 KB, which is the difference between an artifact you
    // commit next to your code and one you do not.
    //
    // The danger is obvious: shaking is deletion with a nicer name, and a
    // smaller file is always one delete away. So the gate is not the size, it
    // is the completeness. Every rule in the FULL stylesheet that targets a
    // class the diagram actually uses must survive into the export, compared
    // set against set. Observed failing on a planted over-shake that kept
    // only single-class selectors.
    //
    // Viewer-only attributes go too -- data-node-id, tabindex, role, aria-*
    // are hooks for JavaScript that is not there. `data-name` is spared,
    // because stylesheets select on it and stripping it would change the
    // picture rather than only the size.
    origin: 'N',
    phase: 'P3',
    proof: 'svg-static.test.mjs',
    testTitle: '[4.15] every style that applied in the artifact still applies',
  },
  {
    id: '6.19',
    name: 'explain (CLI graph queries)',
    // The questions anyone asks about a system they did not write: what calls
    // this, what is downstream, what touches the payment data, is anything
    // unreachable. A search tool answers by matching text and hoping; this
    // answers from the model built out of the evidence graph.
    //
    // Which makes the EMPTY answer the dangerous one. "Nothing calls
    // PaymentService" is useful if the scanner read every file and reckless if
    // six failed to parse, and the difference is invisible unless the answer
    // carries it. So every result -- every verb, without exception -- returns
    // an `incompleteness` block naming the unread files that could change it,
    // and says "not found, never does not exist" in those words. Observed
    // failing on a planted "always complete".
    //
    // A clean scan says so rather than staying silent, because "complete" is
    // information and an absent field reads as an oversight.
    //
    // `impact` is stated as REACHABILITY and refuses to be more. It reports
    // what is connected downstream; whether a change breaks any of it is a
    // judgement about a running system that this has no evidence for, so the
    // answer carries that boundary in writing and a test forbids the word
    // risk anywhere in the payload.
    //
    // An unknown component id is refused with a suggestion rather than
    // answered with zero -- "0 callers" for a typo is true, useless, and reads
    // as a fact about the system instead of about the spelling. Observed
    // failing on a planted lookup that answered anyway.
    //
    // Direction is the whole answer: callers and dependencies are the same
    // traversal read opposite ways, and swapping them yields a plausible list
    // that is a different fact. Observed failing on the swap.
    origin: 'N',
    phase: 'P5',
    proof: 'explain.test.mjs',
    testTitle: '[6.19] an empty result from a gappy scan is "not found", never "does not exist"',
  },
  {
    id: '3.15',
    name: 'assert (architecture rules as CI checks)',
    // A diagram says what the architecture looked like when it was drawn. A
    // rule says what it is allowed to become -- "only the API talks to the
    // database", "payments must not depend on analytics", "no cycles".
    //
    // Detecting a violation is the easy half. The half that matters is what to
    // say when the scan could not read everything, and the answer is a THIRD
    // outcome. A rule that found nothing over a scan with unread files has not
    // been shown to hold; the violation could be in one of them. `unproven` is
    // its own outcome, never counted among the passes even when tolerated, and
    // it fails the run unless someone writes --allow-unproven. Observed
    // failing on a planted "unproven is a pass".
    //
    // A selector matching nothing is an error rather than an empty pass. A
    // rule about a component that does not exist passes forever, and the day
    // someone renames the component is the day it silently stops protecting
    // anything. Observed failing on a planted empty-set selector.
    //
    // Scope came from running this against the repository's own model. A
    // sequence diagram records `api -> auth` and `auth -> api` because a
    // request gets a reply; read as a dependency graph that is a cycle, and
    // no-cycles reported six of them in a repository that has none. The rule
    // was right and the scope was missing, so rules now narrow by diagram
    // type.
    //
    // Cycles report the loop and not the path into it: a node that leads to a
    // cycle without being in it sends the reader somewhere that is not the
    // problem.
    origin: 'N',
    phase: 'P5',
    proof: 'assert-rules.test.mjs',
    testTitle: '[3.15] no violation over a scan with gaps is UNPROVEN, not passing',
  },
  {
    id: '6.18',
    name: 'MCP server (system model as agent context)',
    // An agent asked to change a codebase answers questions first: what calls
    // this, what is downstream, which components touch the payment data.
    // Today it answers with grep, which finds strings, cannot tell a call from
    // a comment, and has no way to report what it missed.
    //
    // This serves the SAME engine `explain` uses rather than a second
    // implementation that could disagree with it, so an agent and a human get
    // the same answer to the same question.
    //
    // The reason it is worth building rather than convenient: an agent that
    // reads "nothing calls PaymentService" and deletes it has done real damage
    // if six files failed to parse. So the incompleteness report is in the
    // TEXT an agent reads, not only the structured payload -- most clients
    // feed the prose to the model and drop the rest. Observed failing on a
    // planted silence.
    //
    // Tool descriptions are held to the same boundary as the answers. `impact`
    // says REACHABILITY and "not a prediction of breakage"; a test forbids
    // "will break", "guarantee" and "safe to" in any description, because a
    // description that oversells is how a careful engine produces a confident
    // wrong action.
    //
    // A bad component id returns tool content with isError, never a JSON-RPC
    // error: most clients never show a protocol error to the model, so an
    // error there is a silent failure the agent cannot correct. Observed
    // failing on a planted protocol error.
    //
    // Notifications draw no response -- the absence is the behaviour, and
    // answering one is a protocol violation clients report as a stray
    // message. Observed failing on a planted reply.
    //
    // The protocol is implemented directly, because row 6.9 keeps this
    // repository at zero runtime dependencies and MCP over stdio is
    // newline-delimited JSON-RPC 2.0.
    origin: 'N',
    phase: 'P5',
    proof: 'mcp-server.test.mjs',
    testTitle: '[6.18] a tool answer carries its incompleteness in the text an agent reads',
  },
  {
    id: '6.20',
    name: 'timeline (evolution across git history)',
    // The obvious implementation checks out every commit and re-scans. It is
    // also the wrong one: a full scan per commit, a clean worktree nobody has,
    // and an answer to a question nobody asked, since most components do not
    // change in most commits.
    //
    // The model knows which files each component cites; git knows which
    // commits touched which files. Joining those answers "what is moving" for
    // one `git log` per path.
    //
    // Which makes the naming the load-bearing part. This measures CITED-FILE
    // CHURN and says so: a commit that touched a cited file changed something
    // in that file, not necessarily the component's shape, relationships or
    // meaning. Claiming otherwise would be an assertion about intent that a
    // file path cannot support.
    //
    // A component with no citations is reported as UNKNOWN, in its own list,
    // never as an entry with zero commits. In a table "no commits" and "no
    // information" look identical and only one is a fact. Observed failing on
    // a planted zero-entry.
    //
    // A commit touching two cited files counts once. Counting per path would
    // make a component look twice as volatile as it is. Observed failing on
    // the planted double count.
    //
    // Run against this repository it reports 62 uncited components and no
    // history, which is correct and worth knowing: the model here is built
    // from authored documents whose sources name a document, not a path.
    origin: 'N',
    phase: 'P5',
    proof: 'timeline.test.mjs',
    testTitle: '[6.20] a component with no cited paths is UNKNOWN, not unchanged',
  },
  {
    id: '6.17',
    name: 'CI action (evidence drift on pull requests)',
    // On a pull request the useful question is not "is this safe to merge" --
    // no static tool can answer that -- but "what does this change say about
    // the system that the last one did not". A fact appeared, vanished, or
    // moved file. Those are checkable, and they are what a reviewer cannot see
    // in a forty-file diff.
    //
    // The design is mostly about what it REFUSES to say: no score, no risk
    // label, no merge recommendation. A reviewer reading "3 facts removed" can
    // go and look; one reading "medium risk" has a number nobody can defend,
    // and will either trust it or ignore it.
    //
    // Identity is the CLAIM -- subject, predicate, object -- and deliberately
    // not the fact id, revision or file. Those change on every scan of an
    // unchanged system, and folding them in would report the whole graph as
    // churned on every run, which conveys nothing.
    //
    // A move is one event, not a removal plus an addition, or a single file
    // rename would bury the real changes in noise.
    //
    // Gaps qualify a removal: "removed" and "no longer visible" call for
    // different reactions, and the caveat appears only when there are gaps
    // rather than as boilerplate nobody reads.
    //
    // The workflow has no failure path, asserted by absence. A drift check
    // that could go red would go red on every pull request that does any work,
    // and would be disabled by whoever it blocked first.
    //
    // The forbidden-word test needed correcting: it first failed on the
    // report's own "not a risk score", which would have pushed the disclaimer
    // out of the report to make the assertion pass. It now scans the findings
    // with the disclaimers removed.
    origin: 'N',
    phase: 'P5',
    proof: 'evidence-drift.test.mjs',
    testTitle: '[6.17] the report claims nothing about risk or merge safety',
  },
  {
    id: '4.16',
    name: 'meridian preset (editorial visual language)',
    // Every inherited preset shares one habit: saturated component fills and
    // coloured arrows, which reads as a dashboard. A diagram that goes into a
    // design document, a review or a printout wants the opposite -- a
    // near-neutral ground, low-chroma fills, and arrows carrying no hue at
    // all, so colour means "what this node IS" and nothing competes with it.
    //
    // ADDED, never substituted. Every inherited preset renders byte-for-byte
    // as before; the 25 existing golden digests did not move and 5 were added.
    // A reader who liked `classic` still has `classic`.
    //
    // Measured rather than admired, because a palette that works on the
    // author's monitor and fails in a bright room is not a professional
    // palette. Body text clears 16:1 in both themes against a WCAG AAA floor
    // of 7; the weakest component stroke clears 5.8:1 against a graphics floor
    // of 3; the closest pair of semantic hues is 14 deltaE apart where the
    // just-noticeable difference is about 2.3. A restrained palette's real
    // risk is two component types collapsing into the same apparent colour --
    // worse than a garish one, because the reader cannot tell a database from
    // a queue and does not know it.
    //
    // The arrow colour is held at least 10 deltaE from every component hue: if
    // it drifted toward one, a relationship would start reading as a category.
    //
    // One correction: the "changed nothing" test first asserted a flat 32
    // tokens per preset and failed on `signal-flow`, which overrides 30 and 27
    // and inherits the rest. A preset is allowed to be partial; the counts are
    // now pinned per preset.
    origin: 'N',
    phase: 'P3',
    proof: 'tokens.test.mjs',
    testTitle: '[4.16] every meridian stroke and text pair clears its legibility floor',
  },
  {
    id: '1.11',
    name: 'Authored positions honoured as hard constraints',
    // Row 1.11 says explicit pos:[x,y] authoring is "replaced by intent +
    // solver" with "manual pins still honoured as hard constraints". That
    // second clause is a promise to the person who typed the coordinates,
    // and a pin the solver may relocate is not a constraint -- it is a
    // suggestion with better marketing.
    //
    // Enforced after the solve, then anything the restoration collided with
    // is moved. The pin never is.
    origin: 'R',
    phase: 'P2',
    proof: 'layout-solver.test.mjs',
    testTitle: '[3.12] an authored position is a hard constraint and survives the solve exactly',
  },

  {
    id: '5.20',
    name: 'Evidence Passport for relationships',
    // Selecting a relationship focuses its SOURCE NODE, so the Passport was
    // showing that node's evidence while the user believed they were
    // inspecting the edge -- evidence attributed to the wrong subject, which
    // is worse than showing none. The edge's own class and sources now
    // replace it.
    //
    // Every assertion is against the fixture's exact values (path, line
    // range, revision, class), never that the panel is merely non-empty: a
    // panel rendering the WRONG file's evidence is non-empty too, and that is
    // precisely the defect this row exists to catch.
    //
    // browser: true, so it defers rather than falsely passing without Chrome.
    origin: 'N',
    phase: 'P1b',
    proof: 'evidence-passport.browser.test.mjs',
    browser: true,
    testTitle: "[5.20] selecting a relationship reports ITS evidence in the Passport, not its source node's",
  },

  {
    id: '5.16',
    name: 'Modularized viewer source',
    // Delivered in P1a -- packages/viewer/src holds 19 modules and the
    // template is generated from them (check:template proves byte-identity)
    // -- and its proof tests were written then too, titled (5.16). The row
    // itself was never registered, so a shipped capability sat in PLANNED
    // for a full phase. Registered during the P1c roadmap sync that noticed
    // the discrepancy: the accounting gate can only catch what has a row.
    origin: 'R',
    phase: 'P1',
    proof: 'viewer-modules.test.mjs',
    testTitle: 'the viewer ships as 20 separate module files, not one blob (5.16)',
  },

  // Phase 3 — Layout validation gates
  {
    id: '3.1',
    name: 'Proper Crossing Gate (edge-vs-edge, showcase-only)',
    proof: 'negative-fixtures.test.mjs',
    // Renamed from "Clean Flow (no edge across unrelated node)": that name
    // was inherited from doc 32's row definition, but every test below it
    // actually proves edge-vs-edge crossing (cleanCrossingProblems /
    // composition/proper-crossing), which is showcase-only. The genuinely
    // named "no edge across unrelated node" capability is
    // cleanFlowProblems / clean-flow/edge-through-node, an always-on
    // correctness invariant with its own row below (3.1b) -- it was
    // uncovered entirely until now (see the build ledger's
    // "RESIDUAL PARKED" entry). The tests and testTitles here are
    // unchanged and remain sound for what they actually test.
    //
    // Three independent proofs: the standalone checker fires on the
    // authored violation; the real CLI's `validate` under --quality
    // showcase blocks delivery of the same unmodified fixture; and the real
    // CLI's `render` -- the one path with no checker fallback -- rejects it
    // on the strength of the render-time gate (geometry.mjs's
    // clean*Problems) alone. The third is required: `validate` always runs
    // the checker as a second stage, so a `validate`-only proof cannot tell
    // "the render-time gate works" from "the render-time gate was deleted
    // and the checker caught it anyway" (see negative-fixtures.test.mjs's
    // comment above the render-proof block for the gutting proof).
    testTitle: [
      'relationship_crossings fires on a genuine proper-crossing (3.1)',
      'CLI: showcase validate blocks delivery of a genuine proper-crossing (3.1)',
      'CLI: showcase render rejects a genuine proper-crossing with composition/proper-crossing (3.1)',
    ],
  },
  {
    id: '3.1b',
    name: 'Clean Flow Gate (no edge across unrelated node)',
    proof: 'negative-fixtures.test.mjs',
    // The row 3.1 was originally named for -- and was uncovered by the
    // matrix until now. cleanFlowProblems (clean-flow/edge-through-node) is
    // an always-on correctness invariant, active regardless of
    // quality_profile (unlike 3.1-3.5, which are showcase- or
    // enforced-marker-gated) and used by all five renderers.
    //
    // It has no equivalent in scripts/check-render-output.mjs (the
    // standalone post-render checker models only the nine checks named in
    // validation-gates.test.mjs's EXPECTED_CHECKS -- crossing, corridor,
    // label clearance, border run, route rhythm, etc -- clean-flow is not
    // among them), so the checker-reimplementation leg the other five rows
    // use does not exist for this gate, and packages/core (which the
    // checker lives under) may not be modified to add one. Three
    // independent proofs stand in its place instead: a direct, in-process
    // unit test of cleanFlowProblems itself (the only "independent
    // detector" this gate has); the real CLI's `validate` under --quality
    // showcase blocking delivery of the unmodified fixture; and the real
    // CLI's `render` rejecting it on the strength of the render-time gate
    // alone, with the specific clean-flow/edge-through-node code. All three
    // are gutting-proven independently of 3.1's cleanCrossingProblems proofs.
    testTitle: [
      'cleanFlowProblems fires on an edge routed through an unrelated node (3.1b)',
      'CLI: showcase validate blocks delivery of an edge routed through an unrelated node (3.1b)',
      'CLI: showcase render rejects an edge routed through an unrelated node with clean-flow/edge-through-node (3.1b)',
    ],
  },

  {
    id: '3.11',
    name: 'showcase false-negative fix (boundary overlap)',
    // A frame-vs-frame check existed, but ALL of it sat behind the opt-in
    // deployment-ownership profile. That gate's comment justifies the
    // exclusion for the MEMBERSHIP contract, and correctly -- ordinary
    // boundaries are sets, not an ownership tree, so orthogonal scopes may
    // share some components while each contains others.
    //
    // The same `continue` also skipped the pure GEOMETRY check, which has
    // nothing to do with membership semantics. Two frames that partially
    // overlap are a visual defect whatever their memberships mean: a
    // component in the intersection sits inside both borders and the reader
    // cannot tell which owns it. Under `showcase` -- the profile whose whole
    // job is refusing compositions that merely look plausible -- that went
    // unreported.
    //
    // Containment is deliberately untouched: nesting is what boundaries are
    // FOR, and flagging it would refuse this repository's own fixtures.
    origin: 'R',
    phase: 'P1',
    proof: 'frame-composition.test.mjs',
    testTitle: '[3.11] showcase reports boundary frames that partially overlap, with no deployment profile set',
  },
  {
    id: '3.2',
    name: 'Clean Label Gate (≥4 px)',
    proof: 'negative-fixtures.test.mjs',
    testTitle: [
      'label_route_clearance fires on a label sitting under 4px from an unrelated route (3.2)',
      'CLI: showcase validate blocks delivery of a sub-4px label/route clearance (3.2)',
      'CLI: showcase render rejects a sub-4px label/route clearance with composition/label-route-clearance (3.2)',
    ],
  },
  {
    id: '3.3',
    name: 'Ambiguous Corridor Gate (≥8 px lane)',
    proof: 'negative-fixtures.test.mjs',
    testTitle: [
      'relationship_corridors fires on two unrelated relationships sharing a >=8px corridor (3.3)',
      'CLI: showcase validate blocks delivery of an ambiguous >=8px corridor (3.3)',
      'CLI: showcase render rejects an ambiguous >=8px corridor with composition/ambiguous-corridor (3.3)',
    ],
  },
  {
    id: '3.4',
    name: 'Clear Container Corridor',
    proof: 'negative-fixtures.test.mjs',
    testTitle: [
      'container_border_runs fires on a relationship that runs along a boundary border instead of crossing it (3.4)',
      'CLI: showcase validate blocks delivery of a container border run (3.4)',
      'CLI: showcase render rejects a container border run with composition/container-border-run (3.4)',
    ],
  },
  {
    id: '3.5',
    name: 'Readable Route Rhythm (8/16 px)',
    proof: 'negative-fixtures.test.mjs',
    testTitle: [
      'route_rhythm fires on a cramped sub-16px interior turn (3.5)',
      'CLI: showcase validate blocks delivery of a cramped sub-16px interior turn (3.5)',
      'CLI: showcase render rejects a cramped sub-16px interior turn with composition/short-interior-segment (3.5)',
    ],
  },
  {
    id: '3.6',
    name: 'Endpoint side contract',
    proof: 'validation-gates.test.mjs',
    testTitle: 'an authored endpoint side that the route cannot honour is rejected (3.6)',
  },
  {
    id: '3.7',
    name: 'Automatic Port Spread',
    proof: 'validation-gates.test.mjs',
    testTitle: 'automatic fan-out spreads connections onto distinct, symmetric ports (3.7)',
  },
  {
    id: '3.8',
    name: 'Grid placement validation',
    proof: 'validation-gates.test.mjs',
    testTitle: 'grid placement validation rejects two components sharing a cell (3.8)',
  },
  {
    id: '3.9',
    name: 'deployment-ownership profile',
    proof: 'validation-gates.test.mjs',
    testTitle: 'the deployment-ownership engineering profile requires region and security-group boundaries (3.9)',
  },
  {
    id: '3.10',
    name: 'Structured diagnostics + supportedFixes',
    proof: 'validation-gates.test.mjs',
    testTitle: 'every diagnostic carries a code, a message, and a supportedFixes array (3.10)',
  },

  // Phase 4 — Renderers
  {
    id: '4.1',
    name: 'Five typed renderers',
    proof: 'render-smoke.test.mjs',
    testTitle: 'all five diagram modes render from their v1-baseline fixture',
  },
  {
    id: '4.2',
    name: 'geometry.mjs (38 exports)',
    proof: 'validation-gates.test.mjs',
    testTitle: 'geometry.mjs exposes exactly 38 named exports (4.2)',
  },
  {
    id: '4.3',
    name: 'Deterministic SVG output',
    proof: 'scripts/golden.mjs',
    // scripts/golden.mjs is a plain script (digest comparison against
    // fixtures/golden/manifest.json), not a node:test file -- there is no
    // TAP output for a testTitle to match against, and the coordinator's
    // fix-round-2 instructions explicitly allow leaving a row like this
    // file-level rather than pretending a title mechanism covers it. Its
    // exit code IS the whole proof (0/5 vs 5/5 printed by the script), so
    // file-level accounting is not a weaker signal here the way it was for
    // a 21-row test file -- one script, one row, one pass/fail.
  },
  {
    id: '4.4',
    name: '4 presets x 2 themes (8 combos)',
    proof: 'preset-matrix.test.mjs',
    // The first test proves the 4-preset half of the matrix, the second
    // the 2-theme half; together they are the "8 combos" claim.
    testTitle: [
      'every preset renders for every mode and declares itself on the document root',
      'both colour modes are defined in every rendered artifact',
    ],
  },
  {
    id: '4.5',
    name: 'Style Picker + S cycle',
    proof: 'preset-matrix.test.mjs',
    testTitle: 'the "S" key cycles the visual style via Mirofy.preset.cycle (4.5)',
  },
  {
    id: '4.6',
    name: '23 keyframe animations, 34 transitions',
    proof: 'validation-gates.test.mjs',
    testTitle: 'the shipped template carries 23 keyframe animations and 34 transition declarations (4.6)',
  },
  {
    id: '4.7',
    name: 'Semantic sigils',
    proof: 'validation-gates.test.mjs',
    testTitle: 'rendered nodes carry semantic sigils (4.7)',
  },
  {
    id: '4.8',
    name: 'Semantic Flow Tokens',
    proof: 'validation-gates.test.mjs',
    testTitle: 'the viewer runtime ships the Semantic Flow Token machinery in every artifact (4.8)',
  },
  {
    id: '4.9',
    name: 'Text fitting + legend',
    proof: 'validation-gates.test.mjs',
    // Legend half shared with 1.9; text-fitting half is its own test.
    testTitle: [
      'legend mode "hidden" omits the legend; "all" includes kinds absent from the diagram (1.9, 4.9)',
      'node text shrinks toward a legible minimum instead of overflowing (4.9)',
    ],
  },
  {
    id: '4.10',
    name: 'Zero SVG filters/gradients',
    proof: 'validation-gates.test.mjs',
    testTitle: 'no rendered mode emits an SVG filter or gradient element (4.10)',
  },
  {
    id: '4.12',
    name: 'Generated design tokens',
    // check-template.mjs (byte-identity of the rebuilt template against
    // packages/core/assets/template.html) is the real proof that the
    // generated palette reproduces the hand-written blocks exactly; it
    // isn't a node:test file, so it can't be named here. This row's
    // testTitle instead asserts the token *model* is coherent -- 10 blocks
    // (grew from 8 in P1a Task 7's okabe-ito dark/light pair), 32 distinct
    // properties -- which the byte check alone can't show.
    proof: 'tokens.test.mjs',
    testTitle: 'the token model covers 12 blocks and 32 distinct properties (4.12)',
  },
  {
    id: '4.13',
    name: 'Okabe-Ito colour-blind-safe preset',
    // The source project declined this preset on maintenance grounds: the palette was
    // eight duplicated hand-written CSS blocks. Task 6's generated token
    // model turned it into a data change; this row proves the published
    // Okabe-Ito hues actually land in the token model, not merely that
    // "some colour" is set.
    proof: 'tokens.test.mjs',
    testTitle: 'the Okabe-Ito palette uses the published CVD-safe hues (4.13)',
  },

  // Phase 5 — Viewer (interactive; proved only in the CI browser job, Task 9).
  // Each row's testTitle is verified individually against the TAP output of
  // viewer.browser.test.mjs -- see the note above and that file's own
  // header comment. 5.10 and 5.11 assert only the core mechanism named in
  // their row (chapter activation / Director Strip; the live<->still
  // switch) -- the fuller "Horizon / Follow Camera" and "Settled Flow"
  // sub-behaviours named in those rows are not separately asserted; this is
  // deliberate partial-but-real coverage, not a claim of exhaustive proof.
  {
    id: '5.1',
    name: 'Pan / zoom / reset · Semantic Camera',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.1] Pan/zoom/reset (Semantic Camera) actually changes the rendered svg scale',
  },
  {
    id: '5.2',
    name: 'Node Finder (search)',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.2] Node Finder toggles open and closed via btn-node-finder',
  },
  {
    id: '5.3',
    name: 'Focus + Semantic Passport',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.3] Focus + Semantic Passport opens on a real node click and reports the clicked node id',
  },
  {
    id: '5.4',
    name: 'Intent Trace',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.4] Intent Trace lights up on real keyboard focus of a node',
  },
  {
    id: '5.5',
    name: 'Route Probe + Route Journey',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.5] Route Probe toggles open and closed via btn-route-probe',
  },
  {
    id: '5.6',
    name: 'Authored Reachability (up/downstream)',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.6] Authored Reachability (upstream) renders a node/link-count receipt on the focused node',
  },
  {
    id: '5.7',
    name: 'Semantic Lens',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.7] Semantic Lens toggles open and closed via btn-semantic-lens',
  },
  {
    id: '5.8',
    name: 'Semantic Radar (minimap)',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.8] Semantic Radar (minimap) toggles open and closed via btn-overview-map',
  },
  {
    id: '5.9',
    name: 'Guided Views + Named Chapter Rail',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.9] guided views leave their boot-time hidden state once meta.views is populated',
  },
  {
    id: '5.10',
    name: 'Story Beats · Director Strip · Horizon · Follow Camera',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.10] activating a guided-view chapter sets data-story-active and builds the Director Strip trail',
  },
  {
    id: '5.11',
    name: 'Motion Governor + Settled Flow',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.11] Motion Governor flips html[data-motion] between live and still via btn-motion',
  },
  {
    id: '5.12',
    name: 'Presentation Stage',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.12] Presentation Stage sets and clears html[data-present] via btn-present',
  },
  {
    id: '5.13',
    name: 'Deep links (view/focus/route/reach/relation/beat)',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    testTitle: '[5.13] a hash-based focus deep link restores the Semantic Passport on load',
  },
  {
    id: '5.14',
    name: 'Print + embed modes',
    proof: 'viewer.browser.test.mjs',
    browser: true,
    // Two mechanisms (embed query-param and print media) share one row;
    // both titled tests must pass for this row to count. See
    // scripts/conformance.mjs, which accepts an array here for exactly
    // this case.
    testTitle: [
      '[5.14a] embed mode (?embed=1) sets data-embed and actually hides the toolbar chrome',
      '[5.14b] print media emulation hides the toolbar chrome',
    ],
  },
  {
    id: '5.17',
    name: 'data-* contract (renderer -> viewer/validator/tooling consumers)',
    // Not imported from the source project: added in P1a to close a gap the
    // import never covered -- nothing previously checked that renderer-
    // emitted data-* attributes agree with what the viewer, the post-render
    // validator, and the delta/visual-check tooling actually read.
    origin: 'N',
    phase: 'P1',
    proof: 'contract.test.mjs',
    testTitle: 'every data-* a renderer emits has a declared consumer (5.17)',
  },
  {
    id: '5.19',
    name: 'axe-core accessibility gate (all five visual presets)',
    // Not imported from the source project: added in P1a (Task 8) to prove
    // 37-ENGINEERING-STANDARDS.md's accessibility-floor commitment against a
    // real rendered artifact in real Chrome, rather than leaving it a
    // restated promise. browser: true for the same reason as the 14 rows
    // above -- accessibility.browser.test.mjs needs a real browser to run
    // axe-core, and is deferred-by-id (never silently "passing") without
    // MIROFY_CHROME.
    origin: 'N',
    phase: 'P1',
    proof: 'accessibility.browser.test.mjs',
    browser: true,
    testTitle: '[5.19] axe-core reports no serious or critical violations in the classic preset',
  },

  // Phase 6 — Delivery
  {
    id: '6.1',
    name: 'Atomic deliver + SHA-256 receipts',
    proof: 'delivery.test.mjs',
    // Two tests: SHA-256 receipt correctness, and atomicity (never
    // clobbers on a failed delivery). Both are the "Atomic + SHA-256" claim.
    testTitle: [
      'deliver writes a receipt whose SHA-256 hashes match the written files exactly (6.1)',
      'deliver never clobbers a previously delivered artifact when given invalid input, and leaves no staging directory (6.1)',
    ],
  },
  {
    id: '6.2',
    name: 'Last-good preview server',
    proof: 'delivery.test.mjs',
    testTitle: 'the preview server keeps serving the last verified artifact when a later edit becomes invalid (6.2)',
  },
  {
    id: '6.3',
    name: 'visual-check (4 viewports, pending)',
    proof: 'delivery.test.mjs',
    // Its proof file is delivery.test.mjs (a non-browser suite most of the
    // time), but the row's own test spawns the real `mirofy visual-check`
    // CLI, which needs a real Chrome/Chromium to inspect anything -- without
    // one, the test calls t.skip() rather than asserting. That makes 6.3
    // browser-dependent exactly like the 14 Phase-5 rows, even though it
    // does not live in viewer.browser.test.mjs; scripts/conformance.mjs
    // treats a `browser: true` row inside a shared suite the same way it
    // treats one in a browser-only suite (deferred by id, never silently
    // counted as passing, and never a title-check failure while deferred).
    // The imported visual-check CLI reads MIROFY_CHROME directly, which is
    // the same switch the other 14 gate on, so this row's Chrome discovery
    // needs no wiring of its own.
    browser: true,
    testTitle: 'visual-check inspects 4 viewports and reports its review as pending, never as passed (6.3)',
  },
  {
    id: '6.4',
    name: 'Exports: PNG·JPEG·WebP·SVG·WebM',
    proof: 'export-surface.test.mjs',
    // Partial coverage: the test asserts the six `<button data-format="…">`
    // elements are present in every rendered artifact's markup. It does not
    // click a button and does not prove the export dispatcher (template.
    // html's `menu.addEventListener('click', ...)` handler) actually runs --
    // no-opping that handler leaves this test green, because the buttons
    // are rendered regardless of whether anything listens for clicks on
    // them. Proving the click path would need a real browser; no test
    // anywhere in this repo does that today for exports. The test title
    // says "declares markup", not "exposes" or "wired", for this reason.
    note: 'Proves the six export-format buttons are present in markup, not that clicking one actually triggers an export. See export-surface.test.mjs\'s header comment.',
    testTitle: 'every rendered artifact declares markup for all six export formats (data-format buttons present; click dispatch not exercised)',
  },
  {
    id: '6.5',
    name: 'Share Card + Route + Reach cards',
    proof: 'export-surface.test.mjs',
    // Shared with 6.6: the same test checks every action button, share-card
    // and clipboard alike, in one pass -- markup presence only, same caveat
    // as 6.4 above (no-opping the click dispatcher leaves this green too).
    note: 'Proves the route/reach/copy share-card buttons carry the expected data-action markup, not that clicking one actually builds or copies a share card. See export-surface.test.mjs\'s header comment.',
    testTitle: 'share-card and clipboard action buttons carry the expected data-action markup in every artifact (present; click dispatch not exercised)',
  },
  {
    id: '6.6',
    name: 'Clipboard copy (PNG, share card)',
    proof: 'export-surface.test.mjs',
    note: 'Proves the copy/copy-share-card buttons carry the expected data-action markup, not that clicking one actually writes to the clipboard. See export-surface.test.mjs\'s header comment.',
    testTitle: 'share-card and clipboard action buttons carry the expected data-action markup in every artifact (present; click dispatch not exercised)',
  },
  {
    id: '6.7',
    name: 'compare (Before/Delta/After + receipt)',
    proof: 'delivery.test.mjs',
    testTitle: 'compare produces a Before/After delta receipt whose hashes match the real input files (6.7)',
  },
  {
    id: '6.8',
    name: 'CLI: render·validate·deliver·check·guide·brands·doctor·demo',
    proof: 'delivery.test.mjs',
    testTitle: 'the CLI exposes render, validate, deliver, check, guide, brands, doctor, and demo (6.8)',
  },
  {
    id: '6.9',
    name: 'Zero runtime dependencies',
    proof: 'delivery.test.mjs',
    testTitle: 'every workspace package.json has zero runtime dependencies (6.9)',
  },
  {
    id: '6.10',
    name: 'Deterministic ZIP packaging',
    proof: null,
    note: 'The source project\'s packaging tooling (scripts/build-zip.sh, scripts/package-smoke.mjs, .github/workflows/release.yml) was not part of Task 4\'s import scope (renderers, schemas, viewer, CLI only) and no task in this 11-task P0 plan (see tasks 8-11) adds ZIP packaging. There is no artifact in product-p0 to assert against. Deferred beyond P0 foundation.',
  },
];
