// The roadmap side of docs/IMPLEMENTATION-STATUS.md's PLANNED section, plus
// the parser and default path scripts/check-roadmap-snapshot.mjs uses to
// verify that side hasn't drifted.
//
// ROADMAP_SNAPSHOT is a frozen copy of every row in the sibling archify
// repo's analysis/future/32-PARITY-AND-FEATURE-MATRIX.md ("# | Capability |
// Origin | Phase | Notes" tables) -- 118 rows, extracted with
// parseRoadmapTable below on 2026-08-29.
//
// That date is the best anchor available, not a verifiable one: the
// sibling repo's entire analysis/ tree is untracked (`git status
// --porcelain -- analysis` there returns `?? analysis/`, 0 files under
// `git ls-files analysis`), so there is no revision to pin this snapshot
// to the way scripts/check-provenance.mjs pins the harvest. If the live
// document changes, nothing here notices on its own.
//
// This snapshot is embedded rather than read live because
// scripts/status.mjs's `status:check` is wired into `npm run check`, which
// CI runs with only this repo checked out -- the sibling repo, and this
// file with it, is simply absent there.
//
// The snapshot can go stale silently: NOTHING re-checks it automatically.
// Run `npm run check:roadmap` by hand (an operator command, deliberately
// not part of `npm run check`, the same as `gallery` and `docs:pdf` --
// see its own header) whenever the live roadmap document might have
// changed. It re-parses the live file with the same parseRoadmapTable
// below and diffs it against ROADMAP_SNAPSHOT by id, reporting exactly
// what added, removed, or changed. If it reports drift, hand-edit the
// array below to match, then rerun `npm run status`.
import fs from 'node:fs';

export const DEFAULT_ROADMAP_PATH = 'L:/Projects/archify/analysis/future/32-PARITY-AND-FEATURE-MATRIX.md';

