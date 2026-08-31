// @ts-check
// Runs before `npm publish`, from packages/core's prepublishOnly.
//
// A published version cannot be taken back. npm allows an unpublish for 72
// hours and then the version number is spent forever, so the cost of shipping
// something broken is not "fix it and republish" — it is a bad 0.1.0 that
// people install for as long as the package exists.
//
// So this refuses to publish unless the whole gate passes, the working tree is
// clean, and the tarball actually runs when installed. It is deliberately
// slower than a publish would otherwise be. That is the trade.

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corePath = path.join(repoRoot, 'packages/core');

/** @param {string} step */
function say(step) {
  console.log(`prepublish: ${step}`);
}

/** @param {string} message */
function refuse(message) {
  console.error(`\nprepublish: REFUSED — ${message}`);
  console.error('Nothing was published.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. The working tree
// ---------------------------------------------------------------------------
// A publish from a dirty tree ships bytes that exist on one machine. Whatever
// goes to npm should be recoverable from a commit, or the provenance the rest
// of this project is built on stops at its own front door.
say('checking the working tree is clean');
let head = null;
try {
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot, encoding: 'utf8',
  }).trim();
  if (dirty) {
    refuse(`the working tree has uncommitted changes:\n${dirty.split('\n').slice(0, 10).join('\n')}`);
  }
  head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch (error) {
  if (head === null && !/not a git repository/i.test(String(error.message))) throw error;
  say('  no git repository — skipped');
}
if (head) say(`  clean at ${head.slice(0, 12)}`);

// ---------------------------------------------------------------------------
// 2. The gate
// ---------------------------------------------------------------------------
say('running the full check (this takes a few minutes)');
try {
  execSync('npm run check', { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
} catch (error) {
  refuse(`\`npm run check\` failed:\n${String(error.stderr || '').slice(-2000)}`);
}
say('  passed');

// ---------------------------------------------------------------------------
// 3. The tarball, installed
// ---------------------------------------------------------------------------
// `files` decides what ships, and an allowlist is exactly the kind of thing
// that silently loses an entry. Packing it and running the result is the only
// check that cannot be fooled by the source tree still being on disk.
say('packing and installing the tarball into a clean directory');
const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-prepublish-'));
try {
  const packed = execFileSync('npm', ['pack', '--pack-destination', probe], {
    cwd: corePath, encoding: 'utf8', shell: process.platform === 'win32',
  }).trim().split('\n').pop();
  const tarball = path.join(probe, String(packed));
  if (!fs.existsSync(tarball)) refuse(`npm pack reported ${packed} but wrote nothing`);

  fs.writeFileSync(path.join(probe, 'package.json'), '{"name":"probe","private":true}\n');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', tarball], {
    cwd: probe, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'],
    shell: process.platform === 'win32',
  });

  const installed = path.join(probe, 'node_modules/mirofy');
  execFileSync(process.execPath, [
    path.join(installed, 'bin/mirofy.mjs'), 'render', 'architecture',
    path.join(installed, 'examples/web-app.architecture.json'),
    path.join(probe, 'out.html'),
  ], { cwd: probe, stdio: ['ignore', 'ignore', 'pipe'] });
  if (!fs.existsSync(path.join(probe, 'out.html'))) {
    refuse('the installed package reported success but rendered nothing');
  }
  const bytes = fs.statSync(tarball).size;
  say(`  ${(bytes / 1024).toFixed(0)} KB, installs and renders`);
} catch (error) {
  refuse(`the packed tarball does not work when installed:\n${String(error.stderr || error.message).slice(0, 1500)}`);
} finally {
  fs.rmSync(probe, { recursive: true, force: true });
}

const version = JSON.parse(fs.readFileSync(path.join(corePath, 'package.json'), 'utf8')).version;
console.log(`\nprepublish: mirofy@${version} is ready to publish.`);
