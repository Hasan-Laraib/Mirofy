// Row 3.15. `assert` — architecture rules as CI checks.
//
// A diagram says what the architecture looked like when someone drew it. A
// rule says what it is allowed to become: "nothing but the API talks to the
// database", "payments must not depend on analytics", "no cycles". These are
// the constraints a team agrees in a meeting and discovers were broken six
// months later.
//
// Detecting a violation is the easy half. The half that matters is what to say
// when the scan could not read everything -- and the answer here is a THIRD
// outcome. A rule that found nothing over a scan with unread files has not
// been shown to hold; the violation could be in one of them. Calling that a
// pass converts an honest gap into a green check, and green checks get acted
// on. So `unproven` is its own outcome, never counted as passing, and it fails
// the command unless someone opts out in writing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexModel, incompletenessFor } from '../../explain/src/query.mjs';
import {
  assertRules, evaluateRule, resolveSelector, scopedRelationships, partitionGaps,
  OUTCOMES, RULE_KINDS,
} from '../../explain/src/assert.mjs';

/** web -> api -> db, plus a direct web -> db that most rules should dislike. */
function model({ direct = true } = {}) {
  const relationships = [
    { id: 'r1', from: 'web', to: 'api', sources: [{ diagramType: 'architecture' }] },
    { id: 'r2', from: 'api', to: 'db', sources: [{ diagramType: 'architecture' }] },
  ];
  if (direct) relationships.push({ id: 'r3', from: 'web', to: 'db', sources: [{ diagramType: 'architecture' }] });
  return {
    components: [
      { id: 'web', kind: 'frontend', labels: ['Web'], sources: [{ path: 'src/web.js' }] },
      { id: 'api', kind: 'backend', labels: ['API'], sources: [{ path: 'src/api.js' }] },
      { id: 'db', kind: 'database', labels: ['Database'], sources: [{ path: 'src/db.js' }] },
    ],
    relationships,
  };
}

const complete = incompletenessFor({ gaps: [] });
const gappy = incompletenessFor({ gaps: [{ path: 'src/worker.js', reason: 'computed import' }] });

const forbidDirect = {
  id: 'only-api-talks-to-the-database',
  kind: 'forbid-dependency',
  from: '*',
  to: 'kind:database',
  except: ['api'],
};

test('[3.15] a rule that finds a violation fails, and names it with evidence', () => {
  const result = evaluateRule(forbidDirect, indexModel(model()), complete);
  assert.equal(result.outcome, OUTCOMES.FAIL);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].from, 'web');
  assert.equal(result.violations[0].to, 'db');
  // A violation you cannot check is a violation you have to take on trust.
  assert.ok(result.violations[0].evidence.includes('src/web.js'));
});

test('[3.15] the `except` list is honoured', () => {
  const result = evaluateRule(forbidDirect, indexModel(model({ direct: false })), complete);
  // api -> db still exists and is exempt; without the exemption this rule
  // would forbid the architecture it is meant to protect.
  assert.equal(result.outcome, OUTCOMES.PASS);
});

test('[3.15] no violation over a scan with gaps is UNPROVEN, not passing', () => {
  // The whole reason this row exists. The rule found nothing -- and the
  // scanner could not read a file, so "found nothing" is not "there is
  // nothing", and the difference is what someone would act on.
  const result = evaluateRule(forbidDirect, indexModel(model({ direct: false })), gappy);
  assert.equal(result.outcome, OUTCOMES.UNPROVEN);
  assert.notEqual(result.outcome, OUTCOMES.PASS);
  assert.match(result.reason, /has not been shown to hold/);
});

test('[3.15] unproven fails the run by default, and passing it takes an explicit flag', () => {
  const index = indexModel(model({ direct: false }));
  const strict = assertRules({ index, incompleteness: gappy, rules: [forbidDirect] });
  assert.equal(strict.ok, false, 'an unproven rule passed the run');
  assert.equal(strict.unproven, 1);
  assert.equal(strict.passed, 0, 'unproven was counted as passing');

  const relaxed = assertRules({ index, incompleteness: gappy, rules: [forbidDirect], allowUnproven: true });
  assert.equal(relaxed.ok, true);
  // Still not counted as passed, even when tolerated: the count is the record
  // of what was actually proved.
  assert.equal(relaxed.passed, 0);
  assert.equal(relaxed.unproven, 1);
});

test('[3.15] a violation fails the run whether or not unproven is tolerated', () => {
  const index = indexModel(model());
  for (const allowUnproven of [false, true]) {
    const report = assertRules({ index, incompleteness: gappy, rules: [forbidDirect], allowUnproven });
    assert.equal(report.ok, false, `a real violation passed with allowUnproven=${allowUnproven}`);
  }
});

