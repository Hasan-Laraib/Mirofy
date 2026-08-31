#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

const TYPES = new Set(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle']);

function usage() {
  return `Usage:
  mirofy render <type> <input.json> [output.html] [--quality standard|showcase] [--repo-root path]
  mirofy compare architecture <base.json> <head.json> [output.html] [--receipt path] [--json] [--quality standard|showcase] [--repo-root path]
  mirofy deliver <type> <input.json> [output.html] [--json] [--open] [--quality standard|showcase] [--repo-root path]
  mirofy preview <type> <input.json> [output.html] [--no-open] [--quality standard|showcase] [--repo-root path]
  mirofy validate <type> <input.json> [--json] [--layout-json] [--quality standard|showcase] [--repo-root path]
  mirofy inspect <type> <input.json>
  mirofy check <output.html>
  mirofy visual-check <output.html> [--json]
  mirofy guide [scenario or question] [--json] [--lang en|zh]
  mirofy brands [name, alias, domain, or category] [--json]
  mirofy brands capture <url> [--json]
  mirofy examples
  mirofy doctor
  mirofy demo [output-directory]
  mirofy init [type] [output.json]
  mirofy import mermaid <input.mmd> [output.json] [--json]
  mirofy repair <type> <input.json> [output.json] --safe [--json]

Types:
  architecture, workflow, sequence, dataflow, lifecycle
`;
}

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function rendererPath(type) {
  if (!TYPES.has(type)) {
    fail(`Unknown diagram type "${type}". Expected one of: ${[...TYPES].join(', ')}`);
  }
  return path.join(skillRoot, 'renderers', type, `render-${type}.mjs`);
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio || 'inherit',
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

function extractQualityArgs(args) {
  const rest = [];
  let quality;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--quality') {
      quality = args[index + 1];
      if (!quality || quality.startsWith('--')) fail('--quality requires standard or showcase.');
      index += 1;
      continue;
    }
    if (arg.startsWith('--quality=')) {
      quality = arg.slice('--quality='.length);
      if (!quality) fail('--quality requires standard or showcase.');
      continue;
    }
    rest.push(arg);
  }
  if (quality !== undefined && !['standard', 'showcase'].includes(quality)) {
    fail(`Unknown quality profile "${quality}". Expected standard or showcase.`);
  }
  return { rest, quality };
}

// --repo-root is REPEATABLE for multi-repository documents:
//   --repo-root <path>              the single-repository form, unchanged
//   --repo-root <id>=<path>  ...    one per declared repository
//
// The id half is kept verbatim rather than resolved, because only the part
// after `=` is a path. Resolving the whole token would turn "api=/src/api"
// into a path that does not exist and report it as an unreadable checkout.
function extractRepoRootArgs(args) {
  const rest = [];
  const repoRoots = [];
  const take = (value) => {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/.exec(value);
    repoRoots.push(match ? `${match[1]}=${path.resolve(match[2])}` : path.resolve(value));
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--repo-root') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) fail('--repo-root requires a repository path, or <id>=<path>.');
      take(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      const value = arg.slice('--repo-root='.length);
      if (!value) fail('--repo-root requires a repository path, or <id>=<path>.');
      take(value);
      continue;
    }
    rest.push(arg);
  }
  // One root stays a bare string so every existing caller and message is
  // unchanged; several become the list the resolver keys by id.
  const repoRoot = repoRoots.length === 0 ? undefined
    : repoRoots.length === 1 && !repoRoots[0].includes('=') ? repoRoots[0]
      : repoRoots;
  return { rest, repoRoot };
}

function rendererEnv(quality, repoRoot, diagnosticJson = false) {
  return {
    ...(quality ? { MIROFY_QUALITY_PROFILE: quality } : {}),
    // Several roots cross the process boundary newline-separated. A comma
    // or path separator would be ambiguous -- Windows paths contain the
    // one and colons the other -- while a newline cannot appear in a path
    // on any platform this supports.
    ...(repoRoot ? { MIROFY_REPO_ROOT: Array.isArray(repoRoot) ? repoRoot.join(String.fromCharCode(10)) : repoRoot } : {}),
    ...(diagnosticJson ? { MIROFY_DIAGNOSTIC_FORMAT: 'json' } : {}),
  };
}

function diagnostic({ code, message, subject = {}, evidence = {}, supportedFixes = [], severity = 'error' }) {
  return {
    code,
    severity,
    message,
    subject,
    evidence,
    supportedFixes,
  };
}

function inputDiagnostic(error, inputPath) {
  const isSyntax = error instanceof SyntaxError;
  return diagnostic({
    code: isSyntax ? 'input/json-parse' : 'input/read',
    message: isSyntax
      ? `Input JSON could not be parsed: ${error.message}`
      : `Input could not be read: ${error.message}`,
    subject: { input: inputPath },
    evidence: {
      ...(error?.code ? { systemCode: error.code } : {}),
      reason: error.message,
    },
    supportedFixes: [isSyntax
      ? 'repair the JSON syntax and run validation again'
      : 'provide one readable JSON input file'],
  });
}

function rendererFailure(result) {
  if (result.error) {
    return {
      error: 'Renderer process could not start.',
      diagnostics: [diagnostic({
        code: 'internal/renderer-process',
        message: 'Renderer process could not start.',
        evidence: { reason: result.error.message },
      })],
    };
  }
  try {
    const payload = JSON.parse((result.stderr || '').trim());
    if (payload?.ok === false && Array.isArray(payload.diagnostics) && payload.diagnostics.length) {
      return {
        error: payload.error || payload.diagnostics[0].message,
        diagnostics: payload.diagnostics,
      };
    }
  } catch {
    // The diagnostic boundary is intentionally fail-closed. Never copy a raw
    // Node stack into a machine receipt when a renderer exits unexpectedly.
  }
  return {
    error: 'Renderer failed before emitting a structured diagnostic.',
    diagnostics: [diagnostic({
      code: 'internal/unclassified',
      message: 'Renderer failed before emitting a structured diagnostic.',
      evidence: { exitCode: result.status ?? 1 },
    })],
  };
}

const COMPOSITION_CHECKS = new Set([
  'label_route_clearance',
  'relationship_crossings',
  'relationship_corridors',
  'container_border_runs',
  'route_rhythm',
]);

const CHECK_FIXES = {
  single_svg: ['remove additional SVG roots so the artifact contains exactly one diagram SVG'],
  finite_svg: ['replace non-finite coordinates before rendering again'],
  orthogonal_arrows: ['use renderer-supported orthogonal routing controls'],
  legend_clearance: ['move the route or enlarge the viewBox so relationships do not enter the legend'],
};

const COMPOSITION_FIXES = {
  'composition/proper-crossing': ['adjust route/via or channel coordinates so unrelated relationships use separate corridors'],
  'composition/ambiguous-corridor': ['adjust route/via or channel coordinates so unrelated relationships do not visually merge'],
  'composition/container-border-run': ['route across the frame perpendicularly through a clear opening'],
  'composition/label-route-clearance': ['adjust labelAt, labelDx, labelDy, labelSegment, message y, or the other relationship route'],
  'composition/desktop-readability': ['reduce the viewBox width, shorten node copy, widen affected nodes, or split the diagram so node context remains at least 6px at a 1440px desktop viewport'],
  'composition/micro-segment': ['move the route/channel/via point so every visible segment is at least 8px'],
  'composition/short-interior-segment': ['move the route/channel/via point so every interior turn has at least 16px'],
};

function checkerDiagnostics(checker) {
  const diagnostics = [];
  for (const issue of checker?.composition?.issues || []) {
    if (issue.severity !== 'error') continue;
    const { severity, code, relationship, ...evidence } = issue;
    diagnostics.push(diagnostic({
      code,
      severity,
      message: `Final artifact failed ${code}.`,
      subject: relationship ? { relationship } : { check: 'composition' },
      evidence,
      supportedFixes: COMPOSITION_FIXES[code] || [],
    }));
  }
  for (const check of checker?.checks || []) {
    if (check.ok || COMPOSITION_CHECKS.has(check.name)) continue;
    diagnostics.push(diagnostic({
      code: `artifact/${check.name.replaceAll('_', '-')}`,
      message: (check.details || []).find(Boolean) || `Final artifact failed ${check.name}.`,
      subject: { check: check.name },
      evidence: { details: check.details || [] },
      supportedFixes: CHECK_FIXES[check.name] || [],
    }));
  }
  return diagnostics.length ? diagnostics : [diagnostic({
    code: 'artifact/check-failed',
    message: 'Final artifact check failed without a classified diagnostic.',
    subject: { check: 'unknown' },
    evidence: {},
  })];
}

function formatDiagnostics(error, diagnostics = []) {
  if (!diagnostics.length) return error;
  return [
    error,
    ...diagnostics.map((entry) => {
      const fix = entry.supportedFixes?.length ? ` Fix: ${entry.supportedFixes.join('; ')}.` : '';
      return `[${entry.code}] ${entry.message}${fix}`;
    }),
  ].join('\n');
}

