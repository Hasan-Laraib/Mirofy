import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, renderFixture, canonicalise } from '../packages/conformance/src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outDir = path.join(repoRoot, '.artifacts');
const verify = process.argv.includes('--check');

fs.mkdirSync(outDir, { recursive: true });
const built = [];
for (const { mode, fixture } of MODES) {
  const out = path.join(outDir, `${mode}.html`);
  renderFixture(mode, fixture, out);
  const sha256 = createHash('sha256')
    .update(canonicalise(fs.readFileSync(out, 'utf8'))).digest('hex');
  built.push({ mode, fixture, sha256 });
  console.log(`  built ${mode}.html  ${sha256.slice(0, 12)}`);
}

if (!verify) process.exit(0);

const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'fixtures/golden/manifest.json'), 'utf8'));
let failures = 0;
for (const entry of built) {
  const expected = manifest.entries.find((e) => e.mode === entry.mode);
  if (!expected || expected.sha256 !== entry.sha256) {
    failures += 1;
    console.error(`  FAIL  ${entry.mode}: rebuilt artifact does not match the golden digest`);
  }
}
console.log(`\nartifacts: ${built.length - failures}/${built.length} reproducible`);
process.exit(failures === 0 ? 0 : 1);
