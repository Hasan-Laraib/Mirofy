import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, renderFixture, canonicalise, fixturesRoot } from '../packages/conformance/src/render.mjs';

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

const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial'];

// meta.visual_preset is the only render-time visual input; theme is a
// runtime toggle the viewer applies from localStorage, so it is covered by
// the browser suite rather than here. All eight palette blocks are embedded
// in every artifact regardless of preset, so these 20 digests do byte-cover
// all eight palettes -- what the extra presets add is coverage of the
// renderer's own preset-conditional branches.
function renderWithPreset(mode, fixture, preset, outPath) {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture), 'utf8'));
  source.meta = { ...source.meta, visual_preset: preset };
  const patched = path.join(tmp, `${mode}-${preset}.source.json`);
  fs.writeFileSync(patched, JSON.stringify(source));
  renderFixture(mode, patched, outPath);
}

function digestOf(mode, fixture, preset) {
  const out = path.join(tmp, `${mode}-${preset}.html`);
  renderWithPreset(mode, fixture, preset, out);
  const html = canonicalise(fs.readFileSync(out, 'utf8'));
  return { sha256: createHash('sha256').update(html).digest('hex'), out };
}

if (writeMode) {
  const entries = MODES.flatMap(({ mode, fixture }) => PRESETS.map((preset) => ({
    mode, fixture, preset, sha256: digestOf(mode, fixture, preset).sha256,
  })));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`);
  console.log(`wrote ${entries.length} golden digests`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let failures = 0;
for (const entry of manifest.entries) {
  const { sha256, out } = digestOf(entry.mode, entry.fixture, entry.preset);
  if (sha256 === entry.sha256) {
    console.log(`  ok    ${entry.mode}/${entry.preset}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${entry.mode}/${entry.preset}: digest mismatch`);
    console.error(`        expected ${entry.sha256}`);
    console.error(`        actual   ${sha256}`);
    console.error(`        fresh render: ${out}`);
  }
}
console.log(`\ngolden: ${manifest.entries.length - failures}/${manifest.entries.length} passed`);
process.exit(failures === 0 ? 0 : 1);
