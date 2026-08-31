// `npm run export -- <format> <type> <input.json> [output] [--json]`
//
// draw.io and Excalidraw export (row 6.25).
//
// The point is that leaving should be cheap. A diagram you can only edit in
// the tool that made it is a diagram held hostage, so this writes formats that
// open in editors you already have.
//
// It always prints what was LOST. Exporting and then editing elsewhere forks
// the diagram, and the user should learn that from the tool rather than from a
// surprise three weeks later.

import fs from 'node:fs';
import path from 'node:path';
import { EXPORTERS } from '../src/drawio.mjs';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const [format, type, input, output] = argv.filter((arg) => !arg.startsWith('--'));

const FORMATS = Object.keys(EXPORTERS);
if (!format || !FORMATS.includes(format)) {
  console.error(`export: format must be one of ${FORMATS.join(', ')}`);
  console.error('  npm run export -- drawio architecture in.json [out.drawio]');
  process.exit(2);
}
if (!type || !input) {
  console.error('export: <type> and <input.json> are required.');
  process.exit(2);
}
if (!fs.existsSync(path.resolve(input))) {
  console.error(`export: no document at ${input}.`);
  process.exit(2);
}

const document = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
const result = EXPORTERS[format](document, type);
const target = output || `${path.resolve(input).replace(/\.json$/i, '')}${result.extension}`;
fs.writeFileSync(target, result.content);

if (json) {
  console.log(JSON.stringify({
    schemaVersion: 1, ok: true, format, output: target, dropped: result.dropped,
  }, null, 2));
} else {
  console.log(`export: wrote ${target}`);
  if (result.dropped.length === 0) {
    console.log('Nothing was dropped: this document carries nothing the target format cannot hold.');
  } else {
    console.log('\nNot carried across — editing there forks the diagram:');
    for (const loss of result.dropped) console.log(`  - ${loss}`);
  }
}
