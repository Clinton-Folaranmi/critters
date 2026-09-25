// Where the pond meets its bank. We see one stretch of shore: a near bank
// along the bottom that curves up the left side, with a grassy point
// reaching into the water. To the top and right the water runs on out of
// the picture. Shared by everything that needs to know where the water is:
// the world (animals and pads keep off the bank), both renderers (depth,
// the reeds), the bank layer (frog-bank-paint.ts) and the page's outer
// edge. Pure maths, no DOM.
//
// World units: canvas heights, y up, x from 0 to the aspect ratio.

import { glslFloat, smoothstep } from './frog-math';

// The bottom bank's height along the canvas (u is a share of the width):
// deepest at the left, running out below the frame toward the right.
const BOTTOM = { height: 0.245, below: 0.07, fadeFrom: 0.58, fadeTo: 0.95 } as const;
// The left bank's width (a share of the width), running out above.
const LEFT = { width: 0.13, beyond: 0.05, fadeFrom: 0.55, fadeTo: 0.95 } as const;
// The grassy point: where along the bottom, how far it reaches, how broad.
const POINT = { u: 0.3, reach: 0.075, breadth: 0.06 } as const;
/** How broadly the two banks merge in the corner. */
const CORNER = 0.09;
// Bays and bulges, then small irregularities, along each bank:
// [frequency, amplitude, phase].
const BOTTOM_WOBBLE = [
  [5, 0.024, 1.3],
  [9, 0.013, 0.4],
  [17, 0.012, 1.0],
  [37, 0.007, 2.0],
  [71, 0.004, 0.5],
] as const;
const LEFT_WOBBLE = [
  [4, 0.016, 0.9],
  [8, 0.01, 2.6],
  [15, 0.01, 2.2],
  [33, 0.006, 0.7],
  [61, 0.004, 3.1],
] as const;

// Where animals may go on the open sides: a soft oval around the middle
// (semi-axes as shares of width and height).
const OPEN_RX = 0.465;
const OPEN_RY = 0.46;
/** The middle of the open water (shares of width and height), which swimmers steer back toward. */
export const WATER_CX = 0.6;
export const WATER_CY = 0.6;

// The water shelves up toward the bank over this distance, and is a little
// shallower toward the open edges than in the middle.
const SHELF = { reach: 0.24, rim: 0.72 } as const;

/** Height of the bottom bank's waterline at u (a share of the width). */
export function bottomBank(u: number) {
  const fade = smoothstep(BOTTOM.fadeFrom, BOTTOM.fadeTo, u);
  let y = BOTTOM.height * (1 - fade) - BOTTOM.below * fade;
  y += POINT.reach * Math.exp(-(((u - POINT.u) / POINT.breadth) ** 2));
  for (let i = 0; i < BOTTOM_WOBBLE.length; i++)
    y += BOTTOM_WOBBLE[i][1] * Math.sin(BOTTOM_WOBBLE[i][0] * u + BOTTOM_WOBBLE[i][2]);
  return y;
}

/** Width of the left bank (a share of the width) at height v. */
export function leftBank(v: number) {
  const fade = smoothstep(LEFT.fadeFrom, LEFT.fadeTo, v);
  let x = LEFT.width * (1 - fade) - LEFT.beyond * fade;
  for (let i = 0; i < LEFT_WOBBLE.length; i++)
    x += LEFT_WOBBLE[i][1] * Math.sin(LEFT_WOBBLE[i][0] * v + LEFT_WOBBLE[i][2]);
  return x;
}

/**
 * Roughly the distance from the waterline, in world units: positive out on
 * the water, negative up the bank.
 */
export function shoreDistance(x: number, y: number, aspect: number) {
  const a = y - bottomBank(x / aspect);
  const b = x - leftBank(y) * aspect;
  // Smooth minimum: the two banks meet in a rounded corner.
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / CORNER));
  return b + (a - b) * h - CORNER * h * (1 - h);
}

/** 0 in the middle of the pond, 1 at the edge of the open water (the soft oval). */
export function openDistance(x: number, y: number, aspect: number, margin = 0) {
  return Math.hypot(
    (x - aspect / 2) / Math.max(0.05, OPEN_RX * aspect - margin),
    (y - 0.5) / Math.max(0.05, OPEN_RY - margin),
  );
}

/**
 * 0 at the bank … 1 over the deepest water: the water shelves toward the
 * shore and stays deep where it runs out of the picture. The riverbed pass
 * adds an uneven floor on top of this (pondDepth in frog-shaders.ts).
 */
export function shelfDepth(x: number, y: number, aspect: number) {
  return (
    smoothstep(0, SHELF.reach, shoreDistance(x, y, aspect)) *
    (SHELF.rim + (1 - SHELF.rim) * smoothstep(1.2, 0.55, openDistance(x, y, aspect)))
  );
}

const f = (value: number) => glslFloat(value, 5);
const wobble = (terms: ReadonlyArray<readonly [number, number, number]>, t: string) =>
  terms.map(([k, amp, phase]) => `+${f(amp)}*sin(${f(k)}*${t}+${f(phase)})`).join('');