// Loaded on demand, and only when --repo-root is actually passed.
//
// This was a static import at the top of the file -- the one non-Node import
// here -- and it made every verb depend on the whole renderer module graph
// resolving. On an incomplete installation that turned `doctor`, the verb
// whose entire job is to diagnose an incomplete installation, into an
// unhandled ERR_MODULE_NOT_FOUND stack trace. A user with a broken install
// got Node internals instead of the list of what was missing.
async function assertEvidenceType(type, repoRoot) {
  if (!repoRoot) return;
  const { supportsRepositoryEvidence } = await import('../renderers/shared/repository-evidence.mjs');
  if (!supportsRepositoryEvidence(type)) {
    fail(`--repo-root is not supported for ${type} diagrams.`);
  }
}

function exitFrom(result) {
  if (result.error) fail(result.error.message, 1);
  process.exit(result.status ?? 1);
}

function reportCompareFailure({ json, stage, error, code = 'delta/internal', details = {}, status = 1 }) {
  const receipt = {
    schemaVersion: 1,
    ok: false,
    command: 'compare',
    type: 'architecture',
    stage,
    error,
    diagnostics: [{
      code,
      severity: 'error',
      message: error,
      subject: details.side ? { side: details.side, ...(details.path ? { path: details.path } : {}) } : {},
      evidence: Object.fromEntries(Object.entries(details).filter(([key]) => !['side', 'path', 'supportedFixes'].includes(key))),
      supportedFixes: details.supportedFixes || [],
    }],
  };
  if (json) console.log(JSON.stringify(receipt, null, 2));
  else console.error(formatDiagnostics(error, receipt.diagnostics));
  process.exitCode = status;
}

function extractCompareOptions(args) {
  const positional = [];
  let receipt;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--receipt') {
      receipt = args[index + 1];
      if (!receipt || receipt.startsWith('--')) fail('--receipt requires a JSON output path.');
      index += 1;
      continue;
    }
    if (arg.startsWith('--receipt=')) {
      receipt = arg.slice('--receipt='.length);
      if (!receipt) fail('--receipt requires a JSON output path.');
      continue;
    }
    if (arg.startsWith('--')) fail(`Unknown compare option "${arg}".`);
    positional.push(arg);
  }
  return { positional, receipt, json };
}

function compareReceiptPath(outputPath) {
  const extension = path.extname(outputPath);
  return extension ? `${outputPath.slice(0, -extension.length)}.receipt.json` : `${outputPath}.receipt.json`;
}

function compareCommitError(message, code, details = {}) {
  const error = new Error(message);
  error.compareStage = 'commit';
  error.compareCode = code;
  error.compareDetails = details;
  return error;
}

function commitComparePair({ htmlCandidate, receiptCandidate, outputPath, receiptPath, stagingDirectory }) {
  const targets = [
    { label: 'HTML artifact', target: outputPath, candidate: htmlCandidate, backup: path.join(stagingDirectory, '.previous-output') },
    { label: 'receipt', target: receiptPath, candidate: receiptCandidate, backup: path.join(stagingDirectory, '.previous-receipt') },
  ];

  // Preflight the whole pair before moving either trusted target. This avoids
  // replacing the HTML and only then discovering that its receipt destination
  // cannot be committed (for example, because it is a directory).
  for (const item of targets) {
    if (!fs.existsSync(item.target)) continue;
    const existing = fs.lstatSync(item.target);
    if (!existing.isFile()) {
      throw compareCommitError(
        `Could not commit Architecture Delta: existing ${item.label} target is not a regular file.`,
        'delta/commit-target',
        {
          target: path.basename(item.target),
          targetType: existing.isDirectory() ? 'directory' : 'non-file',
          supportedFixes: [`choose a regular-file path for the ${item.label}`],
        },
      );
    }
  }

  const backedUp = [];
  const committed = [];
  try {
    for (const item of targets) {
      if (!fs.existsSync(item.target)) continue;
      fs.renameSync(item.target, item.backup);
      backedUp.push(item);
    }
    for (const item of targets) {
      fs.renameSync(item.candidate, item.target);
      committed.push(item);
    }
  } catch (cause) {
    const rollbackErrors = [];
    for (const item of [...committed].reverse()) {
      try {
        fs.rmSync(item.target, { force: true });
      } catch (error) {
        rollbackErrors.push(`${item.label}: remove failed (${error.message})`);
      }
    }
    for (const item of [...backedUp].reverse()) {
      try {
        if (fs.existsSync(item.target)) fs.rmSync(item.target, { force: true });
        fs.renameSync(item.backup, item.target);
      } catch (error) {
        rollbackErrors.push(`${item.label}: restore failed (${error.message})`);
      }
    }
    throw compareCommitError(
      rollbackErrors.length
        ? 'Architecture Delta pair commit failed and its previous files could not be fully restored.'
        : 'Architecture Delta pair commit failed; the previous files were restored.',
      rollbackErrors.length ? 'delta/commit-rollback-failed' : 'delta/commit-failed',
      {
        reason: cause.message,
        ...(rollbackErrors.length ? { rollbackErrors } : {}),
        supportedFixes: ['check that both output paths are writable regular files, then retry'],
      },
    );
  }
}

function renderValidatedArchitecture(inputPath, outputPath, quality, repoRoot) {
  const render = runNode([rendererPath('architecture'), inputPath, outputPath], {
    stdio: 'pipe',
    env: rendererEnv(quality, repoRoot, true),
  });
  if (render.status !== 0) {
    const failure = rendererFailure(render);
    const error = new Error(failure.error);
    error.compareStage = 'input';
    error.compareStatus = render.status ?? 1;
    error.diagnostics = failure.diagnostics;
    throw error;
  }
  const check = runNode([path.join(skillRoot, 'scripts/check-render-output.mjs'), outputPath], { stdio: 'pipe' });
  if (check.status !== 0) {
    const error = new Error('Validated snapshot failed final artifact checks.');
    error.compareStage = 'check';
    error.compareStatus = check.status ?? 1;
    try {
      error.checker = JSON.parse(check.stdout);
      error.diagnostics = checkerDiagnostics(error.checker);
    } catch {
      error.diagnostics = [];
    }
    throw error;
  }
  const artifact = fs.readFileSync(outputPath);
  return {
    artifact,
    html: artifact.toString('utf8'),
    checks: JSON.parse(check.stdout),
    sourceEvidence: sourceEvidenceFromArtifact(artifact),
  };
}

