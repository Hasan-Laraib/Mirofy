import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreRoot, fixturesRoot, repoRoot } from '../src/render.mjs';

const cli = path.join(coreRoot, 'bin/archify.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-delivery-'));

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// 6.1 — atomic deliver + SHA-256 receipts
// ---------------------------------------------------------------------------

test('deliver writes a receipt whose SHA-256 hashes match the written files exactly (6.1)', () => {
  const output = path.join(tmp, 'deliver-receipt.html');
  const stdout = execFileSync(process.execPath, [
    cli, 'deliver', 'architecture', path.join(fixturesRoot, 'web-app.architecture.json'), output, '--json',
  ], { encoding: 'utf8' });
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.match(receipt.specification.sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.artifact.sha256, /^[a-f0-9]{64}$/);

  const artifactBytes = fs.readFileSync(output);
  assert.equal(sha256(artifactBytes), receipt.artifact.sha256, 'artifact receipt hash does not match the written file');
  assert.equal(artifactBytes.byteLength, receipt.artifact.bytes);

  const specBytes = fs.readFileSync(path.join(fixturesRoot, 'web-app.architecture.json'));
  assert.equal(sha256(specBytes), receipt.specification.sha256, 'specification receipt hash does not match the source file');
});

test('deliver never clobbers a previously delivered artifact when given invalid input, and leaves no staging directory (6.1)', () => {
  const output = path.join(tmp, 'deliver-atomic.html');
  execFileSync(process.execPath, [
    cli, 'deliver', 'architecture', path.join(fixturesRoot, 'web-app.architecture.json'), output, '--json',
  ], { encoding: 'utf8' });
  const goodBytes = fs.readFileSync(output);
  const goodHash = sha256(goodBytes);

  const result = spawnSync(process.execPath, [
    cli, 'deliver', 'architecture', path.join(fixturesRoot, 'agent-run.lifecycle.json'), output, '--json',
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'delivering an invalid document must fail');
  assert.ok(!String(result.stdout + result.stderr).includes('at Object.<anonymous>'), 'a stack trace leaked into deliver output');
  const failureReceipt = JSON.parse(result.stdout);
  assert.equal(failureReceipt.ok, false);
  assert.ok(Array.isArray(failureReceipt.diagnostics) && failureReceipt.diagnostics.length > 0);

  assert.equal(sha256(fs.readFileSync(output)), goodHash, 'the previously delivered good artifact was overwritten');

  const leftoverStaging = fs.readdirSync(path.dirname(output)).filter((name) => name.startsWith('.archify-delivery-'));
  assert.deepEqual(leftoverStaging, [], 'a delivery staging directory was left behind after failure');
});

// ---------------------------------------------------------------------------
// 6.2 — last-good preview server
// ---------------------------------------------------------------------------

test('the preview server keeps serving the last verified artifact when a later edit becomes invalid (6.2)', async () => {
  const previewModule = await import(pathToFileURL(path.join(coreRoot, 'bin/preview.mjs')).href);
  const previewTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-preview-'));
  const inputPath = path.join(previewTmp, 'input.architecture.json');
  const outputPath = path.join(previewTmp, 'output.html');
  fs.copyFileSync(path.join(fixturesRoot, 'web-app.architecture.json'), inputPath);

  const handle = await previewModule.startPreview({
    type: 'architecture',
    input: inputPath,
    output: outputPath,
    cwd: previewTmp,
    open: false,
    debounceMs: 50,
    pollMs: 80,
  });

  try {
    async function getState() {
      const res = await fetch(`${handle.url}state`);
      return res.json();
    }
    async function waitFor(predicate, timeoutMs = 8000) {
      const start = Date.now();
      let last;
      while (Date.now() - start < timeoutMs) {
        last = await getState();
        if (predicate(last)) return last;
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }
      throw new Error(`timed out waiting for preview state; last state was ${JSON.stringify(last)}`);
    }

    const verified = await waitFor((state) => state.status === 'verified');
    assert.equal(verified.lastVerified.checksPassed, verified.lastVerified.checkCount);

    const goodArtifact = await (await fetch(`${handle.url}artifact.html`)).text();
    assert.ok(goodArtifact.length > 0);

    fs.writeFileSync(inputPath, fs.readFileSync(path.join(fixturesRoot, 'agent-run.lifecycle.json')));
    const needsFix = await waitFor((state) => state.status === 'needs-fix');
    assert.equal(typeof needsFix.failure.message, 'string');
    assert.ok(needsFix.failure.message.length > 0);

    const stillServed = await (await fetch(`${handle.url}artifact.html`)).text();
    assert.equal(stillServed, goodArtifact, 'preview server must keep serving the last-good artifact after a bad edit');
  } finally {
    await handle.stop({ force: true });
    fs.rmSync(previewTmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6.3 — visual-check (4 viewports, pending)
// ---------------------------------------------------------------------------

test('visual-check inspects 4 viewports and reports its review as pending, never as passed (6.3)', (t) => {
  const output = path.join(tmp, 'visual-check-target.html');
  execFileSync(process.execPath, [
    cli, 'deliver', 'architecture', path.join(fixturesRoot, 'web-app.architecture.json'), output, '--json',
  ], { encoding: 'utf8' });

  const result = spawnSync(process.execPath, [cli, 'visual-check', output, '--json'], { encoding: 'utf8' });
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch {
    receipt = null;
  }
  if (!receipt || receipt.chrome?.status !== 'available') {
    t.skip('no local Chrome detected; visual-check cannot run headless in this environment');
    return;
  }
  assert.equal(receipt.visualReview, 'pending', 'visual-check must never report review as complete on its own');
  assert.equal(receipt.containment.viewports.length, 4);
  const widths = receipt.containment.viewports.map((v) => v.width).sort((a, b) => a - b);
  assert.deepEqual(widths, [1440, 1600, 1920, 2048]);
});

// ---------------------------------------------------------------------------
// 6.7 — compare (Before/Delta/After + receipt)
// ---------------------------------------------------------------------------

test('compare produces a Before/After delta receipt whose hashes match the real input files (6.7)', () => {
  const basePath = path.join(coreRoot, 'examples/checkout-platform.base.architecture.json');
  const headPath = path.join(coreRoot, 'examples/checkout-platform.head.architecture.json');
  const output = path.join(tmp, 'compare.html');
  const receiptPath = path.join(tmp, 'compare-receipt.json');

  const stdout = execFileSync(process.execPath, [
    cli, 'compare', 'architecture', basePath, headPath, output, '--receipt', receiptPath, '--json',
  ], { encoding: 'utf8' });
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.command, 'compare');
  assert.ok(receipt.summary.components.added + receipt.summary.components.removed
    + receipt.summary.components.changed > 0, 'expected the fixture pair to show real component changes');

  assert.equal(receipt.base.rawSha256, sha256(fs.readFileSync(basePath)));
  assert.equal(receipt.head.rawSha256, sha256(fs.readFileSync(headPath)));

  const writtenReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.deepEqual(writtenReceipt, receipt, 'the written --receipt file must match stdout exactly');
  assert.ok(fs.existsSync(output), 'compare must also render a Before/Delta/After HTML artifact');
});

// ---------------------------------------------------------------------------
// 6.8 — CLI subcommand surface
// ---------------------------------------------------------------------------

test('the CLI exposes render, validate, deliver, check, guide, brands, doctor, and demo (6.8)', () => {
  const result = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  const usage = result.stdout + result.stderr;
  for (const subcommand of ['render', 'validate', 'deliver', 'check', 'guide', 'brands', 'doctor', 'demo']) {
    assert.match(usage, new RegExp(`archify ${subcommand}\\b`), `usage text is missing the "${subcommand}" subcommand`);
  }
});

// ---------------------------------------------------------------------------
// 6.9 — zero runtime dependencies
// ---------------------------------------------------------------------------

test('every workspace package.json has zero runtime dependencies (6.9)', () => {
  const packageJsonPaths = [
    path.join(repoRoot, 'package.json'),
    path.join(coreRoot, 'package.json'),
    path.join(repoRoot, 'packages/conformance/package.json'),
  ];
  for (const packagePath of packageJsonPaths) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    assert.equal(pkg.dependencies, undefined, `${packagePath} declares runtime dependencies`);
  }
});
