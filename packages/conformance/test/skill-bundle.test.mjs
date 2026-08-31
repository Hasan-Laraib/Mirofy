// The installable skill bundle.
//
// A skill is something a person copies into their home directory and keeps.
// Two things follow from that, and neither is true of packages/core.
//
// It has to be NAMED right: a skill is identified by the directory it sits in,
// so an agent indexing a skills folder finds "core" claiming in its own
// frontmatter to be "mirofy". The manual copy instruction hides that, because
// it names the destination -- nothing that walks a tree does.
//
// And it has to carry only what it needs. packages/core is 3.7 MB, of which a
// megabyte is the test suite that proves the code and does not run at a user
// site.
//
// These tests exist because a bundle is exactly the kind of thing that rots
// unnoticed: nobody in this repository ever installs it, so nothing here would
// otherwise discover that it stopped working.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const bundle = path.join(repoRoot, 'dist/mirofy');

/**
 * Build the bundle, from nothing.
 *
 * dist/ is cleared first. Without that, a build writing somewhere else -- or
 * not writing at all -- leaves the PREVIOUS bundle sitting there, and every
 * assertion below passes against a directory this run did not produce. That is
 * not a hypothetical: renaming the output to dist/core left all eight of these
 * green.
 */
function build() {
  fs.rmSync(path.join(repoRoot, 'dist'), { recursive: true, force: true });
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts/build-skill.mjs')], {
    cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'],
  });
  assert.ok(fs.existsSync(bundle), `the build wrote no ${path.relative(repoRoot, bundle)}`);
}

test('the bundle builds, and the build proves it runs outside this repository', () => {
  // build-skill.mjs copies the result somewhere with no repository around it
  // and renders a diagram. A bundle that only works inside its own checkout is
  // not a bundle, it is a directory -- so a non-zero exit here is the whole
  // test, and the assertions below only describe what it produced.
  assert.doesNotThrow(build, 'the skill bundle does not work standalone');
});

test('the bundle is named for the skill it contains', () => {
  build();
  assert.equal(path.basename(bundle), 'mirofy');
  const frontmatter = fs.readFileSync(path.join(bundle, 'SKILL.md'), 'utf8').slice(0, 400);
  const declared = /^name:\s*(\S+)\s*$/m.exec(frontmatter)?.[1];
  assert.equal(declared, path.basename(bundle),
    `SKILL.md calls the skill "${declared}" and the directory is "${path.basename(bundle)}"`);
});

test('the bundle omits what a user site never runs', () => {
  build();
  for (const unwanted of ['test', 'scripts', 'node_modules']) {
    assert.equal(fs.existsSync(path.join(bundle, unwanted)), false,
      `the bundle ships ${unwanted}/`);
  }
});

test('the bundle carries everything the CLI reaches for', () => {
  build();
  for (const needed of ['SKILL.md', 'LICENSE', 'bin', 'renderers', 'schemas', 'examples']) {
    assert.ok(fs.existsSync(path.join(bundle, needed)), `the bundle has no ${needed}`);
  }
  // The MIT notice travels with the code it covers. Shipping the renderers
  // without it would be a licence breach, not an oversight.
  assert.match(fs.readFileSync(path.join(bundle, 'LICENSE'), 'utf8'), /MIT/);
});

test('the bundle does not claim to be part of a workspace it was copied out of', () => {
  build();
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8'));
  assert.equal(manifest.private, undefined, 'a private flag would refuse a publish of the bundle');
  assert.equal(manifest.devDependencies, undefined);
  assert.deepEqual(manifest.dependencies ?? {}, {},
    'the bundle declares a runtime dependency, so a copy would not run');
  // Without the leading ./ -- npm rewrites it on publish otherwise, and a
  // manifest npm auto-corrects is a manifest that does not say what ships.
  assert.equal(manifest.bin?.mirofy, 'bin/mirofy.mjs');
});

