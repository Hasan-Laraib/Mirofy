// The library API: `import { render } from 'mirofy-cli/api'`.
//
// WHY THIS FILE EXISTS. The package's `.` export is `bin/mirofy.mjs`, which
// reads `process.argv` at module scope -- so `import 'mirofy-cli'` does not
// hand you a library, it RUNS THE CLI. And the renderers underneath are not
// modules either: they are standalone scripts taking an input path and an
// output path, configured through environment variables, writing a file and
// exiting with a status. There has never been a function to call.
//
// This is that function. It spawns exactly what the CLI spawns, which is the
// whole point: the API and the command cannot disagree about what a diagram
// looks like, because they run the same renderer the same way.
//
// THE RULE THIS FILE LIVES BY: nothing here ever calls `process.exit`. The CLI
// does, through `fail()`, and that is right for a command -- a library that
// kills its host process is not a library. Every failure here throws a
// `MirofyError` carrying the renderer's own structured diagnostics, so a
// caller can branch on `error.diagnostics[0].code` instead of parsing stderr.
//
// WHAT IS DELIBERATELY NOT HERE. The process boundary. A caller sees an async
// function returning a string; whether that string came from a subprocess is
// an implementation detail, and the day the renderers become importable
// modules this signature does not move.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The diagram types this package renders.
 *
 * Frozen and exported rather than documented in prose: a caller validating
 * input against a copied list is a caller whose list goes stale.
 *
 * @type {ReadonlyArray<string>}
 */
