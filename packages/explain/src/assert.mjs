// `assert` — architecture rules as CI checks (row 3.15).
//
// A diagram tells you what the architecture looked like when someone drew it.
// A rule tells you what it is allowed to become. "Nothing but the API may talk
// to the database", "the payments boundary must not depend on analytics",
// "no cycles" -- these are the constraints teams agree on in a meeting and
// then discover were broken six months later.
//
// The interesting design question is not how to detect a violation. It is what
// to say when the scan could not read everything.
//
// A rule has THREE outcomes here, not two: pass, fail, and unproven. A rule
// that found no violations in a scan with six unread files has not been shown
// to hold -- the violation could be in one of those files. Reporting that as a
// pass would turn an honest gap into a green check, which is the precise
// failure this project exists to avoid. So `unproven` is its own outcome, it
// is never counted as passing, and by default it fails the command.
//
// The rules themselves are declarative and evidence-backed: a violation
// reports the components involved and the citations behind them, so the
// reader can go and look rather than take this on trust.

/** Rule kinds `assert` understands. */
export const RULE_KINDS = Object.freeze([
  'forbid-dependency', 'require-dependency', 'no-cycles', 'max-fan-in', 'max-fan-out',
]);

/** Outcomes. `unproven` is deliberately not a synonym for either of the others. */
export const OUTCOMES = Object.freeze({ PASS: 'pass', FAIL: 'fail', UNPROVEN: 'unproven' });

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Resolve a selector to component ids.
 *
 * Selectors are deliberately small: an exact id, a `kind:` prefix, or a
 * `label:` substring. A pattern language here would be a second thing to
 * specify, test and get wrong, and these three cover the rules people actually
 * write.
 *
 * A selector that matches NOTHING is an error, not an empty set. A rule about
 * a component that does not exist silently passes forever, and the day someone
 * renames the component is the day the rule stops protecting anything.
 */
export function resolveSelector(selector, index) {
  const text = String(selector ?? '');
  let matched;
  if (text.startsWith('kind:')) {
    const kind = text.slice(5);
    matched = [...index.components.values()].filter((c) => c.kind === kind).map((c) => c.id);
  } else if (text.startsWith('label:')) {
    const needle = text.slice(6).toLowerCase();
    matched = [...index.components.values()]
      .filter((c) => asArray(c.labels).some((l) => String(l).toLowerCase().includes(needle)))
      .map((c) => c.id);
  } else if (text === '*') {
    matched = [...index.components.keys()];
  } else {
    matched = index.components.has(text) ? [text] : [];
  }
  if (matched.length === 0) {
    throw new TypeError(`assert: selector ${JSON.stringify(text)} matches no component. `
      + 'A rule about something that does not exist passes forever and protects nothing.');
  }
  return matched;
}

/**
 * Narrow the relationships a rule looks at.
 *
 * The model merges every diagram type, and that matters more than it sounds.
 * A sequence diagram records `api -> auth` and `auth -> api` because a request
 * gets a reply; read as a dependency graph that is a cycle, and a no-cycles
 * rule over the merged model reports six of them in a repository that has
 * none. The rule was not wrong -- the scope was.
 *
 * `scope: { diagramType: 'architecture' }` restricts a rule to relationships
 * that came from architecture documents, which is what a dependency rule
 * means. With no scope, everything is considered.
 */
export function scopedRelationships(model, scope) {
  const all = asArray(model.relationships);
  if (!scope || !scope.diagramType) return all;
  return all.filter((relationship) => asArray(relationship.sources)
    .some((source) => source.diagramType === scope.diagramType));
}

/** Rebuild the adjacency maps for one rule's scope. */
function scopedIndex(index, scope) {
  if (!scope || !scope.diagramType) return index;
  const relationships = scopedRelationships(index.model, scope);
  const outgoing = new Map();
  const incoming = new Map();
  for (const relationship of relationships) {
    if (!outgoing.has(relationship.from)) outgoing.set(relationship.from, []);
    if (!incoming.has(relationship.to)) incoming.set(relationship.to, []);
    outgoing.get(relationship.from).push(relationship);
    incoming.get(relationship.to).push(relationship);
  }
  return { ...index, outgoing, incoming, model: { ...index.model, relationships } };
}