async function commandCompare(args) {
  const { resolveOutputPath } = await import('../renderers/shared/output-path.mjs');
  const qualityArgs = extractQualityArgs(args);
  const repoArgs = extractRepoRootArgs(qualityArgs.rest);
  const options = extractCompareOptions(repoArgs.rest);
  const [type, baseInput, headInput, requestedOutput] = options.positional;
  if (type !== 'architecture' || !baseInput || !headInput || options.positional.length > 4) fail(usage());
  let deltaRuntime;
  try {
    deltaRuntime = await import(pathToFileURL(path.join(skillRoot, 'delta/architecture-delta.mjs')).href);
  } catch (error) {
    reportCompareFailure({ json: options.json, stage: 'prepare', error: 'Architecture compare runtime is unavailable.', code: 'delta/runtime-missing', details: { reason: error.message, supportedFixes: ['install the complete Mirofy skill package'] } });
    return;
  }
  const {
    ArchitectureDeltaError,
    annotateArchitectureSideSvg,
    buildDeltaSvg,
    canonicalArchitecture,
    canonicalArchitectureJson,
    compareArchitecture,
    extractArchitectureSvg,
    extractArtifactCss,
    renderArchitectureDeltaHtml,
    validateArchitectureDeltaHtml,
  } = deltaRuntime;

  const basePath = path.resolve(baseInput);
  const headPath = path.resolve(headInput);
  let outputPath;
  try {
    ({ outputPath } = resolveOutputPath({
      requestedOutput,
      defaultOutput: 'architecture-delta.html',
      inputPaths: [basePath, headPath],
    }));
  } catch (error) {
    const outputDiagnostic = error.mirofyDiagnostics?.[0];
    reportCompareFailure({
      json: options.json,
      stage: 'prepare',
      error: error.message,
      code: outputDiagnostic?.code || 'output/path-resolution',
      details: {
        ...(outputDiagnostic?.subject || {}),
        ...(outputDiagnostic?.evidence || {}),
        supportedFixes: outputDiagnostic?.supportedFixes || ['choose a safe output path and retry'],
      },
    });
    return;
  }
  let receiptPath;
  try {
    ({ outputPath: receiptPath } = resolveOutputPath({
      requestedOutput: options.receipt || compareReceiptPath(outputPath),
      defaultOutput: compareReceiptPath(outputPath),
      inputPaths: [basePath, headPath],
      otherOutputPaths: [outputPath],
    }));
  } catch (error) {
    const outputDiagnostic = error.mirofyDiagnostics?.[0];
    reportCompareFailure({
      json: options.json,
      stage: 'prepare',
      error: error.message,
      code: outputDiagnostic?.code || 'output/path-resolution',
      details: {
        ...(outputDiagnostic?.subject || {}),
        ...(outputDiagnostic?.evidence || {}),
        supportedFixes: outputDiagnostic?.supportedFixes || ['choose a safe receipt path and retry'],
      },
    });
    return;
  }
  let baseBuffer;
  let headBuffer;
  let base;
  let head;
  try {
    baseBuffer = fs.readFileSync(basePath);
    base = JSON.parse(baseBuffer.toString('utf8'));
  } catch (error) {
    reportCompareFailure({ json: options.json, stage: 'input', error: `Could not read base input: ${error.message}`, code: 'delta/base-input', details: { side: 'base', reason: error.message } });
    return;
  }
  try {
    headBuffer = fs.readFileSync(headPath);
    head = JSON.parse(headBuffer.toString('utf8'));
  } catch (error) {
    reportCompareFailure({ json: options.json, stage: 'input', error: `Could not read head input: ${error.message}`, code: 'delta/head-input', details: { side: 'head', reason: error.message } });
    return;
  }

  const outputDirectory = path.dirname(outputPath);
  if (path.dirname(receiptPath) !== outputDirectory) {
    reportCompareFailure({ json: options.json, stage: 'prepare', error: 'The compare receipt must be written beside the HTML artifact.', code: 'delta/receipt-directory', details: { supportedFixes: ['choose a --receipt path in the same directory as output.html'] } });
    return;
  }
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
  } catch (error) {
    reportCompareFailure({ json: options.json, stage: 'prepare', error: `Could not create compare output directory: ${error.message}`, code: 'delta/output-directory', details: { reason: error.message } });
    return;
  }

  let stagingDirectory;
  try {
    stagingDirectory = fs.mkdtempSync(path.join(outputDirectory, '.mirofy-compare-'));
  } catch (error) {
    reportCompareFailure({ json: options.json, stage: 'prepare', error: `Could not create compare candidate: ${error.message}`, code: 'delta/candidate-directory', details: { reason: error.message } });
    return;
  }

  const baseCandidate = path.join(stagingDirectory, 'base.html');
  const headCandidate = path.join(stagingDirectory, 'head.html');
  const rawBaseCandidate = path.join(stagingDirectory, 'base.raw.html');
  const rawHeadCandidate = path.join(stagingDirectory, 'head.raw.html');
  const canonicalBaseInput = path.join(stagingDirectory, 'base.architecture.json');
  const canonicalHeadInput = path.join(stagingDirectory, 'head.architecture.json');
  const htmlCandidate = path.join(stagingDirectory, path.basename(outputPath));
  const receiptCandidate = path.join(stagingDirectory, path.basename(receiptPath));

  try {
    let baseResult;
    let headResult;
    try {
      renderValidatedArchitecture(basePath, rawBaseCandidate, qualityArgs.quality, repoArgs.repoRoot);
    } catch (error) {
      const diagnosticEntry = error.diagnostics?.[0];
      reportCompareFailure({
        json: options.json,
        stage: error.compareStage || 'validate',
        error: `Base snapshot failed validation: ${error.message}`,
        code: diagnosticEntry?.code || 'delta/base-validation',
        details: { side: 'base', ...(diagnosticEntry?.subject?.path ? { path: diagnosticEntry.subject.path } : {}), ...(diagnosticEntry?.evidence || {}), supportedFixes: diagnosticEntry?.supportedFixes || [] },
        status: error.compareStatus || 1,
      });
      return;
    }
    try {
      renderValidatedArchitecture(headPath, rawHeadCandidate, qualityArgs.quality, repoArgs.repoRoot);
    } catch (error) {
      const diagnosticEntry = error.diagnostics?.[0];
      reportCompareFailure({
        json: options.json,
        stage: error.compareStage || 'validate',
        error: `Head snapshot failed validation: ${error.message}`,
        code: diagnosticEntry?.code || 'delta/head-validation',
        details: { side: 'head', ...(diagnosticEntry?.subject?.path ? { path: diagnosticEntry.subject.path } : {}), ...(diagnosticEntry?.evidence || {}), supportedFixes: diagnosticEntry?.supportedFixes || [] },
        status: error.compareStatus || 1,
      });
      return;
    }

    // Validation must see the exact authored inputs. Only after both sides
    // pass do we canonicalize their collection order for deterministic SVG
    // geometry and stable artifact bytes.
    fs.writeFileSync(canonicalBaseInput, JSON.stringify(canonicalArchitecture(base)));
    fs.writeFileSync(canonicalHeadInput, JSON.stringify(canonicalArchitecture(head)));
    baseResult = renderValidatedArchitecture(canonicalBaseInput, baseCandidate, qualityArgs.quality, repoArgs.repoRoot);
    headResult = renderValidatedArchitecture(canonicalHeadInput, headCandidate, qualityArgs.quality, repoArgs.repoRoot);

    const semanticHash = (diagram) => createHash('sha256').update(canonicalArchitectureJson(diagram)).digest('hex');
    let compareIr;
    try {
      compareIr = compareArchitecture(base, head, {
        baseRawSha256: createHash('sha256').update(baseBuffer).digest('hex'),
        headRawSha256: createHash('sha256').update(headBuffer).digest('hex'),
        baseSemanticSha256: semanticHash(base),
        headSemanticSha256: semanticHash(head),
        baseBytes: baseBuffer.byteLength,
        headBytes: headBuffer.byteLength,
        baseVerified: Boolean(baseResult.sourceEvidence),
        headVerified: Boolean(headResult.sourceEvidence),
      });
    } catch (error) {
      if (!(error instanceof ArchitectureDeltaError)) throw error;
      reportCompareFailure({ json: options.json, stage: 'compare', error: error.message, code: error.code, details: error.details });
      return;
    }

    const baseSourceSvg = extractArchitectureSvg(baseResult.html);
    const headSourceSvg = extractArchitectureSvg(headResult.html);
    const baseSvg = annotateArchitectureSideSvg(baseSourceSvg, compareIr, 'base');
    const headSvg = annotateArchitectureSideSvg(headSourceSvg, compareIr, 'head');
    const deltaSvg = buildDeltaSvg(baseSourceSvg, headSourceSvg, compareIr);
    // Raw input hashes and byte counts belong in the sidecar receipt, not the
    // artifact. Keeping them out makes formatting-only input rewrites produce
    // the exact same canonical review HTML and artifact hash.
    const artifactIr = {
      ...compareIr,
      base: Object.fromEntries(Object.entries(compareIr.base).filter(([key]) => !['rawSha256', 'bytes'].includes(key))),
      head: Object.fromEntries(Object.entries(compareIr.head).filter(([key]) => !['rawSha256', 'bytes'].includes(key))),
    };
    const html = renderArchitectureDeltaHtml({
      receipt: artifactIr,
      baseSvg,
      deltaSvg,
      headSvg,
      baseHtml: baseResult.html,
      headHtml: headResult.html,
      artifactCss: extractArtifactCss(headResult.html),
    });
    const deltaValidation = validateArchitectureDeltaHtml(html, artifactIr);
    fs.writeFileSync(htmlCandidate, html);
    const artifact = fs.readFileSync(htmlCandidate);
    const baseChecks = baseResult.checks.checks.filter((check) => check.ok).length;
    const headChecks = headResult.checks.checks.filter((check) => check.ok).length;
    const finalReceipt = {
      ...compareIr,
      artifact: { sha256: createHash('sha256').update(artifact).digest('hex'), bytes: artifact.byteLength },
      validation: {
        checksPassed: baseChecks + headChecks + deltaValidation.checksPassed,
        checkCount: baseResult.checks.checks.length + headResult.checks.checks.length + deltaValidation.checkCount,
        baseComposition: baseResult.checks.composition.status,
        headComposition: headResult.checks.composition.status,
      },
    };
    fs.writeFileSync(receiptCandidate, `${JSON.stringify(finalReceipt, null, 2)}\n`);

    try {
      const currentOutput = resolveOutputPath({
        requestedOutput,
        defaultOutput: 'architecture-delta.html',
        inputPaths: [basePath, headPath],
      }).outputPath;
      resolveOutputPath({
        requestedOutput: options.receipt || compareReceiptPath(currentOutput),
        defaultOutput: compareReceiptPath(currentOutput),
        inputPaths: [basePath, headPath],
        otherOutputPaths: [currentOutput],
      });
    } catch (error) {
      const outputDiagnostic = error.mirofyDiagnostics?.[0];
      reportCompareFailure({
        json: options.json,
        stage: 'commit',
        error: error.message,
        code: outputDiagnostic?.code || 'output/path-resolution',
        details: {
          ...(outputDiagnostic?.subject || {}),
          ...(outputDiagnostic?.evidence || {}),
          supportedFixes: outputDiagnostic?.supportedFixes || ['restore safe output paths and retry'],
        },
      });
      return;
    }

    commitComparePair({ htmlCandidate, receiptCandidate, outputPath, receiptPath, stagingDirectory });
    if (options.json) console.log(JSON.stringify(finalReceipt, null, 2));
    else {
      console.log(`compared architecture ${outputPath}`);
      console.log(`${finalReceipt.validation.checksPassed}/${finalReceipt.validation.checkCount} checks; completeness ${finalReceipt.completeness}; ${finalReceipt.proofLevel}; sha256 ${finalReceipt.artifact.sha256.slice(0, 12)}`);
      console.log(`receipt ${receiptPath}`);
    }
  } catch (error) {
    if (error instanceof ArchitectureDeltaError) {
      reportCompareFailure({ json: options.json, stage: 'artifact', error: error.message, code: error.code, details: error.details });
    } else if (error.compareStage === 'commit') {
      reportCompareFailure({
        json: options.json,
        stage: error.compareStage,
        error: error.message,
        code: error.compareCode,
        details: error.compareDetails,
      });
    } else {
      reportCompareFailure({ json: options.json, stage: 'internal', error: 'Architecture compare failed before commit.', code: 'delta/internal', details: { reason: error.message } });
    }
  } finally {
    try {
      fs.rmSync(stagingDirectory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Warning: could not remove compare staging directory: ${error.message}`);
    }
  }
}

/** `--format <name>`; the default is the interactive artifact. */
function extractFormatArg(args) {
  const rest = [];
  let format = 'html';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--format') {
      format = args[i + 1];
      i += 1;
      continue;
    }
    rest.push(args[i]);
  }
  if (format !== 'html' && format !== 'svg-static') {
    fail(`--format must be html or svg-static (got ${JSON.stringify(format)}).`);
  }
  return { format, rest };
}

async function commandRender(args) {
  const formatArgs = extractFormatArg(args);
  const qualityArgs = extractQualityArgs(formatArgs.rest);
  const repoArgs = extractRepoRootArgs(qualityArgs.rest);
  const [type, input, output] = repoArgs.rest;
  if (!type || !input) fail(usage());
  await assertEvidenceType(type, repoArgs.repoRoot);

  if (formatArgs.format === 'svg-static') {
    await renderStaticSvg({ type, input, output, quality: qualityArgs.quality, repoRoot: repoArgs.repoRoot });
    return;
  }

  const result = runNode([rendererPath(type), input, ...(output ? [output] : [])], {
    env: rendererEnv(qualityArgs.quality, repoArgs.repoRoot),
  });
  if (result.status !== 0) exitFrom(result);
}

/**
 * Render the interactive artifact, then reduce it to a standalone SVG.
 *
 * Deliberately derived rather than laid out again. A second layout path would
 * be a second thing to keep correct, and the first time the two disagreed the
 * static export would quietly stop matching the diagram it claims to be.
 */
async function renderStaticSvg({ type, input, output, quality, repoRoot }) {
  const [{ toStaticSvg }, { resolveTokens }] = await Promise.all([
    import('../renderers/shared/svg-static.mjs'),
    import('../../viewer/src/tokens/tokens.mjs'),
  ]);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-svg-static-'));
  const intermediate = path.join(scratch, 'artifact.html');
  // The intermediate render is scaffolding, not output. Its "wrote <temp
  // path>" line would tell the caller about a file that is deleted moments
  // later, so its stdout is captured and only surfaced on failure.
  const result = runNode([rendererPath(type), input, intermediate], {
    env: rendererEnv(quality, repoRoot),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) exitFrom(result);

  const artifact = fs.readFileSync(intermediate, 'utf8');

  // Taken from the artifact rather than from the source document, so the
  // static export always agrees with the interactive one about which preset
  // was applied -- including whatever the renderer does with an absent value.
  const preset = /<html[^>]*\sdata-preset="([^"]*)"/.exec(artifact)?.[1] ?? 'classic';

  // LIGHT, deliberately. A static SVG carries no background rectangle, so it is
  // read on whatever ground it is pasted onto -- a README, a pull request, a
  // Figma board -- and those are overwhelmingly light. Dark tokens would put
  // near-white text on near-white paper. Until this line existed the theme was
  // decided by which base block came last in the token list, which happened to
  // be light; it is now chosen rather than inherited from an accident.
  const { tokens, matchedPreset } = resolveTokens(preset, 'light');
  if (preset !== 'classic' && !matchedPreset) {
    // A preset the schema accepts but the palette has no block for would
    // silently export in the classic colours, which is the bug this replaced.
    fail(`svg-static: no palette for preset "${preset}". The schema accepts it, so `
      + 'a block for it is missing from packages/viewer/src/tokens/tokens.mjs.');
  }

  const staticSvg = toStaticSvg(artifact, { tokens });
  if (staticSvg.unresolved.length > 0) {
    // An unresolved custom property is an element with no colour, and a
    // silently colourless diagram is worse than a refusal.
    fail(`svg-static: ${staticSvg.unresolved.length} unresolved custom propert`
      + `${staticSvg.unresolved.length === 1 ? 'y' : 'ies'}: ${staticSvg.unresolved.join(', ')}`);
  }

  const target = output || `${input.replace(/\.json$/i, '')}.svg`;
  fs.writeFileSync(target, staticSvg.svg);
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`svg-static: wrote ${target} (${Math.round(staticSvg.bytes / 1024)} KB, `
    + `${staticSvg.rulesKept} style rules kept, ${staticSvg.rulesDropped} dropped)`);
}

function reportDeliveryFailure({ json, stage, type, input, output, error, diagnostics = [], status = 1, checker }) {
  const receipt = {
    schemaVersion: 1,
    ok: false,
    command: 'deliver',
    stage,
    type,
    input,
    output,
    error,
    diagnostics,
    ...(checker ? { checker } : {}),
  };
  if (json) console.log(JSON.stringify(receipt, null, 2));
  else console.error(formatDiagnostics(error, diagnostics));
  process.exitCode = status;
}

function reportValidateFailure({ json, stage, type, input, error, diagnostics = [], status = 1, checker }) {
  const receipt = {
    schemaVersion: 1,
    ok: false,
    command: 'validate',
    stage,
    type,
    input,
    error,
    diagnostics,
    ...(checker ? { checker } : {}),
  };
  if (json) console.log(JSON.stringify(receipt, null, 2));
  else console.error(formatDiagnostics(error, diagnostics));
  process.exitCode = status;
}

function sourceEvidenceFromArtifact(artifact) {
  const html = artifact.toString('utf8');
  const match = html.match(/<script id="mirofy-source-evidence-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  const evidence = JSON.parse(match[1]);
  if (evidence?.verified !== true || !evidence.repository?.url || !evidence.repository?.revision || !Number.isInteger(evidence.referenceCount)) {
    throw new Error('Rendered source evidence receipt is incomplete.');
  }
  return evidence;
}

function engineeringProfileFromArtifact(artifact) {
  const match = artifact.toString('utf8').match(/<svg[^>]*\sdata-engineering-profile="([^"]+)"/);
  return match ? match[1] : null;
}

async function commandDeliver(args) {
  const { resolveOutputPath } = await import('../renderers/shared/output-path.mjs');
  const qualityArgs = extractQualityArgs(args);
  const repoArgs = extractRepoRootArgs(qualityArgs.rest);
  const json = repoArgs.rest.includes('--json');
  const open = repoArgs.rest.includes('--open');
  const knownOptions = new Set(['--json', '--open']);
  const unknown = repoArgs.rest.filter((arg) => arg.startsWith('--') && !knownOptions.has(arg));
  if (unknown.length) fail(`Unknown deliver option "${unknown[0]}".`);
  const positional = repoArgs.rest.filter((arg) => !knownOptions.has(arg));
  const [type, input, requestedOutput] = positional;
  if (!type || !input || positional.length > 3) fail(usage());
  await assertEvidenceType(type, repoArgs.repoRoot);

  const renderer = rendererPath(type);
  const inputPath = path.resolve(input);
  let specification;
  let diagram;
  try {
    specification = fs.readFileSync(inputPath);
    diagram = JSON.parse(specification.toString('utf8'));
  } catch (error) {
    const repair = inputDiagnostic(error, inputPath);
    reportDeliveryFailure({
      json,
      stage: 'input',
      type,
      input: inputPath,
      output: path.resolve(requestedOutput || `${type}.html`),
      error: `Could not read delivery input "${inputPath}": ${error.message}`,
      diagnostics: [repair],
    });
    return;
  }

  const authoredOutput = typeof diagram?.meta?.output === 'string' && diagram.meta.output
    ? diagram.meta.output
    : undefined;
  let outputPath;
  try {
    ({ outputPath } = resolveOutputPath({
      requestedOutput,
      authoredOutput,
      defaultOutput: `${type}.html`,
      inputPaths: [inputPath],
    }));
  } catch (error) {
    const attemptedOutput = path.resolve(requestedOutput || authoredOutput || `${type}.html`);
    reportDeliveryFailure({
      json,
      stage: 'prepare',
      type,
      input: inputPath,
      output: attemptedOutput,
      error: error.message,
      diagnostics: error.mirofyDiagnostics || [diagnostic({
        code: 'output/path-resolution',
        message: error.message,
        subject: { output: attemptedOutput },
        evidence: { ...(error?.code ? { systemCode: error.code } : {}) },
        supportedFixes: ['choose a safe output path and retry'],
      })],
    });
    return;
  }
  const outputDirectory = path.dirname(outputPath);
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
  } catch (error) {
    const message = `Could not create delivery directory "${outputDirectory}": ${error.message}`;
    reportDeliveryFailure({
      json,
      stage: 'prepare',
      type,
      input: inputPath,
      output: outputPath,
      error: message,
      diagnostics: [diagnostic({
        code: 'delivery/prepare-directory',
        message,
        subject: { outputDirectory },
        evidence: { ...(error?.code ? { systemCode: error.code } : {}), reason: error.message },
        supportedFixes: ['choose a writable output directory'],
      })],
    });
    return;
  }

  // Keep the candidate beside the target so the final rename is one
  // same-filesystem commit. A render or artifact-check failure never touches
  // an existing trusted output.
  let stagingDirectory;
  try {
    stagingDirectory = fs.mkdtempSync(path.join(outputDirectory, '.mirofy-delivery-'));
  } catch (error) {
    const message = `Could not create a delivery candidate beside "${outputPath}": ${error.message}`;
    reportDeliveryFailure({
      json,
      stage: 'prepare',
      type,
      input: inputPath,
      output: outputPath,
      error: message,
      diagnostics: [diagnostic({
        code: 'delivery/prepare-candidate',
        message,
        subject: { output: outputPath },
        evidence: { ...(error?.code ? { systemCode: error.code } : {}), reason: error.message },
        supportedFixes: ['choose a writable output directory on the target filesystem'],
      })],
    });
    return;
  }
  const candidatePath = path.join(stagingDirectory, path.basename(outputPath));
  const specificationSnapshotPath = path.join(stagingDirectory, 'specification.snapshot.json');

  try {
    try {
      fs.writeFileSync(specificationSnapshotPath, specification, { flag: 'wx' });
    } catch (error) {
      const message = `Could not freeze the delivery specification: ${error.message}`;
      reportDeliveryFailure({
        json,
        stage: 'prepare',
        type,
        input: inputPath,
        output: outputPath,
        error: message,
        diagnostics: [diagnostic({
          code: 'delivery/freeze-specification',
          message,
          subject: { input: inputPath },
          evidence: { ...(error?.code ? { systemCode: error.code } : {}), reason: error.message },
          supportedFixes: ['choose a writable output directory on the target filesystem'],
        })],
      });
      return;
    }

    const render = runNode([renderer, specificationSnapshotPath, candidatePath], {
      stdio: 'pipe',
      env: rendererEnv(qualityArgs.quality, repoArgs.repoRoot, true),
    });
    if (render.status !== 0) {
      const failure = rendererFailure(render);
      reportDeliveryFailure({
        json,
        stage: 'render',
        type,
        input: inputPath,
        output: outputPath,
        error: failure.error,
        diagnostics: failure.diagnostics,
        status: render.status ?? 1,
      });
      return;
    }

    const check = runNode([path.join(skillRoot, 'scripts/check-render-output.mjs'), candidatePath], {
      stdio: 'pipe',
    });
    if (check.status !== 0) {
      if (check.stderr) process.stderr.write(check.stderr);
      let checker;
      try {
        checker = JSON.parse(check.stdout);
        checker.file = outputPath;
      } catch {
        checker = { ok: false, file: outputPath, diagnostic: check.stdout.trim() };
      }
      reportDeliveryFailure({
        json,
        stage: 'check',
        type,
        input: inputPath,
        output: outputPath,
        error: 'Final artifact check failed; the previous artifact was preserved.',
        diagnostics: checkerDiagnostics(checker),
        status: check.status ?? 1,
        checker,
      });
      return;
    }

    let result;
    try {
      result = JSON.parse(check.stdout);
    } catch (error) {
      const message = `Could not parse the successful artifact-check receipt: ${error.message}`;
      reportDeliveryFailure({
        json,
        stage: 'receipt',
        type,
        input: inputPath,
        output: outputPath,
        error: message,
        diagnostics: [diagnostic({
          code: 'delivery/receipt-invalid',
          message,
          subject: { output: outputPath },
          evidence: { reason: error.message },
        })],
      });
      return;
    }
    let artifact;
    try {
      artifact = fs.readFileSync(candidatePath);
    } catch (error) {
      const message = `Could not read the verified delivery candidate: ${error.message}`;
      reportDeliveryFailure({
        json,
        stage: 'receipt',
        type,
        input: inputPath,
        output: outputPath,
        error: message,
        diagnostics: [diagnostic({
          code: 'delivery/candidate-unreadable',
          message,
          subject: { output: outputPath },
          evidence: { ...(error?.code ? { systemCode: error.code } : {}), reason: error.message },
        })],
      });
      return;
    }
    let sourceEvidence;
    try {
      sourceEvidence = sourceEvidenceFromArtifact(artifact);
    } catch (error) {
      const message = `Could not read the repository evidence receipt: ${error.message}`;
      reportDeliveryFailure({
        json,
        stage: 'receipt',
        type,
        input: inputPath,
        output: outputPath,
        error: message,
        diagnostics: [diagnostic({
          code: 'delivery/evidence-receipt-invalid',
          message,
          subject: { output: outputPath },
          evidence: { reason: error.message },
        })],
      });
      return;
    }
    const engineeringProfile = engineeringProfileFromArtifact(artifact);
    const receipt = {
      schemaVersion: 1,
      ok: true,
      command: 'deliver',
      type,
      input: inputPath,
      output: outputPath,
      specification: {
        sha256: createHash('sha256').update(specification).digest('hex'),
        bytes: specification.byteLength,
      },
      artifact: {
        sha256: createHash('sha256').update(artifact).digest('hex'),
        bytes: artifact.byteLength,
      },
      validation: {
        checksPassed: result.checks.filter((checkItem) => checkItem.ok).length,
        checkCount: result.checks.length,
        compositionProfile: result.composition.profile,
        compositionStatus: result.composition.status,
        ...(engineeringProfile ? { engineeringProfile } : {}),
        errors: result.composition.summary.errors,
        warnings: result.composition.summary.warnings,
      },
      ...(sourceEvidence ? {
        evidence: {
          verified: true,
          repository: sourceEvidence.repository.url,
          revision: sourceEvidence.repository.revision,
          references: sourceEvidence.referenceCount,
        },
      } : {}),
    };

    try {
      resolveOutputPath({
        requestedOutput,
        authoredOutput,
        defaultOutput: `${type}.html`,
        inputPaths: [inputPath],
      });
    } catch (error) {
      reportDeliveryFailure({
        json,
        stage: 'commit',
        type,
        input: inputPath,
        output: outputPath,
        error: error.message,
        diagnostics: error.mirofyDiagnostics || [diagnostic({
          code: 'output/path-resolution',
          message: error.message,
          subject: { output: outputPath },
          evidence: { ...(error?.code ? { systemCode: error.code } : {}) },
          supportedFixes: ['restore a safe output path and retry'],
        })],
      });
      return;
    }

    try {
      fs.renameSync(candidatePath, outputPath);
    } catch (error) {
      const message = `Could not commit verified delivery "${outputPath}": ${error.message}`;
      reportDeliveryFailure({
        json,
        stage: 'commit',
        type,
        input: inputPath,
        output: outputPath,
        error: message,
        diagnostics: [diagnostic({
          code: 'delivery/commit',
          message,
          subject: { output: outputPath },
          evidence: { ...(error?.code ? { systemCode: error.code } : {}), reason: error.message },
          supportedFixes: ['choose a replaceable file target on the same writable filesystem'],
        })],
      });
      return;
    }

    if (open) {
      try {
        const { openArtifact } = await import('./open-artifact.mjs');
        receipt.open = openArtifact(outputPath);
      } catch {
        receipt.open = {
          requested: true,
          status: 'unsupported',
          target: outputPath,
          method: null,
        };
      }
      if (receipt.open.status !== 'opened') {
        console.error(`Could not open the verified artifact (${receipt.open.status}). Open it manually: ${outputPath}`);
      }
    }

    if (json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(`delivered ${type} ${outputPath}`);
      const engineering = receipt.validation.engineeringProfile
        ? `; engineering ${receipt.validation.engineeringProfile}: pass`
        : '';
      console.log(`${receipt.validation.checksPassed}/${receipt.validation.checkCount} artifact checks; composition ${receipt.validation.compositionProfile}: ${receipt.validation.compositionStatus}${engineering}; sha256 ${receipt.artifact.sha256.slice(0, 12)}`);
      if (receipt.open?.status === 'opened') console.log(`opened ${outputPath}`);
    }
  } finally {
    try {
      fs.rmSync(stagingDirectory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Warning: could not remove delivery staging directory "${stagingDirectory}": ${error.message}`);
    }
  }
}

