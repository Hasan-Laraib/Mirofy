// Row 2.4. The differentiator: every relationship can answer "why do I believe
// this?". Asserted per diagram type, because evidence existed for exactly one
// of the five before this task -- architecture components -- and a
// single-type test would have passed while four types silently had no support
// at all.
//
// Validation goes through the CLI rather than importing the validator, so the
// test exercises the path a user actually takes: schema -> generated
// validator -> receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot, fixturesRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-evidence-'));
const cli = path.join(coreRoot, 'bin/mirofy.mjs');

const FIXTURE = {
  architecture: 'web-app.architecture.json',
  dataflow: 'event-stream.dataflow.json',
  lifecycle: 'agent-run.lifecycle.json',
  sequence: 'cache-miss-request.sequence.json',
  workflow: 'agent-tool-call.workflow.json',
};

const RELATIONSHIP_ARRAY = {
  architecture: 'connections',
  dataflow: 'flows',
  lifecycle: 'transitions',
  sequence: 'messages',
  workflow: 'edges',
};

function validate(mode, doc) {
  const file = path.join(tmp, `${mode}-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(file, JSON.stringify(doc));
  // The CLI exits non-zero on an invalid document, which is the point of half
  // these assertions, and execFileSync throws on a non-zero exit. The receipt
  // is on stdout either way, so read it from the thrown error rather than
  // letting a correctly-rejected document look like a broken test.
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [cli, 'validate', mode, file, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) throw error;
  }
  const receipt = JSON.parse(stdout);
  return { ok: receipt.ok === true, message: receipt.error ?? JSON.stringify(receipt.diagnostics ?? []) };
}

for (const [mode, arrayName] of Object.entries(RELATIONSHIP_ARRAY)) {
  test(`[2.4] ${mode} accepts sources on its ${arrayName} and rejects a malformed entry`, () => {
    const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, FIXTURE[mode]), 'utf8'));
    const rels = source[arrayName];
    assert.ok(Array.isArray(rels) && rels.length, `${mode} fixture has no ${arrayName}`);

    // Accepted: a well-formed evidence entry on the first relationship.
    rels[0].sources = [{ path: 'src/api/routes.ts', line: 12, end_line: 20, label: 'route table' }];
    const accepted = validate(mode, source);
    assert.equal(accepted.ok, true, accepted.message);

    // Rejected: `path` is required, so an entry without it must fail validation
    // rather than being silently dropped -- evidence that vanishes quietly is
    // worse than evidence that was never claimed.
    rels[0].sources = [{ line: 12 }];
    assert.equal(validate(mode, source).ok, false, `${mode} accepted a source with no path`);
  });
}
