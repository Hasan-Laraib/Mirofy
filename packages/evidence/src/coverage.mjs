// The honest coverage report (row 2.17). The spec's one-line contract:
// "What was derived, inferred, and not analysed. Never a fabricated
// percentage."
//
// The report is a PARTITION: every file lands in exactly one of three
// buckets, and the buckets sum to the file list. A file that appears twice
// or not at all is a lie about coverage, and the tests assert the sum.
//
//   analysed     — at least one adapter examined it and hit no gap there
//   gapped       — some adapter recorded a Gap for it (a partial analysis is
//                  not a complete one, so a gap outranks a clean pass by a
//                  different adapter)
//   not analysed — no adapter examined it at all
//
// No percentages, anywhere. "82% covered" silently claims the denominator is
// the whole system; a count with a stated denominator makes the same
// information honest.

/**
 * @param {{gaps: () => Array<{path: string, reason: string, adapter: string}>}} graph
 * @param {{inventories: Record<string, string[]>, allFiles: string[]}} input
 *        inventories: per-adapter, every file that adapter examined.
 *        allFiles: the full candidate list the scan walked.
 * @returns {{analysed: Array<{path: string, adapters: string[]}>,
 *            gapped: Array<{path: string, reasons: string[], adapters: string[]}>,
 *            notAnalysed: string[],
 *            totalFiles: number}}
 */
export function coverageReport(graph, { inventories, allFiles }) {
  const examinedBy = new Map(); // path -> Set<adapterId>
  for (const [adapter, files] of Object.entries(inventories)) {
    for (const file of files) {
      if (!examinedBy.has(file)) examinedBy.set(file, new Set());
      examinedBy.get(file).add(adapter);
    }
  }

  const gapsByPath = new Map(); // path -> {reasons, adapters}
  for (const gap of graph.gaps()) {
    if (!gapsByPath.has(gap.path)) gapsByPath.set(gap.path, { reasons: [], adapters: new Set() });
    const entry = gapsByPath.get(gap.path);
    entry.reasons.push(gap.reason);
    entry.adapters.add(gap.adapter);
  }

  // The universe is everything: the walked list, plus anything an adapter
  // examined or gapped that the walk missed. Nothing gets to fall between.
  const universe = new Set([...allFiles, ...examinedBy.keys(), ...gapsByPath.keys()]);

  const analysed = [];
  const gapped = [];
  const notAnalysed = [];
  for (const path of [...universe].sort()) {
    if (gapsByPath.has(path)) {
      const entry = gapsByPath.get(path);
      gapped.push({ path, reasons: [...entry.reasons], adapters: [...entry.adapters].sort() });
    } else if (examinedBy.has(path)) {
      analysed.push({ path, adapters: [...examinedBy.get(path)].sort() });
    } else {
      notAnalysed.push(path);
    }
  }

  return { analysed, gapped, notAnalysed, totalFiles: universe.size };
}

/**
 * Render the report as Markdown. Counts with stated denominators; no
 * percentage anywhere; the not-analysed files are NAMED, because a summary
 * ("37 files skipped") is where omissions go to hide.
 *
 * @param {ReturnType<typeof coverageReport>} report
 * @returns {string}
 */
export function renderCoverage(report) {
  const lines = [];
  lines.push('# Coverage');
  lines.push('');
  lines.push(`Of ${report.totalFiles} files: ${report.analysed.length} analysed, `
    + `${report.gapped.length} with gaps, ${report.notAnalysed.length} not analysed.`);
  lines.push('');
  lines.push('No percentage is given on purpose: a percentage silently claims its');
  lines.push('denominator is the whole system. The counts above state theirs.');
  lines.push('');

  lines.push(`## Analysed (${report.analysed.length} of ${report.totalFiles} files)`);
  lines.push('');
  for (const entry of report.analysed) {
    lines.push(`- \`${entry.path}\` — ${entry.adapters.join(', ')}`);
  }
  lines.push('');

  lines.push(`## Gaps (${report.gapped.length} of ${report.totalFiles} files)`);
  lines.push('');
  lines.push('Analysis stopped here and says so. A gap is not an error; it is the');
  lines.push('honest record of what static analysis cannot know.');
  lines.push('');
  for (const entry of report.gapped) {
    lines.push(`- \`${entry.path}\``);
    for (const reason of entry.reasons) lines.push(`  - ${reason}`);
  }
  lines.push('');

  lines.push(`## Not analysed (${report.notAnalysed.length} of ${report.totalFiles} files)`);
  lines.push('');
  lines.push('No adapter examined these at all.');
  lines.push('');
  for (const path of report.notAnalysed) lines.push(`- \`${path}\``);
  lines.push('');

  return lines.join('\n');
}
