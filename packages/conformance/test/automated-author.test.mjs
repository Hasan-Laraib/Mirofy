// Which commits the changelog freshness gate is allowed to ignore.
//
// This is a gate that fails OPEN when it is wrong: mark everyone automated and
// the freshness check finds no human commit, reports "no git history
// available", and passes without checking anything. So the negative cases
// matter more than the positive ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutomated } from '../../../scripts/lib/automated.mjs';

test('dependabot is automated, by name and by its noreply address', () => {
  assert.equal(isAutomated('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'), true);
  assert.equal(isAutomated('', '49699333+dependabot[bot]@users.noreply.github.com'), true);
  assert.equal(isAutomated('dependabot[bot]', ''), true);
});

test('other automation is recognised too', () => {
  assert.equal(isAutomated('github-actions[bot]', 'actions@github.com'), true);
  assert.equal(isAutomated('renovate[bot]', 'bot@renovateapp.com'), true);
});

// The regression that prompted the substring match: `/\[bot\]/` written into a
// generated file, losing its backslashes, becomes `/[bot]/` -- a character
// class matching any b, o or t. Every one of these names contains at least one.
test('a person whose name contains b, o or t is not automated', () => {
  for (const [name, email] of [
    ['Hasan-Laraib', 'lxh417bham@gmail.com'],
    ['Robert Brown', 'bob@example.com'],
    ['Toby', 'toby@example.com'],
    ['Otto', 'otto@example.com'],
  ]) {
    assert.equal(isAutomated(name, email), false, `${name} <${email}> was treated as a bot`);
  }
});

test('missing author fields are not automated', () => {
  assert.equal(isAutomated(undefined, undefined), false);
  assert.equal(isAutomated('', ''), false);
});
