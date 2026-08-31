// A prompt brief, generated from the shipped JSON Schemas.
//
// The first version of the Claude author carried a hand-written description of
// each diagram type. It was wrong in five places -- `participants` need a
// `type`, workflow `nodes` and lifecycle `states` need a `col`, dataflow
// `stages` must NOT carry an `id`, and `boundaries[].kind` is an enum I did
// not mention -- and the benchmark duly scored 0 of 8, every document rejected
// by the schema.
//
// That number measured the PROMPT, not the model and not this tool. A
// benchmark whose instructions are wrong is not a hard benchmark; it is a
// broken one, and publishing its result would be worse than having no result.
//
// So the brief is derived from the schema files the validator actually uses.
// It cannot drift from them, because there is nothing to keep in sync: when a
// schema changes, the brief changes with it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../packages/core/schemas',
);

const cache = new Map();

function loadSchema(name) {
  if (!cache.has(name)) {
    cache.set(name, JSON.parse(fs.readFileSync(path.join(schemaDir, `${name}.schema.json`), 'utf8')));
  }
  return cache.get(name);
}

/** Follow a local `$ref` into the common schema, or return the node as-is. */
function resolveRef(node, common) {
  const ref = node?.$ref;
  if (typeof ref !== 'string') return node;
  const local = ref.replace(/^.*#\//, '').split('/');
  let current = ref.includes('common.schema.json') ? common : node;
  for (const step of local) current = current?.[step];
  return current ?? node;
}

/** Describe one object's properties the way an author needs to hear them. */
function describeItem(item, common, indent = '    ') {
  const resolved = resolveRef(item, common);
  const properties = resolved?.properties ?? {};
  const required = new Set(resolved?.required ?? []);
  const lines = [];
  for (const [name, spec] of Object.entries(properties)) {
    const target = resolveRef(spec, common);
    const enumValues = target?.enum ?? target?.items?.enum;
    const kind = enumValues
      ? enumValues.map((value) => JSON.stringify(value)).join(' | ')
      : (Array.isArray(target?.type) ? target.type.join('|') : target?.type ?? 'any');
    // Numeric bounds are part of what the schema requires, and leaving them
    // out produced rejections that measured the brief rather than the author:
    // sequence `y` has a minimum of 160 and workflow columns a maximum of 5,
    // and a model told only "number" cannot know either.
    const bounds = [];
    if (typeof target?.minimum === 'number') bounds.push(`>= ${target.minimum}`);
    if (typeof target?.maximum === 'number') bounds.push(`<= ${target.maximum}`);
    if (typeof target?.pattern === 'string') bounds.push(`matching ${target.pattern}`);
    const suffix = bounds.length > 0 ? ` (${bounds.join(', ')})` : '';
    lines.push(`${indent}${required.has(name) ? '*' : ' '} ${name}: ${kind}${suffix}`);
  }
  if (resolved?.additionalProperties === false) {
    lines.push(`${indent}  (no other keys are allowed)`);
  }
  return lines.join('\n');
}

/**
 * A brief for one diagram type, read out of its schema.
 *
 * @param {string} diagramType
 * @returns {string}
 */
export function briefFor(diagramType) {
  const schema = loadSchema(diagramType);
  const common = loadSchema('common');
  const required = new Set(schema.required ?? []);

  const sections = [];
  for (const [name, spec] of Object.entries(schema.properties ?? {})) {
    if (spec.type !== 'array') continue;
    const marker = required.has(name) ? 'REQUIRED' : 'optional';
    sections.push(`  "${name}" (${marker}) — each entry:\n${describeItem(spec.items, common)}`);
  }

  return [
    `Top-level keys (* = required): ${[...required].join(', ')}`,
    '  "schema_version": 1',
    `  "diagram_type": "${diagramType}"`,
    '  "meta": { "title": string }',
    '',
    ...sections,
    '',
    'A * marks a required key. Keys not listed are rejected.',
  ].join('\n');
}
