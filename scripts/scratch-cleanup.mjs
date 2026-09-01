// Loaded with `--import` by the test runners. Removes every temporary
// directory the process created, when the process exits.
//
// WHY THIS EXISTS. Test files create scratch repositories with
// fs.mkdtempSync and most of them never removed one. Today's session found
// 20,460 abandoned directories totalling 35.4 GB in the user's temp folder,
// which had filled the system drive to 0.08 GB free -- at which point the gate
// began failing at random with ENOSPC, in different places each run, looking
// like a flaky test suite rather than a full disk.
//
// The obvious fix -- add an rmSync to each of a hundred files -- fixes today
// and not tomorrow: the next test written is one nobody reminds. So cleanup
// belongs to the runner, where forgetting is not possible.
//
// SCOPE, DELIBERATELY NARROW. Only directories whose parent IS the system temp
// directory are recorded. A test that mkdtemps inside the repository -- and one
// does, generate-validators.test.mjs, on purpose -- is never touched by this.
// Deleting inside a working tree because a helper thought it was scratch is a
// far worse bug than the one being fixed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created = new Set();

let tempRoot = null;
try {
  tempRoot = fs.realpathSync(os.tmpdir());
} catch {
  // No temp directory to reason about; record nothing rather than guess.
}

/** Record `dir` if, and only if, it sits directly in the system temp root. */
function remember(dir) {
  if (!tempRoot || typeof dir !== 'string') return dir;
  try {
    if (fs.realpathSync(path.dirname(dir)) === tempRoot) created.add(dir);
  } catch {
    // Unreadable parent: not provably scratch, so not ours to delete.
  }
  return dir;
}

// Patched on the default export, which is the object every caller in this
// repository holds (`import fs from 'node:fs'`). A named import would keep the
// original binding and slip past this, so the check below refuses one.
const mkdtempSync = fs.mkdtempSync.bind(fs);
fs.mkdtempSync = (prefix, options) => remember(mkdtempSync(prefix, options));

const mkdtempPromise = fs.promises.mkdtemp.bind(fs.promises);
fs.promises.mkdtemp = async (prefix, options) => remember(await mkdtempPromise(prefix, options));

const mkdtempCallback = fs.mkdtemp.bind(fs);
// The callback form carries a `__promisify__` property tsc insists on, and this
// wrapper has no use for it. Kept as a cast rather than reconstructed, because
// inventing a promisify shim to satisfy a type would be more code than the
// thing it wraps.
/** @type {any} */
const patchedMkdtemp = (prefix, options, callback) => {
  const done = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? undefined : options;
  return mkdtempCallback(prefix, opts, (error, dir) => {
    if (!error) remember(dir);
    done(error, dir);
  });
};
patchedMkdtemp.__promisify__ = fs.mkdtemp.__promisify__;
fs.mkdtemp = patchedMkdtemp;

// Synchronous, because 'exit' listeners cannot await. A hard kill still leaks,
// which is the honest limit of doing this in-process and is why the sweep in
// check-scratch.mjs exists as well.
// Grandchildren too. A test that spawns the CLI gets a process this module was
// never loaded into, and that process makes its own scratch -- visual-check's
// Chrome profile was the one that survived. NODE_OPTIONS carries the flag down
// every level, and this module prints nothing and changes no behaviour beyond
// the cleanup, so a process under test cannot tell the difference.
const flag = `--import ${JSON.stringify(import.meta.url)}`;
if (!String(process.env.NODE_OPTIONS ?? '').includes('scratch-cleanup')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} ${flag}`.trim();
}

process.on('exit', () => {
  for (const dir of created) {
    try {
      // Windows keeps a handle open briefly after a child process that touched
      // the directory exits -- git, in the cases seen here. Two attempts with
      // no delay was not enough and left the directory behind.
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 60 });
    } catch {
      // A directory a test still holds open on Windows. Left behind rather
      // than retried forever; the gate will name it.
    }
  }
});
