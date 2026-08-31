// `repair --safe` (row 3.13): the makeFeasible() pattern.
//
//   minimise displacement · solve feasibility · report what cannot be satisfied
//   NEVER touch topology, labels, or semantics
//
// The last clause is what makes this safe to run on someone's file, so it is
// structural rather than aspirational: this module reads geometry and writes
// geometry. It never looks at `connections`, `label`, `type`, `id` or `meta`
// except to copy them through untouched, and repair-safe.test.mjs strips
// every position from the input and the output and demands the rest be
// identical.
//
// Minimal displacement is the other half. A repair that re-solves the whole
// diagram is not a repair -- it is a replacement that happens to start from
// your file. So only components involved in a problem move, each along the
// SHALLOWER axis of its overlap, which is the smallest correction that
// resolves it.
//
// And feasibility is reported, not faked. Two components at identical
// positions with identical sizes cannot be separated by direction alone;
// repair says so instead of looping or nudging at random.

import { textUnits } from '../../core/renderers/shared/utils.mjs';
import { defaultFromSide, defaultToSide } from '../../core/renderers/shared/geometry.mjs';
import { gridLayout, resolveComponentPos } from '../../core/renderers/architecture/grid.mjs';
import { shapeFor } from './types.mjs';

const DEFAULT_MAX_PASSES = 12;

// The renderer's own label rule, not an approximation of it. architecture
// rejects a component when `textUnits(label) * 6.6 > width + 8`, so repair
// solves that inequality rather than guessing a comfortable margin -- a repair
// that used its own estimate would fix documents the validator still rejects,
// which is the failure this module already learned once with the 8px
// clearance.
const LABEL_UNIT_PX = 6.6;
const LABEL_SLACK_PX = 8;

/** The narrowest width at which this label passes. */
export function widthForLabel(label) {
  return Math.ceil(textUnits(label) * LABEL_UNIT_PX) - LABEL_SLACK_PX;
}

// The renderer's default when a component declares no size. A grid-placed
// component usually declares none, so this is the width its label is actually
// measured against.
const DEFAULT_COMPONENT_SIZE = [120, 60];

/**
 * The width a component is measured at today.
 *
 * A grid document declares neither pos nor size, which is why repair used to
 * do NOTHING for one: its box list required both, so the whole pass skipped
 * every component. That is the mode `import mermaid` produces and the mode a
 * model asked to avoid coordinates produces -- so repair was blind to exactly
 * the documents most likely to need it.
 */
export function effectiveWidth(component) {
  return Array.isArray(component.size) ? component.size[0] : DEFAULT_COMPONENT_SIZE[0];
}

// The validator does not ask for "not overlapping" -- it asks for CLEARANCE.
// architecture's component rule is rectsOverlap(a, b, 8), so two boxes that
// merely touch still fail it. Separating to exactly zero gap produced
// documents that repair called fixed and validate still rejected, which is
// the worst possible outcome: a repair that reports success and changes
// nothing that matters. Feasibility here means the real rule, not the
// intuitive one.
const DEFAULT_CLEARANCE = 8;

const asArray = (value) => (Array.isArray(value) ? value : []);

const boxOf = (component) => ({
  id: component.id,
  x: component.pos[0],
  y: component.pos[1],
  w: component.size?.[0] ?? 0,
  h: component.size?.[1] ?? 0,
});

const overlaps = (a, b, clearance = 0) => (
  a.x - clearance < b.x + b.w && b.x - clearance < a.x + a.w
  && a.y - clearance < b.y + b.h && b.y - clearance < a.y + a.h
);

/**
 * Move `mover` clear of `other` along the shallower axis.
 *
 * Returns false when the two cannot be separated by direction -- identical
 * centres on the deciding axis leave no "away" to move towards. That is a
 * genuine infeasibility, and the caller reports it rather than guessing.
 */
