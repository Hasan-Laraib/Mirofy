import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreRoot, fixturesRoot, repoRoot } from '../src/render.mjs';

function coreModule(relativePath) {
  return import(pathToFileURL(path.join(coreRoot, relativePath)).href);
}

const EXPECTED_CHECKS = [
  'single_svg', 'finite_svg', 'orthogonal_arrows', 'label_route_clearance',
  'relationship_crossings', 'relationship_corridors', 'container_border_runs',
  'route_rhythm', 'legend_clearance',
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-gates-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

function cliPath() {
  return path.join(coreRoot, 'bin/archify.mjs');
}

function validate(mode, fixture, extraArgs = []) {
  const input = path.isAbsolute(fixture) ? fixture : path.join(fixturesRoot, fixture);
  const stdout = execFileSync(process.execPath, [
    cliPath(), 'validate', mode, input, '--json', ...extraArgs,
  ], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

function validateExpectFailure(mode, fixture, extraArgs = []) {
  const input = path.isAbsolute(fixture) ? fixture : path.join(fixturesRoot, fixture);
  try {
    execFileSync(process.execPath, [
      cliPath(), 'validate', mode, input, '--json', ...extraArgs,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail(`validate unexpectedly succeeded for ${fixture}`);
  } catch (err) {
    if (err.name === 'AssertionError') throw err;
    return { stdout: String(err.stdout || ''), stderr: String(err.stderr || '') };
  }
}

function writeFixture(name, doc) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, JSON.stringify(doc));
  return file;
}

function render(mode, doc, name) {
  const input = writeFixture(`${name}.json`, doc);
  const output = path.join(tmp, `${name}.html`);
  execFileSync(process.execPath, [
    path.join(coreRoot, `renderers/${mode}/render-${mode}.mjs`), input, output,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(output, 'utf8');
}

function nodeAttr(html, id) {
  const idx = html.indexOf(`data-node-id="${id}"`);
  assert.notEqual(idx, -1, `node ${id} not found in rendered output`);
  const segment = html.slice(idx, idx + 600);
  const x = segment.match(/\sx="([-0-9.]+)"/);
  const y = segment.match(/\sy="([-0-9.]+)"/);
  assert.ok(x && y, `node ${id} has no rect/x/y nearby`);
  return { x: Number(x[1]), y: Number(y[1]) };
}

// ---------------------------------------------------------------------------
// Step 1 — the nine artifact checks, showcase acceptance, structured diagnostics.
// Covers 3.1-3.5, 3.10 (the "clean" gates all fire on a real, gate-rich fixture).
// ---------------------------------------------------------------------------

test('showcase validation reports exactly the nine artifact checks', () => {
  const receipt = validate('architecture', 'web-app.architecture.json');
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.checks.map((c) => c.name), EXPECTED_CHECKS);
  assert.ok(receipt.checks.every((c) => c.ok), 'a check failed on a known-good fixture');
});

test('showcase acceptance requires zero composition errors and warnings', () => {
  const receipt = validate('architecture', 'web-app.architecture.json');
  assert.equal(receipt.composition.status, 'pass');
  assert.equal(receipt.composition.summary.errors, 0);
  assert.equal(receipt.composition.summary.warnings, 0);
});

test('invalid input returns structured diagnostics, never a stack trace', () => {
  const { stdout, stderr } = validateExpectFailure('architecture', 'agent-run.lifecycle.json');
  assert.ok(!(stdout + stderr).includes('at Object.<anonymous>'), 'a Node stack trace leaked into output');
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, false);
  assert.ok(Array.isArray(receipt.diagnostics) && receipt.diagnostics.length > 0);
});

test('every diagnostic carries a code, a message, and a supportedFixes array (3.10)', () => {
  const { stdout } = validateExpectFailure('architecture', 'agent-run.lifecycle.json');
  const receipt = JSON.parse(stdout);
  for (const diagnostic of receipt.diagnostics) {
    assert.equal(typeof diagnostic.code, 'string');
    assert.ok(diagnostic.code.length > 0);
    assert.equal(typeof diagnostic.message, 'string');
    assert.ok(Array.isArray(diagnostic.supportedFixes));
  }
});

// ---------------------------------------------------------------------------
// 1.2 — typed IR, additionalProperties:false
// ---------------------------------------------------------------------------

test('the IR schema rejects any additional top-level property (1.2)', () => {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));
  source.notARealProperty = true;
  const file = writeFixture('bogus-prop.json', source);
  const { stdout } = validateExpectFailure('architecture', file);
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, false);
  assert.ok(receipt.diagnostics.some((d) => d.code === 'schema/additionalProperties'
    && d.message.includes('notARealProperty')));
});

