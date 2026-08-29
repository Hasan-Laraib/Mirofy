// Proves rows 3.1-3.5 (the five "clean gate" rows) actually detect the
// violation they are named for, not merely that a clean fixture stays clean.
//
// Why this exists: `validation-gates.test.mjs`'s Step-1 tests render one
// known-good fixture and assert all nine checks report ok:true. A gate whose
// detector was deleted entirely (`return []`) also reports ok:true on a
// clean fixture — that assertion cannot tell "the gate works" from "the gate
// is gone". Each test below instead authors a minimal fixture that commits
// a real, specific violation, then asserts the *named* check catches it.
//
// Why the quality-profile is patched rather than passed as --quality
// showcase end-to-end: four of these five gates (crossing, corridor, label
// clearance, route rhythm) are enforced identically at two points —
// once during rendering (geometry.mjs's clean*Problems, which *rejects* the
// document outright under `--quality showcase`) and once by the standalone
// post-render checker (scripts/check-render-output.mjs, which *reports* a
// checks[] entry). Both read the same "is this showcase?" decision, so
// asking the renderer itself for a showcase artifact of a genuinely-violating
// document throws before a checks[] array ever exists — there would be
// nothing to assert `checks[].ok === false` against. So each violation is
// rendered once under the default (standard) profile, where the render-time
// gate is inactive and the checker treats the finding as advisory, and the
// checker is then run a second time against a copy whose baked-in quality
// marker is flipped to "showcase" — exactly the marker the real `deliver`
// pipeline bakes in when it does render under `--quality showcase`. This
// exercises the real, unmodified checker script both ways; it does not
// invent new detection logic.
//
// A second, stronger proof sits below: the real CLI, invoked on each
// unmodified fixture under --quality showcase, does reject it outright
// (render/validate/deliver all exit non-zero with a diagnostic naming this
// gate's own composition/* code) -- confirming the claim this project
// actually makes (showcase acceptance blocks a violating delivery), not
// just that the checker script's severity logic works on a doctored
// artifact. Both proofs are kept: the CLI proof shows the pipeline blocks
// delivery; the patched-checker proof above is what row 1.7 needs to show
// the standard-vs-showcase severity distinction on the very same artifact,
// which the CLI proof alone cannot do (a showcase CLI run of a violating
// fixture never produces an artifact to compare against its standard twin).
//
// container_border_runs (3.4) is gated differently: enforced whenever any
// quality profile is requested at all (not "showcase" specifically), and
// advisory only when the artifact was rendered with none. Its patch removes
// the `data-quality-gates="advisory"` marker instead of changing a value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { coreRoot, repoRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-negative-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const negativeFixturesRoot = path.join(repoRoot, 'fixtures/negative');
const checker = path.join(coreRoot, 'scripts/check-render-output.mjs');
const renderer = path.join(coreRoot, 'renderers/architecture/render-architecture.mjs');

function renderNegative(name) {
  const input = path.join(negativeFixturesRoot, name);
  const output = path.join(tmp, name.replace('.json', '.html'));
  execFileSync(process.execPath, [renderer, input, output], { stdio: ['ignore', 'ignore', 'pipe'] });
  return output;
}

function runChecker(htmlPath) {
  try {
    const stdout = execFileSync(process.execPath, [checker, htmlPath], { encoding: 'utf8' });
    return JSON.parse(stdout);
  } catch (err) {
    assert.ok(err.stdout, `checker produced no stdout to parse: ${err.stderr}`);
    return JSON.parse(String(err.stdout));
  }
}

function patched(htmlPath, suffix, transform) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const result = transform(html);
  assert.notEqual(result, html, `patch had no effect on ${htmlPath} — the marker this test relies on may have moved`);
  const outPath = `${htmlPath}.${suffix}.html`;
  fs.writeFileSync(outPath, result);
  return outPath;
}

function toShowcase(htmlPath) {
  return patched(htmlPath, 'showcase', (html) => html.replace('data-quality-profile="standard"', 'data-quality-profile="showcase"'));
}

function toEnforced(htmlPath) {
  return patched(htmlPath, 'enforced', (html) => html.replace(' data-quality-gates="advisory"', ''));
}

