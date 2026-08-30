// The roadmap side of docs/IMPLEMENTATION-STATUS.md's PLANNED section: the
// parser, the path, and a live read of the roadmap document.
//
// This module used to carry a frozen 118-row copy of the roadmap, because
// the document lived outside this repository and CI -- which checks out
// this repo alone -- could not see it. The document is now tracked in-tree
// at docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md, so the copy is gone and
// the rows are parsed from the file on every run.
//
// That retires the drift problem the copy created rather than solving:
// a frozen array can go stale silently, and nothing re-checked it. There is
// now nothing to go stale. `npm run status:check`, already part of
// `npm run check`, regenerates IMPLEMENTATION-STATUS.md from these rows and
// fails the build when the committed file no longer matches -- so editing a
// roadmap row without regenerating is now a build failure, not a silent
// divergence.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ROADMAP_PATH = path.join(repoRoot, 'docs/analysis/32-PARITY-AND-FEATURE-MATRIX.md');

// Matches a roadmap table row: "| <id> | <name> | **<origin>** | <phase> |
// ...". id is N or N.N or N.Na (e.g. "3.1b"); origin is one of H, R, N,
// H→R, optionally wrapped in `**`; phase is P0-P9, optionally wrapped in
// `**`. Bold markers, backticks, and the "⭐" callout marker are stripped
// from the name; surrounding whitespace is trimmed.
/** @type {(text: string) => Array<[string, string, string, string]>} */
export function parseRoadmapTable(text) {
  /** @type {Array<[string, string, string, string]>} */
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*([0-9]+(?:\.[0-9]+[a-z]?)?)\s*\|\s*(.+?)\s*\|\s*\*{0,2}(H→R|H|R|N)\*{0,2}\s*\|\s*\*{0,2}(P[0-9])\*{0,2}\s*\|/,
    );
    if (!match) continue;
    const name = match[2].replace(/\*\*/g, '').replace(/`/g, '').replace(/⭐/g, '').trim();
    rows.push([match[1], name, match[3], match[4]]);
  }
  return rows;
}

export function readRoadmap(filePath = DEFAULT_ROADMAP_PATH) {
  return parseRoadmapTable(fs.readFileSync(filePath, 'utf8'));
}

/** @type {Array<[string, string, string, string]>} */
export const ROADMAP_ROWS = readRoadmap();
