// Single-line node text fitting, shared by every renderer.
//
// Node text (`label`, `sublabel`, `tag`) renders as one <text> element with
// text-anchor="middle" and is never wrapped. Left unmeasured, an over-long
// value silently spills across its neighbours while validation still reports
// a clean receipt — the failure mode this module exists to close.
//
// Two halves, always used together:
//   - fittedNodeFontSize shrinks the text toward a legible minimum at render
//     time, so ordinary overruns simply get smaller instead of overlapping.
//   - minimumNodeTextWidth reports the width the text still needs once it has
//     shrunk as far as it may, so validation can reject what shrinking cannot
//     save.
//
// The geometry constants below are shared; the per-field `preferred` and
// `minimum` font sizes are not, because renderers set node text at different
// sizes (architecture sublabels are 9px, the rest are 7px).

import { textUnits } from './utils.mjs';

// widthFactor: px of advance width per text unit, per px of font size.
// horizontalPadding: total px reserved inside the box so text never touches
// the border.
export const nodeTextFit = {
  widthFactor: 0.6,
  horizontalPadding: 8,
};

// Largest font size at or below `preferred` that fits `text` inside `width`,
// floored at `minimum` — below that the text is no longer legible and the
// caller should be reporting a problem instead.
export function fittedNodeFontSize(text, width, preferred, minimum) {
  const units = Math.max(1, textUnits(text));
  const available = Math.max(1, width - nodeTextFit.horizontalPadding);
  const fitted = Math.min(preferred, available / (units * nodeTextFit.widthFactor));
  return Math.max(minimum, Math.floor(fitted * 10) / 10);
}

// Width `text` occupies at its legible minimum. Compare against
// `width - nodeTextFit.horizontalPadding` to decide whether shrink-to-fit can
// rescue it.
export function minimumNodeTextWidth(text, minimum) {
  return textUnits(text) * minimum * nodeTextFit.widthFactor;
}

// Available text width inside a box of `width`.
export function availableNodeTextWidth(width) {
  return width - nodeTextFit.horizontalPadding;
}

// The narrowest box `text` still fits in once it has shrunk as far as it may.
//
// This is minimumNodeTextWidth read the other way round. The pair above answers
// "is this box wide enough?", which is the question to ask when the box is
// fixed. This answers "how wide would be enough?", which is the question to ask
// when the box is the tool's to choose -- and it usually is. A renderer that
// can widen the box should never ask an author to shorten the words instead:
// the words are what the diagram means, and the box is only how it is drawn.
export function requiredNodeWidth(text, minimum) {
  return Math.ceil(minimumNodeTextWidth(text, minimum) + nodeTextFit.horizontalPadding);
}

// Every renderer checks a node's box against its label the same way -- 6.8px
// per text unit, with 6px of slack -- and against its sublabel and tag through
// minimumNodeTextWidth. A brand mark takes a further 48px off the top rail
// before the label starts.
//
// This is those checks read backwards, in one place, so that "is this box wide
// enough?" and "how wide would be enough?" can never drift apart. When they
// drift, a renderer widens a node to a size it then reports as too narrow --
// and the author is told to shorten a label that would have fit.
export function requiredNodeBoxWidth(node, fit) {
  const units = textUnits(node.label ?? '');
  let required = Math.ceil(units * 6.8 - 6);
  if (node.sublabel) required = Math.max(required, requiredNodeWidth(node.sublabel, fit.sublabelMinimum));
  if (node.tag) required = Math.max(required, requiredNodeWidth(node.tag, fit.tagMinimum));
  if (node.brand) required = Math.max(required, Math.ceil(units * fit.labelMinimum * 0.6) + 48);
  return required;
}
