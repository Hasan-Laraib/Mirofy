// What repair can reach, per diagram type.
//
// Repair used to be architecture-only, and refused every other document with
// "a document with components[] is required". That mattered more than it
// sounds: six of eight benchmark tasks came back "repair refused this
// document", so the tool's own repair step contributed nothing to four fifths
// of its own surface.
//
// Extending it turned up a boundary worth naming. Only ARCHITECTURE lets a
// node declare `pos` and `size`. In the other four types placement is derived
// -- a workflow node has a lane and a column, a dataflow node has a stage and
// a row -- and there is no width to widen or coordinate to nudge. So widening
// and separation are architecture-only BY SCHEMA, not by omission, and no
// amount of work here changes that.
//
// What the other types do have is edge sides, and a side that faces away from
// its counterpart is unfixable by routing and trivially fixable by repair. So
// side correction reaches four of the five.
//
// Sequence has neither. Its messages carry no side and its participants carry
// no geometry, so repair has nothing to offer it -- and says so plainly rather
// than reporting a clean run over a document it never touched.

/**
 * Where each type keeps its nodes and relationships, and how a node's
 * position is derived.
 *
 * `axes` returns ORDINALS, not pixels, and that is sufficient on purpose:
 * choosing a side asks only which of two components is further left or
 * further down, and every renderer here places columns and lanes in
 * increasing order. Comparing ordinals therefore gives the same answer as
 * comparing coordinates, without this module having to reimplement -- and keep
 * in step with -- five different layout engines.
 */
export const DIAGRAM_SHAPES = Object.freeze({
  architecture: {
    nodes: 'components',
    edges: 'connections',
    // Architecture is the exception: real coordinates, resolved by the caller.
    axes: null,
    canResize: true,
    canReposition: true,
    canCorrectSides: true,
  },
  workflow: {
    nodes: 'nodes',
    edges: 'edges',
    axes: (node, document) => ({
      x: Number.isInteger(node.col) ? node.col : null,
      y: laneOrdinal(document.lanes, node.lane),
    }),
    canResize: false,
    canReposition: false,
    canCorrectSides: true,
  },
  lifecycle: {
    nodes: 'states',
    edges: 'transitions',
    axes: (node, document) => ({
      x: Number.isInteger(node.col) ? node.col : null,
      y: laneOrdinal(document.lanes, node.lane),
    }),
    canResize: false,
    canReposition: false,
    canCorrectSides: true,
  },
  dataflow: {
    nodes: 'nodes',
    edges: 'flows',
    axes: (node, document) => ({
      x: laneOrdinal(document.stages, node.stage),
      y: Number.isInteger(node.row) ? node.row : null,
    }),
    canResize: false,
    canReposition: false,
    canCorrectSides: true,
  },
  sequence: {
    nodes: 'participants',
    edges: 'messages',
    axes: null,
    canResize: false,
    canReposition: false,
    // Messages carry no side and participants carry no geometry. There is
    // nothing here for a geometry-only repair to hold on to.
    canCorrectSides: false,
    nothingToRepair: 'sequence messages carry no side and participants carry no geometry, '
      + 'so a geometry-only repair has nothing it can change',
  },
});

/** A lane or stage's index, or null when the document does not declare it. */
function laneOrdinal(collection, id) {
  if (!Array.isArray(collection)) return null;
  const index = collection.findIndex((entry) => entry?.id === id);
  return index === -1 ? null : index;
}

/**
 * The shape for a document, from its declared type.
 *
 * An unknown type is refused rather than guessed at: repairing a document
 * whose shape this does not know would mean reading collections that may not
 * mean what it assumes.
 */
export function shapeFor(diagramType) {
  const shape = DIAGRAM_SHAPES[diagramType];
  if (!shape) {
    throw new TypeError(`repair: unknown diagram type ${JSON.stringify(diagramType)}; `
      + `expected one of ${Object.keys(DIAGRAM_SHAPES).join(', ')}`);
  }
  return shape;
}
