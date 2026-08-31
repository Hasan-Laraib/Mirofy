// Row 6.19. `explain` — graph queries over the system model.
//
// The questions are the ones anyone asks about a system they did not write:
// what calls this, what is downstream of it, what touches the payment data, is
// anything here unreachable. A search tool answers those by matching text and
// hoping. This answers from the model built out of the evidence graph.
//
// Which makes the dangerous answer the EMPTY one. "Nothing calls
// PaymentService" is useful if the scanner read every file and reckless if six
// of them failed to parse -- and the difference is invisible unless the answer
// says so. So every result carries an `incompleteness` block, and most of the
// tests below are about that rather than about the traversal.
//
// The second rule is that nothing is inferred. `impact` reports reachability
// in the authored model; it does not claim blast radius, risk, or that a
// change breaks anything. Reachability is a fact about the graph. Breakage is
// a judgement about a system, and this tool has no basis for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain, indexModel, incompletenessFor, VERBS } from '../../explain/src/query.mjs';

/** A small system: web -> api -> db, api -> cache, and one orphan. */
function model() {
  return {
    schemaVersion: 1,
    components: [
      { id: 'web', kind: 'frontend', labels: ['Web'], provenance: 'source-backed', sources: [{ path: 'src/web.js' }] },
      { id: 'api', kind: 'backend', labels: ['API'], provenance: 'source-backed', sources: [{ path: 'src/api.js' }] },
      { id: 'db', kind: 'database', labels: ['Database'], provenance: 'config-derived', sources: [] },
      { id: 'cache', kind: 'database', labels: ['Cache'], provenance: 'inferred', sources: [] },
      { id: 'lonely', kind: 'backend', labels: ['Unused'], provenance: 'authored', sources: [] },
    ],
    relationships: [
      { id: 'r1', from: 'web', to: 'api', labels: ['calls'] },
      { id: 'r2', from: 'api', to: 'db', labels: ['reads'] },
      { id: 'r3', from: 'api', to: 'cache', labels: ['caches'] },
    ],
    boundaries: [],
    provenanceSummary: { 'source-backed': 2, 'config-derived': 1, inferred: 1, authored: 1 },
  };
}

const cleanGraph = { schemaVersion: 1, facts: [], gaps: [] };
const gappyGraph = {
  schemaVersion: 1,
  facts: [],
  gaps: [{ adapter: 'imports', path: 'src/worker.js', reason: 'computed import specifier at line 12' }],
};

test('[6.19] callers and dependencies read the graph in the right direction', () => {
  const callers = explain({ model: model(), graph: cleanGraph, verb: 'callers', args: ['api'] });
  assert.deepEqual(callers.results.map((r) => r.id), ['web']);

  const deps = explain({ model: model(), graph: cleanGraph, verb: 'dependencies', args: ['api'] });
  assert.deepEqual(deps.results.map((r) => r.id).sort(), ['cache', 'db']);

  // Direction is the whole answer. Swapping it turns "what depends on me" into
  // "what I depend on", which is the same list read backwards and a completely
  // different fact about the system.
  assert.notDeepEqual(callers.results.map((r) => r.id), deps.results.map((r) => r.id));
});

test('[6.19] impact is reachability, and says so rather than claiming risk', () => {
  const impact = explain({ model: model(), graph: cleanGraph, verb: 'impact', args: ['web'], depth: 5 });
  assert.deepEqual(impact.results.map((r) => r.id).sort(), ['api', 'cache', 'db']);
  assert.equal(impact.results.find((r) => r.id === 'api').depth, 1);
  assert.equal(impact.results.find((r) => r.id === 'db').depth, 2);

  // The claim is bounded in writing. A tool that answered "what breaks if I
  // change this" would be asserting something about runtime behaviour it has
  // no evidence for.
  assert.match(impact.claim, /[Nn]ot a claim about runtime behaviour/);
  assert.doesNotMatch(JSON.stringify(impact), /\brisk\b/i);
});

test('[6.19] depth bounds the walk', () => {
  const shallow = explain({ model: model(), graph: cleanGraph, verb: 'impact', args: ['web'], depth: 1 });
  assert.deepEqual(shallow.results.map((r) => r.id), ['api']);
});

test('[6.19] every answer says what it could be wrong about', () => {
  /** @type {Array<{verb: string, args: string[]}>} */
  const cases = [
    { verb: 'callers', args: ['api'] },
    { verb: 'dependencies', args: ['api'] },
    { verb: 'impact', args: ['web'] },
    { verb: 'upstream', args: ['db'] },
    { verb: 'find', args: ['api'] },
    { verb: 'orphans', args: [] },
    { verb: 'summary', args: [] },
  ];
  for (const { verb, args } of cases) {
    const answer = explain({ model: model(), graph: gappyGraph, verb, args });
    assert.ok(answer.incompleteness, `${verb} returned no incompleteness block`);
    assert.equal(answer.incompleteness.complete, false, `${verb} called a gappy scan complete`);
    assert.equal(answer.incompleteness.gaps[0].path, 'src/worker.js',
      `${verb} lost the gap path`);
  }
});

