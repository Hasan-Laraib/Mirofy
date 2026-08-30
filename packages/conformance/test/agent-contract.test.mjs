// Row 1.10. The agent contract, and the gate that keeps it honest.
//
// SKILL.md is read by an agent that then makes promises to a user on its
// behalf. A capability claimed there and absent from the CLI is not a
// documentation slip -- it is an agent telling someone the tool can do
// something it cannot.
//
// That was the live state when this gate was written: SKILL.md advertised
// "Accept ... pasted Mermaid flowchart, sequenceDiagram, and stateDiagram
// input" and "convert/beautify Mermaid", while `grep -rn mermaid
// packages/core --include=*.mjs` returned nothing at all.
//
// So the gate is mechanical: every `mirofy <verb>` the document names must be
// a real verb in the CLI's dispatch. Prose is free to describe; it is not
// free to invent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { coreRoot } from '../src/render.mjs';

const skill = fs.readFileSync(path.join(coreRoot, 'SKILL.md'), 'utf8');
const cliSource = fs.readFileSync(path.join(coreRoot, 'bin/mirofy.mjs'), 'utf8');

/** Verbs the CLI actually dispatches: `case 'render':` and friends. */
function dispatchedVerbs() {
  const switchIndex = cliSource.lastIndexOf('switch (command)');
  assert.ok(switchIndex > -1, 'could not find the CLI command dispatch');
  const tail = cliSource.slice(switchIndex);
  return new Set([...tail.matchAll(/case '([a-z][a-z-]*)':/g)].map((match) => match[1]));
}

/** Verbs SKILL.md tells an agent to run. */
function claimedVerbs() {
  return new Set([...skill.matchAll(/\bmirofy(?:\.mjs)?[ \t]+([a-z][a-z-]*)/g)].map((match) => match[1]));
}

test('[1.10] every capability SKILL.md claims maps to a real CLI verb', () => {
  const dispatched = dispatchedVerbs();
  const claimed = claimedVerbs();
  assert.ok(claimed.size > 0, 'no verbs were extracted from SKILL.md; the extractor is broken, not the contract');

  const invented = [...claimed].filter((verb) => !dispatched.has(verb)).sort();
  assert.deepEqual(invented, [],
    'SKILL.md tells an agent to run verbs the CLI does not dispatch:\n  '
    + invented.join('\n  ')
    + '\nAn agent reading this would promise a user something the tool cannot do.');
});

test('[1.10] SKILL.md documents the scan-first flow', () => {
  // The evidence pipeline exists now -- scan, model, compile -- and an agent
  // that does not know about it will keep hand-authoring documents when it
  // could be deriving them from a real repository.
  for (const verb of ['scan', 'model', 'compile']) {
    assert.match(skill, new RegExp(`\\b${verb}\\b`),
      `SKILL.md never mentions \`${verb}\`, so an agent cannot find the evidence pipeline`);
  }
});

test('[1.10] SKILL.md states that installing the skill is optional', () => {
  // Row 1.10's other half: "skill install becomes optional, not required".
  // Every capability is reachable through `node bin/mirofy.mjs <verb>`, and
  // an agent that believes installation is a precondition will refuse work it
  // could do.
  assert.match(skill, /optional/i,
    'SKILL.md does not say that installing the skill is optional');
  assert.match(skill, /node bin\/mirofy\.mjs|node .*mirofy\.mjs/,
    'SKILL.md does not show the direct CLI invocation that makes installation optional');
});

test('[1.10] the Mermaid claim names the verb that implements it', () => {
  // The specific failure this row exists to close. SKILL.md may only promise
  // Mermaid if it points at the command that does it.
  if (!/mermaid/i.test(skill)) return; // no claim, nothing to keep honest
  assert.match(skill, /mirofy(?:\.mjs)?\s+import\s+mermaid|import mermaid/i,
    'SKILL.md promises Mermaid support without naming the verb that provides it');
});
