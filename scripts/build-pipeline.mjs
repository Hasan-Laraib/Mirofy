// @ts-check
// Copies the repository-mapping pipeline into packages/core so it ships.
//
//   node scripts/build-pipeline.mjs
//
// WHY THIS EXISTS. `mirofy-cli` publishes packages/core and nothing else, so
// everything the README's first sentence promises -- point it at a repository
// and it reads the code into an evidence graph -- lived in packages the
// registry never saw. Someone who ran `npx mirofy-cli` got a renderer for JSON
// they had to write themselves.
//
// The alternatives were worse. Publishing @mirofy/scanner and friends
// separately means core depends on them, and "every workspace package.json has
// zero runtime dependencies" is conformance row 6.9 -- a checked invariant, not
// a preference. Moving the sources under packages/core permanently would bury
// four coherent packages inside a fifth to satisfy a packaging constraint.
//
// So the workspace layout stays honest and the published tarball carries a
// copy. packages/core/pipeline/ is generated and git-ignored: there is exactly
// one source of truth, and it is packages/<name>/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repoRoot, 'packages/core/pipeline');

// evidence first: the others import it.
// `import` and `viewer` are not pipeline steps. They are here because the
// CLI dynamically imports a module from each -- mermaid import, and the
// token model the static SVG export needs -- and a specifier that climbs
// out of packages/core resolves to nothing at all once installed.
const PACKAGES = ['evidence', 'scanner', 'model', 'compile', 'layout', 'import', 'viewer'];

// The only cross-package specifier that moves. Copied to
// packages/core/pipeline/<name>/src/x.mjs, a sibling under pipeline/ is still
// '../../evidence/src/...', but core's own renderers climb one level further.
const REWRITE = [["'../../core/", "'../../../"]];

// Built beside the destination and swapped in, rather than deleted and rebuilt
// in place. The in-place version left packages/core/pipeline absent for the
// whole rebuild, and anything reading packages/core in that window -- the skill
// bundle, a coverage walk -- failed with ENOENT on a file that exists a second
// later. Twice today. The swap is two syscalls; the rebuild is seconds.
// Dot-prefixed: while the build runs these ARE visible inside packages/core,
// and everything that reads that package skips dot entries by a rule that
// already exists. A `pipeline.next` sitting there would be an undecided
// directory to the skill bundle -- the thing this whole shape keeps tripping on.
const staging = path.join(repoRoot, 'packages/core/.pipeline-next');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

let files = 0;
let rewritten = 0;
for (const name of PACKAGES) {
  for (const dir of ['src', 'bin']) {
    const from = path.join(repoRoot, 'packages', name, dir);
    if (!fs.existsSync(from)) continue;
    const to = path.join(staging, name, dir);
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
      const rel = path.relative(from, path.join(entry.parentPath ?? entry.path, entry.name));
      const source = fs.readFileSync(path.join(from, rel), 'utf8');
      let text = source;
      for (const [find, replace] of REWRITE) text = text.split(find).join(replace);
      if (text !== source) rewritten += 1;
      fs.mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
      fs.writeFileSync(path.join(to, rel), text);
      files += 1;
    }
  }
}

// A copy that does not run is worse than no copy: it ships, and fails in
// somebody else's terminal. So the bundled scanner is actually run here,
// against a throwaway repository, and has to produce a real fact.
const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-pipeline-'));
try {
  fs.mkdirSync(path.join(probe, 'src'), { recursive: true });
  fs.writeFileSync(path.join(probe, 'package.json'), '{"name":"probe","version":"0.0.0"}');
  fs.writeFileSync(path.join(probe, 'src/a.mjs'), "import { b } from './b.mjs';\nexport const a = b;\n");
  fs.writeFileSync(path.join(probe, 'src/b.mjs'), 'export const b = 1;\n');
  execFileSync('git', ['init', '-q'], { cwd: probe, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: probe, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=probe@local', '-c', 'user.name=probe',
    'commit', '-qm', 'probe'], { cwd: probe, stdio: 'ignore' });

  const run = (rel, args = []) => execFileSync(process.execPath,
    [path.join(staging, rel), ...args], { cwd: probe, stdio: 'pipe', encoding: 'utf8' });
  run('scanner/bin/scan.mjs');
  run('model/bin/model.mjs', ['--from-graph', '--graph', 'scan/evidence-graph.json']);
  run('compile/bin/compile.mjs');
  run('layout/bin/layout.mjs');

  const model = JSON.parse(fs.readFileSync(path.join(probe, 'scan/model.json'), 'utf8'));
  const drawn = (model.components ?? []).map((component) => component.id);
  if (!drawn.includes('src')) {
    throw new Error(`bundled pipeline modelled ${JSON.stringify(drawn)}; expected a src module`);
  }
  console.log(`build-pipeline: probe mapped a fresh repository -> ${drawn.join(', ')}`);
} finally {
  fs.rmSync(probe, { recursive: true, force: true });
}

/** Every file under `dir`, as a sorted list of [relative path, contents]. */
function treeOf(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    entries.push([path.relative(dir, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')]);
  }
  entries.sort((left, right) => left[0].localeCompare(right[0]));
  return JSON.stringify(entries);
}

// Nothing changed: keep the directory that is already there.
//
// The swap below renames packages/core/pipeline, and on Windows a directory
// cannot be renamed while another process holds a file open under it. The
// test suite runs its files in parallel and several of them spawn the CLI,
// which imports from exactly this directory -- so `npm run check` failed at
// random inside the skill-bundle test with a bare binding.rename error,
// twice under the publish guard and never when run alone.
//
// Rebuilding is idempotent: the sources are copied verbatim apart from one
// import rewrite, so an unchanged workspace produces a byte-identical tree.
// That is the overwhelmingly common case -- every test run, every gate --
// and it needs no rename at all. The swap is kept for when the tree really
// did change, where a moment of contention is the correct cost.
const built = treeOf(staging);
const live = treeOf(out);
if (live !== null && built === live) {
  fs.rmSync(staging, { recursive: true, force: true });
  console.log('build-pipeline: bundled pipeline already current; left in place');
} else {
  // Only now, with the copy proved to run, does it become the real one.
  const previous = path.join(repoRoot, 'packages/core/.pipeline-previous');
  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(out)) fs.renameSync(out, previous);
  fs.renameSync(staging, out);
  fs.rmSync(previous, { recursive: true, force: true });
}

const kb = execFileSync(process.execPath, ['-e',
  `let n=0;const w=(d)=>{for(const e of require('fs').readdirSync(d,{withFileTypes:true}))`
  + `{const p=require('path').join(d,e.name);e.isDirectory()?w(p):n+=require('fs').statSync(p).size}};`
  + `w(${JSON.stringify(out)});console.log(Math.round(n/1024))`], { encoding: 'utf8' }).trim();
console.log(`build-pipeline: ${files} files (${rewritten} with rewritten imports) -> `
  + `packages/core/pipeline (${kb} KB)`);
