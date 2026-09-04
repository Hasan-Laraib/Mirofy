// Where npm's JavaScript entry point lives.
//
// Windows will not let Node spawn npm.cmd without a shell, and running it
// through a shell means quoting arguments by hand. The way through is npm's own
// JS entry point, run on the Node that is already here. npm sets npm_execpath to
// exactly that when it runs a script, which is the context these scripts execute
// in; the fallbacks are for running them by hand.
import fs from 'node:fs';
import path from 'node:path';

/** @returns {string|null} path to npm-cli.js, or null if it cannot be found */
export function npmCli() {
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
