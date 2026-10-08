import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_MIN, annotate, judgedId, labelFor } from '../src/annotate.mjs';
import { PROVENANCE_CLASSES } from '../../core/renderers/shared/evidence-provenance.mjs';

const judgment = (from, to, probability) => ({
  from,
  to,
  probability,
  asked: { model: 'jev-1.13.0', request_id: 'req_1', state_sha256: 'a'.repeat(64) },
  gap: { path: 'a/load.mjs', line: 3, reason: 'computed import specifier at line 3; the target cannot be known statically' },
});

const baseModel = () => ({
  components: [{ id: 'app' }, { id: 'billing' }],
  relationships: [{ id: 'derived-x', from: 'app', to: 'other', provenance: 'statically-derived' }],
});

test('the label states a probability and never says "confidence"', () => {
  const label = labelFor(0.6234);
  assert.equal(label, 'may import · p 0.62');
  // TypeSafe documents `confidence` only as a spread statistic, and the AI SDK
  // docs warn it is not a portable confidence measure. Printing that word
  // would be claiming something the model does not return.
  assert.ok(!/confidence/i.test(label));
});

test('inferred is a class the published vocabulary already contains', () => {
  // The whole design rests on this: the class exists, the schema allows it,
  // and the viewer already paints it. If it ever leaves the vocabulary, this
  // package is drawing something the renderer cannot paint.
  assert.ok(PROVENANCE_CLASSES.includes('inferred'));
});

test('a judged edge is added as inferred, cited to the gap', () => {
  const model = baseModel();
  const { model: out, drawn } = annotate(model, [judgment('app', 'billing', 0.62)]);
  assert.equal(drawn.length, 1);
  const added = out.relationships.find((edge) => edge.id === judgedId('app', 'billing'));
  assert.ok(added, 'the judged edge must be present');
  assert.equal(added.provenance, 'inferred');
  assert.equal(added.labels[0], 'may import · p 0.62');
  // The citation is the place the scanner said it could not see. That is not
  // proof of the edge; it is proof of the question.
  assert.deepEqual(added.sources, [{ path: 'a/load.mjs', line: 3 }]);
  assert.equal(added.metadata.probability, 0.62);
  assert.equal(added.metadata.request_id, 'req_1');
});

test('the judged id cannot collide with a derived one', () => {
  assert.ok(judgedId('a', 'b').startsWith('judged-'));
  assert.ok(!judgedId('a', 'b').startsWith('derived-'));
});

test('annotate does not mutate the model it was given', () => {
  const model = baseModel();
  const before = JSON.stringify(model);
  annotate(model, [judgment('app', 'billing', 0.9)]);
  // Every other command in this repository is entitled to the un-judged model.
  assert.equal(JSON.stringify(model), before);
});

test('the existing relationships survive untouched', () => {
  const { model: out } = annotate(baseModel(), [judgment('app', 'billing', 0.9)]);
  const original = out.relationships.find((edge) => edge.id === 'derived-x');
  assert.equal(original.provenance, 'statically-derived');
  assert.equal(out.relationships.length, 2);
});

test('a judgment below --min is withheld but recorded', () => {
  const { model: out, drawn, withheld } = annotate(baseModel(), [judgment('app', 'billing', 0.2)]);
  assert.equal(drawn.length, 0);
  assert.equal(withheld.length, 1);
  assert.ok(withheld[0].withheld_because.includes('below'));
  // Dropping it would leave the file implying the question was never asked.
  assert.equal(out.relationships.length, 1);
});

test('the threshold is inclusive at the boundary', () => {
  const { drawn } = annotate(baseModel(), [judgment('app', 'billing', DEFAULT_MIN)]);
  assert.equal(drawn.length, 1, 'exactly --min is drawn');
});

test('--min is overridable', () => {
  const { drawn } = annotate(baseModel(), [judgment('app', 'billing', 0.62)], { min: 0.9 });
  assert.equal(drawn.length, 0);
});

test('a guess is never drawn beside a proof of the same pair', () => {
  const model = baseModel();
  model.relationships.push({ id: 'derived-y', from: 'app', to: 'billing', provenance: 'statically-derived' });
  const { drawn, withheld } = annotate(model, [judgment('app', 'billing', 0.99)]);
  assert.equal(drawn.length, 0);
  assert.ok(withheld[0].withheld_because.includes('already proved'));
});

test('the same pair judged twice is added once', () => {
  const { model: out } = annotate(baseModel(), [
    judgment('app', 'billing', 0.8),
    judgment('app', 'billing', 0.7),
  ]);
  const judged = out.relationships.filter((edge) => edge.metadata?.judged);
  assert.equal(judged.length, 1);
});

test('a judgment with no probability is withheld, not drawn as zero', () => {
  const broken = { ...judgment('app', 'billing', 0.9), probability: undefined };
  const { drawn, withheld } = annotate(baseModel(), [broken]);
  assert.equal(drawn.length, 0);
  assert.equal(withheld[0].withheld_because, 'no probability');
});

test('no judgments returns the model unchanged in content', () => {
  const { model: out } = annotate(baseModel(), []);
  assert.deepEqual(out.relationships, baseModel().relationships);
});

test('a model with no relationships array is handled', () => {
  const { model: out } = annotate({ components: [] }, [judgment('app', 'billing', 0.9)]);
  assert.equal(out.relationships.length, 1);
});

test('a judgment with no citation is withheld, not drawn and not thrown on', () => {
  // Every relationship in a model cites a file. A judged one cites the place
  // the scanner gave up. With no citation there is no edge -- and withholding
  // it is better than the TypeError reaching the caller.
  const uncited = { from: 'app', to: 'billing', probability: 0.99, asked: {} };
  const { model: out, drawn, withheld } = annotate(baseModel(), [uncited]);
  assert.equal(drawn.length, 0);
  assert.equal(withheld[0].withheld_because, 'no gap citation');
  assert.equal(out.relationships.length, 1);
});
