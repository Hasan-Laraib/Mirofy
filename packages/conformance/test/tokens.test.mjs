// Row 4.12. The byte-identity check in check-template.mjs already proves
// the emitter reproduces the committed palette. What it cannot prove is
// that the token *model* is coherent -- that is what these assert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, PROPERTY_NAMES } from '../../viewer/src/tokens/tokens.mjs';
import { emitPalette } from '../../viewer/src/tokens/emit.mjs';

test('the token model covers 8 blocks and 32 distinct properties (4.12)', () => {
  assert.equal(BLOCKS.length, 8);
  assert.equal(PROPERTY_NAMES.length, 32);
});

test('every block defines a subset of the canonical property set, never a stray name (4.12)', () => {
  const canonical = new Set(PROPERTY_NAMES);
  for (const { selector, props } of BLOCKS) {
    for (const [name] of props) {
      assert.ok(canonical.has(name), `${selector} declares ${name}, which is not a known token`);
    }
  }
});

test('the two signal-flow blocks are partial overrides and the other six are complete (4.12)', () => {
  // Encoded deliberately: a future change that "helpfully" completes the
  // signal-flow blocks would move the template bytes, and this says out
  // loud that the omission is intentional inheritance from :root.
  const byCount = Object.fromEntries(BLOCKS.map((b) => [b.selector.trim(), b.props.length]));
  assert.equal(byCount['[data-preset="signal-flow"][data-theme="dark"]'], 30);
  assert.equal(byCount['[data-preset="signal-flow"][data-theme="light"]'], 27);
  for (const [selector, count] of Object.entries(byCount)) {
    if (selector.includes('signal-flow')) continue;
    assert.equal(count, 32, `${selector} should declare all 32 tokens`);
  }
});

test('no token value is empty and every block emits valid CSS declarations (4.12)', () => {
  for (const { selector, props } of BLOCKS) {
    for (const [name, value] of props) {
      assert.ok(String(value).trim().length > 0, `${selector} ${name} has an empty value`);
      assert.ok(!String(value).includes(';'), `${selector} ${name} value contains a stray semicolon`);
    }
  }
  assert.ok(emitPalette().includes('--'), 'emitPalette produced no custom properties');
});
