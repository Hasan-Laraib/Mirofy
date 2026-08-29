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
