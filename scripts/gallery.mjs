// Renders every diagram type in every visual preset into preview/, with an
// index page. This is the operator's "what does it look like now" surface:
// run after any change that could alter rendered output.
//
// Deliberately renders from fixtures/sources rather than committed examples --
// the committed examples were removed in P1a as build output, and fixtures are
// what the golden digests and conformance suite already use, so the gallery
// shows the same inputs the gates reason about.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, renderFixture, fixturesRoot } from '../packages/conformance/src/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outRoot = path.join(repoRoot, 'preview');
const PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial', 'okabe-ito'];

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(outRoot, '.src-'));

/** @type {Array<{mode: string, preset: string, file: string, bytes: number}>} */
const made = [];
for (const { mode, fixture } of MODES) {
  const source = JSON.parse(fs.readFileSync(path.join(fixturesRoot, fixture), 'utf8'));
  for (const preset of PRESETS) {
    const patched = { ...source, meta: { ...source.meta, visual_preset: preset } };
    delete patched.meta.output;
    const src = path.join(scratch, `${mode}-${preset}.json`);
    fs.writeFileSync(src, JSON.stringify(patched));
    const file = `${mode}--${preset}.html`;
    renderFixture(mode, src, path.join(outRoot, file));
    made.push({ mode, preset, file, bytes: fs.statSync(path.join(outRoot, file)).size });
  }
}
fs.rmSync(scratch, { recursive: true, force: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const groups = MODES.map(({ mode }) => {
  const cards = made.filter((m) => m.mode === mode).map((m) =>
    `<a class="card" href="${m.file}"><div class="p">${esc(m.preset)}</div>`
    + `<div class="m">${(m.bytes / 1024).toFixed(0)} KB</div></a>`).join('\n');
  return `<h2>${esc(mode)}</h2>\n<div class="grid">\n${cards}\n</div>`;
}).join('\n\n');

fs.writeFileSync(path.join(outRoot, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Mirofy preview</title>
<style>
 body{font:15px/1.55 ui-sans-serif,system-ui,sans-serif;margin:0;padding:2rem;background:#f7f6f3;color:#1a1a1a}
 @media (prefers-color-scheme:dark){body{background:#14161a;color:#f2f2f2}}
 .wrap{max-width:1000px;margin:0 auto}
 h2{font-size:1rem;margin:1.8rem 0 .6rem;border-bottom:1px solid #8884;padding-bottom:.3rem}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.5rem}
 a.card{display:block;padding:.7rem .8rem;border:1px solid #8884;border-radius:7px;text-decoration:none;color:inherit}
 a.card:hover{border-color:#0072b2}
 .p{font-weight:600;font-size:.9rem}.m{opacity:.65;font-size:.78rem}
</style>
<div class="wrap"><h1>Mirofy preview</h1>
<p>Press <kbd>S</kbd> inside a diagram to cycle presets. Click a node to open the Semantic Passport.</p>
${groups}</div>\n`);

console.log(`gallery: ${made.length} artifacts in ${path.relative(repoRoot, outRoot)}/`);
console.log(`open ${path.join(outRoot, 'index.html')}`);