/** shoreDistance(), openDistance() and shelfDepth() in GLSL, for the shaders. */
export const BANK_GLSL = /* glsl */ `// ---- The shore (frog-bank.ts) ------------------------------------------------
float bottomBank(float u) {
  float fade = smoothstep(${f(BOTTOM.fadeFrom)}, ${f(BOTTOM.fadeTo)}, u);
  float q = (u - ${f(POINT.u)}) / ${f(POINT.breadth)};
  return ${f(BOTTOM.height)} * (1.0 - fade) - ${f(BOTTOM.below)} * fade + ${f(POINT.reach)} * exp(-q * q)${wobble(BOTTOM_WOBBLE, 'u')};
}
float leftBank(float v) {
  float fade = smoothstep(${f(LEFT.fadeFrom)}, ${f(LEFT.fadeTo)}, v);
  return ${f(LEFT.width)} * (1.0 - fade) - ${f(LEFT.beyond)} * fade${wobble(LEFT_WOBBLE, 'v')};
}
// Positive on the water, negative up the bank (world units, roughly).
float shoreDistance(vec2 p, float aspect) {
  float a = p.y - bottomBank(p.x / aspect);
  float b = p.x - leftBank(p.y) * aspect;
  float h = clamp(.5 + .5 * (b - a) / ${f(CORNER)}, 0.0, 1.0);
  return mix(b, a, h) - ${f(CORNER)} * h * (1.0 - h);
}
float openDistance(vec2 p, float aspect) {
  return length((p - vec2(aspect * .5, .5)) / vec2(${f(OPEN_RX)} * aspect, ${f(OPEN_RY)}));
}
float shelfDepth(vec2 p, float aspect) {
  return smoothstep(0.0, ${f(SHELF.reach)}, shoreDistance(p, aspect))
    * (${f(SHELF.rim)} + ${f(1 - SHELF.rim)} * smoothstep(1.2, .55, openDistance(p, aspect)));
}`;

// ---- The reeds -----------------------------------------------------------------

/** Blades per clump; two clumps. */
const REED_CLUMP = 5;
export const REED_BLADES = REED_CLUMP * 2;
/** A seed head rides on blade 1 of the left clump and blade 3 of the right one: [blade, half-width, half-length]. */
export const REED_HEADS = [
  [1, 0.0065, 0.022],
  [REED_CLUMP + 3, 0.007, 0.024],
] as const;
/** How far a reed's shadow falls from it, away from the light (world units). */
export const REED_SHADOW = 0.01;

// Where the two reed clumps grow: in the bay between the left bank and the
// grassy point, rooted just on the bank.
const REED_LEFT_Y = 0.46;
const REED_BOTTOM_U = 0.17;

/**
 * The reed blades at a moment (they sway a little): for each blade, its root
 * and tip (`ends`: x0, y0, x1, y1) and its width, bend and tone (`shape`:
 * width, bend, tone, 0). Both renderers draw exactly these, and taps are
 * tested against them. Their bounding box (x0, y0, x1, y1, roots and tips
 * only) goes into `box`.
 */
export function reedBlades(aspect: number, time: number, ends: Float32Array, shape: Float32Array, box: Float32Array) {
  const lx = leftBank(REED_LEFT_Y) * aspect - 0.02;
  const ly = REED_LEFT_Y;
  const rx = REED_BOTTOM_U * aspect;
  const ry = bottomBank(REED_BOTTOM_U) - 0.018;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < REED_CLUMP; i++) {
    const tone = i < 2 ? 0.6 - i * 0.2 : 0.06 * (i - 2);
    const sway = Math.sin(time * 0.33 + i * 1.9) * 0.004;
    for (let clump = 0; clump < 2; clump++) {
      const right = clump === 1;
      const k = right ? REED_CLUMP + i : i;
      const rootX = right ? rx + 0.024 - i * 0.012 : lx + i * 0.012 - 0.024;
      const rootY = (right ? ry : ly) - i * 0.004;
      const tipX = right
        ? rootX + (-0.03 - i * 0.02 + 0.035 * ((i + 1) % 2)) * 0.62 - sway
        : rootX + (0.035 + i * 0.02 - 0.04 * (i % 2)) * 0.62 + sway;
      const tipY = rootY + (right ? 0.23 + ((i * 2) % 5) * 0.045 : 0.26 + ((i * 3) % 5) * 0.04) * 0.62;
      ends[k * 4] = rootX;
      ends[k * 4 + 1] = rootY;
      ends[k * 4 + 2] = tipX;
      ends[k * 4 + 3] = tipY;
      shape[k * 4] = right ? 0.0058 + 0.001 * (i % 2) : 0.0054 + 0.0012 * (i % 2);
      shape[k * 4 + 1] = right ? -0.008 * (i - 2) - sway : 0.009 * (i - 2) + sway;
      shape[k * 4 + 2] = tone;
      shape[k * 4 + 3] = 0;
      x0 = Math.min(x0, rootX, tipX);
      y0 = Math.min(y0, rootY, tipY);
      x1 = Math.max(x1, rootX, tipX);
      y1 = Math.max(y1, rootY, tipY);
    }
  }
  box[0] = x0;
  box[1] = y0;
  box[2] = x1;
  box[3] = y1;
}