async function commandPreview(args) {
  const qualityArgs = extractQualityArgs(args);
  const repoArgs = extractRepoRootArgs(qualityArgs.rest);
  const noOpen = repoArgs.rest.includes('--no-open');
  const knownOptions = new Set(['--no-open']);
  const unknown = repoArgs.rest.filter((arg) => arg.startsWith('--') && !knownOptions.has(arg));
  if (unknown.length) fail(`Unknown preview option "${unknown[0]}".`);
  const positional = repoArgs.rest.filter((arg) => !knownOptions.has(arg));
  const [type, input, output] = positional;
  if (!type || !input || positional.length > 3) fail(usage());
  await assertEvidenceType(type, repoArgs.repoRoot);
  rendererPath(type);

  let runPreview;
  try {
    ({ runPreview } = await import('./preview.mjs'));
  } catch (error) {
    fail(`Could not load live preview: ${error.message}`, 1);
  }
  try {
    await runPreview({
      type,
      input,
      output,
      quality: qualityArgs.quality,
      repoRoot: repoArgs.repoRoot,
      open: !noOpen,
    });
  } catch (error) {
    fail(`Could not start live preview: ${error.message}`, 1);
  }
}

function commandCheck(args) {
  const [html] = args;
  if (!html) fail(usage());
  const result = runNode([path.join(skillRoot, 'scripts/check-render-output.mjs'), html]);
  if (result.status !== 0) exitFrom(result);
}

