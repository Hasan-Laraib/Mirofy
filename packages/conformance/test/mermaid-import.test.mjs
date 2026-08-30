// Row 1.13. `import mermaid` -> a typed document that VALIDATES.
//
// The scanner rule applies to importing too: NEVER guess. Mermaid syntax the
// reader does not understand becomes a recorded Gap naming the line, never a
// silently dropped node and never an invented edge. An importer that quietly
// discards what it cannot parse produces a diagram that is confidently wrong
// about the thing it was asked to convert.
//
// Mapping, and why each target guesses least:
//   flowchart/graph  -> architecture  (needs no lanes and no positions)
//   sequenceDiagram  -> sequence      (y comes from message order, real info)
//   stateDiagram     -> lifecycle     (one explicit lane; a state diagram has
//                                      none, and inventing several would be
//                                      inventing domain structure)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-mermaid-'));
const cli = path.join(coreRoot, 'bin/mirofy.mjs');

/** Run the real validator, so "it produced a document" means "it validates". */
function validates(document) {
  const file = path.join(tmp, `doc-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(file, JSON.stringify(document));
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [cli, 'validate', document.diagram_type, file, '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) throw error;
  }
  const receipt = JSON.parse(stdout);
  return { ok: receipt.ok === true, message: receipt.error ?? '' };
}

test('[1.13] a flowchart becomes an architecture document that validates', async () => {
  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  const { document, gaps, diagramType } = importMermaid([
    'flowchart TD',
    '  A[Alpha] --> B[Beta]',
    '  B --> C{Choice}',
    '  C -->|yes| D[(Store)]',
  ].join('\n'));

  assert.equal(diagramType, 'architecture');
  assert.deepEqual(gaps, []);
  assert.deepEqual(document.components.map((c) => c.id).sort(), ['A', 'B', 'C', 'D']);
  assert.equal(document.components.find((c) => c.id === 'A').label, 'Alpha');
  assert.equal(document.connections.length, 3);

  // The labelled edge carries its label rather than dropping it.
  const labelled = document.connections.find((c) => c.from === 'C' && c.to === 'D');
  assert.equal(labelled.label, 'yes');

  // No positions: the schema does not require them, and inventing layout here
  // would be doing the solver's job badly.
  for (const component of document.components) {
    assert.equal(component.pos, undefined, 'the importer invented a position');
    assert.equal(component.size, undefined, 'the importer invented a size');
  }

  const result = validates(document);
  assert.equal(result.ok, true, result.message);
});

test('[1.13] node shapes map to component types deterministically', async () => {
  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  const { document } = importMermaid([
    'flowchart LR',
    '  a[Box] --> b[(Cylinder)]',
    '  b --> c{Diamond}',
    '  c --> d((Circle))',
  ].join('\n'));
  const typeOf = (id) => document.components.find((component) => component.id === id).type;
  // Same shape, same type, every time -- a reader who learns the mapping once
  // can predict the next import.
  assert.equal(typeOf('b'), 'database', 'a cylinder should read as storage');
  assert.notEqual(typeOf('c'), typeOf('b'), 'a diamond and a cylinder must not collapse to one type');
  assert.equal(importMermaid('flowchart LR\n  a[Box] --> b[(Cylinder)]').document.components.find((c) => c.id === 'b').type,
    typeOf('b'), 'the same shape produced a different type on a second import');
});

test('[1.13] a sequenceDiagram becomes a sequence document with ordered messages', async () => {
  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  const { document, diagramType, gaps } = importMermaid([
    'sequenceDiagram',
    '  participant U as User',
    '  participant S as Service',
    '  U->>S: open page',
    '  S-->>U: 200 OK',
  ].join('\n'));

  assert.equal(diagramType, 'sequence');
  assert.deepEqual(gaps, []);
  assert.deepEqual(document.participants.map((p) => p.id), ['U', 'S']);
  assert.equal(document.participants[0].label, 'User');
  assert.deepEqual(document.messages.map((m) => m.label), ['open page', '200 OK']);
  // `y` is required by the schema and comes from message ORDER, which the
  // source genuinely carries -- it is sequence, not layout.
  assert.ok(document.messages[1].y > document.messages[0].y, 'messages are not ordered down the page');

  const result = validates(document);
  assert.equal(result.ok, true, result.message);
});

test('[1.13] a stateDiagram becomes a lifecycle document, and [*] is a real start state', async () => {
  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  const { document, diagramType } = importMermaid([
    'stateDiagram-v2',
    '  [*] --> Idle',
    '  Idle --> Running: start',
    '  Running --> [*]',
  ].join('\n'));

  assert.equal(diagramType, 'lifecycle');
  // `[*]` is Mermaid's start/end marker, not a state called "[*]". An importer
  // that carried it through literally would put a component named `[*]` on the
  // canvas.
  assert.ok(!document.states.some((state) => state.label === '[*]'),
    'the [*] marker was carried through as a literal state');
  assert.ok(document.states.some((state) => /start|begin/i.test(state.label) || state.type === 'start'),
    'no start state was produced for [*]');
  assert.ok(document.transitions.some((t) => t.label === 'start'), 'the transition label was dropped');

  const result = validates(document);
  assert.equal(result.ok, true, result.message);
});

test('[1.13] syntax the reader does not understand becomes a Gap, never a silent drop', async () => {
  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  const { document, gaps } = importMermaid([
    'flowchart TD',
    '  A[Alpha] --> B[Beta]',
    '  subgraph cluster',
    '    B --> C[Gamma]',
    '  end',
    '  classDef important fill:#f9f',
  ].join('\n'));

  // The edges it DID understand are still there.
  assert.ok(document.connections.some((c) => c.from === 'A' && c.to === 'B'));

  // And the lines it did not are recorded with their line numbers, so a
  // reader can see exactly what was not carried across.
  const reasons = gaps.map((gap) => gap.reason).join('\n');
  assert.ok(gaps.length >= 2, `expected gaps for subgraph and classDef, got ${JSON.stringify(gaps)}`);
  assert.match(reasons, /subgraph/i, 'the subgraph line was not recorded as a gap');
  assert.match(reasons, /classDef/i, 'the classDef line was not recorded as a gap');
  for (const gap of gaps) {
    assert.ok(Number.isInteger(gap.line) && gap.line >= 1, `a gap carries no line number: ${JSON.stringify(gap)}`);
  }
});

test('[1.13] an unknown diagram kind is refused, naming what is supported', async () => {
  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  assert.throws(() => importMermaid('gantt\n  title A Gantt'), (error) => {
    const message = error instanceof Error ? error.message : String(error);
    for (const kind of ['flowchart', 'sequenceDiagram', 'stateDiagram']) {
      assert.match(message, new RegExp(kind), `the refusal does not name ${kind}`);
    }
    return true;
  });
});
