import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

test('validator freshness check accepts CRLF checkouts', () => {
  // Inside packages/core, because the generator it copies imports `ajv` and
  // only packages/core/node_modules has the version with dist/2020.js -- moving
  // this to os.tmpdir(), and then to a repo-level directory, broke exactly that.
  //
  // But under ONE named dot-directory rather than a fresh `.validator-check-*`
  // at the top level each time. Everything that reads packages/core skips dot
  // entries, which are never shipped; scattered scratch at the top level made
  // build-skill fail on an undecided directory and degraded.test.mjs -- which
  // copies packages/core wholesale -- fail at random on test ordering.
  const scratchRoot = path.join(skillRoot, '.scratch');
  fs.mkdirSync(scratchRoot, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(scratchRoot, 'validator-check-'));
  try {
    fs.mkdirSync(path.join(scratch, 'scripts'));
    fs.mkdirSync(path.join(scratch, 'renderers', 'shared'), { recursive: true });
    fs.cpSync(path.join(skillRoot, 'schemas'), path.join(scratch, 'schemas'), { recursive: true });
    fs.copyFileSync(
      path.join(skillRoot, 'scripts', 'generate-validators.mjs'),
      path.join(scratch, 'scripts', 'generate-validators.mjs'),
    );

    const validator = fs.readFileSync(
      path.join(skillRoot, 'renderers', 'shared', 'generated-validators.mjs'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(scratch, 'renderers', 'shared', 'generated-validators.mjs'),
      validator.replace(/\r\n?|\n/g, '\r\n'),
    );

    const result = spawnSync(process.execPath, [
      path.join(scratch, 'scripts', 'generate-validators.mjs'),
      '--check',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