function separate(mover, other, clearance = 0) {
  // Overlap measured against the CLEARANCE band, so the correction carries
  // the box past the gap the validator requires rather than up against it.
  const overlapX = Math.min(mover.x + mover.w, other.x + other.w) - Math.max(mover.x, other.x) + clearance;
  const overlapY = Math.min(mover.y + mover.h, other.y + other.h) - Math.max(mover.y, other.y) + clearance;
  if (overlapX <= 0 || overlapY <= 0) return true;

  const moverCentreX = mover.x + mover.w / 2;
  const otherCentreX = other.x + other.w / 2;
  const moverCentreY = mover.y + mover.h / 2;
  const otherCentreY = other.y + other.h / 2;

  if (overlapX < overlapY) {
    if (moverCentreX === otherCentreX) return false;
    mover.x += moverCentreX < otherCentreX ? -overlapX : overlapX;
    return true;
  }
  if (moverCentreY === otherCentreY) return false;
  mover.y += moverCentreY < otherCentreY ? -overlapY : overlapY;
  return true;
}

/**
 * Correct an authored side that contradicts where the components actually are.
 *
 * This is the largest failure class a model-authored diagram hits, and it is
 * not a routing problem at all. A model writes `fromSide: "top"` for two
 * components sitting SIDE BY SIDE, and the renderer cannot honour it: a side is
 * a direction contract, and the first segment has to leave perpendicular to it.
 * No amount of rerouting satisfies a side that faces the wrong way.
 *
 * So repair asks the renderer's OWN question -- which side faces the other
 * component -- and answers it with the renderer's own function. It does not
 * invent a preference; it replaces an impossible instruction with the one the
 * geometry already implies.
 *
 * A side is a routing hint, in the same class as `via`: it changes how an edge
 * is drawn, never what it connects or what it means.
 */
export function correctSides(document, relationships, shape) {
  const rects = new Map();

  if (shape.axes) {
    // Derived placement: compare ordinals. A side asks only which node is
    // further left or further down, and every renderer places columns and
    // lanes in increasing order, so ordinals and coordinates agree.
    for (const node of asArray(document[shape.nodes])) {
      const { x, y } = shape.axes(node, document);
      if (x === null || y === null) continue;
      rects.set(node.id, { id: node.id, cx: x, cy: y });
    }
  } else {
    const grid = document.layout?.mode === 'grid' ? gridLayout(document) : null;
    for (const component of asArray(document[shape.nodes])) {
      const [x, y] = resolveComponentPos(component, grid);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const w = Array.isArray(component.size) ? component.size[0] : DEFAULT_COMPONENT_SIZE[0];
      const h = Array.isArray(component.size) ? component.size[1] : DEFAULT_COMPONENT_SIZE[1];
      rects.set(component.id, { id: component.id, x, y, width: w, height: h, cx: x + w / 2, cy: y + h / 2 });
    }
  }

  const corrections = [];
  const corrected = relationships.map((relationship) => {
    const from = rects.get(relationship.from);
    const to = rects.get(relationship.to);
    // Without both rects there is nothing to compare against, and guessing a
    // side from nothing is exactly what this must not do.
    if (!from || !to) return relationship;
    // An authored route is the author steering deliberately; leave it alone.
    if (relationship.via || relationship.channelX !== undefined || relationship.channelY !== undefined) {
      return relationship;
    }

    const wantFrom = defaultFromSide(from, to);
    const wantTo = defaultToSide(from, to);
    const hasFrom = relationship.fromSide && relationship.fromSide !== 'auto';
    const hasTo = relationship.toSide && relationship.toSide !== 'auto';
    const fromWrong = hasFrom && relationship.fromSide !== wantFrom;
    const toWrong = hasTo && relationship.toSide !== wantTo;
    if (!fromWrong && !toWrong) return relationship;

    corrections.push({
      id: relationship.id ?? `${relationship.from}->${relationship.to}`,
      ...(fromWrong ? { fromSide: { from: relationship.fromSide, to: wantFrom } } : {}),
      ...(toWrong ? { toSide: { from: relationship.toSide, to: wantTo } } : {}),
      reason: 'the authored side faces away from the other component, which no route can honour',
    });
    return {
      ...relationship,
      ...(fromWrong ? { fromSide: wantFrom } : {}),
      ...(toWrong ? { toSide: wantTo } : {}),
    };
  });

  return { relationships: corrected, corrections };
}

