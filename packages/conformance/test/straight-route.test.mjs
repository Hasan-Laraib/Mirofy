// Row 3.14. Straight-route port placement.
//
// Row 3.7 gives fanned-out relationships distinct ports so they do not
// collapse into one line. It spread them evenly about the side's centre,
// which is correct about separation and indifferent about direction: an edge
// whose counterpart sat 200px away still left from a port 14px off centre,
// and bent to get there. Some of those edges could have been straight.
//
// So the ports are solved rather than spaced. Each one's ideal is where its
// counterpart sits; the solver gets as close to that as the side's band and
// the minimum separation permit. What must NOT change is everything row 3.7
// established -- separation, order, determinism -- so those are asserted here
// again rather than assumed to have survived.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { automaticPortSpread } from '../../core/renderers/shared/geometry.mjs';
import { solvePortPositions } from '../../core/renderers/shared/port-solver.mjs';
import { coreRoot } from '../src/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'product-straight-route-'));

function renderArchitecture(doc, name) {
  const input = path.join(tmp, `${name}.json`);
  const output = path.join(tmp, `${name}.html`);
  fs.writeFileSync(input, JSON.stringify(doc));
  execFileSync(process.execPath, [
    path.join(coreRoot, 'renderers/architecture/render-architecture.mjs'), input, output,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(output, 'utf8');
}

/** @returns {[string, object]} one Map entry, so `new Map([...])` types cleanly. */
const rect = (id, x, y, width, height) => /** @type {[string, object]} */ ([id, {
  id, x, y, width, height, cx: x + width / 2, cy: y + height / 2,
}]);

/** A tall hub fanning out to three boxes on its right, spread far apart. */
function fanOut() {
  const boxes = new Map([
    rect('hub', 80, 200, 180, 200),
    rect('a', 600, 100, 180, 60),
    rect('b', 600, 300, 180, 60),
    rect('c', 600, 500, 180, 60),
  ]);
  const relations = [
    { id: 'to-a', from: 'hub', to: 'a' },
    { id: 'to-b', from: 'hub', to: 'b' },
    { id: 'to-c', from: 'hub', to: 'c' },
  ];
  return { boxes, relations };
}

const sourceY = (spread, relation) => spread.get(relation).from[1];

test('[3.14] a port that can make its edge straight, does', () => {
  const { boxes, relations } = fanOut();
  const spread = automaticPortSpread(relations, boxes);

  // `b` sits at cy 330. The hub's usable band is [216, 384], so 330 is
  // reachable and nothing but an even-spread habit stops the port landing on
  // it. Evenly spread, this port sat at 300 and the edge bent 30px.
  assert.equal(sourceY(spread, relations[1]), boxes.get('b').cy,
    'the port did not move to where its edge would be straight');
});

test('[3.14] a port that cannot be straight goes as close as the band allows', () => {
  const { boxes, relations } = fanOut();
  const spread = automaticPortSpread(relations, boxes);

  // `a` at cy 130 and `c` at cy 530 are outside the hub entirely. Their edges
  // cannot be straight at any port, so the honest answer is the closest
  // reachable one -- the band edge, not a shrug back to the centre.
  assert.equal(sourceY(spread, relations[0]), 216, 'the upper port is not at the top of the band');
  assert.equal(sourceY(spread, relations[2]), 384, 'the lower port is not at the bottom of the band');
});

test('[3.14] separation and order survive the solve', () => {
  const { boxes, relations } = fanOut();
  const spread = automaticPortSpread(relations, boxes);
  const ys = relations.map((relation) => sourceY(spread, relation));

  // Row 3.7's guarantee. Pulling ports towards their counterparts must never
  // pull two onto the same point, and must never reorder them -- reordering
  // is how fan-out edges start crossing each other.
  for (let i = 1; i < ys.length; i += 1) {
    assert.ok(ys[i] - ys[i - 1] >= 14 - 1e-9,
      `ports ${i - 1} and ${i} are ${ys[i] - ys[i - 1]}px apart, closer than the 14px separation`);
  }
  assert.deepEqual([...ys].sort((l, r) => l - r), ys, 'the solve reordered the ports');
});

test('[3.14] ports stay inside the side they belong to', () => {
  const { boxes, relations } = fanOut();
  const spread = automaticPortSpread(relations, boxes);
  const hub = boxes.get('hub');
  for (const relation of relations) {
    const y = sourceY(spread, relation);
    // A port outside its own box is not a port. The counterparts here sit
    // 170px beyond both ends of the hub, so an unclamped solver would put
    // two ports off the component.
    assert.ok(y >= hub.y && y <= hub.y + hub.height,
      `${relation.id} leaves from y=${y}, outside the hub's ${hub.y}..${hub.y + hub.height} span`);
  }
});

test('[3.14] even spread is preserved where it was always right', () => {
  // Three relationships into the same place have no straighter port than any
  // other, and the even spread about that place is exactly what row 3.7
  // produced. The new solver must contain the old behaviour, not replace it.
  assert.deepEqual(
    solvePortPositions([300, 300, 300], { lo: 216, hi: 384, gap: 14 }),
    [286, 300, 314],
  );
});

test('[3.14] the solve is the minimum displacement, not merely a feasible one', () => {
  // A feasible answer is easy; the closest feasible answer is the point. This
  // compares against every arrangement on a 1px lattice, so a solver that
  // simply satisfied the constraints would lose to something in the sweep.
  const ideals = [130, 330, 530];
  const band = { lo: 216, hi: 384, gap: 14 };
  const solved = solvePortPositions(ideals, band);
  const cost = (ports) => ports.reduce((sum, port, i) => sum + (port - ideals[i]) ** 2, 0);

  let best = Infinity;
  for (let a = band.lo; a <= band.hi; a += 1) {
    for (let b = a + band.gap; b <= band.hi; b += 1) {
      for (let c = b + band.gap; c <= band.hi; c += 1) best = Math.min(best, cost([a, b, c]));
    }
  }
  assert.ok(cost(solved) <= best + 1e-9,
    `solved cost ${cost(solved)} is worse than the best lattice arrangement ${best}`);
});

test('[3.14] the solve is deterministic', () => {
  const first = automaticPortSpread(fanOut().relations, fanOut().boxes);
  const second = automaticPortSpread(fanOut().relations, fanOut().boxes);
  assert.deepEqual([...first.values()], [...second.values()]);
});

test('[3.14] the straight route survives all the way into the rendered SVG', () => {
  // Everything above tests the solver. This tests the product: a fan-out
  // whose middle edge can be straight must actually RENDER straight. The
  // usable band has to be wide enough for the solve to have any freedom --
  // in a 60px-tall component every ideal clamps to the same point, which is
  // why the shipped showcase digests did not move when this landed.
  const html = renderArchitecture({
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Straight route' },
    components: [
      { id: 'hub', type: 'backend', label: 'Hub', pos: [80, 200], size: [180, 200] },
      { id: 'a', type: 'external', label: 'A', pos: [600, 100], size: [180, 60] },
      { id: 'b', type: 'database', label: 'B', pos: [600, 300], size: [180, 60] },
      { id: 'c', type: 'cloud', label: 'C', pos: [600, 500], size: [180, 60] },
    ],
    connections: [
      { id: 'to-a', from: 'hub', to: 'a' },
      { id: 'to-b', from: 'hub', to: 'b' },
      { id: 'to-c', from: 'hub', to: 'c' },
    ],
  }, 'straight-route');

  const points = (id) => {
    const match = html.match(new RegExp(`data-edge-id="${id}"[^>]+data-composition-points="([^"]+)"`));
    assert.ok(match, `missing rendered connection ${id}`);
    return match[1].split(';').map((pair) => pair.split(',').map(Number));
  };

  // `b` sits at cy 330, inside the hub's usable band, so this edge has a
  // straight route available. Straight means every point shares one y.
  const toB = points('to-b');
  const ys = new Set(toB.map(([, y]) => y));
  assert.equal(ys.size, 1, `hub->b rendered with ${ys.size} distinct y values (${[...ys].join(', ')}), so it doglegs`);
  assert.equal([...ys][0], 330, 'hub->b is straight, but not at the height that makes it straight');

  // And the other two still leave from distinct ports rather than collapsing.
  const startY = (id) => points(id)[0][1];
  assert.ok(startY('to-a') < startY('to-b') && startY('to-b') < startY('to-c'),
    'the fan-out ports collapsed or reordered in the rendered output');
});
