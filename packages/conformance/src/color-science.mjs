// Minimal, dependency-free colour-science helpers used to regression-test
// the okabe-ito preset (packages/conformance/test/tokens.test.mjs, 4.13):
// WCAG contrast, and CIEDE2000 separation under simulated colour-vision
// deficiency. No runtime dependency is added (workspace policy); every
// formula below is a direct, checkable implementation of a published
// standard, not a library wrapper.
//
// Pipeline for a "does this pair actually look different to a dichromat"
// check: sRGB hex -> linear RGB -> (optionally) CVD simulation matrix,
// applied in linear RGB, per Machado, Oliveira & Fernandes (2009) at
// severity 1.0 -> CIE XYZ (D65) -> CIE Lab -> CIEDE2000 (Sharma, Wu &
// Dalal 2005). Contrast ratio follows WCAG 2.1's own linear-RGB relative
// luminance definition and is CVD-independent (that formula does not
// model colour vision at all -- it is a luminance/lightness measure).

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function srgbToLinearChannel(c) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function srgbToLinear(rgb) {
  return rgb.map(srgbToLinearChannel);
}

// Machado/Oliveira/Fernandes (2009), severity 1.0, applied to linear RGB.
// Reproduced from the paper's published simulation matrices (the same set
// used by, e.g., Chromium's built-in vision-deficiency emulation).
const CVD_MATRICES = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

/** @type {ReadonlyArray<'normal' | 'protan' | 'deutan' | 'tritan'>} */
export const CVD_TYPES = Object.freeze(['normal', 'protan', 'deutan', 'tritan']);

function applyMatrix(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function simulateCvd(linearRgb, type) {
  const m = CVD_MATRICES[type];
  if (!m) throw new Error(`unknown CVD type: ${type}`);
  return applyMatrix(m, linearRgb).map((c) => Math.min(1, Math.max(0, c)));
}

// sRGB (D65) linear RGB -> XYZ, IEC 61966-2-1.
/**
 * @param {[number, number, number]} rgb
 * @returns {[number, number, number]}
 */
function linearRgbToXyz([r, g, b]) {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

const D65_WHITE = { x: 0.95047, y: 1.0, z: 1.08883 };

function fLab(t) {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

/**
 * @param {[number, number, number]} xyz
 * @returns {[number, number, number]}
 */
function xyzToLab([x, y, z]) {
  const fx = fLab(x / D65_WHITE.x);
  const fy = fLab(y / D65_WHITE.y);
  const fz = fLab(z / D65_WHITE.z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * @param {string} hex
 * @param {'normal'|'protan'|'deutan'|'tritan'} [cvdType]
 * @returns {[number, number, number]} CIE L*a*b*
 */
export function hexToLab(hex, cvdType = 'normal') {
  const linear = srgbToLinear(hexToRgb(hex));
  const simulated = cvdType === 'normal' ? linear : simulateCvd(linear, cvdType);
  return xyzToLab(linearRgbToXyz(simulated));
}

// WCAG 2.1 relative luminance + contrast ratio (colour-vision independent).
function relativeLuminance(hex) {
  const [r, g, b] = srgbToLinear(hexToRgb(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} hexA @param {string} hexB */
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// CIEDE2000 (Sharma, Wu & Dalal, 2005), the standard reference formula.
// Verified against the paper's own published worked examples (Table 1) to
// within floating-point rounding on every non-degenerate (non-achromatic,
// non-identical) test pair.
/**
 * @param {[number, number, number]} lab1
 * @param {[number, number, number]} lab2
 */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const Cab1 = Math.sqrt(a1 * a1 + b1 * b1);
  const Cab2 = Math.sqrt(a2 * a2 + b2 * b2);
  const CabBar = (Cab1 + Cab2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(CabBar, 7) / (Math.pow(CabBar, 7) + Math.pow(25, 7))));

  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;

  const Cp1 = Math.sqrt(ap1 * ap1 + b1 * b1);
  const Cp2 = Math.sqrt(ap2 * ap2 + b2 * b2);

  function hueAngle(ap, b) {
    if (ap === 0 && b === 0) return 0;
    const h = (Math.atan2(b, ap) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  }

  const hp1 = hueAngle(ap1, b1);
  const hp2 = hueAngle(ap2, b2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;

  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(((dhp * Math.PI) / 180) / 2);

  const LpBar = (L1 + L2) / 2;
  const CpBar = (Cp1 + Cp2) / 2;

  let hpBar;
  if (Cp1 * Cp2 === 0) {
    hpBar = hp1 + hp2;
  } else {
    const sum = hp1 + hp2;
    const diff = Math.abs(hp1 - hp2);
    hpBar = diff > 180 ? (sum < 360 ? (sum + 360) / 2 : (sum - 360) / 2) : sum / 2;
  }

  const T = 1
    - 0.17 * Math.cos(((hpBar - 30) * Math.PI) / 180)
    + 0.24 * Math.cos(((2 * hpBar) * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * hpBar + 6) * Math.PI) / 180)
    - 0.2 * Math.cos(((4 * hpBar - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-Math.pow((hpBar - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(CpBar, 7) / (Math.pow(CpBar, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(LpBar - 50, 2)) / Math.sqrt(20 + Math.pow(LpBar - 50, 2));
  const Sc = 1 + 0.045 * CpBar;
  const Sh = 1 + 0.015 * CpBar * T;
  const Rt = -Math.sin(((2 * dTheta) * Math.PI) / 180) * Rc;

  const termL = dLp / Sl;
  const termC = dCp / Sc;
  const termH = dHp / Sh;

  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH);
}
