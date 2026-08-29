// ONE-TIME extractor. Slices packages/core/assets/template.html into the
// parts that packages/viewer/build.mjs reassembles. Deleted at the end of
// Task 3 -- once the parts are committed, the template is generated from
// them and this script has no further reason to exist. Kept in history.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const templatePath = path.join(repoRoot, 'packages/core/assets/template.html');
const srcRoot = path.join(repoRoot, 'packages/viewer/src');

const text = fs.readFileSync(templatePath, 'utf8');
if (text.includes('\r')) {
  console.error('template.html contains CR bytes; expected LF-only. Check .gitattributes and core.autocrlf.');
  process.exit(1);
}
const lines = text.split('\n');

// Template line N is lines[N-1]. The file ends with a newline, so the final
// element of `lines` is an empty string that must not be re-emitted.
function slice(from, to) {
  return `${lines.slice(from - 1, to).join('\n')}\n`;
}

/** @type {Array<[string, number, number]>} */
const cuts = [
  ['html/00-head.html', 1, 7],
  ['js/boot.js', 9, 32],
  ['html/01-head-tail.html', 34, 41],
  ['css/viewer.css', 43, 4848],
  ['html/02-markup.html', 4850, 5383],
  ['js/viewer.js', 5385, 14784],
  ['html/03-tail.html', 14786, 14787],
];

for (const [rel, from, to] of cuts) {
  const dest = path.join(srcRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, slice(from, to));
  console.log(`wrote ${rel} (${to - from + 1} lines)`);
}

// The viewer JS is a sequence of IIFEs. Cut immediately after each block's
// closing `    })();` so the parts are contiguous -- every line lands in
// exactly one part and nothing is dropped in the gaps between blocks
// (those gaps hold comments that belong with the block that follows).
const jsPath = path.join(srcRoot, 'js/viewer.js');
const jsLines = fs.readFileSync(jsPath, 'utf8').split('\n');

/** @type {Array<[string, number, number]>} */
const jsCuts = [
  ['01-preamble.js', 1, 60],
  ['02-preset.js', 61, 169],
  ['03-theme.js', 170, 234],
  ['04-export.js', 235, 1689],
  ['05-motion-governor.js', 1690, 1954],
  ['06-source-evidence.js', 1955, 2024],
  ['07-focus.js', 2025, 3462],
  ['08-intent-trace.js', 3463, 3676],
  ['09-guided-views.js', 3677, 5389],
  ['10-reader-layout.js', 5390, 5606],
  ['11-chrome-layout.js', 5607, 5918],
  ['12-camera.js', 5919, 6445],
  ['13-radar.js', 6446, 7073],
  ['14-presentation.js', 7074, 7147],
  ['15-finder.js', 7148, 7413],
  ['16-route-probe.js', 7414, 8448],
  ['17-semantic-lens.js', 8449, 9124],
  ['18-guide.js', 9125, 9311],
  ['19-bootstrap.js', 9312, 9400],
];

// Contiguity assertion: a gap or overlap here would silently drop or
// duplicate viewer code, and the byte-identity check would be the only
// thing that caught it. Fail here instead, where the message is useful.
let expected = 1;
for (const [name, from, to] of jsCuts) {
  if (from !== expected) throw new Error(`${name}: expected to start at ${expected}, got ${from}`);
  expected = to + 1;
}
if (expected - 1 !== jsLines.length - 1) {
  throw new Error(`js cuts cover ${expected - 1} lines; viewer.js has ${jsLines.length - 1}`);
}

for (const [name, from, to] of jsCuts) {
  const dest = path.join(srcRoot, 'js', name);
  fs.writeFileSync(dest, `${jsLines.slice(from - 1, to).join('\n')}\n`);
  console.log(`wrote js/${name} (${to - from + 1} lines)`);
}
fs.rmSync(jsPath);