test('[3.15] a selector that matches nothing is an error, not an empty pass', () => {
  // A rule about a component that does not exist passes forever. The day
  // someone renames the component is the day it stops protecting anything,
  // and nothing would report that.
  assert.throws(() => resolveSelector('nonexistent', indexModel(model())),
    /matches no component[\s\S]*protects nothing/);
  assert.throws(() => evaluateRule(
    { kind: 'forbid-dependency', from: 'kind:nowhere', to: 'db' }, indexModel(model()), complete,
  ), /matches no component/);
});

test('[3.15] scope keeps a dependency rule away from sequence replies', () => {
  // Found by running this against the repository's own model. A sequence
  // diagram records `api -> auth` and `auth -> api` because a request gets a
  // reply. Read as a dependency graph that is a cycle, and no-cycles reported
  // six of them in a repository that has none. The rule was right; the scope
  // was missing.
  const mixed = {
    components: [{ id: 'api' }, { id: 'auth' }],
    relationships: [
      { id: 'a', from: 'api', to: 'auth', sources: [{ diagramType: 'architecture' }] },
      { id: 'b', from: 'auth', to: 'api', sources: [{ diagramType: 'sequence' }] },
    ],
  };
  const unscoped = evaluateRule({ kind: 'no-cycles' }, indexModel(mixed), complete);
  assert.equal(unscoped.outcome, OUTCOMES.FAIL, 'the fixture must contain a cycle when unscoped');

  const scoped = evaluateRule(
    { kind: 'no-cycles', scope: { diagramType: 'architecture' } }, indexModel(mixed), complete,
  );
  assert.equal(scoped.outcome, OUTCOMES.PASS, 'the reply edge is still being read as a dependency');

  assert.equal(scopedRelationships(mixed, { diagramType: 'architecture' }).length, 1);
  assert.equal(scopedRelationships(mixed, null).length, 2);
});

test('[3.15] no-cycles finds a real cycle and reports the loop, not the path to it', () => {
  const cyclic = {
    components: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'entry' }],
    relationships: [
      { id: '0', from: 'entry', to: 'a' },
      { id: '1', from: 'a', to: 'b' },
      { id: '2', from: 'b', to: 'c' },
      { id: '3', from: 'c', to: 'a' },
    ],
  };
  const result = evaluateRule({ kind: 'no-cycles' }, indexModel(cyclic), complete);
  assert.equal(result.outcome, OUTCOMES.FAIL);
  const cycle = result.violations[0].cycle;
  // `entry` leads to the loop but is not in it. Reporting it would send the
  // reader to a component that is not part of the problem.
  assert.ok(!cycle.includes('entry'), `the reported cycle includes a node outside it: ${cycle.join(' -> ')}`);
  assert.deepEqual([...new Set(cycle)].sort(), ['a', 'b', 'c']);
});

test('[3.15] require-dependency reports what is missing, not what is present', () => {
  const result = evaluateRule(
    { id: 'web-must-reach-api', kind: 'require-dependency', from: 'kind:frontend', to: 'kind:backend' },
    indexModel(model()), complete,
  );
  assert.equal(result.outcome, OUTCOMES.PASS);

  const orphaned = evaluateRule(
    { kind: 'require-dependency', from: 'kind:database', to: 'kind:backend' },
    indexModel(model()), complete,
  );
  assert.equal(orphaned.outcome, OUTCOMES.FAIL);
  assert.equal(orphaned.violations[0].missing, true);
});

test('[3.15] fan limits count the right direction', () => {
  const index = indexModel(model());
  const fanIn = evaluateRule({ kind: 'max-fan-in', select: 'db', limit: 1 }, index, complete);
  assert.equal(fanIn.outcome, OUTCOMES.FAIL, 'db has two dependents and a limit of one');
  assert.equal(fanIn.violations[0].degree, 2);

  const fanOut = evaluateRule({ kind: 'max-fan-out', select: 'db', limit: 1 }, index, complete);
  assert.equal(fanOut.outcome, OUTCOMES.PASS, 'db points at nothing; fan-out was read as fan-in');
});

test('[3.15] an unknown rule kind and an empty rule file are both refused', () => {
  assert.throws(() => evaluateRule({ kind: 'vibes' }, indexModel(model()), complete), /unknown rule kind/);
  assert.throws(() => assertRules({ index: indexModel(model()), incompleteness: complete, rules: [] }),
    /at least one rule/);
  assert.ok(RULE_KINDS.length >= 5, 'the rule vocabulary shrank');
});

// ---------------------------------------------------------------------------
// Acknowledged gaps. `unproven` is the right default, but a repository can
// have gaps that are genuinely permanent -- this one has eight, every one a
// dynamic import whose base path is a variable, which no scanner can resolve
// without guessing. Leaving every rule unproven forever teaches people to pass
// --allow-unproven, and that switch turns the distinction off entirely.
//
// So a gap can be acknowledged. The whole design question is making that hard
// to abuse, which is what the tests below are about.
// ---------------------------------------------------------------------------

