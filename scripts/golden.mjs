import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, renderFixture, canonicalise } from '../packages/conformance/src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, '../fixtures/golden/manifest.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-golden-'));
// Only clean up on a passing run: a failure prints "fresh render: <path>"
// above so a human can inspect the mismatching output. Cleaning up
// unconditionally would delete that path out from under the very message
// that just told the reader to go look at it.
process.on('exit', (code) => {
  if (code === 0) fs.rmSync(tmp, { recursive: true, force: true });
});
const writeMode = process.argv.includes('--update');

if (writeMode && process.env.CI) {
  console.error('refusing to regenerate golden digests in CI: --update must be a deliberate local action');
  console.error('a re-baseline hides real rendering regressions; run it locally and commit the manifest diff for review');
  process.exit(1);
}

function digestOf(mode, fixture) {
  const out = path.join(tmp, `${mode}.html`);
  renderFixture(mode, fixture, out);
  const html = canonicalise(fs.readFileSync(out, 'utf8'));
  return { sha256: createHash('sha256').update(html).digest('hex'), out };
}

if (writeMode) {
  const entries = MODES.map(({ mode, fixture }) => ({
    mode, fixture, sha256: digestOf(mode, fixture).sha256,
  }));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`);
  console.log(`wrote ${entries.length} golden digests`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let failures = 0;
for (const entry of manifest.entries) {
  const { sha256, out } = digestOf(entry.mode, entry.fixture);
  if (sha256 === entry.sha256) {
    console.log(`  ok    ${entry.mode}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${entry.mode}`);
    console.error(`        expected ${entry.sha256}`);
    console.error(`        actual   ${sha256}`);
    console.error(`        fresh render: ${out}`);
  }
}
console.log(`\ngolden: ${manifest.entries.length - failures}/${manifest.entries.length} passed`);
process.exit(failures === 0 ? 0 : 1);
