// @ts-check
// Runs the first-pass usable benchmark (row 7.8).
//
//   node scripts/benchmark.mjs --author <command> --model <id> [--out run.json]
//   node scripts/benchmark.mjs --author <command> --model <id> --keep <dir>
//   node scripts/benchmark.mjs --replay <dir> [--out run.json]
//
// `--keep` saves the documents the author produced; `--replay` re-runs the
// tool over saved documents WITHOUT calling the author again.
//
// That separation is what makes a change to this tool measurable. A model is
// not deterministic, so two ordinary runs differ in both the documents and the
// tool -- and the difference in the rate cannot be attributed to either. A
// replay holds the documents fixed, so the only thing that moved is the tool.
//
// A REPLAY CANNOT CLAIM A DIFFERENT AUTHOR. The model is read from the saved
// manifest, and --model is refused if it disagrees: a rate measured over one
// model's documents is that model's rate, whatever the flag says.
//
// `--author` is a command that receives one task as JSON on stdin and prints
// one diagram document as JSON on stdout. Keeping the model behind a process
// boundary is what lets this repo measure any author -- a hosted model, a
// local one, a scripted baseline -- without taking a dependency on any of
// them, and keeps row 6.9's zero runtime dependencies intact.
//
// There is no default author. A benchmark that silently substitutes one
// reports a number nobody measured.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBenchmark, formatRun, classifyValidationFailure } from '../packages/benchmark/src/harness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'packages/core/bin/mirofy.mjs');
const tasksDir = path.join(repoRoot, 'benchmarks/tasks');

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const replayDir = args.replay && args.replay !== 'true' ? path.resolve(args.replay) : null;
const keepDir = args.keep && args.keep !== 'true' ? path.resolve(args.keep) : null;

/** What a --keep directory records about the run that produced it. */
const MANIFEST = 'authored-by.json';

let model = args.model && args.model !== 'true' ? args.model : null;

if (replayDir) {
  if (!fs.existsSync(path.join(replayDir, MANIFEST))) {
    console.error(`benchmark: ${replayDir} has no ${MANIFEST}, so nothing there can be attributed. `
      + 'Produce it with --keep.');
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(replayDir, MANIFEST), 'utf8'));
  if (model && model !== manifest.model) {
    console.error(`benchmark: --model ${model} contradicts the saved documents, which `
      + `${manifest.model} wrote. A replay measures this tool over those documents; it cannot `
      + 'reattribute them.');
    process.exit(2);
  }
  model = manifest.model;
} else {
  if (!args.author || args.author === 'true') {
    console.error('benchmark: --author <command> is required. The harness does not invent an author.');
    process.exit(2);
  }
  if (!model) {
    console.error('benchmark: --model <id> is required. An unattributed rate cannot be compared to anything.');
    process.exit(2);
  }
}

const tasks = fs.readdirSync(tasksDir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(tasksDir, name), 'utf8')));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-benchmark-'));

/**
 * Ask the author for one document. Anything unreadable is the author's failure.
 *
 * In replay mode the "author" is the saved file. A task with no saved document
 * is an error rather than a skip: quietly dropping it would shrink the
 * denominator and inflate the rate.
 */
async function author(task) {
  if (replayDir) {
    const saved = path.join(replayDir, `${task.id}.json`);
    if (!fs.existsSync(saved)) {
      throw new Error(`no saved document for ${task.id} in ${replayDir}`);
    }
    return JSON.parse(fs.readFileSync(saved, 'utf8'));
  }
  const result = spawnSync(args.author, { input: JSON.stringify(task), encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    throw new Error(`author exited ${result.status}: ${(result.stderr || '').trim().slice(0, 200)}`);
  }
  try {
    const document = JSON.parse(result.stdout);
    if (keepDir) {
      fs.mkdirSync(keepDir, { recursive: true });
      fs.writeFileSync(path.join(keepDir, `${task.id}.json`), `${JSON.stringify(document, null, 2)}
`);
    }
    return document;
  } catch {
    // Prose instead of JSON is the single most common author failure, and it
    // is the author's, not this tool's. Saying so is the point of the class.
    throw new Error(`author did not produce JSON: ${result.stdout.trim().slice(0, 200)}`);
  }
}

/**
 * Validate one document exactly as a user would, and report what came back.
 *
 * A rejected document is either malformed or badly composed, and those have
 * different owners; classifyValidationFailure() draws that line.
 */
async function evaluate(document, task) {
  const file = path.join(tmp, `${task.id}.json`);
  fs.writeFileSync(file, JSON.stringify(document));
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [cli, 'validate', task.diagramType, file, '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const verdict = classifyValidationFailure(safeParse(error.stdout)?.diagnostics);
    if (verdict.kind === 'invalid') throw new Error(verdict.message);
    return { errors: verdict.errors, warnings: verdict.warnings };
  }
  const receipt = safeParse(stdout);
  if (!receipt) throw new Error('validate produced no readable receipt');
  const summary = receipt.composition?.summary ?? { errors: 0, warnings: 0 };
  return {
    errors: Array(summary.errors ?? 0).fill('composition error'),
    warnings: Array(summary.warnings ?? 0).fill('composition warning'),
  };
}

/** @param {string | undefined} text */
function safeParse(text) {
  try {
    return JSON.parse(String(text));
  } catch {
    return null;
  }
}

/**
 * Run the tool's own repair step, then validate again.
 *
 * The second number this benchmark reports. It exists because a comparable
 * upstream benchmark instructs its agent to "validate and repair the candidate"
 * before freezing it -- so a first-pass rate alone is not the same measurement,
 * and comparing them would be comparing two different questions.
 */
async function repair(document, task) {
  const before = path.join(tmp, `${task.id}.before.json`);
  const after = path.join(tmp, `${task.id}.after.json`);
  fs.writeFileSync(before, JSON.stringify(document));
  try {
    execFileSync(process.execPath, [cli, 'repair', task.diagramType, before, after, '--safe', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
  } catch {
    return { usable: false, reason: 'repair refused this document' };
  }
  try {
    const receipt = safeParse(execFileSync(
      process.execPath, [cli, 'validate', task.diagramType, after, '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
    const summary = receipt?.composition?.summary ?? { errors: 0, warnings: 0 };
    return { usable: (summary.errors ?? 0) === 0 && (summary.warnings ?? 0) === 0 };
  } catch (error) {
    const verdict = classifyValidationFailure(safeParse(error.stdout)?.diagnostics);
    return {
      usable: false,
      reason: verdict.kind === 'invalid' ? verdict.message : `${verdict.errors.length} composition error(s)`,
    };
  }
}

const run = await runBenchmark({ tasks, author, evaluate, repair, model });

if (keepDir) {
  // Written last, so a directory carrying a manifest is a directory whose
  // documents are all present -- a replay never runs over half a corpus.
  fs.writeFileSync(path.join(keepDir, MANIFEST), `${JSON.stringify({
    model,
    author: args.author,
    savedAt: run.measuredAt,
    tasks: tasks.map((task) => task.id),
  }, null, 2)}
`);
}
console.log(formatRun(run));

if (args.out && args.out !== 'true') {
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(run, null, 2)}\n`);
  console.log(`wrote ${args.out}`);
}

// An inconclusive run is not a failure of this repo, so it does not fail the
// job. It is reported as what it is, and no rate enters the trend.
process.exit(0);