function assertAdvisoryThenEnforced(name, checkName, enforce) {
  const output = renderNegative(name);
  const advisory = runChecker(output);
  assert.equal(advisory.ok, true, `${checkName}: standard-quality artifact should still validate ok overall`);
  const advisoryCheck = advisory.checks.find((c) => c.name === checkName);
  assert.ok(advisoryCheck, `${checkName}: check missing from the nine`);
  assert.equal(advisoryCheck.ok, true, `${checkName}: must be advisory (ok:true) under standard quality`);
  assert.ok(advisoryCheck.details.length > 0, `${checkName}: the authored violation was not even detected as a warning`);
  assert.ok(advisory.composition.summary.warnings > 0, `${checkName}: expected a composition warning under standard quality`);

  const enforcedPath = enforce(output);
  const enforced = runChecker(enforcedPath);
  assert.equal(enforced.ok, false, `${checkName}: must fail once this gate is enforced`);
  const enforcedCheck = enforced.checks.find((c) => c.name === checkName);
  assert.ok(enforcedCheck, `${checkName}: check missing from the nine`);
  assert.equal(enforcedCheck.ok, false, `${checkName} must be the check reporting the failure`);
  assert.equal(enforced.composition.status, 'fail');
  assert.ok(enforced.composition.summary.errors > 0);
}

test('relationship_crossings fires on a genuine proper-crossing (3.1)', () => {
  assertAdvisoryThenEnforced('relationship-crossing-violation.architecture.json', 'relationship_crossings', toShowcase);
});

test('label_route_clearance fires on a label sitting under 4px from an unrelated route (3.2)', () => {
  assertAdvisoryThenEnforced('label-route-clearance-violation.architecture.json', 'label_route_clearance', toShowcase);
});

test('relationship_corridors fires on two unrelated relationships sharing a >=8px corridor (3.3)', () => {
  assertAdvisoryThenEnforced('ambiguous-corridor-violation.architecture.json', 'relationship_corridors', toShowcase);
});

test('container_border_runs fires on a relationship that runs along a boundary border instead of crossing it (3.4)', () => {
  assertAdvisoryThenEnforced('container-border-run-violation.architecture.json', 'container_border_runs', toEnforced);
});

test('route_rhythm fires on a cramped sub-16px interior turn (3.5)', () => {
  assertAdvisoryThenEnforced('route-rhythm-violation.architecture.json', 'route_rhythm', toShowcase);
});

// ---------------------------------------------------------------------------
// Direct proof: the real CLI, run on each unmodified fixture under
// --quality showcase, actually blocks delivery -- not just that a doctored
// artifact's checks[] entry can be made to read false. `validate --json`
// gives the richest structured diagnostic (code, severity, subject,
// evidence, supportedFixes); asserting the specific composition/* code (not
// merely a nonzero exit) keeps a fixture that starts failing on some other
// gate from being silently accepted as proof of this one.
// ---------------------------------------------------------------------------

const cli = path.join(coreRoot, 'bin/archify.mjs');

