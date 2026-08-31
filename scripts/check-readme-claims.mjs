// @ts-check
// The README states numbers about this repository. This checks they are true.
//
//   node scripts/check-readme-claims.mjs
//
// Written after a review found three of them wrong at once: the conformance
// matrix had grown from 97 rows to 99 and from 77 proved to 79, and the test
// count was 29 behind. None of it was dishonest -- the numbers were true when
// they were written, and the repository moved.
//
// That is exactly the failure this project exists to refuse. The README says
// "a row whose proof file passes while its own test was renamed counts as
// UNPROVEN, never as passing", and a page that miscounts its own rows while
// saying so is arguing against itself. A claim nobody checks is a claim that
// is true until it isn't, and nobody finds out.
//
// So every number in the README is either derived here from the repository, or
// written as a floor ("1,000+ tests") that stays true as the repository grows
// and fails loudly if it ever shrinks past it. A number that can only be kept
// true by remembering to update it does not belong in the README.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPORTED_ROWS } from '../packages/conformance/src/matrix.mjs';
import { TOOLS } from '../packages/mcp/src/server.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

/** @type {Array<{claim: string, ok: boolean, detail: string}>} */
const results = [];

/**
 * Assert the README contains `expected`, and say what it should have said.
 *
 * @param {string} claim what is being checked, for the report
 * @param {string} expected the exact text the repository's own state produces
 */
function mustContain(claim, expected) {
  const ok = readme.includes(expected);
  results.push({
    claim,
    ok,
    detail: ok ? expected : `README does not contain: ${JSON.stringify(expected)}`,
  });
}

/** @param {string} claim @param {boolean} ok @param {string} detail */
function assertThat(claim, ok, detail) {
  results.push({ claim, ok, detail });
}

// ---------------------------------------------------------------------------
// The conformance matrix
// ---------------------------------------------------------------------------
const rows = IMPORTED_ROWS;
const browserRows = rows.filter((row) => row.browser).length;
const provedWithoutBrowser = rows.filter((row) => !row.browser && row.proof).length;
const unprovable = rows.filter((row) => !row.proof);

mustContain('conformance row count', `**${rows.length} rows**`);
mustContain('rows proved without a browser', `**${provedWithoutBrowser} are proved without a browser**`);
mustContain('browser-deferred rows', `${browserRows} more need headless Chrome`);
mustContain('total with a browser', `total to ${provedWithoutBrowser + browserRows}`);
assertThat(
  'the unproven row is named',
  unprovable.length === 1 && readme.includes(unprovable[0].id),
  unprovable.length === 1
    ? `row ${unprovable[0].id} is unproven and named in the README`
    : `expected exactly one unprovable row, found ${unprovable.length}`,
);

// ---------------------------------------------------------------------------
// Packages, dependencies, tools, presets
// ---------------------------------------------------------------------------
const packages = fs.readdirSync(path.join(repoRoot, 'packages'))
  .filter((name) => fs.existsSync(path.join(repoRoot, 'packages', name, 'package.json')))
  .sort();
const missing = packages.filter((name) => !readme.includes(`\`${name}\``));
assertThat(
  'every package appears in the package table',
  missing.length === 0,
  missing.length ? `not mentioned: ${missing.join(', ')}` : `all ${packages.length} packages listed`,
);

const withDeps = packages.filter((name) => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', name, 'package.json'), 'utf8'),
  );
  return Object.keys(manifest.dependencies ?? {}).length > 0;
});
assertThat(
  'zero runtime dependencies',
  withDeps.length === 0,
  withDeps.length ? `packages with runtime deps: ${withDeps.join(', ')}` : 'no package declares one',
);

// Counted from the exported array the server actually serves, not from a
// pattern in its source: a regex over the file counted ten, because one of
// them was the server's own name.
assertThat(
  'MCP tool count',
  saysCount(TOOLS.length, 'tools'),
  `the server exports ${TOOLS.length} tools: ${TOOLS.map((tool) => tool.name).join(', ')}`,
);

const presets = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'packages/core/schemas/architecture.schema.json'), 'utf8'),
).properties.meta.properties.visual_preset.enum;
assertThat(
  'preset count',
  saysCount(presets.length, 'presets'),
  `the schema declares ${presets.length} presets: ${presets.join(', ')}`,
);

