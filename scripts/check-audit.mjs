// Dependency advisories, with the two failures kept apart.
//
// `npm audit --audit-level=high` conflates two outcomes under one exit code:
// a high-severity advisory against something we ship, and npm's advisory
// endpoint being unreachable. They deserve opposite treatment.
//
// A vulnerability must stop a release. An outage must not -- on 2026-09-04 the
// bulk advisories endpoint timed out and the 0.5.1 publish workflow died at this
// step with "Nothing was published", holding a release hostage to someone else's
// incident. But an outage must never pass QUIETLY either, because a gate that
// reports success when it did not run is worse than no gate: it is a gate that
// lies. So an unreachable endpoint prints UNVERIFIED, in the same shape as a
// failure, and says plainly that nothing was checked.
//
// The decision is separated from the subprocess so both branches can be tested.
// An outage is not something a test can wait for.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { npmCli } from './lib/npm-cli.mjs';

const BLOCKING = ['high', 'critical'];

/**
 * What the audit output means.
 *
 * @param {object|null} report parsed `npm audit --json`, or null if unparseable
 * @param {string} stderr whatever npm said on the way out
 * @returns {{state: 'ok'|'fail'|'unverified', claim: string, detail: string}}
 */
export function verdict(report, stderr = '') {
  // A genuine advisory run always carries the vulnerability tally. Its presence
  // is the only reliable signal that the audit actually happened -- npm exits
  // non-zero for both a finding and an outage, and prints JSON for both.
  const counts = report && report.metadata && report.metadata.vulnerabilities;
  if (!counts) {
    // npm puts the real reason in `message` on a transport failure; error.summary
    // and error.detail are both present and both empty. A run also carries npm
    // warnings that have nothing to do with the audit, so the fallback reason is
    // the first line that actually mentions one.
    const fromStderr = String(stderr)
      .split(String.fromCharCode(10))
      .filter((line) => /audit/i.test(line))
      .map((line) => line.replace(/^npm (error|warn) /, '').trim())
      .filter(Boolean);
    const why = (report && report.message)
      || (report && report.error && (report.error.summary || report.error.detail))
      || fromStderr[0]
      || 'npm audit produced no report';
    return { state: 'unverified', claim: 'dependency advisories were checked', detail: `NOT CHECKED — ${why}` };
  }

  const tally = Object.entries(counts)
    .filter(([level, n]) => level !== 'total' && n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(', ') || 'none at any severity';
  const claim = 'no high or critical advisory against anything we ship';
  const blocking = BLOCKING.reduce((total, level) => total + (counts[level] || 0), 0);
  if (blocking === 0) return { state: 'ok', claim, detail: tally };

  const named = Object.entries((report && report.vulnerabilities) || {})
    .filter(([, entry]) => BLOCKING.includes(entry && entry.severity))
    .map(([name, entry]) => `${name} (${entry.severity})`)
    .slice(0, 8);
  return { state: 'fail', claim, detail: `${tally}${named.length ? ` — ${named.join(', ')}` : ''}` };
}

const MARK = { ok: 'ok  ', fail: 'FAIL', unverified: 'UNVERIFIED' };
const NL = String.fromCharCode(10);

function main() {
  // Windows will not spawn npm.cmd without a shell; npm-cli.js on this Node works
  // everywhere. Failing to find it is OUR problem, not the registry being down --
  // reporting that as UNVERIFIED would leave the gate permanently not-running.
  const cli = npmCli();
  const run = cli
    ? spawnSync(process.execPath, [cli, 'audit', '--json'], { encoding: 'utf8' })
    : spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' });
  if (run.error) {
    console.log('  FAIL  the audit could be run at all');
    console.log(`          npm could not be started: ${run.error.message}`);
    console.log(`${NL}audit: 0/1 verified`);
    return 1;
  }

  let report = null;
  try { report = JSON.parse(run.stdout); } catch { report = null; }
  const result = verdict(report, run.stderr || '');
  console.log(`  ${MARK[result.state]}  ${result.claim}`);
  console.log(`          ${result.detail}`);

  if (result.state === 'unverified') {
    console.log(`${NL}audit: 0/1 verified, 1 unverified`);
    console.log(`${NL}The advisory endpoint could not be reached, so no dependency was`);
    console.log('checked against it. This does not block the release, and it is not a');
    console.log('pass — re-run once the registry is healthy before trusting it.');
    return 0;
  }
  console.log(`${NL}audit: ${result.state === 'ok' ? 1 : 0}/1 verified`);
  return result.state === 'ok' ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