export const DIAGRAM_TYPES = Object.freeze(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle']);

/**
 * Every failure this module raises.
 *
 * `diagnostics` is the renderer's own structured report -- the same objects
 * `mirofy validate --json` prints, each with `code`, `severity`, `message`,
 * `subject`, `evidence` and `supportedFixes`. It is an array, possibly empty,
 * never a string, so a caller never has to parse prose to find out what went
 * wrong.
 */
export class MirofyError extends Error {
  /**
   * @param {string} message
   * @param {{diagnostics?: Array<object>, stage?: string|null, exitCode?: number|null}} [detail]
   */
  constructor(message, { diagnostics = [], stage = null, exitCode = null } = {}) {
    super(message);
    this.name = 'MirofyError';
    this.diagnostics = diagnostics;
    this.stage = stage;
    this.exitCode = exitCode;
  }
}

/** The renderer refused the document, or failed while drawing it. */
export class MirofyRenderError extends MirofyError {
  constructor(message, detail) {
    super(message, detail);
    this.name = 'MirofyRenderError';
  }
}

/** A step of the `map` pipeline failed. `stage` names which one. */
export class MirofyPipelineError extends MirofyError {
  constructor(message, detail) {
    super(message, detail);
    this.name = 'MirofyPipelineError';
  }
}

/** @param {string} type */
function rendererFor(type) {
  if (!DIAGRAM_TYPES.includes(type)) {
    throw new MirofyError(
      `unknown diagram type ${JSON.stringify(type)}; expected one of ${DIAGRAM_TYPES.join(', ')}`,
      { diagnostics: [{ code: 'input/unknown-type', severity: 'error', message: `unknown diagram type ${type}`, subject: { type }, evidence: { expected: [...DIAGRAM_TYPES] }, supportedFixes: ['pass one of DIAGRAM_TYPES'] }] },
    );
  }
  return path.join(here, 'renderers', type, `render-${type}.mjs`);
}

/**
 * A pipeline step, in either layout this package ships in.
 *
 * The published tarball carries the steps under `pipeline/`; a workspace
 * checkout has them as sibling packages. Same two candidates `bin/mirofy.mjs`
 * checks, for the same reason.
 *
 * @param {string} name e.g. `scanner/bin/scan.mjs`
 * @returns {string|null}
 */
function pipelineStep(name) {
  for (const candidate of [path.join(here, 'pipeline', name), path.join(here, '..', name)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** @param {{quality?: string, repoRoot?: string|string[]}} options */
function rendererEnv({ quality, repoRoot } = {}) {
  return {
    ...(quality ? { MIROFY_QUALITY_PROFILE: quality } : {}),
    // Newline-separated, matching bin/mirofy.mjs: a comma or a path separator
    // would be ambiguous on one platform or the other, and a newline cannot
    // appear in a path on any platform this supports.
    ...(repoRoot ? { MIROFY_REPO_ROOT: Array.isArray(repoRoot) ? repoRoot.join('\n') : repoRoot } : {}),
    // Always on here. The CLI makes this conditional because a human reading
    // the terminal wants prose; a caller of this module wants the receipt.
    MIROFY_DIAGNOSTIC_FORMAT: 'json',
  };
}

/**
 * The renderer's structured failure, or an honest stand-in when it did not
 * produce one.
 *
 * Fail-closed, exactly as `bin/mirofy.mjs` does it: a raw Node stack is never
 * copied into a diagnostic, because a machine receipt that contains a stack
 * trace invites a caller to match on text that is not a contract.
 *
 * @param {{error?: Error, stderr?: string, status?: number|null}} result
 */
function failureOf(result) {
  if (result.error) {
    return {
      message: 'renderer process could not start',
      diagnostics: [{
        code: 'internal/renderer-process',
        severity: 'error',
        message: 'renderer process could not start',
        subject: {},
        evidence: { reason: result.error.message },
        supportedFixes: [],
      }],
    };
  }
  try {
    const payload = JSON.parse(String(result.stderr ?? '').trim());
    if (payload?.ok === false && Array.isArray(payload.diagnostics) && payload.diagnostics.length) {
      return { message: payload.error || payload.diagnostics[0].message, diagnostics: payload.diagnostics };
    }
  } catch {
    // Deliberately swallowed. See the fail-closed note above.
  }
  return {
    message: 'renderer failed before emitting a structured diagnostic',
    diagnostics: [{
      code: 'internal/unclassified',
      severity: 'error',
      message: 'renderer failed before emitting a structured diagnostic',
      subject: {},
      evidence: { exitCode: result.status ?? 1 },
      supportedFixes: [],
    }],
  };
}

/**
 * Accept a document either as an object or as a path to one.
 *
 * Returns the path to feed the renderer, and a cleanup function. The caller
 * always calls cleanup, including on the failure path -- a library that leaks
 * a temp directory per failed render is a library that fills a disk.
 *
 * @param {object|string} source
 */
function materialise(source) {
  if (typeof source === 'string') return { input: path.resolve(source), cleanup: () => {} };
  if (!source || typeof source !== 'object') {
    throw new MirofyError('a diagram must be an object or a path to a JSON file');
  }
  // fs.mkdtempSync through the DEFAULT export on purpose: scripts/check-scratch.mjs
  // patches that binding to clean up after tests, and a namespace import walks
  // straight past the patch.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-'));
  const input = path.join(dir, 'diagram.json');
  fs.writeFileSync(input, JSON.stringify(source));
  return { input, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Render a diagram to one self-contained HTML string.
 *
 * @param {string} type one of `DIAGRAM_TYPES`
 * @param {object|string} source the document, or a path to it
 * @param {{quality?: 'standard'|'showcase', repoRoot?: string|string[]}} [options]
 * @returns {Promise<string>} the complete HTML document
 * @throws {MirofyRenderError} carrying `.diagnostics`
 */
export async function render(type, source, options = {}) {
  const renderer = rendererFor(type);
  const { input, cleanup } = materialise(source);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-api-out-'));
  const target = path.join(out, `${type}.html`);
  try {
    const result = spawnSync(process.execPath, [renderer, input, target], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ...rendererEnv(options) },
    });
    if (result.status !== 0) {
      const failure = failureOf(result);
      throw new MirofyRenderError(failure.message, {
        diagnostics: failure.diagnostics,
        stage: 'render',
        exitCode: result.status ?? 1,
      });
    }
    return fs.readFileSync(target, 'utf8');
  } finally {
    cleanup();
    fs.rmSync(out, { recursive: true, force: true });
  }
}

/**
 * Check a diagram without keeping the output.
 *
 * Resolves rather than throws: "this document is invalid" is an ANSWER, and a
 * caller validating a batch should not need a try/catch per document to
 * collect it. Only a failure to ask the question at all throws.
 *
 * @param {string} type
 * @param {object|string} source
 * @param {{quality?: string, repoRoot?: string|string[]}} [options]
 * @returns {Promise<{ok: boolean, diagnostics: Array<object>}>}
 */
export async function validate(type, source, options = {}) {
  try {
    await render(type, source, options);
  } catch (error) {
    if (error instanceof MirofyRenderError) return { ok: false, diagnostics: error.diagnostics };
    throw error;
  }
  return { ok: true, diagnostics: [] };
}

/**
 * The whole pipeline over a repository: scan, model, compile, layout, render.
 *
 * Writes the intermediates, because the pipeline steps are themselves
 * file-to-file programs and pretending otherwise would mean reimplementing
 * four of them here. `out` says where they land; it defaults to
 * `<repoPath>/scan`, which is what the CLI does.
 *
 * Requires a git repository. Every fact the scanner records is pinned to a
 * revision, so a directory with no commit has nothing for the evidence to
 * cite — that is refused up front with `input/not-a-repository`.
 *
 * @param {string} repoPath the repository to map
 * @param {{out?: string, repoUrl?: string, revision?: string, quality?: string}} [options]
 * @returns {Promise<{html: string, drawn: number, outDir: string, diagramPath: string, coveragePath: string|null}>}
 * @throws {MirofyPipelineError} with `stage` naming the step that failed
 */
export async function map(repoPath, options = {}) {
  const target = path.resolve(repoPath ?? '.');
  if (!fs.existsSync(target)) {
    throw new MirofyError(`no such directory: ${target}`, {
      diagnostics: [{ code: 'input/no-such-directory', severity: 'error', message: `no such directory: ${target}`, subject: { path: target }, evidence: {}, supportedFixes: ['pass a path that exists'] }],
    });
  }

  // Checked here rather than left to the scanner, which is right to refuse but
  // reports it as "the scan step exited 1" once it has crossed a process
  // boundary. The requirement is not incidental: every fact this pipeline
  // records is pinned to a commit, so a directory with no revision has nothing
  // for the evidence to cite, and that is worth saying in one sentence rather
  // than leaving in captured stderr.
  if (!fs.existsSync(path.join(target, '.git'))) {
    throw new MirofyError(`not a git repository: ${target}`, {
      diagnostics: [{
        code: 'input/not-a-repository',
        severity: 'error',
        message: `${target} is not a git repository`,
        subject: { path: target },
        evidence: { reason: 'every fact is pinned to a revision, and there is nothing here to pin to' },
        supportedFixes: ['run `git init` and commit, or point map at a checked-out repository'],
      }],
    });
  }

  const outDir = path.resolve(options.out ?? path.join(target, 'scan'));
  fs.mkdirSync(outDir, { recursive: true });
  const at = (name) => path.join(outDir, name);

  // Each step is told its input and its output explicitly, for the reason
  // bin/mirofy.mjs gives: relying on every step defaulting to `<root>/scan` is
  // fine right up until two of them disagree about where that is.
  const steps = [
    ['scan', 'scanner/bin/scan.mjs', ['--out', outDir]],
    ['model', 'model/bin/model.mjs', ['--from-graph', '--graph', at('evidence-graph.json'), '--out', at('model.json')]],
    ['compile', 'compile/bin/compile.mjs', ['--model', at('model.json'), '--out', at('view.json')]],
    ['layout', 'layout/bin/layout.mjs', ['--view', at('view.json'), '--out', at('diagram.json'),
      ...(options.repoUrl ? ['--repo-url', options.repoUrl] : []),
      ...(options.revision ? ['--revision', options.revision] : [])]],
  ];

  for (const [stage, rel, extra] of steps) {
    const script = pipelineStep(rel);
    if (!script) {
      throw new MirofyPipelineError(
        `this build has no ${stage} step; run from a checkout, or reinstall mirofy-cli`,
        { stage, diagnostics: [{ code: 'internal/missing-pipeline-step', severity: 'error', message: `no ${stage} step in this build`, subject: { stage }, evidence: { expected: rel }, supportedFixes: ['reinstall mirofy-cli'] }] },
      );
    }
    const step = spawnSync(process.execPath, [script, ...extra, '--root', target], {
      cwd: target,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (step.status !== 0) {
      throw new MirofyPipelineError(`mirofy map failed at ${stage}`, {
        stage,
        exitCode: step.status ?? 1,
        diagnostics: [{
          code: `pipeline/${stage}`,
          severity: 'error',
          message: `the ${stage} step exited ${step.status ?? 1}`,
          subject: { stage, repository: target },
          // The step's own output, kept rather than discarded: it is the only
          // place that says why, and a library caller has no terminal to have
          // watched it scroll past.
          evidence: { stderr: String(step.stderr ?? '').slice(0, 2000) },
          supportedFixes: [`run \`mirofy map\` on ${target} to see the step's full output`],
        }],
      });
    }
  }

  const diagramPath = at('diagram.json');
  if (!fs.existsSync(diagramPath)) {
    throw new MirofyPipelineError(`the pipeline produced no diagram at ${diagramPath}`, { stage: 'layout' });
  }

  const view = JSON.parse(fs.readFileSync(at('view.json'), 'utf8'));
  const drawn = (view.components ?? view.nodes ?? []).length;
  // An empty diagram is a real answer about a repository, and the CLI refuses
  // to render a blank page and call it success. Here it is returned rather
  // than thrown: `drawn: 0` with the coverage file beside it is the finding,
  // and a caller mapping many repositories should not need a catch to record
  // "this one had nothing to draw".
  const coveragePath = fs.existsSync(at('coverage.md')) ? at('coverage.md') : null;

  const html = await render('architecture', diagramPath, {
    quality: options.quality,
    repoRoot: target,
  });

  return { html, drawn, outDir, diagramPath, coveragePath };
}
