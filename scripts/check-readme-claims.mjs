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

  // The README says the artifact opens "with no server and no network". The
  // first version of this check tested that literally and FAILED on the very
  // first run: the viewer pulls JetBrains Mono from fonts.googleapis.com.
  //
  // The artifact does render completely without it -- the link is loaded with
  // media="print" onload, so it never blocks paint, and the body stack falls
  // back to system monospace. But "it degrades nicely" is not "no network", and
  // a page that opens your architecture also tells Google you opened it.
  //
  // So this checks the guarantee that is actually true and is worth more than
  // the flat one: NOTHING THE ARTIFACT NEEDS COMES FROM THE NETWORK. Every
  // external reference must be a font, and every font reference must be in a
  // form that cannot block or change what the diagram says. A CDN script, a
  // remote image, an analytics beacon, a CSS url(), or that same font link with
  // its async attributes dropped all fail here -- which is the difference
  // between a real check and one written around the thing that broke it.
  const artifact = fs.readFileSync(html, 'utf8');
  const external = [...artifact.matchAll(/<(link|script|img|iframe)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /(?:href|src)=["'](?:https?:)?\/\//i.test(tag))
    .concat([...artifact.matchAll(/url\(\s*["']?(?:https?:)?\/\/[^)]*\)/gi)].map((m) => m[0]))
    .concat([...artifact.matchAll(/@import\s+(?:url\()?["']?https?:[^;]*/gi)].map((m) => m[0]));

  const FONT_HOST = /fonts\.(?:googleapis|gstatic)\.com/i;
  // A reference is harmless only if it is a font AND cannot affect first paint:
  // a connection hint, an async stylesheet, or one behind <noscript> (and this
  // viewer does not run without script at all).
  const harmless = (tag) => FONT_HOST.test(tag) && (
    /rel=["'](?:preconnect|dns-prefetch)["']/i.test(tag)
    || (/media=["']print["']/i.test(tag) && /onload=/i.test(tag))
    || artifact.includes(`<noscript>
    ${tag}`)
  );
  const blocking = external.filter((tag) => !harmless(tag));
  assertThat(
    'nothing the artifact needs comes from the network',
    blocking.length === 0,
    blocking.length === 0
      ? `${htmlKb} KB; ${external.length} external ref(s), all optional webfont`
      : `${blocking.length} blocking: ${blocking.map((t) => t.slice(0, 64)).join(' | ')}`,
  );

  // And the README has to SAY there is a webfont, rather than claim a purity
  // the artifact does not have. If the fetch is ever removed for real, this
  // flips and demands the sentence be strengthened -- the check refuses to let
  // the prose drift in either direction.
  const fetchesAFont = external.some((tag) => FONT_HOST.test(tag) && !/preconnect|dns-prefetch/i.test(tag));
  assertThat(
    'the README describes what the artifact fetches',
    fetchesAFont === /it does not wait for and does not need/.test(readme),
    fetchesAFont ? 'the artifact requests a webfont, and the README says so'
      : 'the artifact requests nothing; the README should drop the webfont caveat',
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// The scan of this repository, re-run
// ---------------------------------------------------------------------------
// The whole pipeline takes under three seconds, so there is no reason to quote
// these from memory. The volatile ones -- facts and cited files, which move
// every time a file is added -- are checked against what the README quotes with
// a tolerance, so ordinary growth does not fail the build. The structural ones
// are exact, because when THOSE change the README genuinely needs rewriting.
run([path.join(repoRoot, 'packages/scanner/bin/scan.mjs')], 'scan');
run([path.join(repoRoot, 'packages/model/bin/model.mjs'), '--from-graph',
  '--graph', path.join(repoRoot, 'scan/evidence-graph.json')], 'model');
run([path.join(repoRoot, 'packages/compile/bin/compile.mjs')], 'compile');

const graph = readJson('scan/evidence-graph.json');
const model = readJson('scan/model.json');
const view = readJson('scan/view.json');
const citedFiles = new Set();
for (const fact of graph.facts ?? []) if (fact.location?.path) citedFiles.add(fact.location.path);
for (const gap of graph.gaps ?? []) if (gap.path) citedFiles.add(gap.path);

within('fact count', /\*\*([\d,]+) facts\*\*/, (graph.facts ?? []).length);
within('cited file count', /across \*\*([\d,]+) files\*\*/, citedFiles.size);
mustContain('recorded gaps', `**${(graph.gaps ?? []).length} gaps**`);
mustContain(
  'components and relationships derived',
  `**${(model.components ?? []).length} components and ${(model.relationships ?? []).length}
relationships**`,
);
mustContain('components drawn', `draws
**${numberWord((view.components ?? view.nodes ?? []).length)}**`);

// The README quotes what the model DECLINED to draw, as evidence that it counts
// rather than drops. That number was written as "734 imports of `node:fs`" and
// had drifted to 784 -- and was never node:fs alone, it was every Node builtin.
// A figure about honesty that is quietly wrong is the worst one to leave
// unchecked.
const notModelled = model.notModelled ?? [];
const builtins = notModelled.find((entry) => /builtin/i.test(entry.what ?? ''));
within('Node builtin imports not drawn', /([\d,]+) imports of Node builtins/, builtins?.count ?? 0);
// The adapter list is a promise about what the tool can read. A new adapter
// that nobody adds to the README is a capability users never learn about; a
// removed one is a lie.
const adapterFiles = fs.readdirSync(path.join(repoRoot, 'packages/scanner/src/adapters'))
  .filter((name) => name.endsWith('.mjs')).map((name) => name.replace(/\.mjs$/, ''));
// Plain substrings, not regexes: a pattern written across a line break lost its
// escape on the way into this file and became an unterminated literal. There is
// nothing here that needs a regex.
const namedInReadme = {
  imports: 'JavaScript and TypeScript** imports',
  python: '**Python** imports',
  workspace: 'workspaces ',
  routes: 'Express and Next routes',
  compose: 'docker-compose',
};
const unlisted = adapterFiles.filter((name) => !(name in namedInReadme)
  || !readme.includes(namedInReadme[name]));
assertThat(
  'every scanner adapter is named in the README',
  unlisted.length === 0,
  unlisted.length === 0 ? `${adapterFiles.length} adapters, all listed`
    : `not described: ${unlisted.join(', ')}`,
);

// ---------------------------------------------------------------------------
// The two graphics at the top of the README
// ---------------------------------------------------------------------------
// assets/pipeline.svg was carrying "230 files", "987 facts", "8 gaps" while the
// repository had moved to 196 / 1,089 / 10. Nobody had lied; the numbers were
// right when they were drawn, and an SVG is not somewhere anyone thinks to look
// for stale figures. That is the same defect this file was written to kill in
// the README prose, so the graphics now answer to it too.
const pipelineSvg = fs.readFileSync(path.join(repoRoot, 'assets/pipeline.svg'), 'utf8');
const svgFigure = (claim, re, actual, tolerance = 0) => {
  const found = pipelineSvg.match(re);
  if (!found) return assertThat(claim, false, `pipeline.svg no longer contains ${re}`);
  const quoted = Number(found[1].replace(/,/g, ''));
  const ok = tolerance ? Math.abs(quoted - actual) <= actual * tolerance : quoted === actual;
  return assertThat(claim, ok, `pipeline.svg says ${found[1]}, the scan says ${actual}`);
};
const drawn = (view.components ?? view.nodes ?? []).length;
const components = (model.components ?? []).length;
svgFigure('pipeline.svg: files', /([\d,]+) files</, citedFiles.size, 0.15);
svgFigure('pipeline.svg: facts', /([\d,]+) facts/, (graph.facts ?? []).length, 0.15);
svgFigure('pipeline.svg: gaps', /· ([\d,]+) gaps</, (graph.gaps ?? []).length);
svgFigure('pipeline.svg: components', /([\d,]+) components</, components);
svgFigure('pipeline.svg: drawn', /([\d,]+) drawn/, drawn);
// The graphic says "12 drawn · 7 named": the seven a bounded view leaves out are
// named in the artifact rather than dropped. If that arithmetic stops holding,
// the sentence the graphic is making has stopped being true.
svgFigure('pipeline.svg: named', /· ([\d,]+) named</, components - drawn);

// Every picture the README points at has to be there. A renamed or regenerated
// asset leaves a broken image on the project's front page, which is both the
// most visible possible defect and the one nothing was watching for.
// srcset as well as src: a <picture> source that points at a missing file
// fails silently for exactly the readers it was added for, and unlike a broken
// <img> it does not even leave alt text behind.
const referenced = [...new Set([
  ...[...readme.matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]),
  ...[...readme.matchAll(/srcset="(assets\/[^"]+)"/g)].map((m) => m[1]),
])];
const brokenImages = referenced.filter((rel) => !fs.existsSync(path.join(repoRoot, rel)));
assertThat(
  'every image the README points at exists',
  brokenImages.length === 0,
  brokenImages.length === 0 ? `${referenced.length} referenced, all present`
    : `broken: ${brokenImages.join(', ')}`,
);
// The captures are a set: build-screenshots.mjs writes all five in one run, so
// a missing one means somebody committed a partial run.
const captures = ['hero', 'hero-dark', 'search', 'passport', 'trace', 'lens']
  .map((name) => `assets/viewer-${name}.png`);
const missingCaptures = captures.filter((rel) => !fs.existsSync(path.join(repoRoot, rel)));
assertThat(
  'the viewer captures are a complete set',
  missingCaptures.length === 0,
  missingCaptures.length === 0 ? 'all five present'
    : `run: npm run build:screenshots -- missing ${missingCaptures.join(', ')}`,
);

// assets/self-model.svg is generated output that a script then decorates, which
// is a shape that rots quietly: anyone re-running the CLI over scan/diagram.json
// writes a perfectly valid hero with the animation silently gone, and no error
// anywhere. So the committed copy has to prove it came from scripts/build-hero.mjs
// and still describes the model this repository has now.
const hero = fs.readFileSync(path.join(repoRoot, 'assets/self-model.svg'), 'utf8');
assertThat(
  'self-model.svg came from build-hero.mjs',
  hero.includes('/* build-hero */'),
  hero.includes('/* build-hero */') ? 'the decoration marker is present'
    : 'the hero looks like a plain render -- run: node scripts/build-hero.mjs',
);
const heroEdges = (hero.match(/a-default h-e\d+/g) ?? []).length;
const heroPaths = (hero.match(/class="a-default/g) ?? []).length;
assertThat(
  'every edge in the hero is animated',
  heroEdges > 0 && heroEdges === heroPaths,
  `${heroEdges} of ${heroPaths} dependency edges carry a reveal`,
);
// Structural staleness is the one that matters: a hero drawn before a package
// existed is a picture of a system this repository no longer is.
const undrawnInHero = (view.components ?? view.nodes ?? [])
  .map((node) => node.label ?? node.id)
  .filter((label) => label && !hero.includes(String(label).split('/').pop()));
assertThat(
  'the hero shows the components the model draws',
  undrawnInHero.length === 0,
  undrawnInHero.length === 0 ? `all ${(view.components ?? view.nodes ?? []).length} present`
    : `missing from the hero: ${undrawnInHero.join(', ')}`,
);

// assets/evidence.svg quotes ONE fact, in full, as the proof that every drawn
// edge carries its source. It has to be a fact this repository actually holds:
// a graphic arguing "nothing is inferred silently", illustrated with an invented
// citation, would be a small demonstration of the opposite.
const evidenceSvg = fs.readFileSync(path.join(repoRoot, 'assets/evidence.svg'), 'utf8');
const citation = evidenceSvg.match(/>([\w./-]+\.mjs):(\d+)</);
if (!citation) {
  assertThat('evidence.svg: cites a source line', false, 'no file:line found in the graphic');
} else {
  const [, citedPath, citedLine] = citation;
  // The lookup is bound to the relation the graphic DRAWS, not just to the file
  // and line. Moving the citation from line 3 to line 4 used to pass this check,
  // because line 4 is also an import -- so a fact existed there, just a
  // different one, pointing somewhere else entirely. Only the object check
  // downstream noticed. A check named "the cited fact is in the evidence graph"
  // has to fail when the citation stops naming the drawn edge.
  const arrow = evidenceSvg.match(/>[^<>]*→\s*([\w./-]+)</);
  const target = arrow ? arrow[1] : null;
  const backing = (graph.facts ?? []).find((fact) => fact.location?.path === citedPath
    && (fact.location?.lines ?? [])[0] === Number(citedLine)
    && Boolean(target) && String(fact.object).endsWith(target));
  assertThat(
    'evidence.svg: the cited fact is in the evidence graph',
    Boolean(backing),
    backing ? `${citedPath}:${citedLine} is ${backing.id} (${backing.predicate})`
      : `${citedPath}:${citedLine} is not a fact this repository records`,
  );
  if (backing) {
    assertThat(
      'evidence.svg: the quoted provenance matches the fact',
      evidenceSvg.includes(`>${backing.provenance}<`),
      `the graph calls ${backing.id} ${backing.provenance}`,
    );
    assertThat(
      'evidence.svg: the quoted object matches the fact',
      evidenceSvg.includes(path.posix.basename(backing.object)),
      `${backing.id} points at ${backing.object}`,
    );
  }
}

// The gap is the other half of the argument, and it is quoted verbatim, so it
// has to still be a gap. A scanner that learns to resolve this import should
// break this graphic rather than leave it advertising a limit that is gone.
const quotedGap = evidenceSvg.match(/>(computed import specifier at line \d+[^<]*)</);
assertThat(
  'evidence.svg: the quoted gap is still recorded',
  Boolean(quotedGap) && (graph.gaps ?? []).some((gap) => gap.reason === quotedGap[1]),
  quotedGap ? `"${quotedGap[1].slice(0, 52)}..."` : 'no gap reason quoted in the graphic',
);

// ---------------------------------------------------------------------------
// Install instructions that actually work
// ---------------------------------------------------------------------------
// A README telling somebody to run `npx mirofy` before `mirofy` is published
// sends them to a 404 on their first contact with the project. A README still
// apologising for not being published a month after it was is just as wrong,
// and much likelier, because nobody goes back to delete a caveat.
//
// So the registry decides which of the two this file is allowed to be. When
// npm cannot be reached the question is not asked -- being offline is not
// evidence about anything.
const readmeTellsYouToNpx = /^\s*npx mirofy-cli /m.test(readme);
const readmeSaysNotLive = /`npx mirofy-cli` is not live yet/.test(readme);
let published = null;
let unreachable = 'npm was not run';
const npmCli = (() => {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fromEnv.endsWith('.js') && fs.existsSync(fromEnv)) return fromEnv;
  const nodeDir = path.dirname(process.execPath);
  for (const candidate of [
    path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    path.join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
})();
if (npmCli) {
  try {
    execFileSync(process.execPath, [npmCli, 'view', 'mirofy-cli', 'version'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    });
    published = true;
  } catch (error) {
    const detail = String(error.stderr || error.message);
    if (/E404|404 Not Found/.test(detail)) published = false;
    else unreachable = detail.split(String.fromCharCode(10))[0].slice(0, 120);
  }
} else {
  unreachable = 'npm-cli.js not found';
}

if (published === null) {
  // Reported as its own outcome rather than folded into a pass. A check that
  // could not run is not a check that succeeded, and the first version of this
  // said "ok" while silently answering nothing -- both planted faults walked
  // straight through it.
  assertThat(`install instructions match the registry (NOT CHECKED: ${unreachable})`,
    true, 'the registry could not be reached; this claim was not verified');
} else if (published) {
  assertThat('install instructions match the registry', readmeTellsYouToNpx && !readmeSaysNotLive,
    readmeTellsYouToNpx && !readmeSaysNotLive
      ? 'mirofy-cli is published and the README says npx'
      : 'mirofy-cli IS published now — lead with `npx mirofy-cli` and delete the "not live yet" note');
} else {
  const why = readmeTellsYouToNpx
    ? 'the README tells a reader to run `npx mirofy-cli`, which 404s: mirofy-cli is not on npm yet'
    : 'mirofy-cli is not published, and the README no longer says so — a reader has no way '
      + 'to know why there is no npx command';
  assertThat('install instructions match the registry', !readmeTellsYouToNpx && readmeSaysNotLive,
    !readmeTellsYouToNpx && readmeSaysNotLive
      ? 'mirofy-cli is unpublished and the README says so instead of telling you to npx it'
      : why);
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
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n);
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
  within(claim, pattern, measuredKb, 0.08, 'KB');
}

/**
 * Check a number the README quotes against one just measured, with slack.
 *
 * Quoting an exact count of anything that grows would fail the build on every
 * commit that adds a file, which trains people to stop reading this.
 */
function within(claim, pattern, measured, tolerance = 0.1, unit = '') {
  const quoted = Number((pattern.exec(readme)?.[1] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(quoted)) {
    assertThat(claim, false, `README quotes no number matching ${pattern} (measured ${measured}${unit})`);
    return;
  }
  const drift = Math.abs(quoted - measured) / (measured || 1);
  assertThat(claim, drift <= tolerance,
    `README says ${quoted}${unit}, measured ${measured}${unit} (${(drift * 100).toFixed(1)}% off)`);
}

/** @param {string} relative */
function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
}

/** Run a repository script, failing loudly rather than checking a stale file. */
function run(argv, label) {
  try {
    return execFileSync(process.execPath, argv, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    console.error(`readme-claims: ${label} failed, so its numbers cannot be checked`);
    console.error(String(error.stderr || error.stdout || error.message).slice(0, 1200));
    process.exit(2);
  }
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
