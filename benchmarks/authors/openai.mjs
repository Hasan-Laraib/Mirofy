// A benchmark author backed by the OpenAI API.
//
//   node scripts/benchmark.mjs --author "node benchmarks/authors/openai.mjs" --model "gpt-...":
//
// Reads one task as JSON on stdin, prints one diagram document as JSON on
// stdout -- the same contract as every other author, so the harness cannot
// tell them apart and the two runs are comparable.
//
// It uses the same schema-derived brief as the Claude author. That is the
// point: if one author saw a better prompt than the other, the comparison
// would measure the prompts. Neither gets worked examples of the tasks.
//
// No dependency is added. `fetch` is built into Node 18+, and row 6.9 keeps
// this repository at zero runtime dependencies.
//
// THE KEY IS NEVER READ FROM AN ARGUMENT and never printed. It comes from the
// environment, or from a git-ignored `.benchmark.env` beside the repository
// root, so it cannot end up in a shell history, a process list, or a commit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { briefFor } from './schema-brief.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The API key, from the environment or a git-ignored file.
 *
 * A file is offered because an environment variable does not survive between
 * separate command invocations on Windows, and the alternative -- passing the
 * key as an argument -- puts it in the process list and the shell history.
 */
function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  const envFile = path.join(repoRoot, '.benchmark.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (match) return match[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const PLACEMENT = {
  architecture: `- Placement: set top-level "layout": { "mode": "grid", "cols": N } and give
  every component integer "row" and "col" within those bounds. Do not use "pos".`,
  workflow: '- Placement: give every node an integer "col" (0-5) and its "lane".',
  lifecycle: '- Placement: give every state an integer "col" (0-4) and its "lane".',
  dataflow: '- Placement: give every node an integer "row" and its "stage".',
  sequence: '- Placement: give every message an increasing "y", from 160, stepping by ~60.',
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

/** Pull a JSON document out of a reply, tolerating a code fence. */
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
process.stdin.on('end', async () => {
  const key = apiKey();
  if (!key) {
    process.stderr.write('openai author: no OPENAI_API_KEY in the environment or .benchmark.env\n');
    process.exit(2);
  }

  let task;
  try {
    task = JSON.parse(input);
  } catch (error) {
    process.stderr.write(`openai author: unreadable task: ${error.message}\n`);
    process.exit(2);
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: promptFor(task) }],
        // Deterministic where the provider allows it, so a re-run of the same
        // corpus is comparable rather than a fresh sample.
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      // The status is the author's failure, not the tool's, and the harness
      // classifies it that way because this exits non-zero.
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content ?? '';
    process.stdout.write(JSON.stringify(extractJson(text)));
  } catch (error) {
    process.stderr.write(`openai author: ${error.message}\n`);
    process.exit(1);
  }
});
