// Row 5.20. The Evidence Passport for a RELATIONSHIP.
//
// Selecting a relationship focuses its source node, which means the Passport
// was previously showing that node's evidence while the user believed they
// were inspecting the edge -- evidence attributed to the wrong subject, which
// is worse than showing none at all. This proves the edge's own evidence
// replaces it.
//
// Every assertion is against the FIXTURE's values -- the exact path, the
// exact line range, the exact revision, the exact class -- never merely that
// the panel is non-empty. A panel that renders the wrong file's evidence is
// non-empty too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { coreRoot } from '../src/render.mjs';
import { chromeAvailable } from './helpers/browser.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-passport-'));
const skip = chromeAvailable() ? false : 'no Chrome; set MIROFY_CHROME to run the evidence Passport gate';

const EVIDENCE_PATH = 'src/app.js';
const EVIDENCE_LINE = 2;
const EVIDENCE_END_LINE = 6;
const EVIDENCE_CLASS = 'runtime-observed';

let artifactUrl = null;
let artifactPath = null;
let revision = null;
let browser = null;
let sid = null;

const git = (repo, ...args) => execFileSync('git', args, {
  cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

before(async () => {
  if (skip) return;

  // A throwaway repository so the evidence is genuinely verified against real
  // blobs at a real revision, rather than asserted against a stub.
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'src', 'app.js'),
    Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n',
  );
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  // Evidence verification requires an origin remote matching /meta/repository.
  git(repo, 'remote', 'add', 'origin', 'https://github.com/acme/widgets.git');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'initial');
  revision = git(repo, 'rev-parse', 'HEAD');

  const doc = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Edge passport',
      repository: { url: 'https://github.com/acme/widgets', revision },
    },
    components: [
      { id: 'app', type: 'backend', label: 'App', pos: [80, 120], size: [200, 60] },
      { id: 'db', type: 'database', label: 'DB', pos: [520, 120], size: [200, 60] },
    ],
    connections: [{
      from: 'app',
      to: 'db',
      id: 'app-to-db',
      label: 'writes',
      provenance: EVIDENCE_CLASS,
      sources: [{ path: EVIDENCE_PATH, line: EVIDENCE_LINE, end_line: EVIDENCE_END_LINE }],
    }],
  };
  const input = path.join(tmp, 'passport.json');
  fs.writeFileSync(input, JSON.stringify(doc));
  const out = path.join(tmp, 'passport.html');
  execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture', input, out, '--repo-root', repo,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  artifactPath = out;
  artifactUrl = pathToFileURL(out).href;

  const { ChromeVisualBrowser, findChrome } = await import(
    pathToFileURL(path.join(coreRoot, 'bin/visual-check.mjs')).href);
  browser = new ChromeVisualBrowser(findChrome());
  sid = await browser.sessionPromise;
});

after(async () => {
  if (browser) await browser.close();
});

async function evaluate(expression) {
  const result = await browser.cdp.send('Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true }, sid, 15000);
  if (result.exceptionDetails) {
    throw new Error(`page threw: ${JSON.stringify(result.exceptionDetails.exception ?? result.exceptionDetails)}`);
  }
  return result.result.value;
}

async function open() {
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sid, 30000);
  await browser.cdp.send('Page.navigate', { url: artifactUrl }, sid);
  await loaded;
}

