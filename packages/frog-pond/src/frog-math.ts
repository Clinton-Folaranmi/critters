// Small helpers shared by the frog pond's modules: maths, and a canvas to
// paint on that works in a worker too.

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** GLSL's smoothstep(edge0, edge1, x); edge0 may be larger than edge1. */
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return k * k * (3 - 2 * k);
};

/** A small deterministic generator (an LCG), so a pattern is the same every load. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A well-mixed seed for item `index` of a set, so each item draws its own
 * random numbers: adding or dropping items never re-rolls the others.
 */
export function itemSeed(set: number, index: number) {
  let n = Math.imul(set ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  return (n ^ (n >>> 15)) >>> 0;
}

/** A number as a short GLSL float literal: 0.95, 1.0, -0.035 (to `digits` places). */
export function glslFloat(value: number, digits = 4) {
  const text = String(Number(value.toFixed(digits)));
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/** A 2D canvas to paint on: an OffscreenCanvas where there is one (in a worker, say), else an element. */
export function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