/** Every cycle reachable in the relationship graph, as id lists. */
function findCycles(index) {
  const cycles = [];
  const colour = new Map();
  const stack = [];

  const visit = (id) => {
    colour.set(id, 'grey');
    stack.push(id);
    for (const relationship of index.outgoing.get(id) || []) {
      const next = relationship.to;
      if (colour.get(next) === 'grey') {
        // Report the cycle from where it closes, not the whole stack: the
        // prefix that led here is not part of the loop.
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (!colour.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    colour.set(id, 'black');
  };

  for (const id of index.components.keys()) if (!colour.has(id)) visit(id);
  return cycles;
}

/** Citations for one component, so a violation can be checked rather than believed. */
function citations(index, id) {
  const component = index.components.get(id);
  return [
    ...asArray(component?.evidenceRefs),
    ...asArray(component?.sources).map((s) => s.path ?? s.document ?? null).filter(Boolean),
  ];
}

/**
 * Evaluate one rule.
 *
 * @returns {{id: string, kind: string, outcome: string, violations: Array<object>, reason: string}}
 */
export function evaluateRule(rule, index, incompleteness) {
  if (!RULE_KINDS.includes(rule.kind)) {
    throw new TypeError(`assert: unknown rule kind ${JSON.stringify(rule.kind)}; expected one of ${RULE_KINDS.join(', ')}`);
  }
  const id = rule.id ?? rule.kind;
  const violations = [];
  // Every rule reads through its own scope, so a dependency rule is not
  // confused by a sequence diagram's replies.
  index = scopedIndex(index, rule.scope);

  if (rule.kind === 'forbid-dependency') {
    const from = new Set(resolveSelector(rule.from, index));
    const to = new Set(resolveSelector(rule.to, index));
    const allowed = new Set(asArray(rule.except));
    for (const relationship of index.model.relationships ?? []) {
      if (!from.has(relationship.from) || !to.has(relationship.to)) continue;
      if (allowed.has(relationship.from)) continue;
      violations.push({
        from: relationship.from,
        to: relationship.to,
        via: relationship.id ?? null,
        evidence: [...citations(index, relationship.from), ...citations(index, relationship.to)],
      });
    }
  } else if (rule.kind === 'require-dependency') {
    const from = resolveSelector(rule.from, index);
    const to = new Set(resolveSelector(rule.to, index));
    for (const source of from) {
      const reaches = (index.outgoing.get(source) || []).some((r) => to.has(r.to));
      if (!reaches) {
        violations.push({ from: source, to: rule.to, missing: true, evidence: citations(index, source) });
      }
    }
  } else if (rule.kind === 'no-cycles') {
    for (const cycle of findCycles(index)) {
      violations.push({ cycle, evidence: cycle.flatMap((node) => citations(index, node)) });
    }
  } else if (rule.kind === 'max-fan-in' || rule.kind === 'max-fan-out') {
    const limit = Number(rule.limit);
    if (!Number.isFinite(limit)) throw new TypeError(`assert: ${rule.kind} needs a numeric limit`);
    const edges = rule.kind === 'max-fan-in' ? index.incoming : index.outgoing;
    for (const target of resolveSelector(rule.select ?? '*', index)) {
      const degree = (edges.get(target) || []).length;
      if (degree > limit) {
        violations.push({ component: target, degree, limit, evidence: citations(index, target) });
      }
    }
  }

  if (violations.length > 0) {
    return { id, kind: rule.kind, outcome: OUTCOMES.FAIL, violations, reason: `${violations.length} violation(s)` };
  }
  if (!incompleteness.complete) {
    // The heart of this module. No violations found is not the same as no
    // violations, and the difference is exactly the unread files.
    return {
      id,
      kind: rule.kind,
      outcome: OUTCOMES.UNPROVEN,
      violations: [],
      reason: `No violation found, but ${incompleteness.gaps.length} file(s) could not be analysed, `
        + 'so this rule has not been shown to hold. Fix the gaps or accept it explicitly.',
    };
  }
  return { id, kind: rule.kind, outcome: OUTCOMES.PASS, violations: [], reason: 'No violation, over a complete scan.' };
}

/**
 * Evaluate every rule against a model.
 *
 * @param {object} options
 * @param {object} options.index from indexModel(); it carries the model
 * @param {object} options.incompleteness from incompletenessFor()
 * @param {Array<object>} options.rules
 * @param {boolean} [options.allowUnproven] treat unproven as tolerable
 * @returns {object}
 */
export function assertRules({ index, incompleteness, rules, allowUnproven = false }) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new TypeError('assert: at least one rule is required; a rule file with no rules asserts nothing');
  }
  const results = rules.map((rule) => evaluateRule(rule, index, incompleteness));
  const counted = (outcome) => results.filter((r) => r.outcome === outcome).length;
  const failed = counted(OUTCOMES.FAIL);
  const unproven = counted(OUTCOMES.UNPROVEN);

  return {
    schemaVersion: 1,
    total: rules.length,
    passed: counted(OUTCOMES.PASS),
    failed,
    unproven,
    // Unproven fails by default. Making it pass would let an unread file turn
    // an unchecked rule into a green check, and green checks are acted on.
    ok: failed === 0 && (allowUnproven || unproven === 0),
    allowUnproven,
    incompleteness,
    results,
  };
}
