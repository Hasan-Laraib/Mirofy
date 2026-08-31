// Row 6.12. Attribution on artifacts.
//
// The baseline this project forked ships none, and that is the single largest
// unforced error in its growth: every diagram it ever rendered went into a
// README, a slide or a chat with nothing on it saying what made it. A tool
// nobody can name is a tool nobody looks for.
//
// Two surfaces, and they are deliberately different.
//
// The viewer footer is DISMISSIBLE. The artifact belongs to whoever rendered
// it, and a banner they cannot close is an imposition on someone else's
// document.
//
// The Share Card is PERMANENT. A card is the one artifact that travels
// without its context -- it lands in a README or a timeline where nothing
// around it says where it came from -- so the attribution is part of the
// image, drawn after the diagram, in a band reserved for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { coreRoot } from '../src/render.mjs';

const template = fs.readFileSync(path.join(coreRoot, 'assets/template.html'), 'utf8');

// Asserted against a real render, not the template. The attribution STRING is
// injected with the rest of the locale dictionary at render time, so the
// template carries the element and the artifact carries the words -- and the
// artifact is what a reader is handed.
const rendered = (() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-attribution-'));
  const out = path.join(tmp, 'artifact.html');
  execFileSync(process.execPath, [
    path.join(coreRoot, 'bin/mirofy.mjs'), 'render', 'architecture',
    path.join(coreRoot, 'examples/web-app.architecture.json'), out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(out, 'utf8');
})();

test('[6.12] the rendered artifact carries attribution markup', () => {
  assert.match(template, /id="attribution"/, 'the template ships no attribution element');
  assert.match(template, /id="btn-attribution-dismiss"/, 'the reader cannot dismiss it');
  assert.match(rendered, /Made with Mirofy/, 'a rendered artifact carries no attribution string');
});

test('[6.12] attribution says what made the diagram, and claims nothing about it', () => {
  // Attribution is a provenance statement, not an endorsement. A footer that
  // said "validated" or "verified" would be making a claim about the reader's
  // diagram that this project has no basis for -- the same truth boundary the
  // Share Cards already hold to.
  const i18n = fs.readFileSync(path.join(coreRoot, 'renderers/shared/i18n.mjs'), 'utf8');
  const lines = i18n.split('\n').filter((line) => line.includes('viewer.attribution.'));
  assert.equal(lines.length, 2, 'expected exactly a footer and a card attribution string');
  for (const line of lines) {
    assert.doesNotMatch(line, /verified|validated|correct|accurate/i,
      `attribution claims something about the diagram: ${line.trim()}`);
    // No URL. A link baked into every artifact someone shares outlives the
    // address it points at, and a dead link is worse than a name.
    assert.doesNotMatch(line, /https?:\/\//, `attribution embeds a URL: ${line.trim()}`);
  }
});

test('[6.12] the card reserves space for attribution instead of drawing over the diagram', () => {
  const exportModule = fs.readFileSync(path.join(coreRoot, '../viewer/src/js/04-export.js'), 'utf8');

  // The band exists and is subtracted from the diagram's height. Without the
  // subtraction the diagram would simply grow into the space and the
  // attribution would sit on top of someone's nodes.
  assert.match(exportModule, /SHARE_CARD_FOOTER\s*=\s*\d+/, 'no reserved footer band on the card');
  assert.match(
    exportModule,
    /availableHeight\s*=\s*SHARE_CARD_HEIGHT[^;]*SHARE_CARD_FOOTER/,
    'the card reserves no height for attribution, so the diagram can cover it',
  );
});

test('[6.12] card attribution is drawn after the diagram, so nothing can cover it', () => {
  const exportModule = fs.readFileSync(path.join(coreRoot, '../viewer/src/js/04-export.js'), 'utf8');
  // Anchored on the CARD's own draw call. `ctx.drawImage(img,` alone also
  // matches the plain PNG export earlier in this file, and matching that one
  // made this assertion pass no matter how the card was ordered -- the test
  // was green while proving nothing.
  const drawImage = exportModule.indexOf('ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)');
  const drawAttribution = exportModule.indexOf("viewerText('viewer.attribution.card')");
  assert.ok(drawImage > -1, 'the card never draws the diagram');
  assert.ok(drawAttribution > -1, 'the card never draws attribution');
  // Order is the whole guarantee. Drawn before the image, a large diagram
  // paints straight over it and the card ships unattributed.
  assert.ok(drawAttribution > drawImage,
    'attribution is drawn before the diagram, so the diagram can paint over it');
});

test('[6.12] the card has no way to turn attribution off', () => {
  const exportModule = fs.readFileSync(path.join(coreRoot, '../viewer/src/js/04-export.js'), 'utf8');
  const start = exportModule.indexOf("viewerText('viewer.attribution.card')");
  // Walk back to the start of the statement and check nothing guards it.
  const statement = exportModule.slice(Math.max(0, start - 400), start);
  assert.doesNotMatch(statement.split('\n').slice(-4).join('\n'), /\bif\s*\(/,
    'the card attribution sits behind a condition; on a card it is not optional');
});

test('[6.12] a reader who dismissed the footer is remembered, and a failure shows it', () => {
  const module = fs.readFileSync(path.join(coreRoot, '../viewer/src/js/20-attribution.js'), 'utf8');
  assert.match(module, /localStorage/, 'dismissal is not remembered between visits');

  // The failure mode is the point. localStorage throws in sandboxed iframes
  // and with cookies blocked; the catch returns null, which reads as "not
  // dismissed" and SHOWS attribution. Defaulting the other way would make a
  // storage error into a silently unattributed artifact.
  assert.match(module, /catch\s*\(_\)\s*\{\s*return null;\s*\}/,
    'a storage failure does not fall back to showing attribution');
  const init = module.slice(module.indexOf('function init('));
  assert.match(init, /readStored\(\)\s*===\s*'1'/,
    'attribution is hidden by anything other than an explicit dismissal');
});

test('[6.12] embed and print modes drop the footer, and neither touches the card', () => {
  // Embedding puts the diagram inside someone else's page furniture, and
  // printing puts it on paper; a floating pill helps in neither. The card is
  // untouched by both, which is why it is the surface that carries the
  // permanent one.
  const css = fs.readFileSync(path.join(coreRoot, '../viewer/src/css/01-structure.css'), 'utf8');
  assert.match(css, /@media print \{ \.attribution \{ display: none; \} \}/);
  assert.match(css, /\[data-embed='1'\] \.attribution \{ display: none; \}/);
});