// The exact extraction rule ROADMAP_SNAPSHOT below was produced with.
// scripts/check-roadmap-snapshot.mjs calls this same function against the
// live file, so "the same parse the snapshot came from" is one function,
// not a re-typed approximation of one.
//
// Matches a roadmap table row: "| <id> | <name> | **<origin>** | <phase> |
// ...". id is N or N.N or N.Na (e.g. "3.1b"); origin is one of H, R, N,
// H→R, optionally wrapped in `**`; phase is P0-P9, optionally wrapped in
// `**`. Bold markers, backticks, and the "⭐" callout marker are stripped
// from the name; surrounding whitespace is trimmed.
/** @type {(text: string) => Array<[string, string, string, string]>} */
export function parseRoadmapTable(text) {
  /** @type {Array<[string, string, string, string]>} */
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*([0-9]+(?:\.[0-9]+[a-z]?)?)\s*\|\s*(.+?)\s*\|\s*\*{0,2}(H→R|H|R|N)\*{0,2}\s*\|\s*\*{0,2}(P[0-9])\*{0,2}\s*\|/,
    );
    if (!match) continue;
    const name = match[2].replace(/\*\*/g, '').replace(/`/g, '').replace(/⭐/g, '').trim();
    rows.push([match[1], name, match[3], match[4]]);
  }
  return rows;
}

export function readRoadmapSnapshot(filePath) {
  return parseRoadmapTable(fs.readFileSync(filePath, 'utf8'));
}

/** @type {Array<[string, string, string, string]>} */
export const ROADMAP_SNAPSHOT = [
  ["1.1", "Five typed diagram domains", "H", "P0"],
  ["1.2", "Typed IR, additionalProperties:false", "H", "P0"],
  ["1.3", "JSON schemas + pre-generated validators", "H", "P0"],
  ["1.4", "Grid placement (row/col)", "H", "P0"],
  ["1.5", "Structural placement (lane/col/stage)", "H", "P0"],
  ["1.6", "Guided views / chapters (≤5)", "H", "P0"],
  ["1.7", "quality_profile standard/showcase", "H", "P0"],
  ["1.8", "Brand marks (107, digest-pinned)", "H", "P0"],
  ["1.9", "Legend modes (auto/all/hidden)", "H", "P0"],
  ["1.10", "Agent contract (SKILL.md)", "H→R", "P1"],
  ["1.11", "Explicit pos:[x,y] authoring", "R", "P2"],
  ["1.12", "Stable semantic IDs", "R", "P1"],
  ["1.13", "Mermaid import", "N", "P1"],
  ["1.14", "System model (model.json)", "N", "P1"],
  ["1.15", "First-class engineering metadata", "N", "P1"],
  ["1.16", "Recipe library (100)", "N", "P3"],
  ["1.17", "Human overrides", "N", "P1"],
  ["2.1", "Repository evidence (revision-pinned)", "H", "P0"],
  ["2.2", "Verified Source Beacon (SRC n)", "H", "P0"],
  ["2.3", "Host-agnostic evidence", "N", "P1"],
  ["2.4", "Evidence on relationships", "N", "P1"],
  ["2.5", "Six-class provenance", "N", "P1"],
  ["2.6", "Multi-repo evidence identity", "N", "P2"],
  ["2.7", "Evidence graph store + query", "N", "P1"],
  ["2.8", "Scanner: TS/JS imports", "N", "P1"],
  ["2.9", "Scanner: workspace/package topology", "N", "P1"],
  ["2.10", "Scanner: HTTP routes", "N", "P1"],
  ["2.11", "Scanner: OpenAPI / gRPC", "N", "P4"],
  ["2.12", "Scanner: Docker Compose", "N", "P4"],
  ["2.13", "Scanner: Terraform / K8s", "N", "P4"],
  ["2.14", "Scanner: DB clients", "N", "P4"],
  ["2.15", "Scanner: queue pub/sub", "N", "P4"],
  ["2.16", "Additional languages", "N", "P4"],
  ["2.17", "Honest coverage report", "N", "P1"],
  ["3.1", "Clean Flow (no edge across unrelated node)", "H", "P0"],
  ["3.2", "Clean Label Gate (≥4 px)", "H", "P0"],
  ["3.3", "Ambiguous Corridor Gate (≥8 px lane)", "H", "P0"],
  ["3.4", "Clear Container Corridor", "H", "P0"],
  ["3.5", "Readable Route Rhythm (8/16 px)", "H", "P0"],
  ["3.6", "Endpoint side contract", "H", "P0"],
  ["3.7", "Automatic Port Spread", "H", "P0"],
  ["3.8", "Grid placement validation", "H", "P0"],
  ["3.9", "deployment-ownership profile", "H", "P0"],
  ["3.10", "Structured diagnostics + supportedFixes", "H", "P0"],
  ["3.11", "showcase false-negative fix", "R", "P1"],
  ["3.12", "Constraint solver", "N", "P2"],
  ["3.13", "repair --safe", "N", "P2"],
  ["3.14", "Calibrated thresholds", "N", "P2"],
  ["3.15", "Architecture assertions (assert)", "N", "P5"],
  ["4.1", "Five typed renderers", "H", "P0"],
  ["4.2", "geometry.mjs (38 exports)", "H", "P0"],
  ["4.3", "Deterministic SVG output", "H", "P0"],
  ["4.4", "4 presets × 2 themes (8 combos)", "H", "P0"],
  ["4.5", "Style Picker + S cycle", "H", "P0"],
  ["4.6", "23 keyframe animations, 34 transitions", "H", "P0"],
  ["4.7", "Semantic sigils", "H", "P0"],
  ["4.8", "Semantic Flow Tokens", "H", "P0"],
  ["4.9", "Text fitting + legend", "H", "P0"],
  ["4.10", "Zero SVG filters/gradients", "H", "P0"],
  ["4.11", "Shared compiler pipeline", "R", "P1"],
  ["4.12", "Generated design tokens", "R", "P1"],
  ["4.13", "Colour-blind preset (Okabe–Ito)", "N", "P1"],
  ["4.14", "Evidence-first visual language", "N", "P1"],
  ["4.15", "Tree-shaken artifacts", "N", "P3"],
  ["5.1", "Pan / zoom / reset · Semantic Camera", "H", "P0"],
  ["5.2", "Node Finder (search)", "H", "P0"],
  ["5.3", "Focus + Semantic Passport", "H", "P0"],
  ["5.4", "Intent Trace", "H", "P0"],
  ["5.5", "Route Probe + Route Journey", "H", "P0"],
  ["5.6", "Authored Reachability (up/downstream)", "H", "P0"],
  ["5.7", "Semantic Lens", "H", "P0"],
  ["5.8", "Semantic Radar (minimap)", "H", "P0"],
  ["5.9", "Guided Views + Named Chapter Rail", "H", "P0"],
  ["5.10", "Story Beats · Director Strip · Horizon · Follow Camera", "H", "P0"],
  ["5.11", "Motion Governor + Settled Flow", "H", "P0"],
  ["5.12", "Presentation Stage", "H", "P0"],
  ["5.13", "Deep links (view/focus/route/reach/relation/beat)", "H", "P0"],
  ["5.14", "Print + embed modes", "H", "P0"],
  ["5.15", "Runtime i18n (en, zh-CN)", "H→R", "P3"],
  ["5.16", "Modularized viewer source", "R", "P1"],
  ["5.17", "Renderer↔viewer contract (contract.mjs)", "N", "P1"],
  ["5.18", "Browser tests in CI", "N", "P0"],
  ["5.19", "axe-core accessibility gate", "N", "P1"],
  ["5.20", "Evidence Passport (edges + provenance)", "N", "P1"],
  ["5.21", "Nudge-to-patch", "N", "P3"],
  ["5.22", "Hierarchical view navigation", "N", "P4"],
  ["6.1", "Atomic deliver + SHA-256 receipts", "H", "P0"],
  ["6.2", "Last-good preview server", "H", "P0"],
  ["6.3", "visual-check (4 viewports, pending)", "H", "P0"],
  ["6.4", "Exports: PNG·JPEG·WebP·SVG·WebM", "H", "P0"],
  ["6.5", "Share Card + Route + Reach cards", "H", "P0"],
  ["6.6", "Clipboard copy (PNG, share card)", "H", "P0"],
  ["6.7", "compare (Before/Delta/After + receipt)", "H", "P0"],
  ["6.8", "CLI: render·validate·deliver·check·guide·brands·doctor·demo", "H", "P0"],
  ["6.9", "Zero runtime dependencies", "H", "P0"],
  ["6.10", "Deterministic ZIP packaging", "N", "P1"],
  ["6.11", "<product> . zero-config entry", "N", "P1"],
  ["6.12", "Attribution on artifacts", "N", "P3"],
  ["6.13", "--format svg-static (~20 KB)", "N", "P3"],
  ["6.14", "publish → user's own gh-pages", "N", "P3"],
  ["6.15", "npm distribution (scoped)", "N", "P3"],
  ["6.16", "Playground (client-side, GH Pages)", "N", "P3"],
  ["6.17", "CI action (drift + delta on PRs)", "N", "P5"],
  ["6.18", "MCP server", "N", "P5"],
  ["6.19", "explain (CLI graph queries)", "N", "P5"],
  ["6.20", "timeline (evolution across git history)", "N", "P5"],
  ["6.21", "VS Code extension", "N", "P5"],
  ["6.22", "Compliance profiles", "N", "P6"],
  ["6.23", "Miro board export", "N", "P3"],
  ["6.24", "Miro round-trip (annotations back)", "N", "P5"],
  ["6.25", "draw.io / Excalidraw export", "N", "P5"],
  ["7.1", "No generated artifacts in git (manifest + CI build)", "N", "P0"],
  ["7.2", "Green tests on Windows/macOS/Linux", "N", "P0"],
  ["7.3", "ESLint + JSDoc checkJs", "N", "P0"],
  ["7.4", "SECURITY.md, SHA-pinned actions, zero CVEs", "N", "P0"],
  ["7.5", "Real Now/Next/Later roadmap", "N", "P0"],
  ["7.6", "Conformance/parity suite", "N", "P0"],
  ["7.7", "Size budget gate", "N", "P0"],
];