async function commandVisualCheck(args) {
  const json = args.includes('--json');
  const knownOptions = new Set(['--json']);
  const unknown = args.filter((arg) => arg.startsWith('--') && !knownOptions.has(arg));
  if (unknown.length) fail(`Unknown visual-check option "${unknown[0]}".`, 1);
  const positional = args.filter((arg) => !knownOptions.has(arg));
  if (positional.length !== 1) fail(usage(), 1);

  let runVisualCheck;
  try {
    ({ runVisualCheck } = await import('./visual-check.mjs'));
  } catch (error) {
    fail(`Could not load visual-check: ${error.message}`, 1);
  }

  let result;
  try {
    result = await runVisualCheck({ artifactPath: positional[0] });
  } catch (error) {
    if (json) {
      console.log(JSON.stringify({
        schemaVersion: 1,
        ok: false,
        command: 'visual-check',
        status: 'fail',
        visualReview: 'pending',
        artifact: { path: path.resolve(positional[0]) },
        error: error.message,
      }, null, 2));
    } else {
      console.error(`visual-check failed: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(JSON.stringify(result.receipt, null, 2));
  } else {
    console.log(`visual-check ${result.receipt.status}: ${result.receipt.artifact.path}`);
    console.log(`containment ${result.receipt.containment.status}; captures ${result.receipt.captures.status}; visual review pending`);
    console.log(`receipt ${path.join(path.dirname(result.receipt.artifact.path), result.receipt.sidecars.receipt)}`);
    if (result.receipt.captures.contactSheet) {
      console.log(`contact sheet ${path.join(path.dirname(result.receipt.artifact.path), result.receipt.captures.contactSheet)}`);
    }
    if (result.receipt.error) console.error(result.receipt.error);
  }
  process.exitCode = result.exitCode;
}

/**
 * Write a starter document you can edit, rather than a blank file.
 *
 * The gap this closes is the first five minutes. `demo` produces a finished
 * artifact, which shows what the tool does and teaches nothing about the
 * document behind it; `examples` lists files inside an installed package that
 * a reader then has to go and find. Neither leaves you with something of your
 * own to change.
 *
 * The starter is deliberately SMALL -- three components and two connections --
 * because a first document you can hold in your head is worth more than one
 * that shows off every key. Every optional key is left out: an absent key is
 * correct and an empty one is rejected, and a starter full of empty strings
 * teaches the opposite.
 */
function commandInit(argv) {
  const types = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];
  const type = argv.find((arg) => types.includes(arg)) ?? 'architecture';
  const explicit = argv.find((arg) => !arg.startsWith('--') && !types.includes(arg));
  const target = path.resolve(explicit ?? `${type}.json`);

  if (fs.existsSync(target)) {
    fail(`${target} already exists. Name a different file, or delete that one.`);
  }

  const starters = {
    architecture: {
      components: [
        { id: 'web', type: 'frontend', label: 'Web App', sublabel: 'browser' },
        { id: 'api', type: 'backend', label: 'API', sublabel: 'HTTP' },
        { id: 'db', type: 'database', label: 'Postgres', sublabel: 'primary' },
      ],
      connections: [
        { from: 'web', to: 'api', label: 'requests' },
        { from: 'api', to: 'db', label: 'reads / writes' },
      ],
      layout: { mode: 'grid', cols: 3 },
    },
  };
  const body = starters[type] ?? starters.architecture;
  if (!starters[type]) {
    console.log(`init: no starter for ${type} yet, writing an architecture one.`);
  }

  const document = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'My system' },
    ...(body.layout ? { layout: body.layout } : {}),
    components: body.components.map((component, index) => ({
      ...component,
      row: Math.floor(index / 3),
      col: index % 3,
    })),
    connections: body.connections,
  };

  fs.writeFileSync(target, `${JSON.stringify(document, null, 2)}${String.fromCharCode(10)}`);
  const shown = path.relative(process.cwd(), target) || target;
  console.log(`Wrote ${shown}`);
  console.log('');
  console.log('Edit it, then:');
  console.log(`  mirofy validate architecture ${shown}     # says what is wrong, and how to fix it`);
  console.log(`  mirofy render architecture ${shown}       # one HTML file you can open`);
}

function commandExamples() {
  const result = runNode([path.join(skillRoot, 'scripts/render-examples.mjs')], { cwd: skillRoot });
  if (result.status !== 0) exitFrom(result);
}

async function commandDoctor() {
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  checks.push({
    label: `Node.js v${process.versions.node} (requires >=18)`,
    ok: nodeMajor >= 18,
    missing: 0,
    failureLabel: 'unsupported',
  });

  const template = path.join(skillRoot, 'assets/template.html');
  checks.push({
    label: 'Core template',
    ok: fs.existsSync(template),
    missing: fs.existsSync(template) ? 0 : 1,
  });

  const examplesRenderer = path.join(skillRoot, 'scripts/render-examples.mjs');
  checks.push({
    label: 'Example renderer',
    ok: fs.existsSync(examplesRenderer),
    missing: fs.existsSync(examplesRenderer) ? 0 : 1,
  });

  const previewRuntime = path.join(skillRoot, 'bin/preview.mjs');
  checks.push({
    label: 'Live preview runtime',
    ok: fs.existsSync(previewRuntime),
    missing: fs.existsSync(previewRuntime) ? 0 : 1,
  });

  const visualCheckRuntime = path.join(skillRoot, 'bin/visual-check.mjs');
  checks.push({
    label: 'Visual-check runtime',
    ok: fs.existsSync(visualCheckRuntime),
    missing: fs.existsSync(visualCheckRuntime) ? 0 : 1,
  });

  const outputPathRuntime = path.join(skillRoot, 'renderers/shared/output-path.mjs');
  checks.push({
    label: 'Output path safety runtime',
    ok: fs.existsSync(outputPathRuntime),
    missing: fs.existsSync(outputPathRuntime) ? 0 : 1,
  });

  const scenarioGuide = path.join(skillRoot, 'recipes/scenarios.mjs');
  checks.push({
    label: 'Scenario recipe guide',
    ok: fs.existsSync(scenarioGuide),
    missing: fs.existsSync(scenarioGuide) ? 0 : 1,
  });

  const authoringReferences = [
    path.join(skillRoot, 'references', 'authoring-contract.md'),
    path.join(skillRoot, 'references', 'viewer-runtime.md'),
    path.join(skillRoot, 'references', 'delivery-contract.md'),
  ];
  const authoringReferencesMissing = authoringReferences.filter((file) => !fs.existsSync(file)).length;
  checks.push({
    label: 'Progressive authoring references',
    ok: authoringReferencesMissing === 0,
    missing: authoringReferencesMissing,
  });

  const compareRuntime = path.join(skillRoot, 'delta/architecture-delta.mjs');
  const compareFixtures = [
    path.join(skillRoot, 'examples/checkout-platform.base.architecture.json'),
    path.join(skillRoot, 'examples/checkout-platform.head.architecture.json'),
  ];
  const compareMissing = [compareRuntime, ...compareFixtures].filter((file) => !fs.existsSync(file)).length;
  checks.push({
    label: 'Architecture compare runtime and proof fixtures',
    ok: compareMissing === 0,
    missing: compareMissing,
  });

  const validators = path.join(skillRoot, 'renderers/shared/generated-validators.mjs');
  const validatorsExist = fs.existsSync(validators);
  let validatorsValid = false;
  if (validatorsExist) {
    try {
      const module = await import(`${pathToFileURL(validators).href}?doctor=${Date.now()}`);
      validatorsValid = [...TYPES].every((type) => typeof module[type] === 'function');
    } catch {
      validatorsValid = false;
    }
  }
  checks.push({
    label: 'Standalone schema validators',
    ok: validatorsValid,
    missing: validatorsExist ? 0 : 1,
    invalid: validatorsExist && !validatorsValid ? 1 : 0,
    failureLabel: validatorsExist ? 'invalid' : 'missing',
  });

  const examples = {
    architecture: 'web-app.architecture.json',
    workflow: 'agent-tool-call.workflow.json',
    sequence: 'cache-miss-request.sequence.json',
    dataflow: 'product-analytics.dataflow.json',
    lifecycle: 'agent-run.lifecycle.json',
  };

  for (const type of TYPES) {
    const required = [
      path.join(skillRoot, 'renderers', type, `render-${type}.mjs`),
      path.join(skillRoot, 'schemas', `${type}.schema.json`),
      path.join(skillRoot, 'examples', examples[type]),
    ];
    const missing = required.filter((file) => !fs.existsSync(file)).length;
    checks.push({
      label: `${type} renderer, schema, and example`,
      ok: missing === 0,
      missing,
    });
  }

  console.log('Mirofy doctor\n');
  for (const check of checks) {
    console.log(`[${check.ok ? 'ok' : (check.failureLabel || 'missing')}] ${check.label}`);
  }

  const nodeFailed = checks[0].ok ? 0 : 1;
  const missingFiles = checks.reduce((count, check) => count + check.missing, 0);
  const invalidRuntime = checks.reduce((count, check) => count + (check.invalid || 0), 0);
  if (nodeFailed === 0 && missingFiles === 0 && invalidRuntime === 0) {
    console.log('\nMirofy is ready.');
    return;
  }

  const problems = [];
  if (nodeFailed) problems.push('Node.js 18 or newer is required');
  if (missingFiles) problems.push(`${missingFiles} required file${missingFiles === 1 ? '' : 's'} missing`);
  if (invalidRuntime) problems.push(`${invalidRuntime} runtime check${invalidRuntime === 1 ? '' : 's'} failed`);
  console.error(`\nMirofy is not ready: ${problems.join('; ')}.`);
  process.exitCode = 1;
}

async function commandGuide(args) {
  let lang;
  let json = false;
  const queryParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--lang') {
      const value = args[index + 1];
      if (value !== 'en' && value !== 'zh') fail('--lang must be "en" or "zh".');
      lang = value;
      index += 1;
    } else if (arg.startsWith('--lang=')) {
      const value = arg.slice('--lang='.length);
      if (value !== 'en' && value !== 'zh') fail('--lang must be "en" or "zh".');
      lang = value;
    } else if (arg.startsWith('--')) {
      fail(`Unknown guide option "${arg}".`);
    } else {
      queryParts.push(arg);
    }
  }

  const guidePath = path.join(skillRoot, 'recipes/scenarios.mjs');
  let guide;
  try {
    guide = await import(pathToFileURL(guidePath).href);
  } catch (error) {
    fail(`Could not load the scenario recipe guide: ${error.message}`, 1);
  }

  const query = queryParts.join(' ').trim();
  if (!query) {
    const selectedLang = lang || 'en';
    if (json) {
      console.log(JSON.stringify({
        ok: true,
        mode: 'list',
        lang: selectedLang,
        recipes: guide.listScenarioRecipes(selectedLang),
      }, null, 2));
    } else {
      console.log(guide.formatScenarioList(selectedLang));
    }
    return;
  }

  const result = guide.recommendScenario(query, lang ? { lang } : {});
  console.log(json ? JSON.stringify(result, null, 2) : guide.formatScenarioRecommendation(result));
}

async function commandBrands(args) {
  const json = args.includes('--json');
  const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--json');
  if (unknown.length) fail(`Unknown brands option "${unknown[0]}".`);
  const positional = args.filter((arg) => arg !== '--json');
  if (positional[0] === 'capture') {
    if (positional.length !== 2) fail('Usage: mirofy brands capture <url> [--json]');
    const { captureBrandReference } = await import('../renderers/shared/brand-marks.mjs');
    let capture;
    try {
      capture = await captureBrandReference(positional[1]);
    } catch (error) {
      fail(error.message);
    }
    const result = {
      schemaVersion: 1,
      ok: true,
      command: 'brands capture',
      brand: capture.brand,
      evidence: {
        status: capture.resolved.status,
        source: capture.resolved.sourceUrl,
        ...(capture.resolved.sha256 ? { sha256: capture.resolved.sha256 } : {}),
        ...(capture.resolved.contentType ? { contentType: capture.resolved.contentType } : {}),
      },
    };
    console.log(json ? JSON.stringify(result, null, 2) : JSON.stringify(result.brand));
    return;
  }
  const query = positional.join(' ').trim();
  const { listBrandMarks } = await import('../renderers/shared/brand-marks.mjs');
  const marks = listBrandMarks(query);
  if (json) {
    console.log(JSON.stringify({
      schemaVersion: 1,
      ok: true,
      command: 'brands',
      query,
      count: marks.length,
      marks,
      fallback: 'Run "mirofy brands capture <url> --json", then use the returned digest-pinned brand value.',
    }, null, 2));
    return;
  }
  if (!marks.length) {
    console.log(`No built-in brand matched "${query}". Run "mirofy brands capture <url> --json", then use the returned digest-pinned brand value.`);
    return;
  }
  const grouped = Map.groupBy
    ? Map.groupBy(marks, (mark) => mark.category)
    : marks.reduce((map, mark) => map.set(mark.category, [...(map.get(mark.category) || []), mark]), new Map());
  for (const [category, entries] of grouped) {
    console.log(`${category}: ${entries.map((mark) => mark.id).join(', ')}`);
  }
}

function commandDemo(args) {
  if (args.length > 1) fail(usage());

  const outputDirectory = path.resolve(args[0] || process.cwd());
  const output = path.join(outputDirectory, 'mirofy-demo.html');
  const input = path.join(skillRoot, 'examples/web-app.architecture.json');

  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
  } catch (error) {
    fail(`Could not create demo directory "${outputDirectory}": ${error.message}`, 1);
  }

  const result = runNode([rendererPath('architecture'), input, output]);
  if (result.status !== 0) exitFrom(result);

  console.log(`\nDemo ready: ${output}`);
  console.log('Next: open the HTML in your browser, then render your own diagram:');
  console.log('  mirofy render architecture <input.json> <output.html>');
}

