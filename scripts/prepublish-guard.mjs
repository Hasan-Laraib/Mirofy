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

/**
 * Run npm without going through a shell.
 *
 * `shell: true` works and Node warns about it, because it concatenates
 * arguments rather than escaping them. Naming npm.cmd directly does not work
 * either: Node refuses to spawn a .cmd without a shell -- the mitigation for
 * CVE-2024-27980 -- and fails with EINVAL.
 *
 * The way through is npm's own JavaScript entry point, run on the Node that is
 * already here. npm sets npm_execpath to exactly that when it runs a script,
 * which is the context this guard executes in; the fallbacks are for running
 * it by hand.
 */
function npmCli() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fromEnv.endsWith('.js') && fs.existsSync(fromEnv)) return fromEnv;
  const nodeDir = path.dirname(process.execPath);
  for (const candidate of [
    path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    path.join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** @param {string[]} argv @param {object} options */
function runNpm(argv, options) {
  const cli = npmCli();
  if (cli) return execFileSync(process.execPath, [cli, ...argv], options);
  // No entry point found. On POSIX `npm` is an ordinary executable and this
  // works; on Windows it will not, and saying so beats a bare EINVAL.
  if (process.platform === 'win32') {
    refuse('could not locate npm-cli.js, and Windows will not spawn npm.cmd directly. '
      + 'Run this through `npm publish` rather than by hand.');
  }
  return execFileSync('npm', argv, options);
}

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
const NEWLINE = String.fromCharCode(10);
// Rebuild the bundled pipeline before packing, ALWAYS. prepublishOnly runs
// build-pipeline first, so npm publish was fine -- but running this guard
// directly tested whatever copy happened to be on disk. It sat one fix behind
// and reported a defect that had already been repaired, which is the friendlier
// half of the failure mode; the other half is a guard passing on a stale bundle
// and blessing a tarball nobody built.
say('rebuilding the bundled pipeline so the tarball under test is the current one');
execFileSync(process.execPath, [path.join(repoRoot, 'scripts/build-pipeline.mjs')],
  { stdio: ['ignore', 'ignore', 'inherit'] });

const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-prepublish-'));
try {
  const packed = runNpm( ['pack', '--pack-destination', probe], {
    cwd: corePath, encoding: 'utf8',
  }).trim().split('\n').pop();
  const tarball = path.join(probe, String(packed));
  if (!fs.existsSync(tarball)) refuse(`npm pack reported ${packed} but wrote nothing`);

  fs.writeFileSync(path.join(probe, 'package.json'), '{"name":"probe","private":true}\n');
  runNpm( ['install', '--no-audit', '--no-fund', tarball], {
    cwd: probe, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Read from the manifest rather than written down: the package was renamed
  // once already, when npm refused the bare name, and a hardcoded directory
  // here would have failed the probe for a reason that has nothing to do with
  // whether the tarball works.
  const packageName = JSON.parse(fs.readFileSync(path.join(corePath, 'package.json'), 'utf8')).name;
  const installed = path.join(probe, 'node_modules', packageName);
  execFileSync(process.execPath, [
    path.join(installed, 'bin/mirofy.mjs'), 'render', 'architecture',
    path.join(installed, 'examples/web-app.architecture.json'),
    path.join(probe, 'out.html'),
  ], { cwd: probe, stdio: ['ignore', 'ignore', 'pipe'] });
  if (!fs.existsSync(path.join(probe, 'out.html'))) {
    refuse('the installed package reported success but rendered nothing');
  }
  // Rendering a document that ships with the package proves the renderer. It
  // does NOT prove the thing the README opens with -- point it at a repository.
  // That path runs entirely different code, it is the reason packages/core now
  // carries a pipeline/ directory, and the first tarball built with it could
  // not lay anything out: layout imported webcola statically, webcola is a dev
  // dependency, and nothing in a render-only probe touches layout. It shipped
  // clean and would have died in the first stranger's terminal.
  //
  // So: build a throwaway repository and map it with the INSTALLED cli.
  const repo = path.join(probe, 'subject');
  fs.mkdirSync(path.join(repo, 'src/api'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src/store'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"subject","version":"0.0.0"}');
  fs.writeFileSync(path.join(repo, 'src/api/routes.mjs'),
    ["import { save } from '../store/repo.mjs';", 'export const app = () => save();', ''].join(NEWLINE));
  fs.writeFileSync(path.join(repo, 'src/store/repo.mjs'), 'export const save = () => 1;' + NEWLINE);
  for (const args of [['init', '-q'], ['add', '-A'],
    ['-c', 'user.email=probe@local', '-c', 'user.name=probe', 'commit', '-qm', 'probe']]) {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  }
  execFileSync(process.execPath, [path.join(installed, 'bin/mirofy.mjs'), 'map', '.'],
    { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] });
  const mapped = path.join(repo, 'architecture.html');
  if (!fs.existsSync(mapped)) {
    refuse('the installed package could not map a repository -- `mirofy map` produced no artifact');
  }
  const model = JSON.parse(fs.readFileSync(path.join(repo, 'scan/model.json'), 'utf8'));
  const drawn = (model.components ?? []).map((component) => component.id).sort();
  if (!drawn.includes('src/api') || !drawn.includes('src/store')) {
    refuse(`the installed package mapped ${JSON.stringify(drawn)}; expected both source modules`);
  }

  const bytes = fs.statSync(tarball).size;
  say(`  ${(bytes / 1024).toFixed(0)} KB, installs, renders, and maps a repository`);
} catch (error) {
  refuse(`the packed tarball does not work when installed:\n${String(error.stderr || error.message).slice(0, 1500)}`);
} finally {
  fs.rmSync(probe, { recursive: true, force: true });
}

// Both from the manifest. The name was written down here and said "mirofy" for
// a whole CI run after the package had been renamed -- the last line anybody
// reads before publishing, quietly naming the wrong package.
const manifest = JSON.parse(fs.readFileSync(path.join(corePath, 'package.json'), 'utf8'));
console.log(`\nprepublish: ${manifest.name}@${manifest.version} is ready to publish.`);
