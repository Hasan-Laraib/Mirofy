#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as simpleIcons from 'simple-icons';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const catalogPath = path.join(root, 'brand-marks', 'catalog.json');
const outputPath = path.join(root, 'renderers', 'shared', 'generated-brand-marks.mjs');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
// Where simple-icons actually is, rather than where a single-package layout
// would put it. npm hoists dependencies to the workspace root, so the literal
// `packages/core/node_modules/simple-icons` this used to read did not exist and
// `--check` died with ENOENT every time it was run. Nothing noticed, because
// nothing ran it.
//
// `simple-icons/package.json` is not an exported subpath, so it cannot be
// resolved directly; resolve the entry point Node itself would import and walk
// up to the manifest that owns it.
function versionOfSimpleIcons() {
  const entry = fileURLToPath(import.meta.resolve('simple-icons'));
  let dir = path.dirname(entry);
  for (let up = 0; up < 6; up += 1) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (parsed.name === 'simple-icons') return parsed.version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('could not locate the simple-icons manifest from ' + entry);
}

const simpleIconsVersion = versionOfSimpleIcons();
const simpleBySlug = new Map(Object.values(simpleIcons)
  .filter((icon) => icon && typeof icon === 'object' && icon.slug && icon.path)
  .map((icon) => [icon.slug, icon]));

function normalizedList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter(Boolean))];
}

function lookupForms(value) {
  const raw = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (!raw) return [];
  return [...new Set([
    raw,
    raw.replace(/[\s_]+/g, '-'),
    raw.replace(/[\s_.-]+/g, ''),
  ])];
}

function fail(message) {
  console.error(`brand catalog: ${message}`);
  process.exit(1);
}

if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.marks) || catalog.marks.length === 0) {
  fail('catalog.json must contain a non-empty schemaVersion 1 marks array');
}

const ids = new Set();
const lookupKeys = new Map();
const domains = new Map();
const generated = catalog.marks.map((entry, index) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id || '')) fail(`marks[${index}] has an invalid id`);
  if (ids.has(entry.id)) fail(`duplicate id ${entry.id}`);
  ids.add(entry.id);

  const aliases = normalizedList(entry.aliases);
  const entryDomains = normalizedList(entry.domains).map((domain) => domain.toLowerCase());
  for (const key of [entry.id, ...aliases]) {
    for (const form of lookupForms(key)) {
      if (lookupKeys.has(form) && lookupKeys.get(form) !== entry.id) {
        fail(`lookup key ${JSON.stringify(key)} is shared by ${lookupKeys.get(form)} and ${entry.id}`);
      }
      lookupKeys.set(form, entry.id);
    }
  }
  for (const domain of entryDomains) {
    if (domains.has(domain) && domains.get(domain) !== entry.id) {
      fail(`domain ${domain} is shared by ${domains.get(domain)} and ${entry.id}`);
    }
    domains.set(domain, entry.id);
  }

  let mark;
  if (entry.simpleIcon) {
    const icon = simpleBySlug.get(entry.simpleIcon);
    if (!icon) fail(`${entry.id} references missing Simple Icons slug ${entry.simpleIcon}`);
    mark = {
      id: entry.id,
      title: entry.title || icon.title,
      category: entry.category,
      aliases,
      domains: entryDomains,
      viewBox: 24,
      hex: icon.hex,
      path: icon.path,
      provenance: {
        provider: 'Simple Icons',
        providerVersion: simpleIconsVersion,
        source: icon.source,
        ...(icon.guidelines ? { guidelines: icon.guidelines } : {}),
        ...(icon.license ? { license: icon.license } : {}),
      },
    };
  } else if (entry.custom) {
    const custom = entry.custom;
    if (!entry.title || !custom.path || !custom.source || !/^[0-9A-F]{6}$/i.test(custom.hex || '')) {
      fail(`${entry.id} custom mark requires title, path, source, and six-digit hex`);
    }
    mark = {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      aliases,
      domains: entryDomains,
      viewBox: custom.viewBox || 24,
      hex: custom.hex.toUpperCase(),
      path: custom.path,
      provenance: {
        provider: 'Official brand asset',
        source: custom.source,
        ...(custom.guidelines ? { guidelines: custom.guidelines } : {}),
      },
    };
  } else {
    fail(`${entry.id} must provide simpleIcon or custom`);
  }
  if (!mark.category || !mark.title) fail(`${entry.id} is missing category or title`);
  for (const form of lookupForms(mark.title)) {
    if (lookupKeys.has(form) && lookupKeys.get(form) !== entry.id) {
      fail(`title ${JSON.stringify(mark.title)} is shared by ${lookupKeys.get(form)} and ${entry.id}`);
    }
    lookupKeys.set(form, entry.id);
  }
  return mark;
}).sort((left, right) => left.id.localeCompare(right.id));

const banner = `// Generated by scripts/generate-brand-marks.mjs from brand-marks/catalog.json.\n// Simple Icons ${simpleIconsVersion}. Do not edit by hand.\n`;
const source = `${banner}export const BRAND_MARKS = Object.freeze(${JSON.stringify(generated, null, 2)});\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, 'utf8').replace(/\r\n?/g, '\n')
    : '';
  if (current !== source) {
    console.error('generated brand marks are stale — run npm run generate:brand-marks');
    process.exit(1);
  }
} else {
  const temporary = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, source);
  fs.renameSync(temporary, outputPath);
  console.log(`generated ${path.relative(root, outputPath)} (${generated.length} marks)`);
}
