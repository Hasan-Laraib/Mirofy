// One entry per harvested (H) row in analysis/future/32-PARITY-AND-FEATURE-MATRIX.md,
// as extracted mechanically into
// .superpowers/sdd/2026-08-29-p0-foundation/harvested-rows.md: 55 pure-H rows.
// Row 1.10 is H->R (rebuilt in P1) and is intentionally absent from this list.
//
// `proof` names the test file (or script) that guarantees the row.
// `browser: true` means the proof runs only in the CI browser job (Task 9),
// against packages/conformance/test/viewer.browser.test.mjs. Such rows are
// never counted as passing by scripts/conformance.mjs until PRODUCT_CHROME
// is set.
// `proof: null` marks a row P0 genuinely cannot prove yet; `note` says why.
// A row with no real proof is never silently listed as covered.
export const HARVESTED_ROWS = [
  // Phase 1 — Authoring surface
  { id: '1.1', name: 'Five typed diagram domains', proof: 'render-smoke.test.mjs' },
  { id: '1.2', name: 'Typed IR, additionalProperties:false', proof: 'validation-gates.test.mjs' },
  { id: '1.3', name: 'JSON schemas + pre-generated validators', proof: 'validation-gates.test.mjs' },
  { id: '1.4', name: 'Grid placement (row/col)', proof: 'validation-gates.test.mjs' },
  { id: '1.5', name: 'Structural placement (lane/col/stage)', proof: 'validation-gates.test.mjs' },
  { id: '1.6', name: 'Guided views / chapters (≤5)', proof: 'validation-gates.test.mjs' },
  { id: '1.7', name: 'quality_profile standard/showcase', proof: 'validation-gates.test.mjs' },
  { id: '1.8', name: 'Brand marks (107, digest-pinned)', proof: 'validation-gates.test.mjs' },
  { id: '1.9', name: 'Legend modes (auto/all/hidden)', proof: 'validation-gates.test.mjs' },

  // Phase 2 — Evidence
  { id: '2.1', name: 'Repository evidence (revision-pinned)', proof: 'validation-gates.test.mjs' },
  { id: '2.2', name: 'Verified Source Beacon (SRC n)', proof: 'validation-gates.test.mjs' },

  // Phase 3 — Layout validation gates
  { id: '3.1', name: 'Clean Flow (no edge across unrelated node)', proof: 'negative-fixtures.test.mjs' },
  { id: '3.2', name: 'Clean Label Gate (≥4 px)', proof: 'negative-fixtures.test.mjs' },
  { id: '3.3', name: 'Ambiguous Corridor Gate (≥8 px lane)', proof: 'negative-fixtures.test.mjs' },
  { id: '3.4', name: 'Clear Container Corridor', proof: 'negative-fixtures.test.mjs' },
  { id: '3.5', name: 'Readable Route Rhythm (8/16 px)', proof: 'negative-fixtures.test.mjs' },
  { id: '3.6', name: 'Endpoint side contract', proof: 'validation-gates.test.mjs' },
  { id: '3.7', name: 'Automatic Port Spread', proof: 'validation-gates.test.mjs' },
  { id: '3.8', name: 'Grid placement validation', proof: 'validation-gates.test.mjs' },
  { id: '3.9', name: 'deployment-ownership profile', proof: 'validation-gates.test.mjs' },
  { id: '3.10', name: 'Structured diagnostics + supportedFixes', proof: 'validation-gates.test.mjs' },

  // Phase 4 — Renderers
  { id: '4.1', name: 'Five typed renderers', proof: 'render-smoke.test.mjs' },
  { id: '4.2', name: 'geometry.mjs (38 exports)', proof: 'validation-gates.test.mjs' },
  { id: '4.3', name: 'Deterministic SVG output', proof: 'scripts/golden.mjs' },
  { id: '4.4', name: '4 presets x 2 themes (8 combos)', proof: 'preset-matrix.test.mjs' },
  { id: '4.5', name: 'Style Picker + S cycle', proof: 'preset-matrix.test.mjs' },
  { id: '4.6', name: '23 keyframe animations, 34 transitions', proof: 'validation-gates.test.mjs' },
  { id: '4.7', name: 'Semantic sigils', proof: 'validation-gates.test.mjs' },
  { id: '4.8', name: 'Semantic Flow Tokens', proof: 'validation-gates.test.mjs' },
  { id: '4.9', name: 'Text fitting + legend', proof: 'validation-gates.test.mjs' },
  { id: '4.10', name: 'Zero SVG filters/gradients', proof: 'validation-gates.test.mjs' },

  // Phase 5 — Viewer (interactive; proved only in the CI browser job, Task 9)
  { id: '5.1', name: 'Pan / zoom / reset · Semantic Camera', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.2', name: 'Node Finder (search)', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.3', name: 'Focus + Semantic Passport', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.4', name: 'Intent Trace', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.5', name: 'Route Probe + Route Journey', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.6', name: 'Authored Reachability (up/downstream)', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.7', name: 'Semantic Lens', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.8', name: 'Semantic Radar (minimap)', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.9', name: 'Guided Views + Named Chapter Rail', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.10', name: 'Story Beats · Director Strip · Horizon · Follow Camera', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.11', name: 'Motion Governor + Settled Flow', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.12', name: 'Presentation Stage', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.13', name: 'Deep links (view/focus/route/reach/relation/beat)', proof: 'viewer.browser.test.mjs', browser: true },
  { id: '5.14', name: 'Print + embed modes', proof: 'viewer.browser.test.mjs', browser: true },

  // Phase 6 — Delivery
  { id: '6.1', name: 'Atomic deliver + SHA-256 receipts', proof: 'delivery.test.mjs' },
  { id: '6.2', name: 'Last-good preview server', proof: 'delivery.test.mjs' },
  { id: '6.3', name: 'visual-check (4 viewports, pending)', proof: 'delivery.test.mjs' },
  { id: '6.4', name: 'Exports: PNG·JPEG·WebP·SVG·WebM', proof: 'export-surface.test.mjs' },
  { id: '6.5', name: 'Share Card + Route + Reach cards', proof: 'export-surface.test.mjs' },
  { id: '6.6', name: 'Clipboard copy (PNG, share card)', proof: 'export-surface.test.mjs' },
  { id: '6.7', name: 'compare (Before/Delta/After + receipt)', proof: 'delivery.test.mjs' },
  { id: '6.8', name: 'CLI: render·validate·deliver·check·guide·brands·doctor·demo', proof: 'delivery.test.mjs' },
  { id: '6.9', name: 'Zero runtime dependencies', proof: 'delivery.test.mjs' },
  {
    id: '6.10',
    name: 'Deterministic ZIP packaging',
    proof: null,
    note: 'The ancestor\'s packaging tooling (scripts/build-zip.sh, scripts/package-smoke.mjs, .github/workflows/release.yml) was not part of Task 4\'s harvest scope (renderers, schemas, viewer, CLI only) and no task in this 11-task P0 plan (see tasks 8-11) adds ZIP packaging. There is no artifact in product-p0 to assert against. Deferred beyond P0 foundation.',
  },
];
