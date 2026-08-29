// The single declaration of assembly order. build.mjs walks this list and
// concatenates; nothing else decides what goes where. The `literal` entries
// are the tag wrappers that live in the generated file but not in any source
// part -- keeping them here means the parts stay pure JS/CSS/HTML fragments
// that an editor and a linter can handle.
export const PARTS = [
  { kind: 'file', path: 'html/00-head.html' },
  { kind: 'literal', text: '  <script>\n' },
  { kind: 'file', path: 'js/boot.js' },
  { kind: 'literal', text: '  </script>\n' },
  { kind: 'file', path: 'html/01-head-tail.html' },
  { kind: 'literal', text: '  <style>\n' },
  { kind: 'file', path: 'css/viewer.css' },
  { kind: 'literal', text: '  </style>\n' },
  { kind: 'file', path: 'html/02-markup.html' },
  { kind: 'literal', text: '  <script>\n' },
  { kind: 'file', path: 'js/viewer.js' },
  { kind: 'literal', text: '  </script>\n' },
  { kind: 'file', path: 'html/03-tail.html' },
];
