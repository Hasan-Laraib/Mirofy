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
    // A `oneOf` has no `type` of its own, and rendering it as "any" told the
    // model nothing -- gpt-4o read it as permission to write null, and all
    // eight documents were rejected on `brand`. The union is what the schema
    // actually says.
    const union = (target?.oneOf ?? target?.anyOf ?? [])
      .map((branch) => branch.type).filter(Boolean);
    const kind = enumValues
      ? enumValues.map((value) => JSON.stringify(value)).join(' | ')
      : union.length > 0
        ? [...new Set(union)].join(' | ')
        : (Array.isArray(target?.type) ? target.type.join('|') : target?.type ?? 'any');
    // Numeric bounds are part of what the schema requires, and leaving them
    // out produced rejections that measured the brief rather than the author:
    // sequence `y` has a minimum of 160 and workflow columns a maximum of 5,
    // and a model told only "number" cannot know either.
    const bounds = [];
    if (typeof target?.minimum === 'number') bounds.push(`>= ${target.minimum}`);
    if (typeof target?.maximum === 'number') bounds.push(`<= ${target.maximum}`);
    if (typeof target?.pattern === 'string') bounds.push(`matching ${target.pattern}`);
    // Array bounds were hidden, and an author told only "array" wrote `[]` for
    // every optional collection -- rejected by minItems on all six documents
    // that had one.
    if (typeof target?.minItems === 'number') bounds.push(`at least ${target.minItems} item(s) IF PRESENT`);
    if (typeof target?.maxItems === 'number') bounds.push(`at most ${target.maxItems}`);
    if (typeof target?.minLength === 'number') bounds.push(`non-empty`);
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
const NEWLINE = String.fromCharCode(10);

export function briefFor(diagramType) {
  const schema = loadSchema(diagramType);
  const common = loadSchema('common');
  const required = new Set(schema.required ?? []);

  const sections = [];
  for (const [name, spec] of Object.entries(schema.properties ?? {})) {
    if (spec.type !== 'array') continue;
    const marker = required.has(name) ? 'REQUIRED' : 'optional';
    // A collection's own rules -- its description, and anything it must
    // contain -- belong in the brief. They are constraints the validator
    // enforces, and an author who is not told them can only discover them by
    // being rejected. Lifecycle's "one lane must be called main" was exactly
    // that: a hard requirement expressed nowhere the author could read.
    const notes = [];
    if (typeof spec.description === 'string' && spec.description.trim()) {
      notes.push(`    ${spec.description.trim()}`);
    }
    const mustContain = Object.entries(spec.contains?.properties ?? {})
      .filter(([, rule]) => rule && Object.prototype.hasOwnProperty.call(rule, 'const'))
      .map(([key, rule]) => `${key} ${JSON.stringify(rule.const)}`);
    if (mustContain.length) {
      notes.push(`    MUST include one entry with ${mustContain.join(' and ')}.`);
    }
    sections.push(`  "${name}" (${marker}) — each entry:${notes.length ? NEWLINE + notes.join(NEWLINE) : ''}\n${describeItem(spec.items, common)}`);
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
    'OMIT any optional key you have no value for. Do not write null, do not write',
    'an empty array, do not write an empty string -- an absent key is correct and',
    'an empty one is rejected.',
  ].join('\n');
}
