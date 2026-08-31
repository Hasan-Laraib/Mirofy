// A benchmark author backed by the Claude Code CLI.
//
//   node scripts/benchmark.mjs --author "node benchmarks/authors/claude-cli.mjs" --model "claude-code-cli"
//
// Reads one task as JSON on stdin, prints one diagram document as JSON on
// stdout. That is the whole author contract; the harness does the rest.
//
// The prompt is part of what gets measured, so it is GENERATED from the
// shipped JSON Schemas rather than written by hand. The first version was
// hand-written, was wrong in five places, and scored 0 of 8 -- a number that
// measured the prompt and nothing else. A brief derived from the schema cannot
// drift from it.
//
// What it deliberately does NOT include is worked examples of these tasks,
// which would measure the prompt rather than the tool.
//
// Nothing here retries, repairs, or post-processes the model's answer beyond
// unwrapping a code fence. "First-pass usable" means first pass: a harness
// that quietly fixed the output would be measuring its own repair step.

import { spawnSync } from 'node:child_process';
import { briefFor } from './schema-brief.mjs';

/**
 * How each type expects to be placed.
 *
 * Only architecture has a top-level `layout` block; offering it generically
 * made a lifecycle document invalid for an additional property. Placement is
 * per-type, so the instruction has to be too.
 */
const PLACEMENT = {
  architecture: `- Placement: set top-level "layout": { "mode": "grid", "cols": N } and give
  every component integer "row" and "col" within those bounds. Do not use "pos".`,
  workflow: `- Placement: give every node an integer "col" (0-5) and its "lane".`,
  lifecycle: `- Placement: give every state an integer "col" (0-4) and its "lane".`,
  dataflow: `- Placement: give every node an integer "row" and its "stage".`,
  sequence: `- Placement: give every message an increasing "y", from 160, stepping by ~60.`,
};

function promptFor(task) {
  return `Produce a ${task.diagramType} diagram as JSON for this system:

${task.prompt}

Output ONLY the JSON document. No prose, no explanation, no code fence.

${briefFor(task.diagramType)}

Rules:
- Every id must be unique.
- Every from/to must name an id that exists in this document.
${PLACEMENT[task.diagramType] ?? ''}`;
}

/** Pull a JSON document out of a model reply, tolerating a code fence. */
export function extractJson(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`no JSON object in the reply: ${trimmed.slice(0, 160)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let task;
  try {
    task = JSON.parse(input);
  } catch (error) {
    process.stderr.write(`claude-cli author: unreadable task: ${error.message}\n`);
    process.exit(2);
  }

  const result = spawnSync('claude', ['-p'], {
    input: promptFor(task),
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.status !== 0) {
    // Exiting non-zero is how the harness learns this is an AUTHOR failure
    // rather than a bad document. Conflating the two would blame the tool for
    // a CLI that timed out.
    process.stderr.write(`claude CLI exited ${result.status}: ${(result.stderr || '').trim().slice(0, 300)}\n`);
    process.exit(1);
  }

  try {
    process.stdout.write(JSON.stringify(extractJson(result.stdout)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
});
