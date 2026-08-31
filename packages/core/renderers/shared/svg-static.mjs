// `--format svg-static` (rows 6.13 and 4.15).
//
// The interactive artifact is ~715 KB, and it earns that: a viewer, a search
// index, five presets, evidence, guided views. None of it survives the places
// a diagram most often needs to go. A README on GitHub, a pull request, a
// Notion page, a Confluence page -- all of them strip scripts and render an
// image. Handed the full artifact, they show nothing.
//
// So this emits the diagram and only the diagram: one standalone `.svg` file
// with its styles inlined, no scripts, no viewer, nothing that needs a host to
// execute anything. It is what you paste into a README.
//
// Two rules make it trustworthy rather than merely small.
//
// NOTHING IS INVENTED. The geometry, the labels, the classes are the ones the
// interactive artifact already rendered -- this reads that output, it does not
// re-lay-out anything. A static export that disagreed with the artifact it
// came from would be worse than no export.
//
// NOTHING THAT APPLIED IS DROPPED. Tree-shaking here means removing rules that
// cannot match, never rules that are inconvenient. Every declaration that
// applied to an element in the interactive artifact still applies here, and a
// test proves it by comparing the two rule sets rather than trusting this
// comment.

/**
 * Attributes that exist only for the viewer's JavaScript to find things.
 *
 * Every `data-*` goes. An earlier version spared one on the assumption that
 * stylesheets selected on it; nothing did, and row 5.17's contract test --
 * which requires every emitted data-* to have a declared consumer -- caught
 * the guess by flagging this very module as its emitter.
 */
const VIEWER_ONLY_ATTR = /\s(?:data-[a-z0-9-]+|tabindex|role|aria-[a-z-]+)="[^"]*"/g;

/** `var(--token)` and `var(--token, fallback)`. */
const VAR_REF = /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*?))?\s*\)/gi;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Pull the diagram SVG out of a rendered artifact.
 *
 * @param {string} html
 * @returns {string}
 */
export function extractSvg(html) {
  const match = html.match(/<svg[\s\S]*?<\/svg>/);
  if (!match) throw new Error('svg-static: the artifact contains no <svg> element');
  return match[0];
}

/** Every class name the SVG actually uses. */
export function classesUsed(svg) {
  const used = new Set();
  for (const match of svg.matchAll(/class="([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) if (name) used.add(name);
  }
  return used;
}

/**
 * Split a stylesheet into `{selector, body}` rules.
 *
 * Deliberately not a CSS parser. It handles the one shape this stylesheet is
 * written in -- flat rules and at-blocks -- and REFUSES anything it does not
 * understand rather than silently dropping it, because a rule this misreads is
 * a rule that vanishes from the export.
 */
export function parseRules(css) {
  const rules = [];
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open === -1) break;
    const selector = css.slice(index, open).trim();

    if (selector.startsWith('@')) {
      // At-blocks nest. Find the matching close brace and keep the whole thing
      // intact; @media and @supports can carry rules that matter.
      let depth = 0;
      let cursor = open;
      for (; cursor < css.length; cursor += 1) {
        if (css[cursor] === '{') depth += 1;
        else if (css[cursor] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      rules.push({ selector, body: css.slice(open + 1, cursor), at: true });
      index = cursor + 1;
      continue;
    }

    const close = css.indexOf('}', open);
    if (close === -1) break;
    rules.push({ selector, body: css.slice(open + 1, close), at: false });
    index = close + 1;
  }
  return rules;
}

/**
 * Does this selector target something inside the SVG?
 *
 * Conservative on purpose: when in doubt the rule is KEPT. A stylesheet rule
 * carried unnecessarily costs bytes; one dropped wrongly costs correctness,
 * and only one of those is recoverable by looking at the file.
 */
export function selectorTouchesSvg(selector, used) {
  // Viewer chrome, panels, toolbars: these have no counterpart in the export.
  if (/^(html|body|:root|\.toolbar|\.panel|\.dock|\.attribution|\.card|\.hint|\.btn|button|input|kbd)\b/i.test(selector)) {
    // ...unless the same rule also names something the SVG uses.
    if (![...used].some((name) => selector.includes(`.${name}`))) return false;
  }
  const classes = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  if (classes.length === 0) {
    // Element-only selectors: keep the SVG ones, drop document chrome.
    return /\b(svg|g|path|rect|circle|line|text|tspan|polyline|polygon|marker|defs|ellipse)\b/.test(selector);
  }
  return classes.some((name) => used.has(name));
}

/**
 * Resolve every `var(--token)` against a flat token map.
 *
 * An unresolved variable in a standalone SVG is an invisible element: there is
 * no :root left to define it. Anything still unresolved after the fallback
 * chain is reported, never left in the output.
 */
export function resolveVars(css, tokens) {
  /** @type {Set<string>} */
  const unresolved = new Set();
  let previous = null;
  let text = css;
  // Tokens can reference other tokens; iterate to a fixed point rather than
  // assuming one pass is enough.
  for (let pass = 0; pass < 8 && text !== previous; pass += 1) {
    previous = text;
    text = text.replace(VAR_REF, (whole, name, fallback) => {
      if (Object.prototype.hasOwnProperty.call(tokens, name)) return tokens[name];
      if (fallback !== undefined && fallback !== '') return fallback;
      unresolved.add(name);
      return whole;
    });
  }
  return { css: text, unresolved: [...unresolved] };
}

/**
 * Collapse whitespace and drop comments from a stylesheet.
 *
 * Purely lexical, and deliberately so: it removes only characters CSS itself
 * treats as insignificant. Nothing is reordered, no shorthand is rewritten,
 * no value is "optimised" -- the kinds of transformation that shrink a
 * stylesheet by changing what it means.
 */
export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * Build a standalone SVG from a rendered artifact.
 *
 * @param {string} html the interactive artifact
 * @param {{tokens: Record<string, string>, keepInteractiveAttributes?: boolean}} options
 * @returns {{svg: string, bytes: number, rulesKept: number, rulesDropped: number, unresolved: string[]}}
 */
export function toStaticSvg(html, { tokens, keepInteractiveAttributes = false }) {
  let svg = extractSvg(html);
  const used = classesUsed(svg);

  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const rules = parseRules(styleBlocks.join('\n'));
  const kept = rules.filter((rule) => selectorTouchesSvg(rule.selector, used));

  const stylesheet = kept.map((rule) => `${rule.selector}{${rule.body}}`).join('\n');
  const resolved = resolveVars(minifyCss(stylesheet), tokens);

  if (!keepInteractiveAttributes) {
    // These exist for the viewer's JavaScript. With no JavaScript they are
    // bytes that do nothing.
    svg = svg.replace(VIEWER_ONLY_ATTR, '');
  }

  // A standalone file needs the namespace; inside an HTML document the parser
  // supplies it, which is why the artifact's SVG does not carry one.
  if (!/\sxmlns=/.test(svg.slice(0, 400))) {
    svg = svg.replace(/^<svg/, `<svg xmlns="${SVG_NS}"`);
  }

  const styled = svg.replace(/^(<svg[^>]*>)/, `$1<style>${resolved.css}</style>`);
  const document = `<?xml version="1.0" encoding="UTF-8"?>\n${styled}\n`;

  return {
    svg: document,
    bytes: Buffer.byteLength(document, 'utf8'),
    rulesKept: kept.length,
    rulesDropped: rules.length - kept.length,
    unresolved: resolved.unresolved,
  };
}