// ---------------------------------------------------------------------------
// 1.3 — pre-generated standalone validators
// ---------------------------------------------------------------------------

test('pre-generated AJV-standalone validators exist for all five types and reject drift (1.3)', async () => {
  const mod = await coreModule('renderers/shared/generated-validators.mjs');
  const types = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];
  assert.deepEqual(Object.keys(mod).sort(), types.slice().sort());
  for (const type of types) assert.equal(typeof mod[type], 'function', `${type} validator is not a function`);

  const good = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));
  assert.equal(mod.architecture(good), true, 'known-good fixture rejected by standalone validator');

  const bad = { ...good, extraTopLevelField: true };
  assert.equal(mod.architecture(bad), false, 'standalone validator accepted an invalid document');
  assert.ok(mod.architecture.errors.some((e) => e.keyword === 'additionalProperties'));
});

// ---------------------------------------------------------------------------
// 1.4 / 3.8 — grid placement (row/col) and its validation
// ---------------------------------------------------------------------------

function gridDoc(components) {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Grid placement' },
    layout: { mode: 'grid', cols: 2, origin: [20, 20], gapX: 40, gapY: 40, cellW: 160, cellH: 80 },
    components,
    connections: [{ from: components[0].id, to: components[1].id }],
  };
}

test('layout.mode "grid" places components deterministically by row/col (1.4)', () => {
  const doc = gridDoc([
    { id: 'a', type: 'frontend', label: 'A', row: 0, col: 0 },
    { id: 'b', type: 'backend', label: 'B', row: 0, col: 1 },
  ]);
  doc.components.push({ id: 'c', type: 'database', label: 'C', row: 1, col: 0 });
  const html = render('architecture', doc, 'grid-placement');
  assert.deepEqual(nodeAttr(html, 'a'), { x: 20, y: 20 }, 'row 0 col 0 must sit at origin');
  assert.deepEqual(nodeAttr(html, 'b'), { x: 220, y: 20 }, 'row 0 col 1 must advance by cellW+gapX');
  assert.deepEqual(nodeAttr(html, 'c'), { x: 20, y: 140 }, 'row 1 col 0 must advance by cellH+gapY');
});

test('grid placement validation rejects two components sharing a cell (3.8)', () => {
  const doc = gridDoc([
    { id: 'a', type: 'frontend', label: 'A', row: 0, col: 0 },
    { id: 'b', type: 'backend', label: 'B', row: 0, col: 0 },
  ]);
  const file = writeFixture('grid-overlap.json', doc);
  const { stdout } = validateExpectFailure('architecture', file);
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, false);
  assert.ok(receipt.diagnostics.some((d) => d.code === 'layout/constraint'
    && d.message.includes('share grid cell')));
});

// ---------------------------------------------------------------------------
// 1.5 — structural placement (lane/col for workflow, stage/row for dataflow)
// ---------------------------------------------------------------------------

