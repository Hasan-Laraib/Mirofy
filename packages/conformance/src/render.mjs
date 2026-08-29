import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');
export const coreRoot = path.join(repoRoot, 'packages/core');
export const fixturesRoot = path.join(repoRoot, 'fixtures/sources');

export const MODES = [
  { mode: 'architecture', fixture: 'web-app.architecture.json' },
  { mode: 'workflow', fixture: 'agent-tool-call.workflow.json' },
  { mode: 'sequence', fixture: 'cache-miss-request.sequence.json' },
  { mode: 'dataflow', fixture: 'product-analytics.dataflow.json' },
  { mode: 'lifecycle', fixture: 'agent-run.lifecycle.json' },
];

export function renderFixture(mode, fixture, outPath) {
  const input = path.isAbsolute(fixture) ? fixture : path.join(fixturesRoot, fixture);
  execFileSync(process.execPath, [
    path.join(coreRoot, `renderers/${mode}/render-${mode}.mjs`),
    input,
    outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

export function canonicalise(html) {
  return html.replace(/\r\n?/g, '\n');
}