async function commandValidate(args) {
  const qualityArgs = extractQualityArgs(args);
  const repoArgs = extractRepoRootArgs(qualityArgs.rest);
  args = repoArgs.rest;
  const quality = qualityArgs.quality;
  const repoRoot = repoArgs.repoRoot;
  const json = args.includes('--json');
  const layoutJson = args.includes('--layout-json');
  const rest = args.filter((arg) => arg !== '--json' && arg !== '--layout-json');
  const [type, input] = rest;
  if (!type || !input) fail(usage());
  await assertEvidenceType(type, repoRoot);
  const renderer = rendererPath(type);

  if (layoutJson) {
    if (type !== 'architecture') {
      fail('--layout-json is currently supported for architecture diagrams only.');
    }
    const result = runNode([renderer, input, '/dev/null', '--layout-json'], {
      stdio: 'pipe',
      env: rendererEnv(quality, repoRoot, true),
    });
    if (result.status !== 0) {
      const failure = rendererFailure(result);
      reportValidateFailure({
        json,
        stage: failure.diagnostics.some((entry) => entry.code.startsWith('input/')) ? 'input' : 'render',
        type,
        input: path.resolve(input),
        error: failure.error,
        diagnostics: failure.diagnostics,
        status: result.status ?? 1,
      });
      return;
    }
    process.stdout.write(result.stdout);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-validate-'));
  const out = path.join(tmp, `${type}.html`);
  let exitCode = 0;

  try {
    const render = runNode([renderer, input, out], {
      stdio: 'pipe',
      env: rendererEnv(quality, repoRoot, true),
    });
    if (render.status !== 0) {
      const failure = rendererFailure(render);
      reportValidateFailure({
        json,
        stage: failure.diagnostics.some((entry) => entry.code.startsWith('input/')) ? 'input' : 'render',
        type,
        input: path.resolve(input),
        error: failure.error,
        diagnostics: failure.diagnostics,
        status: render.status ?? 1,
      });
      exitCode = render.status ?? 1;
    } else {
      const check = runNode([path.join(skillRoot, 'scripts/check-render-output.mjs'), out], { stdio: 'pipe' });
      if (check.status !== 0) {
        let checker;
        try {
          checker = JSON.parse(check.stdout);
          checker.file = path.resolve(input);
        } catch {
          checker = { ok: false, diagnostic: 'Artifact checker failed without a parseable receipt.' };
        }
        reportValidateFailure({
          json,
          stage: 'check',
          type,
          input: path.resolve(input),
          error: 'Final artifact check failed.',
          diagnostics: checkerDiagnostics(checker),
          checker,
          status: check.status ?? 1,
        });
        exitCode = check.status ?? 1;
      } else {
        const result = JSON.parse(check.stdout);
        const engineeringProfile = engineeringProfileFromArtifact(fs.readFileSync(out));
        if (json) {
          console.log(JSON.stringify({
            schemaVersion: 1,
            ok: true,
            command: 'validate',
            type,
            input: path.resolve(input),
            checks: result.checks,
            composition: result.composition,
            ...(engineeringProfile ? { engineeringProfile } : {}),
          }, null, 2));
        } else {
          const engineering = engineeringProfile
            ? `; engineering ${engineeringProfile}: pass`
            : '';
          console.log(`ok ${type} ${path.resolve(input)} (${result.checks.length} artifact checks; composition ${result.composition.profile}: ${result.composition.summary.errors} errors, ${result.composition.summary.warnings} warnings${engineering})`);
        }
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (exitCode !== 0) process.exitCode = exitCode;
}

const [command, ...args] = process.argv.slice(2);

async function commandImport(argv) {
  const json = argv.includes('--json');
  const positional = argv.filter((value) => !value.startsWith('--'));
  const [format, input, output] = positional;
  if (format !== 'mermaid' || !input) {
    fail('Usage: mirofy import mermaid <input.mmd> [output.json] [--json]');
  }
  let text;
  try {
    text = fs.readFileSync(input, 'utf8');
  } catch (error) {
    fail(`import: could not read ${JSON.stringify(input)}: ${error.message}`);
  }

  const { importMermaid } = await import('../../import/src/mermaid.mjs');
  let result;
  try {
    result = importMermaid(text);
  } catch (error) {
    fail(error.message);
  }

  const outPath = output || `${input.replace(/\.[^.]+$/, '')}.json`;
  fs.writeFileSync(outPath, `${JSON.stringify(result.document, null, 2)}
`);

  if (json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      ok: true,
      command: 'import',
      format: 'mermaid',
      diagramType: result.diagramType,
      output: path.resolve(outPath),
      gaps: result.gaps,
    }, null, 2)}
`);
    return;
  }

  console.log(`import: ${input} -> ${outPath} (${result.diagramType})`);
  // Gaps are reported, never swallowed: the person who pasted the Mermaid is
  // the only one who can tell whether what was skipped mattered.
  if (result.gaps.length) {
    console.log(`import: ${result.gaps.length} line(s) not carried across:`);
    for (const gap of result.gaps) console.log(`  line ${gap.line}: ${gap.text}`);
  } else {
    console.log('import: every line was carried across');
  }
}

async function commandRepair(argv) {
  const json = argv.includes('--json');
  const safe = argv.includes('--safe');
  const positional = argv.filter((value) => !value.startsWith('--'));
  const [type, input, output] = positional;
  if (!TYPES.has(type) || !input) {
    fail('Usage: mirofy repair <type> <input.json> [output.json] --safe [--json]');
  }
  if (!safe) {
    fail('repair: pass --safe. Repair rewrites authored coordinates, and that takes an explicit word.');
  }

  let document;
  try {
    document = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch (error) {
    fail(`repair: could not read ${JSON.stringify(input)}: ${error.message}`);
  }

  const { repairDocument } = await import('../../layout/src/repair.mjs');
  // What was already wrong, before repair touched anything. Without this the
  // report cannot tell a problem repair FAILED to fix from one it CAUSED --
  // and widening a component to fit its label really can change which side an
  // edge leaves from.
  const before = await validateDocumentQuietly(type, input);

  const { document: repaired, receipt } = repairDocument(document, { safe: true, diagramType: type });

  const outPath = output || input;
  fs.writeFileSync(outPath, `${JSON.stringify(repaired, null, 2)}
`);

  if (json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      ok: receipt.unsatisfiable.length === 0,
      command: 'repair',
      type,
      output: path.resolve(outPath),
      receipt,
    }, null, 2)}
`);
    return;
  }

  console.log(`repair: ${input} -> ${outPath}`);
  if (receipt.nothingToRepair) {
    // Distinct from "nothing needed fixing". This type offers repair no lever
    // at all, and reporting a clean run over a document it never touched would
    // be a claim it has not earned.
    console.log(`repair: nothing to repair in a ${type} document -- ${receipt.nothingToRepair}`);
  } else if (!receipt.moves.length) {
    console.log('repair: nothing needed moving');
  } else {
    console.log(`repair: ${receipt.moves.length} component(s) nudged, ${receipt.passes} pass(es):`);
    for (const move of receipt.moves) {
      console.log(`  ${move.id}: [${move.from}] -> [${move.to}] (${move.distance}px) -- ${move.reason}`);
    }
  }
  // Reported, never swallowed: a repair that silently leaves problems behind
  // is worse than one that refuses, because the next run looks clean.
  if (receipt.unsatisfiable.length) {
    console.log(`repair: ${receipt.unsatisfiable.length} overlap(s) a displacement-only repair cannot fix:`);
    for (const entry of receipt.unsatisfiable) console.log(`  ${entry.a} / ${entry.b}: ${entry.reason}`);
  }

  // Then re-validate against the REAL validator, not repair's own model of
  // the world. Repair moves boxes; moving a box changes edge geometry, and a
  // routing rule can fail on a document whose overlaps are now perfect.
  // Saying so is the difference between "I fixed it" and "I fixed what I can
  // fix, and here is what is left".
  const residual = await validateDocumentQuietly(type, outPath);
  const known = new Set(before);
  const introduced = residual.filter((line) => !known.has(line));
  const outstanding = residual.filter((line) => known.has(line));

  if (!residual.length) {
    console.log('repair: the document now validates');
  } else {
    if (outstanding.length) {
      console.log(`repair: ${outstanding.length} problem(s) outside repair's reach:`);
      for (const line of outstanding.slice(0, 6)) console.log(`  ${line}`);
      if (outstanding.length > 6) console.log(`  ... and ${outstanding.length - 6} more`);
    }
    if (introduced.length) {
      // The loudest thing this command can say. A repair that trades one
      // failure class for another while reporting success is worse than one
      // that refuses, and only a before/after comparison can tell them apart.
      console.log(`repair: ${introduced.length} problem(s) INTRODUCED by this repair:`);
      for (const line of introduced.slice(0, 6)) console.log(`  ${line}`);
      console.log('repair: widening a component changes its geometry, and an edge can leave a '
        + 'different side as a result. Review these before keeping the result.');
    }
  }
  if (before.length && residual.length > before.length) {
    console.log(`repair: this document had ${before.length} problem(s) and now has ${residual.length}. `
      + 'That is worse, not better.');
  }
}