test('workflow lane order drives vertical stacking and col drives horizontal order (1.5)', () => {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'agent-tool-call.workflow.json'), 'utf8'));
  const html = render('workflow', source, 'workflow-lane-order');
  const laneIndex = new Map(source.lanes.map((lane, index) => [lane.id, index]));
  const positions = source.nodes.map((node) => ({ ...node, ...nodeAttr(html, node.id) }));

  // y must be monotonic with lane order: every node in a later lane sits
  // strictly below every node in an earlier lane.
  for (const a of positions) {
    for (const b of positions) {
      if (laneIndex.get(a.lane) < laneIndex.get(b.lane)) {
        assert.ok(a.y < b.y, `${a.id} (lane ${a.lane}) should render above ${b.id} (lane ${b.lane})`);
      }
    }
  }
  // x must be monotonic with col within the same lane.
  const byLane = new Map();
  for (const p of positions) {
    if (!byLane.has(p.lane)) byLane.set(p.lane, []);
    byLane.get(p.lane).push(p);
  }
  for (const nodes of byLane.values()) {
    const sorted = [...nodes].sort((a, b) => a.col - b.col);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i].x >= sorted[i - 1].x, `col order violated within lane ${sorted[i].lane}`);
    }
  }
});

test('dataflow stage/row drives a left-to-right, top-to-bottom grid (1.5)', () => {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'product-analytics.dataflow.json'), 'utf8'));
  const html = render('dataflow', source, 'dataflow-stage-order');
  const positions = source.nodes.map((node) => ({ ...node, ...nodeAttr(html, node.id) }));
  for (const a of positions) {
    for (const b of positions) {
      if (a.stage < b.stage) assert.ok(a.x < b.x, `${a.id} (stage ${a.stage}) should render left of ${b.id} (stage ${b.stage})`);
    }
  }
  const byStage = new Map();
  for (const p of positions) {
    if (!byStage.has(p.stage)) byStage.set(p.stage, []);
    byStage.get(p.stage).push(p);
  }
  for (const nodes of byStage.values()) {
    const sorted = [...nodes].sort((a, b) => a.row - b.row);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i].y >= sorted[i - 1].y, `row order violated within stage ${sorted[i].stage}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 1.6 — guided views / chapters, max 5
// ---------------------------------------------------------------------------

test('guided views round-trip into the rendered artifact and are capped at 5 (1.6)', () => {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'production-deployment.architecture.json'), 'utf8'));
  assert.ok(source.meta.views.length > 0 && source.meta.views.length <= 5);
  const html = render('architecture', source, 'guided-views');
  const match = html.match(/<script id="archify-guided-views-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'guided views were not embedded in the rendered artifact');
  const embedded = JSON.parse(match[1]);
  assert.deepEqual(embedded.map((v) => v.id), source.meta.views.map((v) => v.id));

  const tooMany = JSON.parse(JSON.stringify(source));
  const template = tooMany.meta.views[0];
  tooMany.meta.views = Array.from({ length: 6 }, (_, i) => ({ ...template, id: `${template.id}-${i}` }));
  const file = writeFixture('too-many-views.json', tooMany);
  const { stdout } = validateExpectFailure('architecture', file);
  const receipt = JSON.parse(stdout);
  assert.ok(receipt.diagnostics.some((d) => d.code === 'schema/maxItems'));
});

// ---------------------------------------------------------------------------
// 1.7 — quality_profile standard/showcase
// ---------------------------------------------------------------------------

test('the --quality flag is echoed as the reported composition profile on a clean fixture (1.7)', () => {
  for (const quality of ['standard', 'showcase']) {
    const receipt = validate('architecture', 'web-app.architecture.json', ['--quality', quality]);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.composition.status, 'pass');
  }
  const output = path.join(tmp, 'quality-standard.html');
  const outputShowcase = path.join(tmp, 'quality-showcase.html');
  const deliverJson = (quality, out) => JSON.parse(execFileSync(process.execPath, [
    cliPath(), 'deliver', 'architecture', path.join(fixturesRoot, 'web-app.architecture.json'), out,
    '--json', '--quality', quality,
  ], { encoding: 'utf8' }));
  const standard = deliverJson('standard', output);
  const showcase = deliverJson('showcase', outputShowcase);
  assert.equal(standard.validation.compositionProfile, 'standard');
  assert.equal(showcase.validation.compositionProfile, 'showcase');
});

test('quality_profile actually escalates a real violation from warning to error, not just an echoed label (1.7)', () => {
  // Echoing the flag (above) proves nothing about behaviour. This proves the
  // distinction that is the entire point of quality_profile: the exact same
  // authored violation (from the label-route-clearance negative fixture,
  // clearance 1px) is tolerated as a warning under standard and rejected as
  // an error under showcase — using the real, unmodified checker script both
  // times. See negative-fixtures.test.mjs for why the showcase run patches
  // the baked-in quality marker rather than re-rendering with --quality
  // showcase: that would reject the document at the render stage before any
  // checks[] array existed to compare against.
  const checker = path.join(coreRoot, 'scripts/check-render-output.mjs');
  const renderer = path.join(coreRoot, 'renderers/architecture/render-architecture.mjs');
  const negativeFixture = path.join(repoRoot, 'fixtures/negative/label-route-clearance-violation.architecture.json');
  const output = path.join(tmp, 'quality-escalation.html');
  execFileSync(process.execPath, [renderer, negativeFixture, output], { stdio: ['ignore', 'ignore', 'pipe'] });

  const runChecker = (htmlPath) => {
    try {
      return JSON.parse(execFileSync(process.execPath, [checker, htmlPath], { encoding: 'utf8' }));
    } catch (err) {
      return JSON.parse(String(err.stdout));
    }
  };

  const underStandard = runChecker(output);
  assert.equal(underStandard.ok, true, 'standard quality must tolerate this violation');
  assert.equal(underStandard.checks.find((c) => c.name === 'label_route_clearance').ok, true);
  assert.ok(underStandard.composition.summary.warnings > 0, 'standard quality must still record it as a warning');
  assert.equal(underStandard.composition.summary.errors, 0);

  const showcaseHtml = fs.readFileSync(output, 'utf8').replace('data-quality-profile="standard"', 'data-quality-profile="showcase"');
  const showcasePath = `${output}.showcase.html`;
  fs.writeFileSync(showcasePath, showcaseHtml);
  const underShowcase = runChecker(showcasePath);
  assert.equal(underShowcase.ok, false, 'showcase quality must reject this violation');
  assert.equal(underShowcase.checks.find((c) => c.name === 'label_route_clearance').ok, false);
  assert.ok(underShowcase.composition.summary.errors > 0, 'showcase quality must record it as an error');
  assert.equal(underShowcase.composition.summary.warnings, 0);
});

// ---------------------------------------------------------------------------
// 1.8 — brand marks (107, digest-pinned)
// ---------------------------------------------------------------------------

test('exactly 107 brand marks are catalogued and pinned to one Simple Icons version (1.8)', () => {
  const stdout = execFileSync(process.execPath, [cliPath(), 'brands', '--json'], { encoding: 'utf8' });
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.count, 107);
  assert.equal(receipt.marks.length, 107);
  const simpleIconsMarks = receipt.marks.filter((m) => m.provenance.provider === 'Simple Icons');
  assert.ok(simpleIconsMarks.length > 100, 'expected the vast majority of marks to be Simple Icons sourced');
  const versions = new Set(simpleIconsMarks.map((m) => m.provenance.providerVersion));
  assert.deepEqual([...versions], ['16.28.0'], 'Simple Icons brand marks must be pinned to one exact version');
  for (const mark of receipt.marks) {
    assert.match(mark.hex, /^[0-9A-Fa-f]{6}$/, `${mark.id} has no valid pinned hex colour`);
    assert.equal(typeof mark.provenance.provider, 'string');
    assert.ok(mark.provenance.provider.length > 0, `${mark.id} has no provenance provider`);
  }
});

// ---------------------------------------------------------------------------
// 1.9 / 4.9 — legend modes (auto/all/hidden) and legend presence
// ---------------------------------------------------------------------------

test('legend mode "hidden" omits the legend; "all" includes kinds absent from the diagram (1.9, 4.9)', () => {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8'));
  const kinds = new Set(source.components.map((c) => c.type));
  assert.ok(!kinds.has('frontend'), 'fixture assumption changed: expected no frontend component');

  const renderWithMode = (mode) => {
    const doc = JSON.parse(JSON.stringify(source));
    doc.meta = { ...doc.meta, legend: { mode } };
    return render('architecture', doc, `legend-${mode}`);
  };

  const hidden = renderWithMode('hidden');
  assert.ok(!/data-legend=/.test(hidden), 'hidden legend mode still rendered a legend group');

  const auto = renderWithMode('auto');
  const all = renderWithMode('all');
  assert.ok(/data-legend=/.test(auto) && /data-legend=/.test(all));
  assert.ok(!auto.includes('>Frontend<'), 'auto legend must omit kinds absent from the diagram');
  assert.ok(all.includes('>Frontend<'), 'all legend must include kinds absent from the diagram');
});

test('node text shrinks toward a legible minimum instead of overflowing (4.9)', async () => {
  const mod = await coreModule('renderers/shared/text-fit.mjs');
  const short = mod.fittedNodeFontSize('API', 120, 9, 6);
  const long = mod.fittedNodeFontSize('A Very Long Component Label That Cannot Possibly Fit', 120, 9, 6);
  assert.equal(short, 9, 'short text should render at the preferred size');
  assert.ok(long < short, 'long text must shrink below the preferred size');
  assert.ok(long >= 6, 'text must never shrink below the legible minimum');
});

// ---------------------------------------------------------------------------
// 2.1 / 2.2 — repository evidence (revision-pinned) and the data behind the
// Verified Source Beacon. The beacon's on-screen "SRC n" affordance is a
// viewer/passport interaction (see 5.3, browser-deferred); what is proved
// here, non-browser, is that the renderer verifies the pinned revision
// against a real local repository and embeds the resulting evidence.
// ---------------------------------------------------------------------------

test('repository evidence verifies a pinned 40-char revision against a real repo and embeds it (2.1, 2.2)', () => {
  const mkdtempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'product-evidence-repo-'));
  process.on('exit', () => fs.rmSync(mkdtempRepo, { recursive: true, force: true }));
  const git = (args, cwd = evidenceRepo) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(['init', '-q'], mkdtempRepo);
  // On Windows CI runners the account backing `os.tmpdir()` is long enough
  // (e.g. "runneradmin") that Windows also exposes an 8.3 short alias for
  // it (e.g. "RUNNER~1"), and that short form is what TEMP/os.tmpdir()
  // actually returns there. `fs.realpathSync` (used by the harvested
  // repository-evidence check below) does not expand that alias, but
  // `git rev-parse --show-toplevel` always reports the canonical long-form
  // path -- so passing the raw mkdtemp path as --repo-root makes the two
  // disagree about "the same directory" even though they are. Resolving
  // through git's own canonical output up front, and using THAT path for
  // every later git/file/CLI operation, keeps this test's repo root in the
  // exact form the harvested check will independently re-derive and match
  // against, on every OS. This is a test-only path issue, not a bug in
  // packages/core.
  const evidenceRepo = git(['rev-parse', '--show-toplevel'], mkdtempRepo).replace(/\//g, path.sep);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['remote', 'add', 'origin', 'https://github.com/acme/widgets.git']);
  fs.mkdirSync(path.join(evidenceRepo, 'src'));
  fs.writeFileSync(
    path.join(evidenceRepo, 'src', 'app.js'),
    Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n',
  );
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial']);
  const revision = git(['rev-parse', 'HEAD']);
  assert.match(revision, /^[a-f0-9]{40}$/);

  const doc = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Evidence test',
      repository: { url: 'https://github.com/acme/widgets', revision },
    },
    components: [
      {
        id: 'app', type: 'backend', label: 'App', pos: [100, 100], size: [120, 60],
        sources: [{ path: 'src/app.js', line: 3, end_line: 5 }],
      },
      { id: 'db', type: 'database', label: 'DB', pos: [300, 100], size: [120, 60] },
    ],
    connections: [{ from: 'app', to: 'db' }],
  };
  const input = writeFixture('evidence.json', doc);
  const output = path.join(tmp, 'evidence.html');
  execFileSync(process.execPath, [
    cliPath(), 'render', 'architecture', input, output, '--repo-root', evidenceRepo,
  ], { encoding: 'utf8' });
  const html = fs.readFileSync(output, 'utf8');
  const match = html.match(/<script id="archify-source-evidence-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'verified repository evidence was not embedded in the rendered artifact');
  const evidence = JSON.parse(match[1]);
  assert.equal(evidence.verified, true);
  assert.equal(evidence.repository.revision, revision);
  assert.equal(evidence.referenceCount, 1);
  assert.ok(Array.isArray(evidence.nodes.app) && evidence.nodes.app.length === 1);

  // A revision that does not exist in the repository must fail, never
  // silently render as if it were verified.
  const badDoc = JSON.parse(JSON.stringify(doc));
  badDoc.meta.repository.revision = '0'.repeat(40);
  const badInput = writeFixture('evidence-bad-revision.json', badDoc);
  const result = spawnSync(process.execPath, [
    cliPath(), 'render', 'architecture', badInput, path.join(tmp, 'evidence-bad.html'), '--repo-root', evidenceRepo,
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'an unavailable pinned revision must fail rendering');
});

// ---------------------------------------------------------------------------
// 3.6 — endpoint side contract
// ---------------------------------------------------------------------------

function sideDoc(fromSide, toSide) {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Endpoint side contract' },
    components: [
      { id: 'a', type: 'backend', label: 'A', pos: [100, 100], size: [120, 60] },
      { id: 'b', type: 'backend', label: 'B', pos: [100, 300], size: [120, 60] },
    ],
    connections: [{ id: 'a-b', from: 'a', to: 'b', fromSide, toSide }],
  };
}

test('an authored endpoint side that the route cannot honour is rejected (3.6)', () => {
  const good = validate('architecture', writeFixture('side-good.json', sideDoc('bottom', 'top')));
  assert.equal(good.ok, true);

  const file = writeFixture('side-bad.json', sideDoc('top', 'top'));
  const { stdout } = validateExpectFailure('architecture', file);
  const receipt = JSON.parse(stdout);
  assert.ok(receipt.diagnostics.some((d) => d.code.includes('endpoint-side')));
});

// ---------------------------------------------------------------------------
// 3.7 — automatic port spread
// ---------------------------------------------------------------------------

test('automatic fan-out spreads connections onto distinct, symmetric ports (3.7)', () => {
  const doc = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Automatic port spread' },
    components: [
      { id: 'hub', type: 'backend', label: 'Hub', pos: [100, 280], size: [120, 60] },
      { id: 'upper', type: 'external', label: 'Upper', pos: [500, 100], size: [120, 60] },
      { id: 'middle', type: 'database', label: 'Middle', pos: [500, 280], size: [120, 60] },
      { id: 'lower', type: 'cloud', label: 'Lower', pos: [500, 460], size: [120, 60] },
    ],
    connections: [
      { id: 'to-upper', from: 'hub', to: 'upper' },
      { id: 'to-middle', from: 'hub', to: 'middle' },
      { id: 'to-lower', from: 'hub', to: 'lower' },
    ],
  };
  const html = render('architecture', doc, 'port-spread');
  function firstPoint(id) {
    const match = html.match(new RegExp(`data-edge-id="${id}"[^>]+data-composition-points="([^"]+)"`));
    assert.ok(match, `missing rendered connection ${id}`);
    return match[1].split(';')[0].split(',').map(Number);
  }
  const upper = firstPoint('to-upper');
  const middle = firstPoint('to-middle');
  const lower = firstPoint('to-lower');
  assert.equal(upper[0], middle[0]);
  assert.equal(middle[0], lower[0]);
  assert.ok(upper[1] < middle[1] && middle[1] < lower[1], 'fan-out ports must spread in target order, not collapse to one point');
});

