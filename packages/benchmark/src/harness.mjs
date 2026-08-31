// First-pass usable rate (row 7.8).
//
// The number this measures is the one a user actually feels: given a task,
// how often does the authored diagram come out usable on the FIRST attempt,
// with no repair round, no nudge, no second try. Everything else in this repo
// is a gate that says yes or no about one document. This says how often the
// whole pipeline gets there unaided.
//
// It is not a per-PR gate and must never become one. What it measures moves
// when an external model changes behaviour, with no commit in this repo -- so
// wiring it to a pull request would block work on evidence that has nothing
// to do with that work. It runs on a schedule and at a release, where a
// moving number is information rather than an obstruction.
//
// Two rules keep the number honest.
//
// FIRST: a rate is never reported for a run that could not measure. When the
// author fails often enough -- a model outage, an expired key, a refusal --
// what comes back is not a low score, it is `inconclusive`. A depressed rate
// attributed to the tool during someone else's outage is worse than no
// number, because it looks like a regression and gets acted on.
//
// SECOND: the author's failures and the tool's failures are never summed.
// "The model returned prose instead of JSON" and "the document overlapped two
// components" are different problems with different owners, and a metric that
// adds them tells you nothing about either.

/** Outcomes, in the order a task passes through them. */
export const OUTCOMES = Object.freeze({
  /** Validated and composed with zero errors and zero warnings, first try. */
  USABLE: 'usable',
  /** The author produced nothing this tool could read. Not the tool's failure. */
  AUTHOR_ERROR: 'author-error',
  /** Authored, but rejected by schema validation. */
  INVALID: 'invalid',
  /** Valid, but the composition gates reported problems. */
  COMPOSITION: 'composition',
});

// Above this share of author errors, the run measured the model's
// availability rather than the tool's quality, and says so.
const INCONCLUSIVE_AUTHOR_ERROR_SHARE = 0.2;

/**
 * Measure the first-pass usable rate over a set of tasks.
 *
 * @param {object} options
 * @param {Array<{id: string, diagramType?: string, prompt?: string}>} options.tasks
 * @param {(task: object) => Promise<object>} options.author produces a
 *   document for one task, or throws. Required: there is no default author,
 *   because a harness that invents one reports a number nobody measured.
 * @param {(document: object, task: object) => Promise<{errors?: string[], warnings?: string[]}>} options.evaluate
 *   validates and composes one document, returning what it found.
 * @param {string} options.model identifier of what authored the run, recorded
 *   with the result so a trend line can never silently compare two models.
 * @param {((document: object, task: object) => Promise<{usable: boolean, reason?: string}>)|null} [options.repair]
 *   runs the tool's own repair step and re-validates, producing the second,
 *   separately reported measure.
 * @param {() => Date} [options.now]
 * @returns {Promise<object>} the run record
 */
export async function runBenchmark({
  tasks, author, evaluate, model, repair = null, now = () => new Date(),
}) {
  if (typeof author !== 'function') {
    throw new TypeError('benchmark: an author is required; the harness does not invent one');
  }
  if (typeof evaluate !== 'function') {
    throw new TypeError('benchmark: an evaluate function is required');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new TypeError('benchmark: at least one task is required');
  }
  if (!model) {
    throw new TypeError('benchmark: name the model; an unattributed rate cannot be compared to anything');
  }

  const results = [];
  for (const task of tasks) {
    // Sequential on purpose. Concurrent authoring would measure the provider's
    // rate limiter as much as the tool, and the run is scheduled, not urgent.
    results.push(await measureTask(task, author, evaluate, repair));
  }

  const counted = (outcome) => results.filter((result) => result.outcome === outcome).length;
  const authorErrors = counted(OUTCOMES.AUTHOR_ERROR);
  const usable = counted(OUTCOMES.USABLE);

  const inconclusive = authorErrors / tasks.length > INCONCLUSIVE_AUTHOR_ERROR_SHARE;
  const rescued = results.filter((result) => (
    /** @type {{afterRepair?: {usable?: boolean}}} */ (result).afterRepair?.usable
  )).length;

  return {
    schemaVersion: 1,
    measuredAt: now().toISOString(),
    model,
    status: inconclusive ? 'inconclusive' : 'measured',
    // Withheld rather than zeroed on an inconclusive run: `null` cannot be
    // charted as a regression, and 0 can.
    //
    // The rate is over EVERY task, including ones the author failed. That is
    // what a user experiences. Excluding them would let a model that answered
    // only its easy tasks post a perfect score.
    firstPassUsableRate: inconclusive ? null : usable / tasks.length,
    total: tasks.length,
    usable,
    // Counted separately and never folded into the headline. A document that
    // needed repair did not pass first, and blurring the two would answer a
    // question nobody asked.
    usableAfterRepair: usable + rescued,
    toolAssistedRate: inconclusive ? null : (usable + rescued) / tasks.length,
    byOutcome: {
      [OUTCOMES.USABLE]: usable,
      [OUTCOMES.AUTHOR_ERROR]: authorErrors,
      [OUTCOMES.INVALID]: counted(OUTCOMES.INVALID),
      [OUTCOMES.COMPOSITION]: counted(OUTCOMES.COMPOSITION),
    },
    ...(inconclusive
      ? {
        inconclusiveReason: `${authorErrors} of ${tasks.length} tasks failed in the author, above the `
          + `${INCONCLUSIVE_AUTHOR_ERROR_SHARE * 100}% threshold. This run measured the author's `
          + 'availability, not this tool.',
      }
      : {}),
    results,
  };
}

