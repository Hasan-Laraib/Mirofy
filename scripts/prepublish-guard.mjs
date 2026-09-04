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

import { npmCli } from './lib/npm-cli.mjs';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corePath = path.join(repoRoot, 'packages/core');

// npmCli lives in scripts/lib/npm-cli.mjs -- check-audit.mjs needs the same
// resolver, and two copies of it would drift.

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
  // Capture BOTH streams. Only stderr was kept, and every check here reports
  // its failures on stdout -- so a refusal printed "npm run check failed:"
  // followed by nothing, on a release job, where nobody can rerun it locally
  // to find out. A gate that blocks a release without saying why is half a gate.
  execSync('npm run check', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  const output = `${String(error.stdout || '')}${String(error.stderr || '')}`;
  refuse(`\`npm run check\` failed:
${output.slice(-4000) || '(the check produced no output at all)'}`);
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

  // Every command the CLI ADVERTISES, run from the installed tarball.
  //
  // Rendering and mapping were the only two exercised, and `files` is an
  // allowlist: two commands shipped to the registry that died on the first
  // call with "Cannot find module", because the scripts/ helpers they spawn
  // were not in it. The gate above passed the whole time -- neither command
  // was on the path it walked.
  //
  // The advertised list is READ from the installed help text rather than
  // written down here, so adding a command to usage() without teaching this
  // guard to exercise it fails the publish instead of shipping untested.
  const cli = path.join(installed, "bin/mirofy.mjs");
  const run = (argv, cwd) => spawnSync(process.execPath, [cli, ...argv],
    { cwd: cwd || probe, encoding: "utf8" });

  const helpText = run(["--help"]).stdout || "";
  const advertised = new Set();
  for (const line of helpText.split(NEWLINE)) {
    // Anchored on the binary name, not on the line shape: each usage line is
    // prefixed with however the CLI was invoked -- a bare `mirofy` when
    // installed, a full script path from a checkout. Matching the prefix
    // positionally found zero commands, and the guard above refused rather
    // than walking an empty set, which is the only reason this was seen.
      const match = line.match(/mirofy(?:\.mjs|-cli)?\s+([a-z][a-z-]*)/);
    if (match) advertised.add(match[1]);
  }
  if (advertised.size < 10) {
    refuse(`could not read the command list from the installed help text `
      + `(found ${advertised.size}); the walk below would pass vacuously`);
  }

  const example = (name) => path.join(installed, "examples", name);
  const ARCH = example("web-app.architecture.json");
  fs.writeFileSync(path.join(probe, "d.mmd"), "graph TD" + NEWLINE + "  a-->b" + NEWLINE);

  // "runs" must exit 0. "resolves" may refuse its arguments -- it wants a
  // browser, a server, or a question this probe has no answer for -- but
  // must still load every module it needs to say so, which is the failure
  // this whole section exists for.
  const WALK = {
    map: { mode: "runs", argv: ["map", ".", path.join(probe, "m.html"),
      "--out", path.join(probe, "mscan"), "--quiet"], cwd: repo },
    render: { mode: "runs", argv: ["render", "architecture", ARCH, path.join(probe, "r.html")] },
    compare: { mode: "runs", argv: ["compare", "architecture",
      example("checkout-platform.base.architecture.json"),
      example("checkout-platform.head.architecture.json"), path.join(probe, "c.html")] },
    deliver: { mode: "runs", argv: ["deliver", "architecture", ARCH, path.join(probe, "dv.html"), "--json"] },
    validate: { mode: "runs", argv: ["validate", "architecture", ARCH, "--json"] },
    inspect: { mode: "runs", argv: ["inspect", "architecture", ARCH] },
    check: { mode: "runs", argv: ["check", path.join(probe, "out.html")] },
    guide: { mode: "runs", argv: ["guide", "a request with a cache miss", "--json"] },
    brands: { mode: "runs", argv: ["brands", "stripe", "--json"] },
    examples: { mode: "runs", argv: ["examples"] },
    doctor: { mode: "runs", argv: ["doctor"] },
    demo: { mode: "runs", argv: ["demo", path.join(probe, "demo")] },
    init: { mode: "runs", argv: ["init", "architecture", path.join(probe, "i.json")] },
    import: { mode: "runs", argv: ["import", "mermaid", path.join(probe, "d.mmd"),
      path.join(probe, "im.json"), "--json"] },
    repair: { mode: "runs", argv: ["repair", "architecture", ARCH, path.join(probe, "rp.json"), "--safe"] },
    // Serves over HTTP until interrupted; running it here would hang the publish.
    preview: { mode: "resolves", argv: ["preview"] },
    // Drives real Chrome, which a publish must not require.
    "visual-check": { mode: "resolves", argv: ["visual-check"] },
  };

  for (const name of advertised) {
    if (!WALK[name]) {
      refuse(`the CLI advertises ${name} and this guard does not exercise it. `
        + `Add it to WALK in scripts/prepublish-guard.mjs -- an advertised command `
        + `nobody runs before publishing is how check and examples shipped broken.`);
    }
  }
  for (const name of Object.keys(WALK)) {
    if (!advertised.has(name)) {
      refuse(`this guard exercises ${name}, which the CLI no longer advertises. `
        + `Remove it from WALK, or it is testing a command nobody can find.`);
    }
  }

  const walked = [];
  for (const [name, spec] of Object.entries(WALK)) {
    const result = run(spec.argv, spec.cwd);
    const output = String(result.stdout ?? "") + String(result.stderr ?? "");
    // The packaging failure, in every spelling Node gives it.
    if (/Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(output)) {
      refuse(`mirofy ${name}: cannot resolve a module from the installed package. `
        + `Something it needs is missing from the files list in packages/core/package.json.`
        + NEWLINE + output.slice(0, 800));
    }
    if (spec.mode === "runs" && result.status !== 0) {
      refuse(`mirofy ${name}: exited ${result.status} when installed from the tarball.`
        + NEWLINE + output.slice(0, 800));
    }
    walked.push(name);
  }
  say(`  walked ${walked.length} advertised command(s) from the installed package`);
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
