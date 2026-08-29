// One entry per harvested (H) row in analysis/future/32-PARITY-AND-FEATURE-MATRIX.md,
// as extracted mechanically into
// .superpowers/sdd/2026-08-29-p0-foundation/harvested-rows.md: 55 pure-H rows,
// plus row 3.1b (added post-P0 to close the mislabelled-row-plus-coverage-gap
// residual recorded in docs/P0-BUILD-LEDGER.md) -- 56 rows total.
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
export const HARVESTED_ROWS = [
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
    testTitle: '[2.2] Verified Source Beacon renders "SRC n" on a node with verified repository evidence, and stays off a node without it',
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
    // uncovered entirely until now (see docs/P0-BUILD-LEDGER.md's
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
    testTitle: 'the token model covers 10 blocks and 32 distinct properties (4.12)',
  },
  {
    id: '4.13',
    name: 'Okabe-Ito colour-blind-safe preset',
    // Upstream declined this preset on maintenance grounds: the palette was
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
    // Not harvested from the ancestor: added in P1a to close a gap the
    // harvest never covered -- nothing previously checked that renderer-
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
    // Not harvested from the ancestor: added in P1a (Task 8) to prove
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
    // The harvested visual-check CLI reads MIROFY_CHROME directly, which is
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
    note: 'The ancestor\'s packaging tooling (scripts/build-zip.sh, scripts/package-smoke.mjs, .github/workflows/release.yml) was not part of Task 4\'s harvest scope (renderers, schemas, viewer, CLI only) and no task in this 11-task P0 plan (see tasks 8-11) adds ZIP packaging. There is no artifact in product-p0 to assert against. Deferred beyond P0 foundation.',
  },
];