test('[5.20] selecting a relationship reports ITS evidence in the Passport, not its source node\'s', { skip }, async () => {
  await open();

  const report = await evaluate(`(function () {
    var target = document.querySelector('[data-relationship-hit-key]');
    if (!target) return { error: 'no relationship hit target was installed' };
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    var evidence = document.getElementById('focus-evidence');
    var provenance = document.getElementById('focus-provenance');
    var repository = document.getElementById('focus-repository');
    var links = document.querySelectorAll('#focus-evidence-links a');
    var first = links[0];
    return {
      evidenceVisible: evidence ? !evidence.hidden : false,
      provenance: provenance && !provenance.hidden ? provenance.textContent : null,
      provenanceLabel: provenance ? provenance.getAttribute('aria-label') : null,
      repositoryHref: repository ? repository.getAttribute('href') : null,
      linkCount: links.length,
      href: first ? first.getAttribute('href') : null,
      lineText: first ? (first.querySelector('code') || {}).textContent : null,
      pathText: first ? (first.querySelector('small') || {}).textContent : null,
    };
  })()`);

  assert.equal(report.error, undefined, report.error);
  assert.equal(report.evidenceVisible, true, 'the Passport evidence section stayed hidden after selecting the relationship');

  // The class the FIXTURE claims, not whatever the source node resolved to.
  assert.equal(report.provenance, EVIDENCE_CLASS);
  assert.match(report.provenanceLabel || '', new RegExp(EVIDENCE_CLASS));

  // The revision the fixture pinned.
  assert.equal(report.repositoryHref, `https://github.com/acme/widgets/tree/${revision}`);

  // The path and line range the fixture cited. The source node carries no
  // evidence at all, so any of these being present at all proves the edge's
  // evidence -- and their exact values prove it is not some other edge's.
  assert.equal(report.linkCount, 1, 'expected exactly one source link for the relationship');
  assert.equal(report.pathText, EVIDENCE_PATH);
  assert.match(report.lineText || '', new RegExp(`L${EVIDENCE_LINE}.*${EVIDENCE_END_LINE}`));
  assert.match(report.href || '', new RegExp(`${revision}/${EVIDENCE_PATH}#L${EVIDENCE_LINE}-L${EVIDENCE_END_LINE}$`));
});

test('[5.20] provenance survives export while the beacon never enters the static artifact', { skip }, async () => {
  // Two different things, easy to conflate:
  //
  //   the BEACON is viewer chrome. It is installed at runtime and the export
  //   pipeline strips it (04-export.js), so it must never appear in the static
  //   artifact on disk -- if it did, every embed and every canonical export
  //   would carry interaction furniture the renderer never authored.
  //
  //   data-provenance is renderer-emitted SEMANTICS, like data-node-kind. It
  //   must SURVIVE, because the six treatments are keyed on it: stripping it
  //   would silently flatten every provenance distinction in an exported SVG
  //   while leaving the diagram looking fine.
  //
  // Asserting only "the export is clean" would be satisfied by stripping
  // both, which is the failure this checks for.
  // Scoped to the diagram SVG, not the whole file: the artifact also embeds
  // the viewer's own source, which naturally CONTAINS the string
  // "data-source-evidence-beacon" in the code that installs one. Matching the
  // file would fail on the installer rather than on a baked-in element.
  const staticMarkup = fs.readFileSync(artifactPath, 'utf8');
  const svgMatch = staticMarkup.match(/<svg[^>]*role="graphics-document"[\s\S]*?<\/svg>/);
  assert.ok(svgMatch, 'no diagram svg found in the static artifact');
  const staticSvg = svgMatch[0];
  assert.match(staticSvg, /data-provenance="runtime-observed"/,
    'the artifact does not carry the authored provenance class statically');
  assert.doesNotMatch(staticSvg, /data-source-evidence-beacon/,
    'a source beacon is baked into the static diagram svg; it must be installed at runtime only');

  // And it is genuinely installed once the viewer runs, so the absence above
  // is "stripped/never-written", not "never implemented".
  await open();
  const live = await evaluate(`(function () {
    var svg = document.querySelector('.diagram-container svg');
    return {
      beacons: svg ? svg.querySelectorAll('[data-source-evidence-beacon]').length : 0,
      provenanced: svg ? svg.querySelectorAll('[data-provenance]').length : 0,
    };
  })()`);
  assert.ok(live.beacons > 0, 'the viewer installed no beacon at runtime, so the static absence proves nothing');
  assert.ok(live.provenanced > 0, 'no element carries data-provenance at runtime');
});
