// Row 4.11. Ends five-renderer drift.
//
// The drift was already there when this gate was written: four renderers
// called all seven composition gates and `sequence` called six, missing
// `cleanEndpointSideProblems`. Nothing recorded whether that was a decision
// or an oversight, and nothing would have caught a second one.
//
// composition-pass.mjs is now the declared table. These tests check the
// renderers against it in both directions -- a gate missing from a renderer
// fails, and an exemption that is no longer true fails too, so the table
// cannot rot into a list of excuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { coreRoot } from '../src/render.mjs';
import {
  COMPOSITION_GATES,
  DIAGRAM_TYPES,
  COMPOSITION_EXEMPTIONS,
  expectedGates,
  exemptionReason,
} from '../../core/renderers/shared/composition-pass.mjs';

/** Gate names a renderer actually calls, read from its source. */
function gatesCalledBy(diagramType) {
  const source = fs.readFileSync(
    path.join(coreRoot, 'renderers', diagramType, `render-${diagramType}.mjs`),
    'utf8',
  );
  // Comments are stripped so a gate merely NAMED in prose does not count as
  // called -- the same trap row 5.17's contract gate has.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
  return new Set(COMPOSITION_GATES.filter((gate) => new RegExp(`\\b${gate}\\s*\\(`).test(code)));
}

test('[4.11] every renderer runs every composition gate it is not declared exempt from', () => {
  const missing = [];
  for (const diagramType of DIAGRAM_TYPES) {
    const called = gatesCalledBy(diagramType);
    for (const gate of expectedGates(diagramType)) {
      if (!called.has(gate)) missing.push(`${diagramType} does not run ${gate}`);
    }
  }
  assert.deepEqual(missing, [],
    'a renderer silently skips a composition gate:\n  ' + missing.join('\n  ')
    + '\nEither wire the gate up, or declare an exemption WITH A REASON in composition-pass.mjs.');
});

test('[4.11] every declared exemption is still true, so the table cannot rot into excuses', () => {
  const stale = [];
  for (const [diagramType, exemptions] of Object.entries(COMPOSITION_EXEMPTIONS)) {
    const called = gatesCalledBy(diagramType);
    for (const gate of Object.keys(exemptions)) {
      // An exemption for a gate the renderer now calls is a lie the table is
      // telling about the code.
      if (called.has(gate)) stale.push(`${diagramType} is declared exempt from ${gate}, but calls it`);
    }
  }
  assert.deepEqual(stale, [], stale.join('\n  '));
});

test('[4.11] every exemption carries a written reason, not a bare entry', () => {
  for (const [diagramType, exemptions] of Object.entries(COMPOSITION_EXEMPTIONS)) {
    for (const [gate, reason] of Object.entries(exemptions)) {
      assert.equal(typeof reason, 'string', `${diagramType}/${gate} has no reason`);
      // A reason short enough to be a shrug is not a reason. "This gate does
      // not apply" is a claim about the diagram's geometry and has to say why.
      assert.ok(reason.trim().length >= 60,
        `${diagramType} is exempt from ${gate} with a reason too short to be one: ${JSON.stringify(reason)}`);
      assert.equal(exemptionReason(diagramType, gate), reason);
    }
  }
});

test('[4.11] the table names only real gates and real diagram types', () => {
  // A typo in the table would silently exempt nothing while looking like it
  // exempted something.
  for (const [diagramType, exemptions] of Object.entries(COMPOSITION_EXEMPTIONS)) {
    assert.ok(DIAGRAM_TYPES.includes(diagramType), `the table names an unknown diagram type: ${diagramType}`);
    for (const gate of Object.keys(exemptions)) {
      assert.ok(COMPOSITION_GATES.includes(gate), `the table names an unknown gate: ${gate}`);
    }
  }
  for (const diagramType of DIAGRAM_TYPES) {
    assert.ok(fs.existsSync(path.join(coreRoot, 'renderers', diagramType, `render-${diagramType}.mjs`)),
      `DIAGRAM_TYPES names ${diagramType}, which has no renderer`);
  }
});