test('a new directory in packages/core has to be decided about', () => {
  // The bundle names what it ships, so adding a directory to packages/core does
  // not silently enlarge what every user installs -- but it also must not be
  // silently left out. The build refuses an entry it neither ships nor records
  // a reason for skipping.
  const invented = path.join(repoRoot, 'packages/core/__bundle_probe__');
  fs.mkdirSync(invented, { recursive: true });
  fs.writeFileSync(path.join(invented, 'keep.txt'), 'probe\n');
  try {
    assert.throws(build, 'an undecided directory was silently dropped from the bundle');
  } finally {
    fs.rmSync(invented, { recursive: true, force: true });
  }
});

test('the bundle is materially smaller than the package it comes from', () => {
  build();
  const sizeOf = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules') return total;
    return total + (entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size);
  }, 0);
  const shipped = sizeOf(bundle);
  const whole = sizeOf(path.join(repoRoot, 'packages/core'));
  // Measured against what is actually omitted rather than a round percentage.
  // A ratio would be an opinion about how much smaller is smaller enough; this
  // says the bundle is lighter by at least the directories it leaves behind,
  // which is a fact about the two trees.
  const omitted = ['test', 'scripts']
    .reduce((total, name) => total + sizeOf(path.join(repoRoot, 'packages/core', name)), 0);
  assert.ok(whole - shipped >= omitted * 0.95,
    `the bundle saves ${((whole - shipped) / 1024 / 1024).toFixed(2)} MB but omits `
    + `${(omitted / 1024 / 1024).toFixed(2)} MB — something it should not ship is being copied`);
  assert.ok(omitted > 512 * 1024, 'the omitted directories are too small for this to prove anything');
});

test('the temporary bundle is not committed', () => {
  const ignored = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.match(ignored, /^dist\/$/m,
    'dist/ is not ignored, so a build would commit a generated artifact (row 7.1)');
});

// ---------------------------------------------------------------------------
// Declared `bin` entries.
//
// npm creates a launcher for each one at install time, and on POSIX that
// launcher runs the file directly -- so a bin without a shebang is a command
// that installs cleanly and then fails the first time somebody types it.
//
// npm also sets the executable bit, which git tracks. A bin committed as 644 is
// therefore MODIFIED the moment `npm ci` runs, and any check that expects a
// clean tree fails on a fresh CI checkout for reasons that have nothing to do
// with the change being tested. That is what this pair is really guarding.
// ---------------------------------------------------------------------------

/** Every `bin` a workspace manifest declares, as absolute paths. */
function declaredBins() {
  const packagesDir = path.join(repoRoot, 'packages');
  const found = [];
  for (const name of fs.readdirSync(packagesDir)) {
    const manifestPath = path.join(packagesDir, name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const relative of Object.values(manifest.bin ?? {})) {
      found.push(path.join(packagesDir, name, String(relative)));
    }
  }
  return found;
}

test('every declared bin starts with a shebang', () => {
  const bins = declaredBins();
  assert.ok(bins.length > 0, 'no bin entries found, so this proves nothing');
  for (const file of bins) {
    const first = fs.readFileSync(file, 'utf8').split('\n')[0];
    assert.match(first, /^#!\/usr\/bin\/env node/,
      `${path.relative(repoRoot, file)} is a bin with no shebang — it would install and then not run`);
  }
});

test('every declared bin is committed executable', () => {
  const modes = execFileSync('git', ['ls-files', '-s', '--', 'packages'],
    { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .reduce((map, line) => {
      const [meta, file] = line.split('\t');
      map.set(file, meta.split(' ')[0]);
      return map;
    }, new Map());

  for (const file of declaredBins()) {
    const key = path.relative(repoRoot, file).split(path.sep).join('/');
    assert.equal(modes.get(key), '100755',
      `${key} is committed ${modes.get(key)}; npm sets it executable, so git reports it modified on a fresh checkout`);
  }
});
