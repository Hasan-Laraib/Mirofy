// @ts-check
// Produces assets/self-model.svg -- the diagram at the top of the README.
//
//   node scripts/build-hero.mjs
//
// It renders the REAL thing (this repository, scanned by itself, through the
// real pipeline) and then decorates the result so the dependencies draw
// themselves in sequence rather than arriving as a finished wall of boxes.
//
// WHY THIS SCRIPT EXISTS RATHER THAN A HAND-EDIT: the hero is generated output.
// Anyone who re-runs the CLI over scan/diagram.json overwrites it, and a
// hand-added animation would vanish with no error. This is the documented way
// to produce that file, and check-readme-claims.mjs asserts the committed copy
// still carries what this script adds and still matches the current model.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not colour the boxes. All twelve
// components are the same kind -- `package` -- and the README states the rule
// plainly: colour tells you what a node is, never where an arrow goes. Tinting
// them to look livelier would break the one promise the picture is there to
// make. The colour here is on the edges, and only while they are moving: it is
// motion, not encoding, and it settles back to the resting grey.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repoRoot, 'assets/self-model.svg');

const run = (args, label) => {
  process.stdout.write(`  ${label}\n`);
  execFileSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
};

console.log('build-hero: rendering this repository, scanned by itself');
run([path.join(repoRoot, 'packages/scanner/bin/scan.mjs')], 'scan');
run([path.join(repoRoot, 'packages/model/bin/model.mjs'), '--from-graph',
  '--graph', path.join(repoRoot, 'scan/evidence-graph.json')], 'model');
run([path.join(repoRoot, 'packages/compile/bin/compile.mjs')], 'compile');
// standard, not showcase: this repository's own package graph does not pass the
// showcase Proper Crossing Gate (row 3.1). `conformance` fans out to nine
// packages and those runs cross the cli-to-viewer edge. That is the gate being
// right about a real graph, not something to route around here.
run([path.join(repoRoot, 'packages/core/bin/mirofy.mjs'), 'render', 'architecture',
  path.join(repoRoot, 'scan/diagram.json'), out,
  '--format', 'svg-static', '--repo-root', repoRoot], 'render');

let svg = fs.readFileSync(out, 'utf8');

// Mark every dependency edge. pathLength="1" normalises each path to a length
// of 1 so one dasharray works for all of them -- without it every edge needs
// its own measured length, which means parsing path geometry.
// The renderer emits `d` before `class`, so anchoring on `<path class=` matched
// nothing and the guard below fired on a file that was full of edges.
let edges = 0;
svg = svg.replace(/<path([^>]*?)class="a-default"/g,
  (_all, before) => `<path${before}pathLength="1" class="a-default h-e${edges++}"`);
if (!edges) throw new Error('build-hero: no a-default edges found; the renderer output has changed shape');

// Each edge fades in AND draws. Fading matters because marker-end arrowheads
// are painted at the path end regardless of the dash pattern -- draw alone
// leaves fourteen arrowheads sitting there from the first frame, pointing at
// nothing, which gives the whole reveal away.
const LOOP = 11;
const START = 4;
const STEP = 3.6;
const DRAW = 5;
const SETTLE = 12;
const HOLD = 88;

const keyframes = [];
for (let i = 0; i < edges; i += 1) {
  const t0 = START + i * STEP;
  const lit = t0 + DRAW;
  const rest = Math.min(lit + SETTLE, HOLD);
  keyframes.push(
    `@keyframes h-draw${i}{`
    + `0%,${t0.toFixed(1)}%{opacity:0;stroke-dashoffset:1;stroke:#2563eb}`
    + `${(t0 + 0.6).toFixed(1)}%{opacity:1;stroke-dashoffset:1;stroke:#2563eb}`
    + `${lit.toFixed(1)}%{opacity:1;stroke-dashoffset:0;stroke:#2563eb}`
    + `${rest.toFixed(1)}%,${HOLD}%{opacity:1;stroke-dashoffset:0;stroke:#94a3b8}`
    + `94%,100%{opacity:0;stroke-dashoffset:1;stroke:#2563eb}}`,
  );
}

const style = [
  '.a-default{stroke-dasharray:1;stroke-dashoffset:1;opacity:0;',
  `animation-duration:${LOOP}s;animation-iteration-count:infinite;`,
  'animation-timing-function:ease-in-out}',
  ...Array.from({ length: edges }, (_, i) => `.h-e${i}{animation-name:h-draw${i}}`),
  ...keyframes,
  // Asked not to see motion: the finished picture, which is the one that
  // carries the information anyway.
  '@media (prefers-reduced-motion:reduce){',
  '.a-default{animation:none;opacity:1;stroke-dashoffset:0;stroke:#94a3b8}}',
].join('');

// Appended to the renderer's own stylesheet rather than added as a second
// <style>, so there is exactly one place cascade order has to be reasoned about.
const marker = '/* build-hero */';
if (svg.includes(marker)) throw new Error('build-hero: this file was already decorated');
svg = svg.replace('</style>', `${marker}${style}</style>`);

fs.writeFileSync(out, svg);
console.log(`build-hero: ${edges} dependency edges animated -> assets/self-model.svg`
  + ` (${Math.round(fs.statSync(out).size / 1024)} KB)`);
