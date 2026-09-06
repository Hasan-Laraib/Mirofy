// Whether a commit was made by automation rather than a person.
//
// A bot cannot write a changelog entry, so demanding one from it makes the
// freshness gate unpassable rather than informative. Every open Dependabot pull
// request failed on exactly that: the bump touches .github, becomes the newest
// change to watched code, and asks for prose its author cannot write.
//
// A dependency bump still belongs in the record. It goes in at release time,
// written by the person who decided to ship it, which is where a reader can be
// told why it mattered.
//
// Substrings rather than a regular expression on purpose. The pattern needs a
// literal "[bot]", and an escaped character class is the single most reliable
// way to get this wrong: `/\[bot\]/` losing its backslashes becomes `/[bot]/`,
// which matches any name containing b, o or t -- including this repository's
// own author -- and silently turns the gate into a pass.
const AUTOMATED = ['[bot]', 'dependabot', 'renovate', 'github-actions'];

/**
 * @param {string} name commit author name
 * @param {string} email commit author email
 * @returns {boolean}
 */
export function isAutomated(name, email) {
  const who = `${name ?? ''} ${email ?? ''}`.toLowerCase();
  return AUTOMATED.some((mark) => who.includes(mark));
}
