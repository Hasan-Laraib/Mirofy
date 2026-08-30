// Generates docs/IMPLEMENTATION-STATUS.md -- the operator's "what is
// actually built" record -- from packages/conformance/src/matrix.mjs (the
// only machine-readable record of what is actually proved) plus a committed
// snapshot of the roadmap (analysis/future/32-PARITY-AND-FEATURE-MATRIX.md
// in the sibling archify repo) for rows that have not landed a matrix row
// yet.
//
// State is derived, never asserted:
//   - a row with proof: null is UNPROVEN (matrix.mjs says why, in `note`);
//   - a row with browser: true is SHIPPED (browser-proved) -- its test only
//     runs in the CI browser job, or locally with MIROFY_CHROME set;
//   - any other row with a proof is SHIPPED.
// Rows the roadmap names that matrix.mjs does not yet carry are PLANNED --
// this is where every later P1b task's own row sits until its task lands,
// which is what keeps this file honest rather than aspirational.
//
// Run `npm run status` after any change to matrix.mjs (a task landing moves
// exactly one row from PLANNED to SHIPPED/UNPROVEN). `npm run status:check`
// (wired into `npm run check`, immediately after lint) regenerates into
// memory and diffs against the committed file, so a stale status file fails
// the build instead of quietly lying.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARVESTED_ROWS } from '../packages/conformance/src/matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const OUT_PATH = path.join(repoRoot, 'docs/IMPLEMENTATION-STATUS.md');

// Snapshot of every row in analysis/future/32-PARITY-AND-FEATURE-MATRIX.md's
// own tables -- 118 capabilities, mechanically extracted from that
// document's "# | Capability | Origin | Phase | Notes" tables on 2026-08-29
// (the date the roadmap doc itself was last updated; see its own "Totals"
// line). Not read live from that file: the roadmap lives in the sibling
// archify repository, which CI never checks out, and `status:check` runs in
// CI as part of `npm run check`. If the roadmap table adds, renames, or
// re-phases a row, re-extract this snapshot by hand -- there is no
// mechanical link across the repo boundary to keep it honest automatically.
/** @type {Array<[string, string, string, string]>} */
const ROADMAP_SNAPSHOT = [
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

const mdEscape = (value) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\|/g, '\\|')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function stateOf(row) {
  if (row.proof === null) return 'UNPROVEN';
  if (row.browser) return 'SHIPPED (browser-proved)';
  return 'SHIPPED';
}

const roadmapById = new Map(ROADMAP_SNAPSHOT.map(([id, name, origin, phase]) => [id, { name, origin, phase }]));
const matrixIds = new Set(HARVESTED_ROWS.map((row) => row.id));

function originOf(row) {
  return row.origin ?? roadmapById.get(row.id)?.origin ?? 'H';
}
function phaseOf(row) {
  return row.phase ?? roadmapById.get(row.id)?.phase ?? 'P0';
}

const shippedRows = HARVESTED_ROWS.filter((row) => row.proof !== null);
const browserProvedRows = shippedRows.filter((row) => row.browser);
const unprovenRows = HARVESTED_ROWS.filter((row) => row.proof === null);
const plannedRows = ROADMAP_SNAPSHOT.filter(([id]) => !matrixIds.has(id));

function render() {
  const lines = [];
  lines.push('# Implementation Status');
  lines.push('');
  lines.push('Generated by `node scripts/status.mjs` from `packages/conformance/src/matrix.mjs`');
  lines.push('(SHIPPED / UNPROVEN) and a committed snapshot of the roadmap,');
  lines.push('`analysis/future/32-PARITY-AND-FEATURE-MATRIX.md` (PLANNED -- rows the roadmap');
  lines.push('names that do not yet have a row of their own in the matrix).');
  lines.push('');
  lines.push('Do not hand-edit this file -- regenerate it with `npm run status`.');
  lines.push('`npm run status:check` (part of `npm run check`) fails the build if this file');
  lines.push('has drifted from what the matrix and the roadmap snapshot would produce.');
  lines.push('');
  lines.push(
    `**Totals:** ${shippedRows.length} SHIPPED (${browserProvedRows.length} browser-proved), `
    + `${unprovenRows.length} UNPROVEN, ${plannedRows.length} PLANNED.`,
  );
  lines.push('');
  lines.push('## Shipped & unproven — from the conformance matrix');
  lines.push('');
  lines.push('| ID | Name | Origin | Phase | State | Proof |');
  lines.push('|---|---|---|---|---|---|');
  for (const row of HARVESTED_ROWS) {
    const proof = row.proof === null ? `_none — ${mdEscape(row.note || 'no assertion exists')}_` : `\`${mdEscape(row.proof)}\``;
    lines.push(
      `| ${mdEscape(row.id)} | ${mdEscape(row.name)} | ${mdEscape(originOf(row))} | ${mdEscape(phaseOf(row))} `
      + `| ${stateOf(row)} | ${proof} |`,
    );
  }
  lines.push('');
  lines.push('## Planned — named in the roadmap, not yet in the matrix');
  lines.push('');
  lines.push('| ID | Name | Origin | Phase |');
  lines.push('|---|---|---|---|');
  for (const [id, name, origin, phase] of plannedRows) {
    lines.push(`| ${mdEscape(id)} | ${mdEscape(name)} | ${mdEscape(origin)} | ${mdEscape(phase)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const generated = render();

if (process.argv.includes('--check')) {
  let committed;
  try {
    committed = fs.readFileSync(OUT_PATH, 'utf8');
  } catch {
    console.error(`status:check: ${path.relative(repoRoot, OUT_PATH)} does not exist. Run \`npm run status\`.`);
    process.exit(1);
  }
  if (committed === generated) {
    console.log(`status:check: ${path.relative(repoRoot, OUT_PATH)} is up to date.`);
    process.exit(0);
  }
  console.error(`status:check: ${path.relative(repoRoot, OUT_PATH)} is stale -- committed content does not match what scripts/status.mjs would generate.`);
  const committedLines = committed.split('\n');
  const generatedLines = generated.split('\n');
  const limit = Math.max(committedLines.length, generatedLines.length);
  for (let i = 0; i < limit; i += 1) {
    if (committedLines[i] !== generatedLines[i]) {
      console.error(`  first difference at line ${i + 1}:`);
      console.error(`    committed:  ${JSON.stringify(committedLines[i] ?? '<eof>')}`);
      console.error(`    regenerated: ${JSON.stringify(generatedLines[i] ?? '<eof>')}`);
      break;
    }
  }
  console.error('Run `npm run status` to regenerate.');
  process.exit(1);
}

fs.writeFileSync(OUT_PATH, generated);
console.log(`status: wrote ${path.relative(repoRoot, OUT_PATH)} (${shippedRows.length} shipped, ${unprovenRows.length} unproven, ${plannedRows.length} planned)`);
