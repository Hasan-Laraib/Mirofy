// The palette, as data. Every value here was lifted verbatim from the
// hand-written CSS this replaces; Task 6 changes no colour.
//
// Each block keeps two representations of its interior:
//   - `body` is the raw, verbatim CSS text between the braces (including
//     the mid-block comments, blank lines, and column-aligned declarations
//     that :root/[data-theme="dark"] and [data-theme="light"] carry) --
//     this is what makes byte-identical regeneration possible.
//   - `props` is derived FROM `body` below, at module load, by parsing out
//     every `--name: value;` declaration and dropping comment lines and
//     blank lines (see propsFromBody). It is not hand-maintained data: it
//     cannot drift out of sync with `body`, because it is computed from
//     `body` every time this module loads. That is what makes it
//     impossible for the token model (property counts, canonical names,
//     non-empty values -- everything tokens.test.mjs asserts) to disagree
//     with the bytes emit.mjs actually produces from that same `body`.
//   - `prefix` is the verbatim text preceding this block's selector --
//     for most blocks a single blank line, but for the first block in each
//     preset group (signal-flow, blueprint, editorial) it also carries that
//     group's banner comment. These banners sit between blocks, not inside
//     any block's braces, so they travel with the block they precede.
//
// signal-flow's two blocks are PARTIAL overrides (30 and 27 of the 32
// properties): they inherit the rest from :root. Emitting all 32 there
// would be semantically equivalent and byte-different, which would cost
// the only proof that this restructure is safe.

