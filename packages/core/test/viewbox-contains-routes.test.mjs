// A diagram has to fit inside the box that clips it.
//
// The viewBox was measured from components and boundaries only. Connections
// routed through the gutter drop below the lowest component on purpose -- that
// empty band between columns is the only way past a full column -- so the
// measurement missed them, and the edge was cut off at the bottom of the frame.
// Twelve of thirteen real repositories drew one, on screen and in every
// exported PNG alike.
//
// This reads the renderer's own layout report rather than parsing path data:
// `d` attributes mix absolute, relative, arc and shorthand commands, and a
// regex over their numbers reports a point 9,000 units below a 640-unit
// diagram. The report states the geometry the renderer used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const examples = fs.readdirSync(path.join(root, 'examples'))
  .filter((name) => name.endsWith('.architecture.json'));

/** @param {string} example @returns {{viewBox: number[], connections: object[]}} */
function layoutOf(example) {
  const out = execFileSync(process.execPath, [
    path.join(root, 'bin', 'mirofy.mjs'),
    'validate', 'architecture',
    path.join(root, 'examples', example),
    '--layout-json',
  ], { encoding: 'utf8' });
  return JSON.parse(out);
}

// The fixture that made the bug reproducible: a skip-level edge in a full
// column, taken from a real spring-boot map. Without it every other example
// stays inside the box by accident and this file proves nothing.
test('the gutter-routing example still routes below its components', () => {
  const layout = layoutOf('gutter-routing.architecture.json');
  const componentBottom = Math.max(...layout.components.map((c) => c.y + c.height));
  const routeBottom = Math.max(...layout.connections.flatMap((c) => (c.points ?? []).map((p) => p[1])));
  assert.ok(routeBottom > componentBottom,
    `fixture no longer exercises gutter routing: lowest route ${routeBottom} is not below lowest component ${componentBottom}`);
});

for (const example of examples) {
  test(`${example}: every routed point is inside the viewBox`, () => {
    const layout = layoutOf(example);
    const [width, height] = layout.viewBox;
    for (const connection of layout.connections) {
      for (const [x, y] of connection.points ?? []) {
        assert.ok(y <= height,
          `${example}: a route reaches y=${y}, below the viewBox height ${height} — it will be clipped`);
        assert.ok(x <= width,
          `${example}: a route reaches x=${x}, past the viewBox width ${width} — it will be clipped`);
      }
    }
  });
}