/**
 * Repair a document's geometry.
 *
 * @param {object} document
 * @param {{safe?: boolean, maxPasses?: number, clearance?: number,
 *          fitLabels?: boolean, diagramType?: string}} [options]
 * @returns {{document: object, receipt: {moves: Array<object>, widened: Array<object>,
 *            resided: Array<object>, resolved: Array<object>,
 *            unsatisfiable: Array<object>, passes: number,
 *            nothingToRepair?: string}}}
 */
export function repairDocument(document, options = {}) {
  // Rewriting authored coordinates is a real edit to someone's file. It takes
  // an explicit word, not a default.
  if (options.safe !== true) {
    throw new TypeError('repair: pass --safe to rewrite authored geometry; repair does not run by default');
  }
  const shape = shapeFor(options.diagramType ?? document?.diagram_type);
  if (!document || !Array.isArray(document[shape.nodes])) {
    throw new TypeError(`repair: a document with ${shape.nodes}[] is required`);
  }

  // Said out loud rather than reported as a clean run. A document repair could
  // not touch at all must not look like one it inspected and found perfect.
  if (!shape.canCorrectSides && !shape.canResize && !shape.canReposition) {
    return {
      document,
      receipt: {
        moves: [], widened: [], resided: [], resolved: [], unsatisfiable: [], passes: 0,
        nothingToRepair: shape.nothingToRepair,
      },
    };
  }

  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES;
  const fitLabels = options.fitLabels !== false;
  const clearance = options.clearance ?? DEFAULT_CLEARANCE;
  const original = new Map(asArray(document[shape.nodes]).map((component) => [component.id, component.pos ? [...component.pos] : null]));

  // Only positioned, sized components take part. Anything else is copied
  // through: repair has no basis for placing what was never placed.
  const boxes = (shape.canReposition ? document[shape.nodes] : [])
    .filter((component) => Array.isArray(component.pos) && Array.isArray(component.size))
    .map(boxOf);

  // Widening happens FIRST, and separation runs after it. A component that
  // grows to fit its label can collide with a neighbour that was clear before,
  // and separating first would leave those collisions behind.
  //
  // This is the failure class the benchmark found: labels wider than their
  // component were the single most common reason a model-authored diagram was
  // rejected, and repair could not touch them. Widening is geometry -- it
  // changes how much room a thing has, never what it is or what it says.
  const widened = [];
  if (fitLabels) {
    const sized = new Map(boxes.map((box) => [box.id, box]));
    const needed = (shape.canResize ? asArray(document[shape.nodes]) : [])
      .filter((component) => component.label)
      .map((component) => ({
        component,
        current: effectiveWidth(component),
        required: widthForLabel(component.label),
      }))
      .filter((entry) => entry.current < entry.required);

    // In a grid, EVERY widened component gets the SAME width.
    //
    // Widening them individually was worse than doing nothing: two components
    // stacked in one column grew to 131 and 138, their centres stopped
    // aligning, and the vertical edge between them stopped leaving a
    // perpendicular side -- trading two label failures for two routing
    // failures. A grid's whole value is that things line up, and a repair that
    // breaks the alignment has misunderstood what it is repairing.
    //
    // Free-placed components have explicit coordinates and a separation pass
    // behind them, so each can take exactly the width it needs.
    const gridPlaced = document.layout?.mode === 'grid';
    const uniform = gridPlaced && needed.length > 0
      ? Math.max(...needed.map((entry) => entry.required))
      : null;

    for (const entry of needed) {
      const width = uniform ?? entry.required;
      widened.push({
        id: entry.component.id, from: entry.current, to: width, label: entry.component.label,
      });
      // Keep the free-placement box in step so separation sees the new width;
      // a grid component has no box, and needs none -- the grid places it.
      const box = sized.get(entry.component.id);
      if (box) box.w = width;
    }
  }

  /** @type {Array<{a: string, b: string, reason: string}>} */
  const unsatisfiable = [];
  const resolvedPairs = new Set();
  let passes = 0;

  for (; passes < maxPasses; passes += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (!overlaps(a, b, clearance)) continue;
        const key = `${a.id}|${b.id}`;
        // Move the SECOND of the pair, so the outcome does not depend on
        // iteration order in a way a reader cannot predict.
        if (separate(b, a, clearance)) {
          resolvedPairs.add(key);
          moved = true;
        } else if (!unsatisfiable.some((entry) => entry.a === a.id && entry.b === b.id)) {
          unsatisfiable.push({
            a: a.id,
            b: b.id,
            reason: `${a.id} and ${b.id} share the same centre on the deciding axis, so there is no direction to `
              + 'separate them in. Move one of them, or give them different sizes.',
          });
        }
      }
    }
    if (!moved) break;
  }

  // Anything still overlapping after the pass budget is reported rather than
  // left to be discovered by the next validation run.
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!overlaps(a, b, clearance)) continue;
      if (unsatisfiable.some((entry) => entry.a === a.id && entry.b === b.id)) continue;
      unsatisfiable.push({
        a: a.id,
        b: b.id,
        reason: `still overlapping after ${maxPasses} passes; the surrounding layout is too tight for a `
          + 'displacement-only repair.',
      });
    }
  }

  const solved = new Map(boxes.map((box) => [box.id, [Math.round(box.x), Math.round(box.y)]]));

  // The output document. Geometry is replaced; everything else is the input,
  // carried through by reference-free copy so nothing is shared or mutated.
  const grownBy = new Map(widened.map((entry) => [entry.id, entry.to]));
  // Sides are corrected against the ORIGINAL geometry, before widening moves
  // anything: a side faces whichever component is to its left or right, and
  // widening does not change which side that is.
  const sided = shape.canCorrectSides
    ? correctSides(document, asArray(document[shape.edges]), shape)
    : { relationships: asArray(document[shape.edges]), corrections: [] };

  const repaired = {
    ...document,
    ...(sided.corrections.length > 0 ? { [shape.edges]: sided.relationships } : {}),
    [shape.nodes]: asArray(document[shape.nodes]).map((component) => {
      const width = grownBy.get(component.id);
      if (width !== undefined) {
        // Setting an explicit size is what makes this work in grid mode: the
        // renderer honours a declared size there, and measures the label
        // against it.
        component = { ...component, size: [width, component.size?.[1] ?? DEFAULT_COMPONENT_SIZE[1]] };
      }
      const position = solved.get(component.id);
      if (!position) return { ...component };
      return { ...component, pos: position };
    }),
  };

  const moves = [];
  for (const component of asArray(repaired[shape.nodes])) {
    const before = original.get(component.id);
    const after = component.pos;
    if (!before || !after) continue;
    if (before[0] === after[0] && before[1] === after[1]) continue;
    moves.push({
      id: component.id,
      from: before,
      to: [...after],
      distance: Math.round(Math.hypot(after[0] - before[0], after[1] - before[1])),
      reason: 'separated from an overlapping component along the shallower axis',
    });
  }

  return {
    document: repaired,
    receipt: {
      moves,
      widened,
      resided: sided.corrections,
      resolved: [...resolvedPairs].map((key) => {
        const [a, b] = key.split('|');
        return { a, b };
      }),
      unsatisfiable,
      passes,
    },
  };
}