// ---------------------------------------------------------------------------
// 3.9 — deployment-ownership engineering profile
// ---------------------------------------------------------------------------

function deploymentDoc({ withSecurityGroup = true } = {}) {
  const boundaries = [
    { kind: 'region', label: 'us-east-1', wraps: ['api', 'db'] },
  ];
  if (withSecurityGroup) boundaries.push({ kind: 'security-group', label: 'private subnet', wraps: ['db'] });
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Deployment ownership', engineering_profile: 'deployment-ownership' },
    components: [
      { id: 'ext', type: 'external', label: 'Client', pos: [40, 100], size: [120, 60] },
      { id: 'api', type: 'backend', label: 'API', tag: 'platform', pos: [220, 100], size: [120, 60] },
      { id: 'db', type: 'database', label: 'DB', tag: 'data', pos: [400, 100], size: [120, 60] },
    ],
    boundaries,
    connections: [
      { from: 'ext', to: 'api', label: 'HTTPS' },
      { from: 'api', to: 'db', label: 'TLS' },
    ],
  };
}

test('the deployment-ownership engineering profile requires region and security-group boundaries (3.9)', () => {
  const good = validate('architecture', writeFixture('deployment-good.json', deploymentDoc()));
  assert.equal(good.ok, true);
  assert.equal(good.composition.status, 'pass');

  const file = writeFixture('deployment-broken.json', deploymentDoc({ withSecurityGroup: false }));
  const { stdout } = validateExpectFailure('architecture', file);
  const receipt = JSON.parse(stdout);
  assert.ok(receipt.diagnostics.some((d) => d.code === 'engineering/deployment-boundary-kind'));
});