/**
 * Run the layout validator and return its problem lines, without exiting.
 * Repair reports what it could not reach; it does not fail on it.
 */
async function validateDocumentQuietly(type, filePath) {
  const result = spawnSync(process.execPath, [
    path.join(skillRoot, 'bin/mirofy.mjs'), 'validate', type, filePath, '--json',
  ], { encoding: 'utf8' });
  try {
    const receipt = JSON.parse(result.stdout);
    if (receipt.ok) return [];
    return String(receipt.error || '').split(String.fromCharCode(10)).filter((line) => line.trim().startsWith('-'));
  } catch {
    return [];
  }
}

switch (command) {
  case undefined:
  case '-h':
  case '--help':
  case 'help':
    console.log(usage());
    break;
  case 'render':
    commandRender(args);
    break;
  case 'compare':
    await commandCompare(args);
    break;
  case 'deliver':
    await commandDeliver(args);
    break;
  case 'preview':
    await commandPreview(args);
    break;
  case 'validate':
    commandValidate(args);
    break;
  case 'inspect':
    commandValidate([...args, '--layout-json']);
    break;
  case 'check':
    commandCheck(args);
    break;
  case 'visual-check':
    await commandVisualCheck(args);
    break;
  case 'guide':
    await commandGuide(args);
    break;
  case 'brands':
    await commandBrands(args);
    break;
  case 'examples':
    commandExamples();
    break;
  case 'doctor':
    await commandDoctor();
    break;
  case 'demo':
    commandDemo(args);
    break;
  case 'init':
    commandInit(args);
    break;
  case 'import':
    await commandImport(args);
    break;
  case 'repair':
    await commandRepair(args);
    break;
  default:
    fail(`Unknown command "${command}".\n\n${usage()}`);
}