const REASON = 'Read every call site; the target is a fixed file in this repository, not user input.';
const ack = (path, extra = {}) => ({
  path, reasonContains: 'computed import specifier', because: REASON, ...extra,
});
const gapAt = (path, reason = 'computed import specifier at line 12') => incompletenessFor({
  gaps: [{ path, reason }],
});

test('[3.15] an acknowledged gap lets a rule pass, and the pass says what it rests on', () => {
  const index = indexModel(model({ direct: false }));
  const result = evaluateRule(forbidDirect, index, gapAt('src/worker.js'), [ack('src/worker.js')]);
  assert.equal(result.outcome, OUTCOMES.PASS);
  // A human judgement standing in for evidence must never be indistinguishable
  // from a clean scan.
  assert.equal(result.restsOnAcknowledgements, 1);
  assert.match(result.reason, /rests on that judgement, not on a complete scan/);
});

test('[3.15] an acknowledgement covers one path and no others', () => {
  // No wildcard exists. An acknowledgement written for one file must not
  // quietly cover the next file that fails.
  const index = indexModel(model({ direct: false }));
  const result = evaluateRule(forbidDirect, index, gapAt('src/other.js'), [ack('src/worker.js')]);
  assert.equal(result.outcome, OUTCOMES.UNPROVEN);
});

test('[3.15] an acknowledgement stops applying when the reason changes', () => {
  // The load-bearing constraint. An acknowledgement written for a dynamic
  // import says nothing about that file failing to parse, and must not carry
  // over to a failure nobody examined.
  const index = indexModel(model({ direct: false }));
  const different = gapAt('src/worker.js', 'syntax error at line 4');
  const result = evaluateRule(forbidDirect, index, different, [ack('src/worker.js')]);
  assert.equal(result.outcome, OUTCOMES.UNPROVEN,
    'an acknowledgement covered a failure it was not written for');
});

test('[3.15] an acknowledgement with no real reason is refused', () => {
  // "because: ok" is not a review. The threshold is deliberately crude but
  // real: an acknowledgement has to carry an argument someone can disagree
  // with.
  const index = indexModel(model({ direct: false }));
  for (const because of [undefined, '', 'ok', 'wontfix']) {
    const result = evaluateRule(forbidDirect, index, gapAt('src/worker.js'),
      [{ path: 'src/worker.js', reasonContains: 'computed import specifier', because }]);
    assert.equal(result.outcome, OUTCOMES.UNPROVEN, `an empty reason (${because}) was accepted`);
  }
});

test('[3.15] an acknowledgement never hides a real violation', () => {
  // Acknowledging a gap says "nothing can hide here". It says nothing about
  // the violations that are in plain sight.
  const index = indexModel(model());
  const result = evaluateRule(forbidDirect, index, gapAt('src/worker.js'), [ack('src/worker.js')]);
  assert.equal(result.outcome, OUTCOMES.FAIL);
  assert.equal(result.violations.length, 1);
});

test('[3.15] one unacknowledged gap is enough to hold a rule unproven', () => {
  const index = indexModel(model({ direct: false }));
  const two = incompletenessFor({
    gaps: [
      { path: 'src/worker.js', reason: 'computed import specifier at line 12' },
      { path: 'src/new.js', reason: 'computed import specifier at line 3' },
    ],
  });
  const result = evaluateRule(forbidDirect, index, two, [ack('src/worker.js')]);
  assert.equal(result.outcome, OUTCOMES.UNPROVEN);
  assert.match(result.reason, /1 file\(s\).*not acknowledged/);
});

test('[3.15] the run reports how many rules rest on a judgement rather than evidence', () => {
  const index = indexModel(model({ direct: false }));
  const report = assertRules({
    index,
    incompleteness: gapAt('src/worker.js'),
    rules: [forbidDirect, { id: 'cycles', kind: 'no-cycles' }],
    acknowledgements: [ack('src/worker.js')],
  });
  assert.equal(report.ok, true);
  assert.equal(report.passed, 2);
  // Counted in RULES. Summing gaps across rules gave 16 for eight gaps and two
  // rules, which is a number nobody can act on.
  assert.equal(report.acknowledged, 2);
});

test('[3.15] partitionGaps separates what was examined from what was not', () => {
  const gaps = [
    { path: 'a.js', reason: 'computed import specifier at line 1' },
    { path: 'b.js', reason: 'computed import specifier at line 2' },
  ];
  const { acknowledged, outstanding } = partitionGaps(gaps, [ack('a.js')]);
  assert.equal(acknowledged.length, 1);
  assert.equal(acknowledged[0].gap.path, 'a.js');
  assert.equal(acknowledged[0].by.because, REASON);
  assert.deepEqual(outstanding.map((g) => g.path), ['b.js']);
});
