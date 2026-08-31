import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as validators from './generated-validators.mjs';
import { throwDiagnosticError } from './diagnostics.mjs';

// "/nodes/3/label" reads much better as "/nodes/3 (id: "router") /label" for the
// LLM fixing the JSON; resolve the nearest enclosing element's id or label.
function annotatedPath(instancePath, data) {
  if (!instancePath) return { path: '/', identity: null };
  let node = data;
  let hint = null;
  for (const seg of instancePath.split('/').slice(1)) {
    if (node == null || typeof node !== 'object') break;
    node = node[/^\d+$/.test(seg) ? Number(seg) : seg];
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const tag = node.id ?? node.label;
      if (tag != null) hint = String(tag);
    }
  }
  return { path: instancePath, identity: hint };
}

function annotatePath(instancePath, data) {
  const annotated = annotatedPath(instancePath, data);
  return annotated.identity != null
    ? `${annotated.path} (id/label: ${JSON.stringify(annotated.identity)})`
    : annotated.path;
}

/**
 * Drop the per-item errors a failed `contains` drags along with it.
 *
 * Ajv reports `contains` by telling you every way each item failed and then, at
 * the end, that none of them matched. For "lanes must include one with id
 * main", that reads as though EVERY lane must be called main -- the opposite of
 * what the schema says, and worse than the renderer's own message about it.
 *
 * The `contains` error already says the useful thing, so the items it tried and
 * rejected are noise: they describe candidates, not mistakes.
 */
function withoutContainsCandidates(errors) {
  const containsAt = errors.filter((error) => error.keyword === 'contains')
    .map((error) => error.instancePath);
  if (containsAt.length === 0) return errors;
  return errors.filter((error) => (
    error.keyword === 'contains'
    || !containsAt.some((path) => error.instancePath.startsWith(`${path}/`))
  ));
}

const schemasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas');
/** @type {Map<string, object|null>} */
const schemaCache = new Map();

/**
 * The schema for one diagram type, read on demand.
 *
 * Only ever reached when a `contains` fails, which is rare, so the cost sits on
 * the error path rather than on every render. The generated validators do not
 * carry their source schema -- `error.schema` is undefined in standalone mode --
 * and the alternative was a message that could not say what it wanted.
 */
function schemaFor(diagramType) {
  if (!schemaCache.has(diagramType)) {
    try {
      schemaCache.set(diagramType, JSON.parse(
        fs.readFileSync(path.join(schemasDir, `${diagramType}.schema.json`), 'utf8'),
      ));
    } catch {
      schemaCache.set(diagramType, null);
    }
  }
  return schemaCache.get(diagramType);
}

/** Walk a `#/a/b/c` schemaPath into the schema it points at. */
function atSchemaPath(schema, schemaPath) {
  let node = schema;
  for (const segment of String(schemaPath).replace(/^#\/?/, '').split('/')) {
    if (!segment) continue;
    if (node == null || typeof node !== 'object') return null;
    node = node[segment];
  }
  return node ?? null;
}

/**
 * What a failed `contains` was actually looking for, in words.
 *
 * The collection's own description comes with it. Moving this requirement into
 * the schema meant the renderer's message about it -- which explained WHY the
 * id is reserved -- stopped being reached, and a check that fires earlier
 * should not also say less.
 */
function containsRequirement(error, diagramType) {
  const schema = diagramType ? schemaFor(diagramType) : null;
  const collection = atSchemaPath(schema, error.schemaPath.replace(/\/contains$/, ''));
  const wanted = atSchemaPath(schema, error.schemaPath)?.properties ?? {};
  const named = Object.entries(wanted)
    .filter(([, rule]) => rule && Object.prototype.hasOwnProperty.call(rule, 'const'))
    .map(([key, rule]) => `${key} ${JSON.stringify(rule.const)}`);
  if (!named.length) return null;
  const because = typeof collection?.description === 'string' && collection.description.trim()
    ? ` ${collection.description.trim()}`
    : '';
  return `include one entry with ${named.join(' and ')}.${because}`;
}

function formatErrors(errors, data, diagramType) {
  return withoutContainsCandidates(errors).map((e) => {
    if (e.keyword === 'contains') {
      const requirement = containsRequirement(e, diagramType);
      if (requirement) return `  ${annotatePath(e.instancePath, data)} must ${requirement}`;
    }
    const where = annotatePath(e.instancePath, data);
    const detail = e.params && Object.keys(e.params).length
      ? ' ' + JSON.stringify(e.params)
      : '';
    return `  ${where} ${e.message}${detail}`;
  }).join('\n');
}

export function validateSchema(diagramType, data) {
  const validate = validators[diagramType];
  if (!validate) {
    throw new Error(`validateSchema: unknown diagram type "${diagramType}"`);
  }
  if (!validate(data)) {
    const diagnostics = withoutContainsCandidates(validate.errors).map((error) => {
      const annotated = annotatedPath(error.instancePath, data);
      const subject = {
        diagramType,
        path: annotated.path,
        ...(annotated.identity != null ? { identity: String(annotated.identity) } : {}),
      };
      const evidence = {
        keyword: error.keyword,
        expected: error.schema,
        ...error.params,
      };
      const supportedFixes = {
        additionalProperties: [`remove unsupported property ${JSON.stringify(error.params?.additionalProperty)}`],
        required: [`add required property ${JSON.stringify(error.params?.missingProperty)}`],
        type: [`use ${JSON.stringify(error.params?.type)} at ${annotated.path}`],
        enum: [`choose one of ${JSON.stringify(error.params?.allowedValues || [])}`],
        pattern: [`match the required pattern ${JSON.stringify(error.params?.pattern)}`],
        minimum: [`use a value ${error.params?.comparison || '>='} ${error.params?.limit}`],
        maximum: [`use a value ${error.params?.comparison || '<='} ${error.params?.limit}`],
        minItems: [`provide at least ${error.params?.limit} item(s)`],
        maxItems: [`provide at most ${error.params?.limit} item(s)`],
        minLength: [`provide at least ${error.params?.limit} character(s)`],
        maxLength: [`provide at most ${error.params?.limit} character(s)`],
        contains: [containsRequirement(error, diagramType) ?? 'include at least one matching entry'],
      }[error.keyword] || [];
      const detail = error.params && Object.keys(error.params).length
        ? ` ${JSON.stringify(error.params)}`
        : '';
      return {
        code: `schema/${error.keyword}`,
        severity: 'error',
        message: `${annotatePath(error.instancePath, data)} ${error.message}${detail}`,
        subject,
        evidence,
        supportedFixes,
      };
    });
    throwDiagnosticError(
      `${diagramType} schema validation failed:\n${formatErrors(validate.errors, data, diagramType)}`,
      diagnostics,
    );
  }
}
