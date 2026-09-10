// Two claims SECURITY.md makes about how this project runs other programs.
//
// Supply-chain scanners flag it for shell access and they are right: it spawns
// `git`, because the product's whole claim is that every edge names the commit
// it came from, and nothing but git can answer that. What the flag cannot see
// is the difference between spawning a program with an argument array and
// handing a string to a shell -- the first cannot be injected into, the second
// is where command injection lives.
//
// SECURITY.md says there is no shell and no command built from a string. This
// is what makes those checked claims instead of assurances.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Everything that ships or runs, excluding the checks themselves: this file
// names the patterns it forbids, and scripts/ tooling legitimately shells out.
const files = execFileSync('git', ['ls-files', 'packages/**/*.mjs'], { cwd: repoRoot, encoding: 'utf8' })
  .split(String.fromCharCode(10))
  .filter(Boolean)
  .filter((file) => !file.includes('/test/') && !file.includes('/conformance/'));

const offenders = { shell: [], stringCommand: [] };
for (const file of files) {
  const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const lines = source.split(String.fromCharCode(10));
  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    // `shell: true` hands the arguments to cmd.exe or /bin/sh, which is where
    // a metacharacter in a branch name or a path becomes an executed command.
    if (line.includes('shell: true') || line.includes('shell:true')) offenders.shell.push(at);
  });

  // The signal is the IMPORT, not the call site. `exec` and `execSync` take a
  // command string and are the injection surface; `execFile`/`spawn` take an
  // argument array and are not. Matching call sites instead flags every
  // `regex.exec(line)` in the parsers -- eighteen of them, none a child
  // process, which is how the first version of this check failed.
  //
  // Compared as exact names rather than by pattern. The second version used a
  // character class, the backslash did not survive being written into this
  // file, and `[{,s]` matched nothing -- a check that passes because its own
  // pattern is broken, in a file about not trusting unchecked claims.
  const RISKY = new Set([String.fromCharCode(101, 120, 101, 99),
    String.fromCharCode(101, 120, 101, 99) + String.fromCharCode(83, 121, 110, 99)]);
  for (const line of lines) {
    const from = line.indexOf(String.fromCharCode(123));
    const to = line.indexOf(String.fromCharCode(125));
    if (!line.includes('child_process') || from < 0 || to < from) continue;
    for (const name of line.slice(from + 1, to).split(',')) {
      const bare = name.trim().split(String.fromCharCode(32))[0];
      if (RISKY.has(bare)) offenders.stringCommand.push(`${file}: imports ${bare}`);
    }
  }
}

const results = [
  {
    claim: 'no child process is given a shell',
    ok: offenders.shell.length === 0,
    detail: offenders.shell.length ? offenders.shell.join(', ') : `${files.length} shipped file(s) checked`,
  },
  {
    claim: 'no command is built from a string',
    ok: offenders.stringCommand.length === 0,
    detail: offenders.stringCommand.length
      ? offenders.stringCommand.join(', ')
      : 'every call passes an argument array',
  },
];

for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.claim}`);
  console.log(`          ${result.detail}`);
}
const failed = results.filter((result) => !result.ok);
console.log(`${String.fromCharCode(10)}shell: ${results.length - failed.length}/${results.length} verified`);
if (failed.length) {
  console.log(`${String.fromCharCode(10)}SECURITY.md tells readers neither of these happens. Either this is wrong,`);
  console.log('or that page is -- and a security page that is wrong is worse than none.');
  process.exit(1);
}