// ---------------------------------------------------------------------------
// 4.2 — geometry.mjs (38 exports)
// ---------------------------------------------------------------------------

test('geometry.mjs exposes exactly 38 named exports (4.2)', async () => {
  const mod = await coreModule('renderers/shared/geometry.mjs');
  assert.equal(Object.keys(mod).length, 38);
});

// ---------------------------------------------------------------------------
// 4.6 — 23 keyframe animations, 34 transitions
// ---------------------------------------------------------------------------

test('the shipped template carries 23 keyframe animations and 34 transition declarations (4.6)', () => {
  const html = render('architecture', JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8')), 'animation-count');
  assert.equal((html.match(/@keyframes/g) || []).length, 23);
  assert.equal((html.match(/transition:/g) || []).length, 34);
});

// ---------------------------------------------------------------------------
// 4.7 — semantic sigils
// ---------------------------------------------------------------------------

test('rendered nodes carry semantic sigils (4.7)', () => {
  const html = render('architecture', JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), 'utf8')), 'sigils');
  const count = (html.match(/data-semantic-sigil="/g) || []).length;
  assert.ok(count > 0, 'no semantic sigils were rendered');
});

// ---------------------------------------------------------------------------
// 4.8 — Semantic Flow Tokens
// ---------------------------------------------------------------------------

