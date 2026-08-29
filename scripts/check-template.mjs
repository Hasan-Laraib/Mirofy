// Proves packages/core/assets/template.html is exactly what packages/viewer
// builds. This is the gate that lets the viewer be restructured without
// trusting anyone's claim that the restructure changed nothing: if the
// rebuilt bytes differ by one character, this fails and names the offset.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { buildTemplate, TEMPLATE_PATH } from '../packages/viewer/build.mjs';

const built = Buffer.from(buildTemplate(), 'utf8');
const committed = fs.readFileSync(TEMPLATE_PATH);

if (built.equals(committed)) {
  console.log(`template: byte-identical to packages/viewer sources (${built.byteLength} bytes)`);
  process.exit(0);
}

console.error('template.html does not match what packages/viewer builds.');
console.error(`  committed: ${committed.byteLength} bytes`);
console.error(`  rebuilt:   ${built.byteLength} bytes`);

const limit = Math.min(built.byteLength, committed.byteLength);
let at = 0;
while (at < limit && built[at] === committed[at]) at += 1;
const line = committed.subarray(0, at).toString('utf8').split('\n').length;
console.error(`  first difference at byte ${at} (template.html line ${line})`);
console.error(`  committed: ${JSON.stringify(committed.subarray(at, at + 60).toString('utf8'))}`);
console.error(`  rebuilt:   ${JSON.stringify(built.subarray(at, at + 60).toString('utf8'))}`);
console.error('run `npm run build:template` if the sources are correct and the template is stale');
process.exit(1);