/** Run one task all the way through, classifying wherever it stops. */
async function measureTask(task, author, evaluate, repair) {
  let document;
  try {
    document = await author(task);
  } catch (error) {
    return {
      id: task.id,
      outcome: OUTCOMES.AUTHOR_ERROR,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let report;
  try {
    report = await evaluate(document, task);
  } catch (error) {
    // A throw from evaluation is the document being rejected outright --
    // schema validation refuses rather than returns.
    return {
      id: task.id,
      outcome: OUTCOMES.INVALID,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const errors = report?.errors ?? [];
  const warnings = report?.warnings ?? [];
  if (errors.length > 0 || warnings.length > 0) {
    // A second, separately reported measure: what the same document becomes
    // once the tool's own repair step has run.
    //
    // This is what a comparable upstream benchmark actually measures -- its
    // agent is instructed to "validate and repair the candidate" before
    // freezing it -- so a first-pass rate alone compares two different things.
    // Reporting both keeps the harder number honest AND makes the comparison
    // possible, and the DIFFERENCE between them is the tooling's contribution.
    const repaired = repair ? await repair(document, task) : null;
    /** @type {{id: string, outcome: string, detail: string, errors: number,
     *          warnings: number, afterRepair?: object}} */
    return {
      id: task.id,
      outcome: OUTCOMES.COMPOSITION,
      detail: [...errors, ...warnings].slice(0, 5).join('; '),
      errors: errors.length,
      warnings: warnings.length,
      ...(repaired ? { afterRepair: repaired } : {}),
    };
  }

  // "Usable" means clean, not merely accepted. A warning is the diagram
  // telling you it needs a second look, which is exactly what first-pass
  // usable is supposed to exclude.
  return { id: task.id, outcome: OUTCOMES.USABLE };
}

/**
 * Split a rejected document's diagnostics into "malformed" and "badly composed".
 *
 * These must never be conflated, and a validation receipt does not separate
 * them by exit code or stage -- both arrive as a non-zero exit at stage
 * "render". The diagnostic CODE is what tells them apart: `schema/*` means the
 * author produced a document this tool cannot read, anything else means the
 * document was well-formed and the composition gates rejected the geometry.
 *
 * This lived inline in the runner until an end-to-end run classified every
 * overlapping diagram as malformed -- blaming the author for the layout
 * engine's verdict. It is exported so the rule can be tested on its own
 * rather than only observed at the end of a full run.
 *
 * @param {Array<{code?: string, message?: string, severity?: string}>} diagnostics
 * @returns {{kind: 'invalid', message: string}
 *          | {kind: 'composition', errors: string[], warnings: string[]}}
 */
export function classifyValidationFailure(diagnostics) {
  const list = diagnostics ?? [];
  if (list.length === 0) {
    return { kind: 'invalid', message: 'validation refused the document without saying why' };
  }
  if (list.some((diagnostic) => String(diagnostic.code).startsWith('schema/'))) {
    return { kind: 'invalid', message: String(list[0].message) };
  }
  const describe = (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`;
  return {
    kind: 'composition',
    errors: list.filter((diagnostic) => diagnostic.severity !== 'warning').map(describe),
    warnings: list.filter((diagnostic) => diagnostic.severity === 'warning').map(describe),
  };
}

/**
 * Render a run record as a one-screen summary.
 *
 * @param {object} run
 * @returns {string}
 */
export function formatRun(run) {
  const lines = [`benchmark: ${run.model} @ ${run.measuredAt}`];
  if (run.status === 'inconclusive') {
    lines.push('  INCONCLUSIVE -- no rate reported');
    lines.push(`  ${run.inconclusiveReason}`);
  } else {
    lines.push(`  first-pass usable: ${(run.firstPassUsableRate * 100).toFixed(1)}% (${run.usable}/${run.total})`);
    if (typeof run.toolAssistedRate === 'number') {
      lines.push(`  after repair     : ${(run.toolAssistedRate * 100).toFixed(1)}% `
        + `(${run.usableAfterRepair}/${run.total})`);
      const gain = run.usableAfterRepair - run.usable;
      lines.push(`  the tool's contribution is that difference: ${gain} document(s) repair rescued.`);
    }
  }
  for (const [outcome, count] of Object.entries(run.byOutcome)) {
    lines.push(`    ${outcome.padEnd(13)} ${count}`);
  }
  return lines.join('\n');
}