test('the viewer runtime ships the Semantic Flow Token machinery in every artifact (4.8)', () => {
  const html = render('dataflow', JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'product-analytics.dataflow.json'), 'utf8')), 'flow-tokens');
  assert.ok(html.includes('Archify.flowTokens'), 'flow token creation API missing from the artifact');
  assert.ok(html.includes('.semantic-flow-token'), 'flow token CSS missing from the artifact');
});

// ---------------------------------------------------------------------------
// 4.10 — zero SVG filters/gradients
// ---------------------------------------------------------------------------

test('no rendered mode emits an SVG filter or gradient element (4.10)', () => {
  const modes = [
    ['architecture', 'web-app.architecture.json'],
    ['workflow', 'agent-tool-call.workflow.json'],
    ['sequence', 'cache-miss-request.sequence.json'],
    ['dataflow', 'product-analytics.dataflow.json'],
    ['lifecycle', 'agent-run.lifecycle.json'],
  ];
  for (const [mode, fixture] of modes) {
    const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture), 'utf8'));
    const html = render(mode, source, `no-filters-${mode}`);
    const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/);
    assert.ok(svgMatch, `${mode}: no inline SVG found`);
    const svg = svgMatch[0];
    assert.ok(!/<filter[\s>]/.test(svg), `${mode}: SVG <filter> present`);
    assert.ok(!/<linearGradient[\s>]/.test(svg), `${mode}: SVG <linearGradient> present`);
    assert.ok(!/<radialGradient[\s>]/.test(svg), `${mode}: SVG <radialGradient> present`);
  }
});
