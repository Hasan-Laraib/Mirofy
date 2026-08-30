// Markdown -> HTML -> PDF via the Chrome client the repo already drives for
// visual-check and the axe gate. The PDFs were previously produced by an
// unknown external tool and had no reproducible path; from here they are
// generated artifacts with a committed source of truth.
//
// Not wired into `npm run check`: generation needs a real Chrome, and the
// output is a build artifact rather than a source of truth. This is an
// operator command, run by hand after editing any of the source .md files it
// concatenates.
//
// Scope note: this renders the analysis corpus that is tracked in this
// repository, under docs/analysis/. An earlier version also rendered a
// second, larger PDF from documents held outside the repo; those sources are
// not in the tree and cannot be resolved from it, so that output is not
// produced here.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const visualCheck = pathToFileURL(path.join(repoRoot, 'packages/core/bin/visual-check.mjs')).href;
const { ChromeVisualBrowser, findChrome } = await import(visualCheck);

/** @type {Array<[string, string, string]>} */
const DOCS = [
  ['System-Intelligence-Plan', path.join(repoRoot, 'docs/analysis'), 'Mirofy — System Intelligence Plan'],
];

const OUT_DIR = process.env.MIROFY_DOCS_PDF_OUT || path.join(repoRoot, 'docs/analysis/pdf');

// The declared per-PDF file order, recovered from the EXISTING PDFs'
// structure (Step 6's first-choice source): both carry a literal table of
// contents naming every source file in the order it was rendered ("Part
// I..VII" headers in System-Intelligence-Plan.pdf; a "Contents" page in
// System-Intelligence-Corpus.pdf), so neither had to fall back to
// 00-INDEX.md's reading order. Paths are relative to each DOC's sourceDir
// above. Note the two PDFs do not agree with each other on the relative
// order of 34 (Competitive Positioning) and 37 (Engineering Standards) --
// that inconsistency is preserved here rather than "corrected", because it
// is itself evidence for why this task exists: the previous generator had
// no single, recoverable ordering rule, only whatever it happened to do
// each time.
const ORDER = {
  'System-Intelligence-Plan': [
    '30-PRODUCT-THESIS.md',
    '32-PARITY-AND-FEATURE-MATRIX.md',
    '33-MASTER-ROADMAP.md',
    '36-VISUAL-SYSTEM.md',
    '31-V1-ARCHITECTURE.md',
    '37-ENGINEERING-STANDARDS.md',
  ],
};

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function buildHtml(title, files) {
  const sections = files.map(({ relPath, markdown }) =>
    `<section class="doc-file" data-source="${htmlEscape(relPath)}">\n${marked.parse(markdown)}\n</section>`).join('\n');
  const generatedAt = new Date().toISOString();
  const toc = files.map(({ relPath }) => `<li>${htmlEscape(relPath)}</li>`).join('\n    ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${htmlEscape(title)}</title>
<style>
  @page { size: A4; margin: 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 0; }
  h1, h2, h3, h4 { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #10141c; }
  h1 { font-size: 20pt; margin: 0 0 10pt; page-break-before: always; }
  .doc-cover h1, section.doc-file:first-of-type > h1:first-child { page-break-before: avoid; }
  h2 { font-size: 15pt; margin: 18pt 0 6pt; }
  h3 { font-size: 12.5pt; margin: 14pt 0 4pt; }
  p, li { font-size: 10.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; page-break-inside: avoid; font-size: 9.5pt; }
  th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eee; }
  pre, code { font-family: Consolas, 'SFMono-Regular', monospace; font-size: 9pt; }
  pre {
    background: #f4f4f4; border: 1px solid #ddd; border-radius: 4px; padding: 8pt;
    white-space: pre-wrap; word-break: break-word; page-break-inside: avoid;
  }
  code { background: #f0f0f0; padding: 1px 3px; border-radius: 3px; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ccc; margin: 8pt 0; padding: 2pt 10pt; color: #444; }
  a { color: #0b5fa5; text-decoration: none; }
  img { max-width: 100%; }
  .doc-cover { page-break-after: always; }
  .doc-cover h1 { font-size: 26pt; }
  .doc-cover .meta { color: #555; font-size: 10pt; margin-top: 24pt; }
</style>
</head>
<body>
<div class="doc-cover">
  <h1>${htmlEscape(title)}</h1>
  <p class="meta">Generated ${htmlEscape(generatedAt)} by scripts/docs-pdf.mjs from ${files.length} source document${files.length === 1 ? '' : 's'}.</p>
  <ol class="meta">
    ${toc}
  </ol>
</div>
${sections}
</body>
</html>
`;
}

async function printToPdf(browser, sessionId, fileUrl) {
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId, 30000);
  const navigation = await browser.cdp.send('Page.navigate', { url: fileUrl }, sessionId);
  if (navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
  await loaded;
  const result = await browser.cdp.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.4,
    marginBottom: 0.4,
    marginLeft: 0.3,
    marginRight: 0.3,
  }, sessionId, 60000);
  if (!result.data) throw new Error('Chrome returned an empty PDF.');
  return Buffer.from(result.data, 'base64');
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('docs:pdf: no Chrome found. Set MIROFY_CHROME=<path to a Chrome/Chromium executable> and retry.');
    console.error('Refusing to emit a partial PDF -- a silently truncated PDF is worse than none.');
    process.exit(1);
  }

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirofy-docs-pdf-'));
  let browser;
  try {
    browser = new ChromeVisualBrowser(chrome);
    const sessionId = await browser.sessionPromise;
    for (const [basename, sourceDir, title] of DOCS) {
      const order = ORDER[basename];
      if (!order) throw new Error(`docs:pdf: no declared file order for "${basename}".`);
      const files = order.map((relPath) => ({
        relPath,
        markdown: fs.readFileSync(path.join(sourceDir, relPath), 'utf8'),
      }));
      const html = buildHtml(title, files);
      const htmlPath = path.join(scratchDir, `${basename}.html`);
      fs.writeFileSync(htmlPath, html);

      const pdf = await printToPdf(browser, sessionId, pathToFileURL(htmlPath).href);

      fs.mkdirSync(OUT_DIR, { recursive: true });
      const outPath = path.join(OUT_DIR, `${basename}.pdf`);
      const tmpOut = `${outPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmpOut, pdf);
      fs.renameSync(tmpOut, outPath);
      console.log(`docs:pdf: wrote ${outPath} (${(pdf.length / 1024 / 1024).toFixed(2)} MB, ${files.length} source files)`);
    }
  } finally {
    if (browser) await browser.close();
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

await main();