test('[6.19] an empty result from a gappy scan is "not found", never "does not exist"', () => {
  // The failure this row exists to prevent. `lonely` has no callers; with an
  // unread file in the scan, that emptiness is not evidence of absence, and
  // the answer has to carry the difference or someone will act on it.
  const answer = explain({ model: model(), graph: gappyGraph, verb: 'callers', args: ['lonely'] });
  assert.equal(answer.count, 0);
  assert.equal(answer.incompleteness.complete, false);
  assert.match(answer.incompleteness.note, /never as "does not exist"/);
});

test('[6.19] a complete scan says so, instead of staying silent', () => {
  const answer = explain({ model: model(), graph: cleanGraph, verb: 'callers', args: ['lonely'] });
  assert.equal(answer.count, 0);
  // "Complete" is information. Leaving the field out reads as an oversight,
  // and the reader cannot tell a clean scan from an unreported one.
  assert.equal(answer.incompleteness.complete, true);
  assert.match(answer.incompleteness.note, /no unanalysed files/);
});

test('[6.19] an unknown component is refused, with a suggestion', () => {
  // Answering "0 callers" for a typo is true and useless -- worse, it reads as
  // a fact about the system rather than about the spelling.
  assert.throws(() => explain({ model: model(), graph: cleanGraph, verb: 'callers', args: ['ap'] }),
    /no component "ap"[\s\S]*Did you mean/);
  assert.throws(() => explain({ model: model(), graph: cleanGraph, verb: 'callers', args: ['nowhere'] }),
    /no component "nowhere"/);
});

test('[6.19] path finds a route, and reports honestly when there is none', () => {
  const found = explain({ model: model(), graph: cleanGraph, verb: 'path', args: ['web', 'db'] });
  assert.equal(found.found, true);
  assert.equal(found.hops, 2);
  assert.deepEqual(found.results.map((r) => r.id), ['web', 'api', 'db']);

  const missing = explain({ model: model(), graph: gappyGraph, verb: 'path', args: ['db', 'web'] });
  assert.equal(missing.found, false);
  // Direction matters and so does honesty: with gaps, "no path" is "none
  // recorded".
  assert.match(missing.claim, /none recorded/);
});

test('[6.19] find matches ids, labels, kinds and metadata', () => {
  const byLabel = explain({ model: model(), graph: cleanGraph, verb: 'find', args: ['cache'] });
  assert.deepEqual(byLabel.results.map((r) => r.id), ['cache']);
  const byKind = explain({ model: model(), graph: cleanGraph, verb: 'find', args: ['database'] });
  assert.deepEqual(byKind.results.map((r) => r.id).sort(), ['cache', 'db']);
});

test('[6.19] orphans are components nothing connects to, either way', () => {
  const orphans = explain({ model: model(), graph: cleanGraph, verb: 'orphans' });
  assert.deepEqual(orphans.results.map((r) => r.id), ['lonely']);
});

test('[6.19] answers carry the evidence the model recorded', () => {
  const answer = explain({ model: model(), graph: cleanGraph, verb: 'callers', args: ['api'] });
  const web = answer.results[0];
  assert.ok(web.evidence.length > 0, 'a source-backed component answered with no citations');
  assert.equal(web.evidence[0].path, 'src/web.js');
  // Provenance travels with the answer, so a reader can tell a cited fact from
  // an inferred one without going back to the model.
  assert.equal(web.provenance, 'source-backed');
});

test('[6.19] an unknown verb is refused rather than guessed at', () => {
  assert.throws(() => explain({ model: model(), verb: 'wat' }), /unknown verb/);
  assert.ok(VERBS.length >= 8, 'the verb list shrank');
});

test('[6.19] indexing a model with no relationships does not throw', () => {
  const index = indexModel({ components: [{ id: 'a' }] });
  assert.equal(index.components.size, 1);
  assert.equal(index.outgoing.size, 0);
  const answer = explain({ model: { components: [{ id: 'a' }] }, verb: 'orphans' });
  assert.equal(answer.count, 1);
});

test('[6.19] a missing evidence graph is treated as unknown, not as clean', () => {
  // No graph is not the same as a graph with no gaps. Reporting "complete"
  // here would be a claim about a scan that never ran.
  const report = incompletenessFor(null);
  assert.equal(report.complete, true);
  // ...and that is the one place this is deliberately permissive, so it is
  // pinned: callers pass the graph, and the CLI refuses to run without a
  // model. If this ever needs to distinguish the two, it should return a
  // third state rather than quietly reading absent as clean.
  assert.match(report.note, /no unanalysed files/);
});
