// The cockroach's drawn shape, in its own frame (BL; x toward the head, y to
// its left), written once and read by both renderers and the hit test (spec
// A-7, B-1, B-2). The outline follows the measured body (cockroach-motion.ts:
// 1 × 0.4 BL, pronotum the front 0.23); the parts' exact curves are drawing
// choices, not measurements.

/** Blended ellipses, front to back: [centre x, radius x, radius y]. */
export const BODY_PARTS = {
  pronotum: [0.37, 0.135, 0.195],
  thorax: [0.1, 0.2, 0.2],
  abdomen: [-0.2, 0.3, 0.19],
} as const;
/** How softly the parts blend (a smooth minimum's width, BL). */
export const BLEND = 0.06;
/** Where the pronotum's rear edge and the wing pads' rear edge cross the midline (BL). */
export const PRONOTUM_BACK = 0.27;
export const TEGMINA_BACK = -0.05;
/** The visible abdominal segment lines (x, BL). */
export const SEGMENT_LINES = [-0.11, -0.18, -0.25, -0.32, -0.39, -0.45] as const;
/** Capsule radii (BL): femur, tibia, tarsus; then the antennae. */
export const LEG_RADII = [0.03, 0.022, 0.013] as const;
export const ANTENNA_RADIUS = 0.009;
/** How far the body casts its shadow along the light (BL): a low animal close to the floor. */
export const SHADOW_OFFSET = 0.07;
export const SHADOW_SOFTNESS = 0.07;

/** Signed distance to an axis-aligned ellipse (an approximation, like the kit's ellipseDistance). */
const ellipse = (px: number, py: number, rx: number, ry: number) =>
  (Math.hypot(px / rx, py / ry) - 1) * Math.min(rx, ry);
/** Polynomial smooth minimum (same as the shader's smin). */
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Signed distance to the body (BL), the same formula the shader uses. */
export function bodyDistance(px: number, py: number) {
  const [pc, prx, pry] = BODY_PARTS.pronotum;
  const [tc, trx, try_] = BODY_PARTS.thorax;
  const [ac, arx, ary] = BODY_PARTS.abdomen;
  return smin(
    smin(ellipse(px - pc, py, prx, pry), ellipse(px - tc, py, trx, try_), BLEND),
    ellipse(px - ac, py, arx, ary),
    BLEND,
  );
}

/** The same body distance as GLSL, generated from the numbers above. */
export function bodyGlsl(float: (v: number) => string) {
  const e = (name: keyof typeof BODY_PARTS) => {
    const [c, rx, ry] = BODY_PARTS[name];
    return `ellipseD(p - vec2(${float(c)}, 0.0), vec2(${float(rx)}, ${float(ry)}))`;
  };
  return /* glsl */ `float ellipseD(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float bodyD(vec2 p) {
  return smin(smin(${e('pronotum')}, ${e('thorax')}, ${float(BLEND)}), ${e('abdomen')}, ${float(BLEND)});
}`;
}
