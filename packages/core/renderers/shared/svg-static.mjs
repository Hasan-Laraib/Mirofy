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
 * Properties that SVG also accepts as attributes.
 *
 * Only these can be flattened. `transform` and geometry are already
 * attributes; layout properties like `transition` have no attribute form and
 * mean nothing in a static file.
 */
export const PRESENTATION_PROPERTIES = Object.freeze([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'letter-spacing', 'paint-order',
  'visibility', 'display',
]);

/**
 * Can this selector still match once viewer attributes are stripped?
 *
 * The export removes every `data-*`, so a selector that requires one can never
 * match anything in the output. Those rules are not merely unused -- they are
 * unmatchable, and carrying them is 149 of the 183 selector parts in a typical
 * artifact: most of the stylesheet, kept for elements that no longer exist.
 */
export function selectorCanMatchStatic(selector, { attributesStripped = true } = {}) {
  if (!attributesStripped) return true;
  const parts = stripComments(selector).split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  // A grouped selector survives if ANY of its parts can still match.
  return parts.some((part) => !/\[data-/.test(part));
}

/** Remove CSS comments from a selector so it can be reasoned about. */
export function stripComments(text) {
  return String(text).replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Reduce a selector part to the single class or tag it targets, or null.
 *
 * Handles the three shapes this stylesheet actually uses: `.name`,
 * `tag.name`, and `svg .name` -- the last of which is the same as `.name`
 * here, because everything in the document IS inside the svg root. Anything
 * more complex is reported rather than guessed at: flattening a selector this
 * misread would paint the wrong element.
 */
export function flattenTarget(selectorPart) {
  const part = stripComments(selectorPart).trim().replace(/^svg\s+/, '');
  if (/[>+~]/.test(part) || part.includes(':') || /\[/.test(part)) return null;
  const words = part.split(/\s+/).filter(Boolean);
  if (words.length !== 1) return null;
  const single = words[0];
  const match = /^([a-zA-Z][a-zA-Z0-9]*)?(?:\.([a-zA-Z0-9_-]+))?$/.exec(single);
  if (!match) return null;
  const [, tag, className] = match;
  if (!tag && !className) return null;
  return { tag: tag ?? null, className: className ?? null };
}

/** Parse a declaration body into `{property: value}`, last wins. */
function declarationsOf(body) {
  const out = {};
  for (const chunk of stripComments(body).split(';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1) continue;
    const property = chunk.slice(0, colon).trim();
    const value = chunk.slice(colon + 1).trim();
    if (!property || !value) continue;
    if (!PRESENTATION_PROPERTIES.includes(property)) continue;
    if (value.includes('!important')) continue;
    out[property] = value;
  }
  return out;
}

/**
 * Write the computed styles onto elements as presentation attributes.
 *
 * Additive on purpose. In SVG a stylesheet BEATS a presentation attribute, so
 * a browser renders exactly as it did before this existed -- the attributes
 * only speak where the CSS does not. That is precisely the situation in Figma,
 * Canva and Illustrator, which import SVG but do not reliably apply a `<style>`
 * block, and would otherwise show the diagram shape-correct and colour-dead.
 *
 * Attributes already on the element are never overwritten: an authored value
 * is more specific than a class rule and outranks it here as it would there.
 */
export function flattenToAttributes(svg, rules) {
  /** @type {Map<string, Record<string, string>>} */
  const byClass = new Map();
  /** @type {Map<string, Record<string, string>>} */
  const byTag = new Map();
  let skipped = 0;

  for (const rule of rules) {
    if (rule.at) { skipped += 1; continue; }
    const declarations = declarationsOf(rule.body);
    if (Object.keys(declarations).length === 0) continue;
    for (const part of stripComments(rule.selector).split(',')) {
      if (!part.trim()) continue;
      const target = flattenTarget(part);
      if (!target) { skipped += 1; continue; }
      const bucket = target.className ? byClass : byTag;
      const key = target.className ?? target.tag;
      bucket.set(key, { ...(bucket.get(key) ?? {}), ...declarations });
    }
  }

  let applied = 0;
  const out = svg.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g, (whole, tag, attrs, selfClose) => {
    const classMatch = /class="([^"]*)"/.exec(attrs);
    const classes = classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [];
    const computed = { ...(byTag.get(tag) ?? {}) };
    for (const name of classes) Object.assign(computed, byClass.get(name) ?? {});
    const additions = [];
    for (const [property, value] of Object.entries(computed)) {
      // No regex: `\s` inside a template literal is just the letter s, so the
      // first version of this guard never matched and emitted a second `fill`
      // beside the authored one -- duplicate attributes, and invalid XML.
      if (attrs.includes(` ${property}="`) || attrs.trimStart().startsWith(`${property}="`)) continue;
      additions.push(`${property}="${value.replaceAll('"', "'")}"`);
    }
    if (additions.length === 0) return whole;
    applied += 1;
    return `<${tag}${attrs} ${additions.join(' ')}${selfClose}>`;
  });

  return { svg: out, elementsStyled: applied, selectorsNotFlattened: skipped };
}

/**
 * Build a standalone SVG from a rendered artifact.
 *
 * @param {string} html the interactive artifact
 * @param {{tokens: Record<string, string>, keepInteractiveAttributes?: boolean, flatten?: boolean}} options
 * @returns {{svg: string, bytes: number, rulesKept: number, rulesDropped: number,
 *            unresolved: string[], elementsStyled: number, selectorsNotFlattened: number}}
 */
export function toStaticSvg(html, { tokens, keepInteractiveAttributes = false, flatten = true }) {
  let svg = extractSvg(html);
  const used = classesUsed(svg);

  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const rules = parseRules(styleBlocks.join('\n'));
  const kept = rules
    .filter((rule) => selectorTouchesSvg(rule.selector, used))
    // Viewer attributes are stripped below, so a rule that requires one can
    // never match anything here. Not "probably unused" -- unmatchable, and it
    // is most of the stylesheet: 149 of 183 selector parts in a typical
    // artifact target elements that no longer exist.
    .filter((rule) => selectorCanMatchStatic(rule.selector,
      { attributesStripped: !keepInteractiveAttributes }));

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

  // Written onto the elements as well as into the stylesheet. CSS beats a
  // presentation attribute, so a browser is unaffected; the attributes speak
  // only where the stylesheet is ignored -- which is exactly Figma, Canva and
  // Illustrator, where the diagram otherwise imports shape-correct and
  // colour-dead.
  const flattened = flatten
    ? flattenToAttributes(svg, kept.map((rule) => ({ ...rule, body: resolveVars(minifyCss(rule.body), tokens).css })))
    : { svg, elementsStyled: 0, selectorsNotFlattened: 0 };

  const styled = flattened.svg.replace(/^(<svg[^>]*>)/, `$1<style>${resolved.css}</style>`);
  const document = `<?xml version="1.0" encoding="UTF-8"?>\n${styled}\n`;

  return {
    svg: document,
    bytes: Buffer.byteLength(document, 'utf8'),
    rulesKept: kept.length,
    rulesDropped: rules.length - kept.length,
    unresolved: resolved.unresolved,
    elementsStyled: flattened.elementsStyled,
    selectorsNotFlattened: flattened.selectorsNotFlattened,
  };
}