/** @type {Array<{prefix: string, selector: string, body: string}>} */
const RAW_BLOCKS = [
  {
    prefix: "    /* ==========================================================\n       THEME VARIABLES — switch by toggling [data-theme] on <html>\n       ========================================================== */\n",
    selector: "    :root,\n    [data-theme=\"dark\"] ",
    body: "      --bg: #020617;\n      --grid: #1e293b;\n      --text: #ffffff;\n      --text-muted: #94a3b8;\n      --text-dim: #475569;\n      /* UI chrome and menu hints need more contrast than SVG .t-dim accents */\n      --text-faint: #7d8da1;\n\n      --panel: rgba(15, 23, 42, 0.5);\n      --panel-border: #1e293b;\n      --lane-fill: rgba(15, 23, 42, 0.22);\n      --lane-stroke: #334155;\n\n      --arrow: #64748b;\n      --arrow-emphasis: #34d399;\n\n      /* Opaque mask color used behind semi-transparent component fills\n         so the arrows drawn underneath are properly hidden. */\n      --mask: #0f172a;\n\n      --frontend-fill:    rgba(8, 51, 68, 0.4);\n      --frontend-stroke:  #22d3ee;\n      --backend-fill:     rgba(6, 78, 59, 0.4);\n      --backend-stroke:   #34d399;\n      --database-fill:    rgba(76, 29, 149, 0.4);\n      --database-stroke:  #a78bfa;\n      --cloud-fill:       rgba(120, 53, 15, 0.3);\n      --cloud-stroke:     #fbbf24;\n      --security-fill:    rgba(136, 19, 55, 0.4);\n      --security-stroke:  #fb7185;\n      --messagebus-fill:  rgba(251, 146, 60, 0.3);\n      --messagebus-stroke:#fb923c;\n      --external-fill:    rgba(30, 41, 59, 0.5);\n      --external-stroke:  #94a3b8;\n\n      --toolbar-bg:       rgba(15, 23, 42, 0.8);\n      --toolbar-border:   #334155;\n      --toolbar-text:     #e2e8f0;\n      --toolbar-hover:    rgba(15, 23, 42, 0.95);\n      --toolbar-menu-bg:  #0f172a;\n",
  },
  {
    prefix: "\n\n",
    selector: "    [data-theme=\"light\"] ",
    body: "      --bg: #f8fafc;\n      --grid: #e2e8f0;\n      --text: #0f172a;\n      --text-muted: #64748b;\n      --text-dim: #94a3b8;\n      --text-faint: #64748b;\n\n      --panel: #ffffff;\n      --panel-border: #e2e8f0;\n      --lane-fill: rgba(248, 250, 252, 0.65);\n      --lane-stroke: #cbd5e1;\n\n      --arrow: #94a3b8;\n      --arrow-emphasis: #059669;\n\n      --mask: #ffffff;\n\n      --frontend-fill:    rgba(34, 211, 238, 0.15);\n      --frontend-stroke:  #0891b2;\n      --backend-fill:     rgba(52, 211, 153, 0.18);\n      --backend-stroke:   #059669;\n      --database-fill:    rgba(167, 139, 250, 0.2);\n      --database-stroke:  #7c3aed;\n      --cloud-fill:       rgba(251, 191, 36, 0.18);\n      --cloud-stroke:     #d97706;\n      --security-fill:    rgba(251, 113, 133, 0.15);\n      --security-stroke:  #e11d48;\n      --messagebus-fill:  rgba(251, 146, 60, 0.15);\n      --messagebus-stroke:#ea580c;\n      --external-fill:    rgba(148, 163, 184, 0.18);\n      --external-stroke:  #64748b;\n\n      --toolbar-bg:       rgba(255, 255, 255, 0.92);\n      --toolbar-border:   #cbd5e1;\n      --toolbar-text:     #334155;\n      --toolbar-hover:    #ffffff;\n      --toolbar-menu-bg:  #ffffff;\n",
  },
  {
    prefix: "\n\n    /* ==========================================================\n       SIGNAL FLOW — an opt-in, motion-forward visual preset.\n       The variables also target a standalone exported SVG, whose\n       root carries data-preset and data-theme directly.\n       ========================================================== */\n",
    selector: "    [data-preset=\"signal-flow\"][data-theme=\"dark\"] ",
    body: "      --bg: #030711;\n      --grid: #15233a;\n      --panel: rgba(6, 14, 28, 0.78);\n      --panel-border: #1d3350;\n      --lane-fill: rgba(9, 22, 40, 0.5);\n      --lane-stroke: #2c4564;\n      --text: #f5fbff;\n      --text-muted: #9eb0c7;\n      --text-dim: #52667f;\n      --text-faint: #7890ad;\n      --mask: #07101e;\n      --frontend-fill: rgba(6, 182, 212, 0.14);\n      --frontend-stroke: #67e8f9;\n      --backend-fill: rgba(16, 185, 129, 0.14);\n      --backend-stroke: #5eead4;\n      --database-fill: rgba(139, 92, 246, 0.16);\n      --database-stroke: #c4b5fd;\n      --cloud-fill: rgba(245, 158, 11, 0.13);\n      --cloud-stroke: #fcd34d;\n      --security-fill: rgba(244, 63, 94, 0.13);\n      --security-stroke: #fda4af;\n      --messagebus-fill: rgba(249, 115, 22, 0.13);\n      --messagebus-stroke: #fdba74;\n      --external-fill: rgba(71, 85, 105, 0.24);\n      --external-stroke: #a5b4c7;\n      --arrow: #7890ad;\n      --arrow-emphasis: #2dd4bf;\n      --toolbar-bg: rgba(7, 16, 30, 0.86);\n      --toolbar-border: #29415f;\n      --toolbar-menu-bg: #07101e;\n",
  },
  {
    prefix: "\n\n",
    selector: "    [data-preset=\"signal-flow\"][data-theme=\"light\"] ",
    body: "      --bg: #f4f9fc;\n      --grid: #d4e5ee;\n      --panel: rgba(255, 255, 255, 0.82);\n      --panel-border: #bfd5e2;\n      --lane-fill: rgba(232, 243, 248, 0.62);\n      --lane-stroke: #a9c5d5;\n      --text: #102638;\n      --text-muted: #587287;\n      --text-dim: #8aa2b4;\n      --text-faint: #668397;\n      --mask: #ffffff;\n      --frontend-fill: rgba(6, 182, 212, 0.09);\n      --frontend-stroke: #0789a1;\n      --backend-fill: rgba(5, 150, 105, 0.09);\n      --backend-stroke: #087f69;\n      --database-fill: rgba(124, 58, 237, 0.09);\n      --database-stroke: #7254c7;\n      --cloud-fill: rgba(217, 119, 6, 0.08);\n      --cloud-stroke: #b9670b;\n      --security-fill: rgba(225, 29, 72, 0.08);\n      --security-stroke: #c53a59;\n      --messagebus-fill: rgba(234, 88, 12, 0.08);\n      --messagebus-stroke: #c65f27;\n      --external-fill: rgba(100, 116, 139, 0.1);\n      --external-stroke: #607a8c;\n      --arrow: #7b97aa;\n      --arrow-emphasis: #0d9488;\n",
  },
  {
    prefix: "\n\n    /* ==========================================================\n       BLUEPRINT — a review-first drafting preset for deployment,\n       infrastructure, and technical design documentation. It keeps\n       the same semantic palette and geometry while trading glow for\n       precise grid contrast, squared materials, and drafting marks.\n       ========================================================== */\n",
    selector: "    [data-preset=\"blueprint\"][data-theme=\"dark\"] ",
    body: "      --bg: #06131f;\n      --grid: #17425a;\n      --panel: rgba(7, 27, 43, 0.9);\n      --panel-border: #27627f;\n      --lane-fill: rgba(10, 43, 66, 0.36);\n      --lane-stroke: #34799a;\n      --text: #e3f6ff;\n      --text-muted: #91b8ca;\n      --text-dim: #557e92;\n      --text-faint: #739caf;\n      --mask: #0a2031;\n      --frontend-fill: rgba(26, 157, 193, 0.14);\n      --frontend-stroke: #66d9ef;\n      --backend-fill: rgba(31, 155, 124, 0.13);\n      --backend-stroke: #69dfbd;\n      --database-fill: rgba(120, 105, 196, 0.14);\n      --database-stroke: #b4a8ff;\n      --cloud-fill: rgba(197, 145, 43, 0.13);\n      --cloud-stroke: #ffd166;\n      --security-fill: rgba(199, 76, 104, 0.13);\n      --security-stroke: #ff8da1;\n      --messagebus-fill: rgba(207, 112, 49, 0.13);\n      --messagebus-stroke: #ffad66;\n      --external-fill: rgba(84, 119, 139, 0.18);\n      --external-stroke: #a7cad9;\n      --arrow: #78a3b7;\n      --arrow-emphasis: #64dfc1;\n      --toolbar-bg: rgba(7, 28, 45, 0.92);\n      --toolbar-border: #34799a;\n      --toolbar-text: #d8f3ff;\n      --toolbar-hover: rgba(18, 58, 83, 0.95);\n      --toolbar-menu-bg: #0a2031;\n",
  },
  {
    prefix: "\n\n",
    selector: "    [data-preset=\"blueprint\"][data-theme=\"light\"] ",
    body: "      --bg: #edf7fa;\n      --grid: #b5d5e1;\n      --panel: rgba(249, 253, 255, 0.94);\n      --panel-border: #78aabd;\n      --lane-fill: rgba(210, 232, 240, 0.42);\n      --lane-stroke: #83b2c4;\n      --text: #123344;\n      --text-muted: #4e7486;\n      --text-dim: #86a6b4;\n      --text-faint: #668c9d;\n      --mask: #f9fdff;\n      --frontend-fill: rgba(8, 145, 178, 0.08);\n      --frontend-stroke: #087f9c;\n      --backend-fill: rgba(5, 128, 101, 0.08);\n      --backend-stroke: #08755f;\n      --database-fill: rgba(100, 75, 180, 0.08);\n      --database-stroke: #6757a8;\n      --cloud-fill: rgba(181, 120, 15, 0.08);\n      --cloud-stroke: #a86609;\n      --security-fill: rgba(190, 48, 80, 0.07);\n      --security-stroke: #b32f50;\n      --messagebus-fill: rgba(196, 81, 22, 0.07);\n      --messagebus-stroke: #b65120;\n      --external-fill: rgba(79, 112, 128, 0.08);\n      --external-stroke: #506f7e;\n      --arrow: #6d93a5;\n      --arrow-emphasis: #087f69;\n      --toolbar-bg: rgba(247, 252, 254, 0.94);\n      --toolbar-border: #8ab5c5;\n      --toolbar-text: #294f61;\n      --toolbar-hover: #ffffff;\n      --toolbar-menu-bg: #f9fdff;\n",
  },
  {
    prefix: "\n\n    /* ==========================================================\n       EDITORIAL — a warm, publication-minded preset for design\n       reviews, launch notes, and documentation. The diagram keeps\n       the same semantic palette and exact geometry, but trades\n       software chrome for paper, ink, ruled structure, and one\n       restrained vermilion accent.\n       ========================================================== */\n",
    selector: "    [data-preset=\"editorial\"][data-theme=\"dark\"] ",
    body: "      --bg: #181611;\n      --grid: #39342a;\n      --panel: rgba(35, 31, 24, 0.96);\n      --panel-border: #625a4a;\n      --lane-fill: rgba(52, 46, 35, 0.46);\n      --lane-stroke: #726957;\n      --text: #f4eddf;\n      --text-muted: #b9ae9b;\n      --text-dim: #776e60;\n      --text-faint: #9d917e;\n      --mask: #231f18;\n      --frontend-fill: rgba(43, 133, 142, 0.16);\n      --frontend-stroke: #7fc6c7;\n      --backend-fill: rgba(63, 132, 92, 0.16);\n      --backend-stroke: #8fc29e;\n      --database-fill: rgba(117, 91, 141, 0.17);\n      --database-stroke: #c0a4d0;\n      --cloud-fill: rgba(170, 119, 49, 0.16);\n      --cloud-stroke: #d8ad68;\n      --security-fill: rgba(157, 69, 65, 0.17);\n      --security-stroke: #df9085;\n      --messagebus-fill: rgba(174, 79, 42, 0.16);\n      --messagebus-stroke: #df946f;\n      --external-fill: rgba(126, 115, 96, 0.18);\n      --external-stroke: #b8ad99;\n      --arrow: #948978;\n      --arrow-emphasis: #dd6b3d;\n      --toolbar-bg: rgba(35, 31, 24, 0.92);\n      --toolbar-border: #625a4a;\n      --toolbar-text: #eee5d5;\n      --toolbar-hover: #302a20;\n      --toolbar-menu-bg: #231f18;\n",
  },
  {
    prefix: "\n\n",
    selector: "    [data-preset=\"editorial\"][data-theme=\"light\"] ",
    body: "      --bg: #f2eee5;\n      --grid: #d8d0c2;\n      --panel: rgba(251, 248, 241, 0.97);\n      --panel-border: #c4b9a6;\n      --lane-fill: rgba(229, 221, 207, 0.42);\n      --lane-stroke: #b8aa94;\n      --text: #242018;\n      --text-muted: #6f6658;\n      --text-dim: #a09788;\n      --text-faint: #817767;\n      --mask: #fbf8f1;\n      --frontend-fill: rgba(31, 117, 126, 0.09);\n      --frontend-stroke: #287e84;\n      --backend-fill: rgba(42, 119, 75, 0.09);\n      --backend-stroke: #397b53;\n      --database-fill: rgba(105, 75, 130, 0.09);\n      --database-stroke: #765d86;\n      --cloud-fill: rgba(157, 103, 31, 0.1);\n      --cloud-stroke: #9a671f;\n      --security-fill: rgba(153, 58, 52, 0.09);\n      --security-stroke: #9e463f;\n      --messagebus-fill: rgba(182, 70, 27, 0.09);\n      --messagebus-stroke: #ad4b25;\n      --external-fill: rgba(101, 91, 75, 0.09);\n      --external-stroke: #746b5e;\n      --arrow: #8a806f;\n      --arrow-emphasis: #bb4c23;\n      --toolbar-bg: rgba(251, 248, 241, 0.94);\n      --toolbar-border: #c4b9a6;\n      --toolbar-text: #40392f;\n      --toolbar-hover: #fffdf8;\n      --toolbar-menu-bg: #fbf8f1;\n",
  },
  {
    prefix: "\n\n    /* ==========================================================\n       OKABE-ITO — an opt-in, colour-vision-deficiency-aware preset.\n       Swaps only the seven semantic component hues for the published\n       Okabe-Ito qualitative palette (distinguishable under deuteranopia,\n       protanopia, and tritanopia); every other token matches classic.\n       Light-mode strokes are darkened for contrast against a light\n       surface -- the same hue, not a different one -- mirroring how\n       blueprint and editorial already adapt hues per theme.\n       ========================================================== */\n",
    selector: "    [data-preset=\"okabe-ito\"][data-theme=\"dark\"] ",
    body: "      --bg: #020617;\n      --grid: #1e293b;\n      --panel: rgba(15, 23, 42, 0.5);\n      --panel-border: #1e293b;\n      --lane-fill: rgba(15, 23, 42, 0.22);\n      --lane-stroke: #334155;\n      --text: #ffffff;\n      --text-muted: #94a3b8;\n      --text-dim: #475569;\n      --text-faint: #7d8da1;\n      --mask: #0f172a;\n      --frontend-fill: rgba(22, 45, 58, 0.4);\n      --frontend-stroke: #56b4e9;\n      --backend-fill: rgba(0, 40, 29, 0.4);\n      --backend-stroke: #009e73;\n      --database-fill: rgba(51, 30, 42, 0.4);\n      --database-stroke: #cc79a7;\n      --cloud-fill: rgba(58, 40, 0, 0.3);\n      --cloud-stroke: #e69f00;\n      --security-fill: rgba(53, 24, 0, 0.4);\n      --security-stroke: #d55e00;\n      --messagebus-fill: rgba(60, 57, 17, 0.3);\n      --messagebus-stroke: #f0e442;\n      --external-fill: rgba(0, 29, 45, 0.5);\n      --external-stroke: #0072b2;\n      --arrow: #64748b;\n      --arrow-emphasis: #34d399;\n      --toolbar-bg: rgba(15, 23, 42, 0.8);\n      --toolbar-border: #334155;\n      --toolbar-text: #e2e8f0;\n      --toolbar-hover: rgba(15, 23, 42, 0.95);\n      --toolbar-menu-bg: #0f172a;\n",
  },
  {
    prefix: "\n\n",
    selector: "    [data-preset=\"okabe-ito\"][data-theme=\"light\"] ",
    body: "      --bg: #f8fafc;\n      --grid: #e2e8f0;\n      --panel: #ffffff;\n      --panel-border: #e2e8f0;\n      --lane-fill: rgba(248, 250, 252, 0.65);\n      --lane-stroke: #cbd5e1;\n      --text: #0f172a;\n      --text-muted: #64748b;\n      --text-dim: #94a3b8;\n      --text-faint: #64748b;\n      --mask: #ffffff;\n      --frontend-fill: rgba(86, 180, 233, 0.15);\n      --frontend-stroke: #0d6fa5;\n      --backend-fill: rgba(0, 158, 115, 0.18);\n      --backend-stroke: #007052;\n      --database-fill: rgba(204, 121, 167, 0.2);\n      --database-stroke: #8f245f;\n      --cloud-fill: rgba(230, 159, 0, 0.18);\n      --cloud-stroke: #996a00;\n      --security-fill: rgba(213, 94, 0, 0.15);\n      --security-stroke: #a34800;\n      --messagebus-fill: rgba(240, 228, 66, 0.15);\n      --messagebus-stroke: #746d06;\n      --external-fill: rgba(0, 114, 178, 0.18);\n      --external-stroke: #0072b2;\n      --arrow: #94a3b8;\n      --arrow-emphasis: #059669;\n      --toolbar-bg: rgba(255, 255, 255, 0.92);\n      --toolbar-border: #cbd5e1;\n      --toolbar-text: #334155;\n      --toolbar-hover: #ffffff;\n      --toolbar-menu-bg: #ffffff;\n",
  },
];

// Parses a block's raw `body` into an ordered [name, value] list, skipping
// comment lines and blank lines. Reuses the same declaration pattern
// derive.mjs (Task 6 Step 1, since deleted) used to produce this data in
// the first place, so the property counts this yields are the same counts
// that were verified against the committed CSS: 32, 32, 30, 27, 32, 32, 32, 32.
/**
 * @param {string} body
 * @returns {Array<[string, string]>}
 */
function propsFromBody(body) {
  /** @type {Array<[string, string]>} */
  const props = [];
  for (const line of body.split('\n')) {
    const prop = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.+?);\s*$/);
    if (prop) props.push([prop[1], prop[2]]);
  }
  return props;
}

/** @type {Array<{prefix: string, selector: string, body: string, props: Array<[string, string]>}>} */
export const BLOCKS = RAW_BLOCKS.map((block) => ({ ...block, props: propsFromBody(block.body) }));

// Verbatim text after the last block's closing brace (a blank line plus
// the file's trailing newline). Captured as data, like everything else
// here, rather than hard-coded in the emitter.
export const SUFFIX = "\n\n";

export const PROPERTY_NAMES = [...new Set(BLOCKS.flatMap((b) => b.props.map(([name]) => name)))];