/** Distance to a tapered, gently bent blade (as blade() in the shader), and how far along it. */
function bladeDistance(px: number, py: number, ends: Float32Array, shape: Float32Array, k: number) {
  const rootX = ends[k * 4];
  const rootY = ends[k * 4 + 1];
  const ax = ends[k * 4 + 2] - rootX;
  const ay = ends[k * 4 + 3] - rootY;
  const len = Math.hypot(ax, ay) || 1;
  const h = Math.max(0, Math.min(1, ((px - rootX) * ax + (py - rootY) * ay) / (len * len)));
  const nx = -ay / len;
  const ny = ax / len;
  const bow = Math.sin(h * Math.PI) * shape[k * 4 + 1];
  const breadth = shape[k * 4] * (1 - h * 0.88) + 0.0005;
  return Math.hypot(px - rootX - ax * h - nx * bow, py - rootY - ay * h - ny * bow) - breadth;
}

const reedEnds = new Float32Array(REED_BLADES * 4);
const reedShape = new Float32Array(REED_BLADES * 4);
const reedBox = new Float32Array(4);
/** Whether a point is on a reed (at rest), within a tolerance. */
export function reedAt(x: number, y: number, aspect: number, tolerance = 0) {
  reedBlades(aspect, 0, reedEnds, reedShape, reedBox);
  if (x < reedBox[0] - 0.03 || x > reedBox[2] + 0.03 || y < reedBox[1] - 0.03 || y > reedBox[3] + 0.03) return false;
  for (let k = 0; k < REED_BLADES; k++) {
    if (bladeDistance(x, y, reedEnds, reedShape, k) < tolerance) return true;
  }
  return false;
}

// ---- The picture's outer edge --------------------------------------------------

/**
 * The outline the page fades the picture out along: a squarish oval (a
 * superellipse) a little in from the canvas all round, so the corners keep
 * some picture. Its semi-axes, in world units.
 */
const pictureRadii = (aspect: number) => [aspect / 2 - 0.05, 0.45] as const;
/** The superellipse's exponent: |x|^n + |y|^n = 1 (picturePath draws the same curve). */
const PICTURE_POWER = 2 / 0.6;

/**
 * Where a point sits against the picture's outline: below 1 inside, 1 on
 * it (where the soft, ragged edge is about half faded), above 1 outside.
 * Taps beyond 1 are on the page, not the pond.
 */
export function pictureEdge(x: number, y: number, aspect: number) {
  const [rx, ry] = pictureRadii(aspect);
  const dx = Math.abs(x - aspect / 2) / rx;
  const dy = Math.abs(y - 0.5) / ry;
  return (dx ** PICTURE_POWER + dy ** PICTURE_POWER) ** (1 / PICTURE_POWER);
}

/** The outline as an SVG path in a viewBox 1000 high, grown by `grow` world units. */
function picturePath(aspect: number, grow = 0) {
  const [rx, ry] = pictureRadii(aspect);
  const points: string[] = [];
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Parametric form of |x|^n + |y|^n = 1, with n = 2 / 0.6.
    const x = aspect / 2 + (rx + grow) * Math.sign(c) * Math.abs(c) ** 0.6;
    const y = 0.5 + (ry + grow) * Math.sign(s) * Math.abs(s) ** 0.6;
    points.push(`${(x * 1000).toFixed(1)} ${((1 - y) * 1000).toFixed(1)}`);
  }
  return `M${points.join('L')}Z`;
}

const svg = (aspect: number, body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${(aspect * 1000).toFixed(0)} 1000' preserveAspectRatio='none'>${body}</svg>`;
const cssUrl = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;

/**
 * The picture's outer edge, as a CSS mask image: the outline above, made
 * ragged and soft, so the water to the top and right and the bank to the
 * bottom and left all fade into the page. Sized in world units, so it fits
 * any aspect.
 */
export function bankMaskUrl(aspect: number) {
  return cssUrl(
    svg(
      aspect,
      `<filter id='r' x='-10%' y='-10%' width='120%' height='120%'>` +
        `<feTurbulence type='fractalNoise' baseFrequency='.016' numOctaves='4' seed='7'/>` +
        `<feDisplacementMap in='SourceGraphic' scale='44' xChannelSelector='R' yChannelSelector='G'/>` +
        `<feGaussianBlur stdDeviation='14'/></filter>` +
        `<path d='${picturePath(aspect)}' fill='black' filter='url(#r)'/>`,
    ),
  );
}

/**
 * A keyboard-focus ring just outside the picture's edge, as a CSS mask
 * image: a line `width` CSS pixels wide along the outline, grown a little.
 */
export function pictureRingUrl(aspect: number, width: number) {
  return cssUrl(
    svg(
      aspect,
      `<path d='${picturePath(aspect, 0.03)}' fill='none' stroke='black' ` +
        `stroke-width='${width}' stroke-linejoin='round' vector-effect='non-scaling-stroke'/>`,
    ),
  );
}
