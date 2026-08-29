import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTS } from './src/parts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.join(here, 'src');
export const TEMPLATE_PATH = path.resolve(here, '../core/assets/template.html');

export function buildTemplate() {
  return PARTS.map((part) => {
    if (part.kind === 'literal') return part.text;
    const body = fs.readFileSync(path.join(SRC_ROOT, part.path), 'utf8');
    if (body.includes('\r')) {
      throw new Error(`${part.path} contains CR bytes; viewer sources must be LF-only`);
    }
    return body;
  }).join('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  fs.writeFileSync(TEMPLATE_PATH, buildTemplate());
  console.log(`wrote ${TEMPLATE_PATH}`);
}
