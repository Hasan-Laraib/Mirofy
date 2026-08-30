// @ts-check
// Runs the first-pass usable benchmark (row 7.8).
//
//   node scripts/benchmark.mjs --author <command> --model <id> [--out run.json]
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
if (!args.author || args.author === 'true') {
  console.error('benchmark: --author <command> is required. The harness does not invent an author.');
  process.exit(2);
}
if (!args.model || args.model === 'true') {
  console.error('benchmark: --model <id> is required. An unattributed rate cannot be compared to anything.');
  process.exit(2);
}

const tasks = fs.readdirSync(tasksDir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(tasksDir, name), 'utf8')));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-benchmark-'));

/** Ask the author for one document. Anything unreadable is the author's failure. */
async function author(task) {
  const result = spawnSync(args.author, { input: JSON.stringify(task), encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    throw new Error(`author exited ${result.status}: ${(result.stderr || '').trim().slice(0, 200)}`);
  }
  try {
    return JSON.parse(result.stdout);
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

const run = await runBenchmark({ tasks, author, evaluate, model: args.model });
console.log(formatRun(run));

if (args.out && args.out !== 'true') {
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(run, null, 2)}\n`);
  console.log(`wrote ${args.out}`);
}

// An inconclusive run is not a failure of this repo, so it does not fail the
// job. It is reported as what it is, and no rate enters the trend.
process.exit(0);
