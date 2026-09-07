// server.json is what the MCP registry publishes, and every field in it is a
// claim about a package that exists somewhere else.
//
// Three of those claims can drift silently, and drift here is not cosmetic: the
// registry verifies ownership by matching `mcpName` in the npm package against
// `name` here, and clients install the `version` this file states. A mismatch
// is either a rejected publish or, worse, an accepted entry pointing at a
// version nobody can install.
//
// This project has produced exactly this bug twice in one day -- SKILL.md said
// 0.1.0 while the package was 0.5.5, and pipeline.svg said 14 gaps while the
// scan said 15. Both were caught by a gate. This is that gate for server.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = JSON.parse(fs.readFileSync(path.join(repoRoot, 'server.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/core/package.json'), 'utf8'));

const results = [];
const check = (claim, ok, detail) => results.push({ claim, ok, detail });

check('the registry name matches the package that proves ownership',
  server.name === pkg.mcpName,
  server.name === pkg.mcpName
    ? `both say ${server.name}`
    : `server.json says ${server.name}; package.json mcpName says ${pkg.mcpName ?? '(absent)'}`);

const npmPackage = (server.packages ?? []).find((entry) => entry.registryType === 'npm');
check('it points at this package',
  npmPackage?.identifier === pkg.name,
  npmPackage ? `identifier ${npmPackage.identifier}, package ${pkg.name}` : 'no npm package entry');

check('the version it advertises is the version being published',
  server.version === pkg.version && npmPackage?.version === pkg.version,
  `server.json ${server.version}, package entry ${npmPackage?.version}, package.json ${pkg.version}`);

// The launch line is the whole point of the entry. If the argument that selects
// the MCP subcommand goes missing, clients start the CLI with no command and
// get usage text on stdout -- which is a parse error in the client.
const args = (npmPackage?.packageArguments ?? []).map((a) => a.value);
check('it starts the MCP server rather than the bare CLI',
  args.includes('mcp'),
  args.length ? `arguments: ${args.join(' ')}` : 'no packageArguments; the client would run the CLI with no command');

for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.claim}`);
  console.log(`          ${result.detail}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`${String.fromCharCode(10)}server.json: ${results.length - failed.length}/${results.length} verified`);
if (failed.length) process.exit(1);
