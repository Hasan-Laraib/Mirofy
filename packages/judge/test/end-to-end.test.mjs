// The whole chain, offline: a scanner gap in, an `inferred` relationship out.
//
// No key, no socket, no disk. The client is a fixture built to the DOCUMENTED
// direct-dialect response shape -- see the note in client.test.mjs about what
// that does and does not prove.
import assert from 'node:assert/strict';
import test from 'node:test';
import { unresolvedImports } from '../src/gaps.mjs';
import { buildCandidates } from '../src/questions.mjs';
import { runJudge } from '../src/judge.mjs';
import { annotate } from '../src/annotate.mjs';
import { resolveProvenance } from '../../core/renderers/shared/evidence-provenance.mjs';

// A scan of a two-package repository whose loader dispatches dynamically.
const gaps = [
  {
    adapter: 'imports',
    path: 'packages/app/src/load.mjs',
    reason: 'computed import specifier at line 3; the target cannot be known statically',
    revision: 'a'.repeat(40),
  },
  {
    adapter: 'imports',
    path: 'packages/app/src/broken.mjs',
    reason: 'unreadable: EACCES: permission denied',
    revision: 'a'.repeat(40),
  },
];

const model = {
  schemaVersion: 1,
  components: [
    {
      id: '@acme/app',
      kind: 'package',
      labels: ['app'],
      sources: [{ path: 'packages/app/package.json' }],
      provenance: 'config-derived',
      metadata: { packageName: '@acme/app' },
    },
    {
      id: '@acme/billing',
      kind: 'package',
      labels: ['billing'],
      sources: [{ path: 'packages/billing/package.json' }],
      provenance: 'config-derived',
      metadata: { packageName: '@acme/billing' },
    },
  ],
  relationships: [],
};

const source = [
  'const which = process.env.HANDLER;',
  '// dispatch to the billing handler when configured',
  'const mod = await import(`../../billing/src/${which}.mjs`);',
  'export default mod;',
].join('\n');

/** A fixture client. The response shape is the documented direct dialect. */
const fixtureClient = (probability) => ({
  model: 'jev-1.13.0',
  ask: async ({ id, state, question }) => {
    // The chain must hand the client a real question about a real state.
    assert.equal(question.type, 'noul');
    assert.ok(state.excerpt.includes('3: const mod'));
    assert.ok(id);
    return {
      probability,
      model: 'jev-1.13.0',
      requestId: 'req_e2e',
      usage: { input_tokens: 211, output_tokens: 0 },
    };
  },
});

test('a computed import becomes a drawn `inferred` edge, cited to the gap', async () => {
  const { questions, skipped } = unresolvedImports(gaps);
  assert.equal(questions.length, 1, 'the computed import is a question');
  assert.equal(skipped, 1, 'the unreadable file is not');

  const { candidates } = buildCandidates({
    questions,
    components: model.components,
    relationships: model.relationships,
    readFile: (path) => (path === 'packages/app/src/load.mjs' ? source : null),
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].from, '@acme/app');
  assert.equal(candidates[0].to, '@acme/billing');

  const result = await runJudge({ candidates, client: fixtureClient(0.62) });
  assert.equal(result.judgments.length, 1);

  const { model: judged, drawn } = annotate(model, result.judgments);
  assert.equal(drawn.length, 1);

  const edge = judged.relationships.find((relationship) => relationship.metadata?.judged);
  assert.ok(edge, 'the judged edge reached the model');

  // This is the contract with the rest of the pipeline. compile.mjs reads
  // exactly these two fields:
  //     label: relationship.labels?.[0] ?? null,
  //     provenance: relationship.provenance,
  assert.equal(edge.labels[0], 'may import · p 0.62');
  assert.equal(edge.provenance, 'inferred');
  // And this is what the renderer will resolve it to, using core's own
  // function rather than a copy of its rules.
  assert.equal(resolveProvenance(edge), 'inferred');

  // The citation points at the line the scanner gave up on.
  assert.deepEqual(edge.sources, [{ path: 'packages/app/src/load.mjs', line: 3 }]);
});

test('a low answer leaves the model exactly as it was', async () => {
  const { questions } = unresolvedImports(gaps);
  const { candidates } = buildCandidates({
    questions,
    components: model.components,
    relationships: model.relationships,
    readFile: () => source,
  });
  const result = await runJudge({ candidates, client: fixtureClient(0.11) });
  const { model: judged, drawn, withheld } = annotate(model, result.judgments);

  assert.equal(drawn.length, 0);
  assert.equal(withheld.length, 1, 'the question was asked, and the answer is recorded');
  assert.deepEqual(judged.relationships, [], 'nothing is drawn on a "probably not"');
});

test('the original model is never mutated anywhere in the chain', async () => {
  const before = JSON.stringify(model);
  const { questions } = unresolvedImports(gaps);
  const { candidates } = buildCandidates({
    questions,
    components: model.components,
    relationships: model.relationships,
    readFile: () => source,
  });
  const result = await runJudge({ candidates, client: fixtureClient(0.9) });
  annotate(model, result.judgments);
  assert.equal(JSON.stringify(model), before);
});
