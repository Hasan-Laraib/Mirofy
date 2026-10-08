// `npm run judge [-- --limit 25] [--min 0.5] [--dry-run]`
//
// Asks a System One model about the imports this repository's scanner recorded
// that it could not resolve, and writes both the answers and the receipts.
//
// This command is OPT-IN and stands outside the pipeline. `mirofy scan` does
// not call it, `model` does not call it, `compile` does not call it. Nothing
// reads scan/judgments.json or scan/model.judged.json unless a person asks for
// them by name. Delete this package and every other command behaves exactly as
// it did.
//
// --dry-run needs no key and makes no request. It prints what WOULD be asked,
// which is also the honest way to see the cost of a run before paying it.

import fs from 'node:fs';
import path from 'node:path';
import { unresolvedImports } from '../src/gaps.mjs';
import { buildCandidates } from '../src/questions.mjs';
import { createClient } from '../src/client.mjs';
import { runJudge } from '../src/judge.mjs';
import { DEFAULT_MIN, annotate } from '../src/annotate.mjs';

// The repository being worked on is the CURRENT DIRECTORY, for the same
// reason packages/model/bin/model.mjs says so: deriving it from
// import.meta.url means pointing this at someone else's repository writes
// into the Mirofy checkout instead of theirs.
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};
const has = (name) => argv.includes(`--${name}`);

const repoRoot = path.resolve(flag('root') ?? process.cwd());
const graphPath = path.resolve(repoRoot, flag('graph') ?? 'scan/evidence-graph.json');
const modelPath = path.resolve(repoRoot, flag('model') ?? 'scan/model.json');
const outDir = path.resolve(repoRoot, flag('out') ?? 'scan');
const limit = Number(flag('limit', '25'));
const min = Number(flag('min', String(DEFAULT_MIN)));
const dryRun = has('dry-run');

if (!Number.isFinite(limit) || limit < 0) fail('--limit must be a non-negative number');
if (!Number.isFinite(min) || min < 0 || min > 1) fail('--min must be between 0 and 1');

/** @param {string} message */
function fail(message) {
  console.error(`judge: ${message}`);
  process.exit(1);
}

function readJson(file, what) {
  if (!fs.existsSync(file)) {
    fail(`${what} not found at ${path.relative(repoRoot, file)}. Run \`npm run scan\` first.`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fail(`${what} at ${path.relative(repoRoot, file)} is not valid JSON: ${error.message}`);
  }
}

const graph = readJson(graphPath, 'the evidence graph');
const model = readJson(modelPath, 'the model');

const { questions, skipped } = unresolvedImports(graph.gaps ?? []);
const { candidates, unread } = buildCandidates({
  questions,
  components: model.components ?? [],
  relationships: model.relationships ?? [],
  readFile: (rel) => {
    try {
      return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      return null;
    }
  },
});

console.log(`judge: ${graph.gaps?.length ?? 0} gaps, ${questions.length} unresolved imports, ${skipped} not about an import`);
console.log(`judge: ${candidates.length} candidate relationship(s) to ask about`);
if (unread) console.log(`judge: ${unread} gapped file(s) could not be re-read by this process`);

if (candidates.length === 0) {
  // Not a failure. A repository whose scanner resolved everything has nothing
  // for this command to be uncertain about, and saying so is the answer.
  console.log('judge: nothing to ask. The scanner resolved every import it found.');
  process.exit(0);
}

if (dryRun) {
  for (const candidate of candidates.slice(0, limit)) {
    console.log(`  ${candidate.from} -> ${candidate.to}  (${candidate.gap.path}:${candidate.gap.line}, named as "${candidate.matched}")`);
  }
  const would = Math.min(candidates.length, limit);
  console.log(`judge: --dry-run made no request. A real run would ask ${would} question(s), one call each.`);
  process.exit(0);
}

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  // No silent fallback and no cached guess. A command that reported success
  // without having asked anything would be exactly the fabricated number this
  // repository refuses everywhere else.
  fail('TYPESAFE_API_KEY is not set. Set it, or use --dry-run to see what would be asked.');
}

const client = createClient({ apiKey });
const result = await runJudge({
  candidates,
  client,
  limit,
  onProgress: (event) => {
    if (event.kind === 'judged') console.log(`  ${event.from} -> ${event.to}  p ${event.probability.toFixed(2)}`);
    if (event.kind === 'retry') console.log(`  retrying after HTTP ${event.status} (attempt ${event.attempt})`);
    if (event.kind === 'failed') console.log(`  ${event.from} -> ${event.to}  FAILED: ${event.message}`);
  },
});

const { model: judged, drawn, withheld } = annotate(model, result.judgments, { min });

fs.mkdirSync(outDir, { recursive: true });
const judgmentsPath = path.join(outDir, 'judgments.json');
const judgedPath = path.join(outDir, 'model.judged.json');

fs.writeFileSync(judgmentsPath, `${JSON.stringify({
  schemaVersion: 1,
  // Everything needed to say what this run actually did, including what it did
  // NOT do. A file recording only the drawn edges would imply the rest were
  // asked and refused.
  ranAt: new Date().toISOString(),
  model: client.model,
  min,
  limit,
  gaps: graph.gaps?.length ?? 0,
  unresolvedImports: questions.length,
  candidatesConsidered: result.considered,
  candidatesAsked: result.asked,
  filesUnreadable: unread,
  usage: result.usage,
  drawn,
  withheld,
  failures: result.failures,
}, null, 2)}\n`);

fs.writeFileSync(judgedPath, `${JSON.stringify(judged, null, 2)}\n`);

console.log(`judge: asked ${result.asked} of ${result.considered}; drew ${drawn.length}, withheld ${withheld.length}, failed ${result.failures.length}`);
console.log(`judge: tokens in ${result.usage.input_tokens}, out ${result.usage.output_tokens}`);
console.log(`judge: wrote ${path.relative(repoRoot, judgmentsPath)} and ${path.relative(repoRoot, judgedPath)}`);
console.log('judge: render it with');
console.log(`  node packages/compile/bin/compile.mjs --model ${path.relative(repoRoot, judgedPath)}`);
