import { BLOCKS, SUFFIX } from './tokens.mjs';

// Reproduces the palette CSS byte-for-byte from BLOCKS. Every block's
// `prefix` (a blank line, and for the first block of each preset group,
// that group's banner comment) and `body` (the raw declaration text,
// including mid-block comments, blank lines, and column alignment that
// :root/[data-theme="dark"] and [data-theme="light"] carry) are stored
// verbatim, so reconstruction is plain concatenation -- no whitespace or
// comment text is synthesized here. check:template compares bytes and
// does not care that a comment is "just" a comment.
export function emitPalette() {
  const body = BLOCKS.map(({ prefix, selector, body }) => `${prefix}${selector}{\n${body}    }`).join('');
  return `${body}${SUFFIX}`;
}