function validateShowcaseExpectFailure(fixtureName) {
  const input = path.join(negativeFixturesRoot, fixtureName);
  try {
    execFileSync(process.execPath, [
      cli, 'validate', 'architecture', input, '--quality', 'showcase', '--json',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail(`validate --quality showcase unexpectedly succeeded for ${fixtureName}`);
  } catch (err) {
    if (err.name === 'AssertionError') throw err;
    assert.notEqual(err.status, 0, `${fixtureName}: expected a nonzero exit under showcase quality`);
    return JSON.parse(String(err.stdout));
  }
}

function assertCliBlocksDelivery(fixtureName, expectedCode) {
  const receipt = validateShowcaseExpectFailure(fixtureName);
  assert.equal(receipt.ok, false);
  const codes = (receipt.diagnostics || []).map((d) => d.code);
  assert.ok(codes.includes(expectedCode), `expected diagnostic code ${expectedCode}, got [${codes.join(', ')}]`);
}

test('CLI: showcase validate blocks delivery of a genuine proper-crossing (3.1)', () => {
  assertCliBlocksDelivery('relationship-crossing-violation.architecture.json', 'composition/proper-crossing');
});

test('CLI: showcase validate blocks delivery of a sub-4px label/route clearance (3.2)', () => {
  assertCliBlocksDelivery('label-route-clearance-violation.architecture.json', 'composition/label-route-clearance');
});

test('CLI: showcase validate blocks delivery of an ambiguous >=8px corridor (3.3)', () => {
  assertCliBlocksDelivery('ambiguous-corridor-violation.architecture.json', 'composition/ambiguous-corridor');
});

test('CLI: showcase validate blocks delivery of a container border run (3.4)', () => {
  assertCliBlocksDelivery('container-border-run-violation.architecture.json', 'composition/container-border-run');
});

test('CLI: showcase validate blocks delivery of a cramped sub-16px interior turn (3.5)', () => {
  assertCliBlocksDelivery('route-rhythm-violation.architecture.json', 'composition/short-interior-segment');
});

// ---------------------------------------------------------------------------
// Third, independent proof: `archify render` (not `validate`). `validate`
// always runs the standalone checker (scripts/check-render-output.mjs) as
// its second stage whenever the renderer itself exits 0 -- so a CLI test
// built on `validate` can pass on the strength of the checker alone and
// never actually exercise the render-time gate in geometry.mjs's
// clean*Problems functions (commandValidate only reaches "render" stage
// failure when the renderer itself throws). `render` has no such second
// stage: commandRender in bin/archify.mjs only spawns the renderer and
// forwards its exit code, so this is the one CLI path whose result depends
// solely on the render-time gate.
//
// Proof this closes the gap: gutting all six clean*Problems functions
// (`if (1) return [];` at the top of each) leaves every test above green --
// the checker independently re-detects the same violation via its own,
// separate implementation -- while these five fail, because `render`
// --quality showcase now writes the violating artifact instead of exiting
// non-zero. See docs/harvest.md-adjacent conformance notes / the fix report
// for the captured before/after output.
//
// The renderer has no --json diagnostic mode wired through `render` (that
// flag is only threaded through `validate`/`deliver` via rendererEnv's
// diagnosticJson parameter), so the diagnostic is read off the plain-text
// uncaught-exception message the renderer prints to stderr when it throws --
// asserting the specific bracketed `[composition/*]` code embedded in that
// message, not just the nonzero exit. A bare exit-code assertion would not
// be enough: under full gutting the crossing fixture still exits non-zero
// from a *different* codepath in some configurations (e.g. if a caller adds
// `validate` alongside `render`), so the code must be the specific one this
// gate emits.
// ---------------------------------------------------------------------------

function renderShowcaseExpectFailure(fixtureName) {
  const input = path.join(negativeFixturesRoot, fixtureName);
  const output = path.join(tmp, `render-showcase-${fixtureName}.html`);
  return spawnSync(process.execPath, [
    cli, 'render', 'architecture', input, output, '--quality', 'showcase',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function assertRenderBlocksDelivery(fixtureName, expectedCode) {
  const result = renderShowcaseExpectFailure(fixtureName);
  assert.notEqual(result.status, 0, `${fixtureName}: expected a nonzero exit from 'archify render --quality showcase'`);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.ok(
    output.includes(`[${expectedCode}]`),
    `${fixtureName}: expected render output to name ${expectedCode}, got:\n${output}`,
  );
}

test('CLI: showcase render rejects a genuine proper-crossing with composition/proper-crossing (3.1)', () => {
  assertRenderBlocksDelivery('relationship-crossing-violation.architecture.json', 'composition/proper-crossing');
});

test('CLI: showcase render rejects a sub-4px label/route clearance with composition/label-route-clearance (3.2)', () => {
  assertRenderBlocksDelivery('label-route-clearance-violation.architecture.json', 'composition/label-route-clearance');
});

test('CLI: showcase render rejects an ambiguous >=8px corridor with composition/ambiguous-corridor (3.3)', () => {
  assertRenderBlocksDelivery('ambiguous-corridor-violation.architecture.json', 'composition/ambiguous-corridor');
});

test('CLI: showcase render rejects a container border run with composition/container-border-run (3.4)', () => {
  assertRenderBlocksDelivery('container-border-run-violation.architecture.json', 'composition/container-border-run');
});

test('CLI: showcase render rejects a cramped sub-16px interior turn with composition/short-interior-segment (3.5)', () => {
  assertRenderBlocksDelivery('route-rhythm-violation.architecture.json', 'composition/short-interior-segment');
});
