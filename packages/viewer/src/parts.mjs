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
  { kind: 'file', path: 'js/01-preamble.js' },
  { kind: 'file', path: 'js/02-preset.js' },
  { kind: 'file', path: 'js/03-theme.js' },
  { kind: 'file', path: 'js/04-export.js' },
  { kind: 'file', path: 'js/05-motion-governor.js' },
  { kind: 'file', path: 'js/06-source-evidence.js' },
  { kind: 'file', path: 'js/07-focus.js' },
  { kind: 'file', path: 'js/08-intent-trace.js' },
  { kind: 'file', path: 'js/09-guided-views.js' },
  { kind: 'file', path: 'js/10-reader-layout.js' },
  { kind: 'file', path: 'js/11-chrome-layout.js' },
  { kind: 'file', path: 'js/12-camera.js' },
  { kind: 'file', path: 'js/13-radar.js' },
  { kind: 'file', path: 'js/14-presentation.js' },
  { kind: 'file', path: 'js/15-finder.js' },
  { kind: 'file', path: 'js/16-route-probe.js' },
  { kind: 'file', path: 'js/17-semantic-lens.js' },
  { kind: 'file', path: 'js/18-guide.js' },
  { kind: 'file', path: 'js/19-bootstrap.js' },
  { kind: 'literal', text: '  </script>\n' },
  { kind: 'file', path: 'html/03-tail.html' },
];
