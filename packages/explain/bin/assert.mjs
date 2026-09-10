// `mirofy assert [--rules architecture-rules.json] [--json] [--allow-unproven]`
// (in a checkout: `npm run assert -- ...`)
//
// Architecture rules as CI checks (row 3.15).
//
// Exits non-zero on a violation, and also on an UNPROVEN rule: a rule that
// found nothing in a scan with unread files has not been shown to hold, and
// letting that pass turns a gap into a green check. `--allow-unproven` is the
// explicit opt-out, and it is explicit precisely so it shows up in a diff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexModel, incompletenessFor } from '../src/query.mjs';
import { assertRules, OUTCOMES } from '../src/assert.mjs';

// Defaults are resolved AFTER parsing, against `--root` when it is given, so
// `mirofy assert` reads the rules and scan of the repository the user is in
// rather than the ones inside its own installation.
const selfRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const argv = process.argv.slice(2);
const flags = {};
let json = false;
let allowUnproven = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--json') { json = true; continue; }
  if (argv[i] === '--allow-unproven') { allowUnproven = true; continue; }
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i += 1; }
}

const repoRoot = flags.root ? path.resolve(flags.root) : selfRoot;
if (!flags.rules) flags.rules = path.join(repoRoot, 'architecture-rules.json');
if (!flags.model) flags.model = path.join(repoRoot, 'scan', 'model.json');
if (!flags.graph) flags.graph = path.join(repoRoot, 'scan', 'evidence-graph.json');

function read(file, what, hint) {
  if (!fs.existsSync(file)) {
    console.error(`assert: no ${what} at ${file}.${hint ? ` ${hint}` : ''}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// The hint names a command the reader can actually run. It used to name
// `npm run scan`, which works only inside a clone of this monorepo -- the same
// mistake that kept this command unreachable in the first place.
const model = read(path.resolve(flags.model), 'system model',
  'Run `mirofy map .` to produce one (in a checkout: `npm run scan && npm run model`).');
const graph = fs.existsSync(path.resolve(flags.graph))
  ? JSON.parse(fs.readFileSync(path.resolve(flags.graph), 'utf8'))
  : null;
const ruleFile = read(path.resolve(flags.rules), 'rule file',
  'Write one, or pass --rules <path>. See references/architecture-rules.md.');

let report;
try {
  report = assertRules({
    index: indexModel(model),
    incompleteness: incompletenessFor(graph),
    rules: ruleFile.rules ?? ruleFile,
    acknowledgements: ruleFile.acknowledgedGaps ?? [],
    allowUnproven,
  });
} catch (error) {
  console.error(`assert: ${error.message}`);
  process.exit(2);
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

for (const result of report.results) {
  const mark = result.outcome === OUTCOMES.PASS ? 'ok  '
    : result.outcome === OUTCOMES.FAIL ? 'FAIL' : 'UNPROVEN';
  console.log(`[${mark}] ${result.id} — ${result.reason}`);
  for (const violation of result.violations.slice(0, 10)) {
    if (violation.cycle) console.log(`         cycle: ${violation.cycle.join(' -> ')}`);
    else if (violation.missing) console.log(`         ${violation.from} reaches nothing matching ${violation.to}`);
    else if (violation.component) console.log(`         ${violation.component}: ${violation.degree} > ${violation.limit}`);
    else console.log(`         ${violation.from} -> ${violation.to}`);
    if (violation.evidence?.length) console.log(`         evidence: ${violation.evidence.slice(0, 3).join(', ')}`);
  }
}

console.log(`\n${report.passed} passed, ${report.failed} failed, ${report.unproven} unproven of ${report.total}`);
if (report.acknowledged > 0) {
  // Never silent. A pass resting on a human judgement must not read like a
  // pass resting on a complete scan.
  console.log(`${report.acknowledged} of those rule(s) rest on acknowledged gaps, not on evidence. `
    + 'See acknowledgedGaps in the rule file.');
}
if (report.unproven > 0 && !allowUnproven) {
  console.log('An unproven rule is not a passing rule. Fix the scan gaps, or pass --allow-unproven '
    + 'to accept them deliberately.');
}
process.exit(report.ok ? 0 : 1);