// ---------------------------------------------------------------------------
// Artifact sizes, measured rather than remembered
// ---------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-readme-claims-'));
try {
  const example = path.join(repoRoot, 'packages/core/examples/web-app.architecture.json');
  const cli = path.join(repoRoot, 'packages/core/bin/mirofy.mjs');
  const html = path.join(tmp, 'a.html');
  const svg = path.join(tmp, 'a.svg');
  execFileSync(process.execPath, [cli, 'render', 'architecture', example, html], { stdio: 'ignore' });
  execFileSync(process.execPath, [cli, 'render', 'architecture', example, svg, '--format', 'svg-static'], { stdio: 'ignore' });
  const htmlKb = Math.round(fs.statSync(html).size / 1024);
  const svgKb = Math.round(fs.statSync(svg).size / 1024);
  // The README quotes a round number; this reads the number it quoted and
  // allows 8% of drift. Quoting an exact byte count would fail the build every
  // time a stylesheet gained a rule, which trains people to stop reading it.
  sizeWithin('interactive artifact size', /~(\d+) KB and earns it/, htmlKb);
  sizeWithin('static SVG size', /(\d+) KB standalone SVG/, svgKb);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// The benchmark, re-measured
// ---------------------------------------------------------------------------
// Re-run rather than read a stored result. The rate is a claim about THIS
// tool, and a stored number stops being one the moment the tool changes --
// which is the whole reason the replay mode exists.
const corpus = path.join(repoRoot, 'benchmarks/corpus/claude-cli');
if (fs.existsSync(path.join(corpus, 'authored-by.json'))) {
  const out = path.join(os.tmpdir(), `mirofy-readme-benchmark-${process.pid}.json`);
  try {
    execFileSync(process.execPath, [
      path.join(repoRoot, 'scripts/benchmark.mjs'), '--replay', corpus, '--out', out,
    ], { stdio: 'ignore' });
    const run = JSON.parse(fs.readFileSync(out, 'utf8'));
    // The bold form, and only the bold form: the prose mentions the rate more
    // than once, and matching anywhere let an overstated headline pass because
    // the true figure still appeared further down the page.
    mustContain('first-pass usable rate', `**${run.usable} of ${run.total}**`);
  } finally {
    fs.rmSync(out, { force: true });
  }
} else {
  assertThat('benchmark corpus present', false, `no replay corpus at ${corpus}`);
}

// ---------------------------------------------------------------------------
/** Small counts read better as words, and that is how the README writes them. */
function numberWord(n) {
  return ['zero', 'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
}

/** Whether the README says "<n> <noun>", as a word or a numeral. */
function saysCount(n, noun) {
  // Built with String.raw and an explicit alternation, because \b inside an
  // ordinary template literal is a BACKSPACE character rather than a word
  // boundary -- which silently produced a regex that matched nothing at all.
  const pattern = new RegExp(
    String.raw`\b(` + numberWord(n) + `|${n})` + String.raw`\s+` + noun + String.raw`\b`,
    'i',
  );
  return pattern.test(readme);
}

/** Compare a size the README quotes against the size just measured. */
function sizeWithin(claim, pattern, measuredKb) {
  const quoted = Number(pattern.exec(readme)?.[1]);
  if (!Number.isFinite(quoted)) {
    assertThat(claim, false, `README quotes no size matching ${pattern} (measured ${measuredKb} KB)`);
    return;
  }
  const drift = Math.abs(quoted - measuredKb) / measuredKb;
  assertThat(claim, drift <= 0.08,
    `README says ${quoted} KB, measured ${measuredKb} KB (${(drift * 100).toFixed(1)}% off)`);
}

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.claim}`);
  if (!result.ok) console.log(`          ${result.detail}`);
}
console.log(`\nreadme-claims: ${results.length - failed.length}/${results.length} verified`);
if (failed.length) {
  console.log('\nThe README states something this repository no longer supports. Fix the README,');
  console.log('or fix the repository -- but do not leave a page that argues for checking claims');
  console.log('while making unchecked ones.');
  process.exit(1);
}
