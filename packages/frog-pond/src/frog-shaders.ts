import { glslFloat } from 'critter-kit';
import { CAUSTIC_TILE, GRAIN_TILE, SHADE_SCALE } from './frog-caustics';
import {
  FROG_EDGES,
  FROG_LINES,
  FROG_LOOKS,
  FROG_PALETTE,
  FROG_SPOTS,
  FROG_TONGUE,
  HALO_GROW,
  LILY,
  LOOSE_PETALS,
  PAD_BAND,
  RIPPLE,
  SHADE_CLUSTERS,
  lighten,
} from './frog-theme';
import { FORE_TOE, FROG_LIFT, HIND_TOE, MAX_FLIES, MAX_PADS } from './frog-world';

// The pond in the grainy flat meadow style (frog-theme.ts), one fullscreen
// pass: flat water with two posterised caustic tones, ripple marks, swimmers,
// the pads' flat bands and leaves, the lily, midges, frogs as flat shapes from
// the rig's pose with their own offset bands, the drifting foliage shade, and
// one grain over everything. Every edge is cut against the same grain. The
// Canvas 2D fallback (frog-canvas.ts) draws the same shapes in the same order.
// Coordinates are canvas-height units, y up; frog-local ones are body
// lengths, snout toward +x.

/** Ripple slots, and the arcs each one is broken into (2 rings × 3 arcs, as start and length). */
export const RIPPLE_SLOTS = 8;
export const RIPPLE_ARCS = 6;
export const MAX_SHADE = SHADE_CLUSTERS.length;

export const frogVertexShader = /* glsl */ `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0); }`;

const float = (value: number) => glslFloat(value);
const vec3 = (c: readonly number[]) => `vec3(${c.map(float).join(',')})`;
const vec4 = (c: readonly number[]) => `vec4(${c.map(float).join(',')})`;
/** A GLSL function giving one colour of each frog's look, by palette index. */
const lookFunction = (name: string, pick: (i: number) => readonly number[]) => /* glsl */ `vec3 ${name}(int palette) {
${FROG_LOOKS.slice(1)
  .map((_, i) => `  if (palette == ${i + 1}) return ${vec3(pick(i + 1))};`)
  .join('\n')}
  return ${vec3(pick(0))};
}`;

// Markings as constant tables: all looks' spots in one list, with where each look's start.
const spotStart = FROG_SPOTS.map((_, i) => FROG_SPOTS.slice(0, i).reduce((n, list) => n + list.length, 0));
const allSpots = FROG_SPOTS.flat();
const lineStart = FROG_LINES.map((_, i) => FROG_LINES.slice(0, i).reduce((n, list) => n + list.length, 0));
const allLines = FROG_LINES.flat();
const P = FROG_PALETTE;
const E = FROG_EDGES;

const CONSTANTS = /* glsl */ `const float PI = 3.14159265;
const float TAU = 6.2831853;
const vec2 SUN = vec2(${float(P.sun[0])}, ${float(P.sun[1])});
const vec3 WATER = ${vec3(P.water)};
const vec3 CAUSTIC_LOW = ${vec3(P.causticLow)};
const vec3 CAUSTIC_HIGH = ${vec3(P.causticHigh)};
const vec2 CAUSTIC_STEPS = vec2(${float(P.causticSteps[0])}, ${float(P.causticSteps[1])});
const float CAUSTIC_JITTER = ${float(P.causticJitter)};
const float CAUSTIC_TILE = ${float(CAUSTIC_TILE)};
const vec3 RIPPLE = ${vec3(P.ripple)};
const vec3 LEAF = ${vec3(P.leaf)};
const vec3 LEAF_VEIN = ${vec3(P.leafVein)};
const vec3 LEAF_AGED = ${vec3(P.leafAged)};
const vec3 WHITE = ${vec3(P.white)};
const vec3 PETAL_INNER = ${vec3(P.petalInner)};
const vec3 GOLD = ${vec3(P.gold)};
const vec3 INK = ${vec3(P.ink)};
const vec3 SHADOW = ${vec3(P.shadow)};
const vec3 SHADOW_DEEP = ${vec3(P.shadowDeep)};
const vec3 SHADE = ${vec3(P.shade)};
const vec3 TONGUE = ${vec3(FROG_TONGUE)};
const float BAND = ${float(E.band)};
const float PAD_BAND = ${float(PAD_BAND)};
const float LIFT = ${float(FROG_LIFT)};
const float HIND_TOE = ${float(HIND_TOE)};
const float FORE_TOE = ${float(FORE_TOE)};
const float GRAIN_TILE = ${float(GRAIN_TILE)};
const float SHADE_SCALE = ${float(SHADE_SCALE)};
const float RIPPLE_START = ${float(RIPPLE.start)};
const float RIPPLE_SPEED = ${float(RIPPLE.speed)};
const float RIPPLE_LIFE = ${float(RIPPLE.life)};
const float RIPPLE_GAP = ${float(RIPPLE.gap)};
const int LILY_PAD = ${LILY.pad};
const vec4 LILY_SHAPE = ${vec4([LILY.dx, LILY.dy, LILY.size, LILY.turn])};
const vec3 PETALS[${LOOSE_PETALS.length}] = vec3[${LOOSE_PETALS.length}](${LOOSE_PETALS.map((p) => vec3(p)).join(', ')});
const vec4 SPOTS[${allSpots.length}] = vec4[${allSpots.length}](${allSpots.map((s) => vec4([s.x, s.y, s.rx, s.r])).join(', ')});
const float SPOT_TURN[${allSpots.length}] = float[${allSpots.length}](${allSpots.map((s) => float(s.a)).join(', ')});
const vec4 LINES[${allLines.length}] = vec4[${allLines.length}](${allLines.map((l) => vec4(l.slice(0, 4))).join(', ')});
const vec2 LINE_STYLE[${allLines.length}] = vec2[${allLines.length}](${allLines.map((l) => `vec2(${float(l[4])}, ${float(l[5])})`).join(', ')});
${lookFunction('frogSkin', (i) => FROG_LOOKS[i].skin)}
${lookFunction('frogMark', (i) => FROG_LOOKS[i].mark)}
${lookFunction('frogAccent', (i) => FROG_LOOKS[i].accent)}
${lookFunction('frogIris', (i) => FROG_LOOKS[i].iris)}
${lookFunction('frogHighlight', (i) => lighten(FROG_LOOKS[i].skin, 0.24))}
${lookFunction('frogLid', (i) => lighten(FROG_LOOKS[i].skin, -0.15))}
float frogBars(int palette) {
  ${FROG_LOOKS.map((look, i) => `if (palette == ${i}) return ${float(look.bars)};`).join('\n  ')}
  return 0.0;
}
ivec2 spotRange(int palette) {
  ${FROG_SPOTS.map((list, i) => `if (palette == ${i}) return ivec2(${spotStart[i]}, ${spotStart[i] + list.length});`).join('\n  ')}
  return ivec2(0);
}
ivec2 lineRange(int palette) {
  ${FROG_LINES.map((list, i) => `if (palette == ${i}) return ivec2(${lineStart[i]}, ${lineStart[i] + list.length});`).join('\n  ')}
  return ivec2(0);
}`;

const UTILS = /* glsl */ `// Sine-free hash, and gradient noise (frog-caustics.ts has the same in JS).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 gradient(vec2 i) {
  float a = hash(i) * 6.28318;
  return vec2(cos(a), sin(a));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(gradient(i), f), dot(gradient(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
    mix(dot(gradient(i + vec2(0, 1)), f - vec2(0, 1)), dot(gradient(i + vec2(1)), f - vec2(1)), u.x),
    u.y) * .7 + .5;
}
// rotate(a) * v turns v counter-clockwise by a.
mat2 rotate(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, s, -s, c);
}
float ellipse(vec2 p, vec2 r) {
  return (length(p / r) - 1.0) * min(r.x, r.y);
}
float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h) - mix(ra, rb, h);
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h);
}
// The W3C soft-light blend (what the Canvas renderer's 'soft-light' does).
vec3 softLight(vec3 b, float s) {
  vec3 d = mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(.25)));
  return s <= .5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b);
}`;

export function frogFragmentShader() {
  return /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_ratio;  // device pixels per CSS pixel
uniform vec4 u_ripples[${RIPPLE_SLOTS}];  // x, y, time, strength
uniform vec4 u_arcs[${(RIPPLE_SLOTS * RIPPLE_ARCS) / 2}];  // per ripple: 6 arcs as (start, length) pairs
uniform int u_padCount;
uniform ivec4 u_counts;  // leg capsules (10), ripple slots (8), arcs per ripple (6), passes (2): loop bounds the compiler can't unroll
uniform vec4 u_padA[${MAX_PADS}];  // x, y, radius (with bob), angle
uniform vec4 u_padB[${MAX_PADS}];  // notch, age, rim damage, press
uniform vec4 u_padC[${MAX_PADS}];  // press x, y (pad-local), base radius
uniform vec4 u_padLeaf[${MAX_PADS}];  // the leaf's sprite in the atlas: x, y, half size (px), bob scale
uniform vec4 u_padBand[${MAX_PADS}];  // the band's sprite: x, y, half size
uniform vec4 u_shadeSprite[${MAX_SHADE}];  // each shade cluster's sprite: x, y, half size
uniform sampler2D u_atlas;  // pads and shade, painted once per size (paintAtlas), premultiplied
uniform vec2 u_atlasSize;
uniform float u_atlasH;  // the canvas height the atlas was painted for
uniform int u_frogCount;  // frogs in drawing order: swimmers and sitters first, the highest last
uniform vec4 u_frogA[3];  // x, y, body heading, body length
uniform vec4 u_frogB[3];  // height, stretch, blink, throat
uniform vec4 u_frogC[3];  // tongue tip x, y, tongue extension, submerged
uniform vec4 u_frogD[3];  // palette, swim speed, left web, right web
uniform vec4 u_frogE[3];  // lean, look, reach (world units)
uniform vec4 u_legs[30];  // frog-local capsules: a.xy, b.xy (in drawing order)
uniform int u_flyCount;
uniform vec4 u_flies[${MAX_FLIES}];  // x, y, how much it's seen, height
uniform vec4 u_shade[${MAX_SHADE}];  // each cluster's point (x, y) and reach
uniform sampler2D u_caustic;  // tileable caustic web, brightness in alpha
uniform sampler2D u_grain;  // R: grain, G: its soft-light value (GRAIN_TILE square, repeating)
uniform sampler2D u_drift;  // the slow mottle's soft-light value, over the whole picture

${CONSTANTS}
${UTILS}

float grain;  // this pixel's grain
float pixel;  // one device pixel, in world units

// A shape's coverage with its edge softened by soft CSS px and cut against the grain.
float cut(float d, float soft, float rough, float band) {
  float sigma = max(soft * u_ratio, .35) * pixel;
  float a = 1.0 - smoothstep(-2.0 * sigma, 2.0 * sigma, d);
  float t = .5 + (grain - .5) * rough;
  float e = clamp((a - t + band) / (2.0 * band), 0.0, 1.0);
  return e * e * (3.0 - 2.0 * e);
}
float cut(float d, float soft, float rough) { return cut(d, soft, rough, BAND); }

// ---- Water ------------------------------------------------------------------

// The shader's caustic field: two copies of the baked web at scales 1 and
// .71 sliding past each other, bent by a slow warp.
float caustics(vec2 p, float t) {
  vec2 warp = vec2(noise(p * 2.3 + t * .07), noise(p * 2.3 + 17.0 - t * .06)) - .5;
  vec2 q = (p + warp * .18) / CAUSTIC_TILE;
  float a = texture(u_caustic, q - t * vec2(.011, .006) / CAUSTIC_TILE).a;
  float b = texture(u_caustic, q / .71 - t * vec2(-.008, .01) / (CAUSTIC_TILE * .71)).a;
  return a * .45 + b * .3 + a * b * 1.1;
}

// ---- Ripple marks ---------------------------------------------------------------

float arcDistance(vec2 d, float r, float start, float len) {
  float a = mod(atan(d.y, d.x) - start, TAU);
  if (a <= len) return abs(length(d) - r);
  vec2 e0 = vec2(cos(start), sin(start)) * r;
  vec2 e1 = vec2(cos(start + len), sin(start + len)) * r;
  return min(length(d - e0), length(d - e1));
}
vec3 rippleMarks(vec3 color, vec2 p) {
  float width = max(1.4 * u_ratio * pixel, .0032) * .5;
  for (int i = 0; i < u_counts.y; i++) {
    vec4 r = u_ripples[i];
    float age = u_time - r.z;
    if (r.z <= 0.0 || age < 0.0 || age >= RIPPLE_LIFE) continue;
    float r0 = RIPPLE_START + age * RIPPLE_SPEED;
    vec2 d = p - r.xy;
    float dist = length(d);
    if (dist > r0 + .02 || dist < r0 - RIPPLE_GAP - .02) continue;
    float alpha = .9 * (1.0 - age / RIPPLE_LIFE) * min(1.0, r.w * 2.0);
    float best = 1e5;
    for (int arc = 0; arc < u_counts.z; arc++) {
      float rr = r0 - float(arc / 3) * RIPPLE_GAP;
      if (rr <= .012) continue;
      vec4 pair = u_arcs[i * 3 + arc / 2];
      vec2 sl = (arc % 2 == 0) ? pair.xy : pair.zw;
      best = min(best, arcDistance(d, rr, sl.x, sl.y));
    }
    color = mix(color, RIPPLE, cut(best - width, .7, .8) * alpha);
  }
  return color;
}

// ---- Lily pads and shade: sprites from the atlas ------------------------------------

// A sprite's texel at a point offset (world units, y up) from its centre, at scale times the atlas's resolution.
vec4 sprite(vec4 at, vec2 offset, float scale) {
  vec2 px = vec2(at.z) + vec2(offset.x, -offset.y) * u_atlasH * scale;
  if (px.x < 0.0 || px.y < 0.0 || px.x > at.z * 2.0 || px.y > at.z * 2.0) return vec4(0.0);
  return texture(u_atlas, (at.xy + px) / u_atlasSize);
}

vec3 drawPad(vec3 color, int i, vec2 p) {
  vec4 A = u_padA[i];
  vec4 B = u_padB[i];
  vec4 C = u_padC[i];
  vec2 local = rotate(-A.w) * (p - A.xy);
  vec4 leaf = sprite(u_padLeaf[i], local / u_padLeaf[i].w, 1.0);
  if (leaf.a <= 0.0) return color;
  color = color * (1.0 - leaf.a) + leaf.rgb;
  // A tap or a landing leaves a pale ring that closes as it fades.
  if (B.w > .05) {
    float ring = abs(length(local - C.xy) - C.z * (.28 + (1.0 - B.w) * .25)) - .0016;
    color = mix(color, RIPPLE, cut(ring, .6, .8) * B.w * .5 * leaf.a);
  }
  return color;
}

// ---- The water lily, and loose petals ---------------------------------------------

float petals(vec2 p, vec2 centre, float size, float turn, float ring) {
  float r = size * (ring > .5 ? .62 : 1.0);
  float d = 1e5;
  for (int k = 0; k < u_counts.z + 2; k++) {  // the lily's 8 petals
    float a = turn + float(k) / ${float(LILY.petals)} * TAU + (ring > .5 ? PI / ${float(LILY.petals)} : 0.0);
    vec2 c = centre + vec2(cos(a), sin(a)) * r * .55;
    d = min(d, ellipse(rotate(-a) * (p - c), vec2(r * .55, r * .24)));
  }
  return d;
}

vec3 drawLily(vec3 color, vec2 p) {
  if (u_padCount <= LILY_PAD) return color;
  vec2 centre = u_padA[LILY_PAD].xy + LILY_SHAPE.xy;
  float size = LILY_SHAPE.z;
  if (length(p - centre) > size * 1.4) return color;
  vec2 away = -normalize(SUN);
  color *= mix(vec3(1.0), SHADOW_DEEP, cut(petals(p - away * .008, centre, size, LILY_SHAPE.w, 0.0), 1.2, .8));
  color = mix(color, WHITE, cut(petals(p, centre, size, LILY_SHAPE.w, 0.0), .7, .8));
  color = mix(color, PETAL_INNER, cut(petals(p, centre, size, LILY_SHAPE.w, 1.0), .6, .8));
  return mix(color, GOLD, cut(length(p - centre) - size * .16, .6, .8));
}

vec3 drawPetals(vec3 color, vec2 p, float aspect) {
  vec2 away = -normalize(SUN);
  for (int i = 0; i < ${LOOSE_PETALS.length}; i++) {
    vec2 c = vec2(PETALS[i].x * aspect, PETALS[i].y);
    if (length(p - c) > .03) continue;
    mat2 turn = rotate(PETALS[i].z);
    color *= mix(vec3(1.0), SHADOW, cut(ellipse(turn * (p - c - away * .004), vec2(.011, .0048)), .8, .8));
    color = mix(color, WHITE, cut(ellipse(turn * (p - c), vec2(.011, .0048)), .6, .8));
  }
  return color;
}

// ---- Midges -------------------------------------------------------------------

vec3 drawMidges(vec3 color, vec2 p) {
  vec2 away = -normalize(SUN);
  for (int i = 0; i < u_flyCount; i++) {
    vec4 fly = u_flies[i];
    if (fly.z < .05 || length(p - fly.xy) > .04) continue;
    float lift = .01 + fly.w * .05;
    float shadow = length(p - fly.xy - away * lift) - 1.4 * u_ratio * pixel;
    color *= mix(vec3(1.0), SHADOW, cut(shadow, .6, .8) * fly.z);
    float speck = length(p - fly.xy) - 1.3 * u_ratio * pixel;
    color = mix(color, INK, cut(speck, .3, .8) * .8 * fly.z);
  }
  return color;
}

// ---- Frogs ------------------------------------------------------------------

// World point to frog-local body-length units. Height scales the frog up
// only slightly (lift 0 gives the ground-sized footprint for its shadow);
// stretch squashes or elongates it.
vec2 frogLocal(int f, vec2 p, float lift) {
  vec4 A = u_frogA[f];
  vec4 B = u_frogB[f];
  vec2 local = rotate(-A.z) * (p - A.xy) / (A.w * (1.0 + B.x * lift));
  return vec2(local.x / B.y, local.y * B.y);
}

// The body: ellipses for back, hips, head and snout, the eye bumps and the
// paired vocal sacs (the left fractionally the larger), as the board.
float bodySDF(int f, vec2 q) {
  float throat = u_frogB[f].w;
  q.x += u_frogE[f].x;
  float d = ellipse(q - vec2(-.1, 0.0), vec2(.4, .265));
  d = min(d, ellipse(q - vec2(-.3, 0.0), vec2(.19, .235)));
  d = min(d, ellipse(q - vec2(.24, 0.0), vec2(.24, .222)));
  d = min(d, ellipse(q - vec2(.41, 0.0), vec2(.1, .12)));
  d = min(d, length(vec2(q.x - .27, abs(q.y) - .155)) - .078);
  float sac = throat * (q.y > 0.0 ? 1.06 : .94);
  d = min(d, length(vec2(q.x - .17, abs(q.y) - (.2 + sac * .06))) - (.02 + sac * .075));
  return d;
}

// A fan of toes from an ankle or wrist along dir; hind feet webbed between.
float foot(vec2 q, vec2 ankle, vec2 dir, bool hind, float web) {
  vec2 p = q - ankle;
  vec2 f = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
  int toes = hind ? 5 : 4;
  float spread = hind ? .18 + .38 * web : .62;
  float reach = hind ? HIND_TOE : FORE_TOE;
  float toeR = hind ? .02 : .016;
  float d = 1e5;
  float span = float(toes - 1);
  for (int i = 0; i < toes; i++) {
    float k = float(i) / span * 2.0 - 1.0;
    float a = k * spread;
    float l = reach * (.72 + .28 * sin((k * .8 + 1.0) * 1.35));
    d = min(d, capsule(f, vec2(0.0), vec2(cos(a), sin(a)) * l, toeR, toeR * 1.25));
  }
  if (hind && web > .05) {
    float r = length(f);
    float ang = atan(f.y, f.x);
    float between = fract((ang + spread) / (2.0 * spread) * span);
    float edge = reach * (.7 + .16 * web) * (1.0 - .2 * sin(between * PI));
    d = min(d, max(r - edge, (abs(ang) - spread) * r));
  }
  return d;
}

// Legs and feet together (the flat silhouette's legs).
float legsSDF(int f, vec2 q) {
  vec4 D = u_frogD[f];
  float d = 1e5;
  for (int k = 0; k < u_counts.x; k++) {
    vec4 c = u_legs[f * 10 + k];
    int part = k % 5;
    vec2 radius = part == 0 ? vec2(.125, .074) : part == 1 ? vec2(.078, .048)
      : part == 2 ? vec2(.05, .034) : part == 3 ? vec2(.05, .038) : vec2(.038, .028);
    d = min(d, capsule(q, c.xy, c.zw, radius.x, radius.y));
    if (part == 2 || part == 4) d = min(d, foot(q, c.zw, normalize(c.zw - c.xy), part == 2, k < 5 ? D.z : D.w));
  }
  return d;
}

// The legs for a shadow: capsules, and each foot as a disc.
float shadowLegs(int f, vec2 q) {
  float d = 1e5;
  for (int k = 0; k < u_counts.x; k++) {
    vec4 c = u_legs[f * 10 + k];
    int part = k % 5;
    vec2 radius = part == 0 ? vec2(.125, .074) : part == 1 ? vec2(.078, .048)
      : part == 2 ? vec2(.05, .034) : part == 3 ? vec2(.05, .038) : vec2(.038, .028);
    d = min(d, capsule(q, c.xy, c.zw, radius.x, radius.y));
    if (part == 2 || part == 4) {
      float len = part == 2 ? HIND_TOE : FORE_TOE;
      d = min(d, length(q - c.zw - normalize(c.zw - c.xy) * len * .45) - len * .5);
    }
  }
  return d;
}

// Dark cross-bars on thighs and shins, as flat ellipses across the leg.
float barsSDF(int f, vec2 q) {
  float d = 1e5;
  for (int k = 0; k < u_counts.x; k++) {
    int part = k % 5;
    if (part > 1) continue;
    vec4 c = u_legs[f * 10 + k];
    vec2 ab = c.zw - c.xy;
    float len = max(length(ab), 1e-4);
    vec2 u = ab / len;
    vec2 radius = part == 0 ? vec2(.125, .074) : vec2(.078, .048);
    for (int j = 0; j < 3; j++) {
      if (part == 0 && j == 2) break;
      float t = part == 0 ? (j == 0 ? .32 : .64) : (j == 0 ? .28 : j == 1 ? .55 : .8);
      float r = mix(radius.x, radius.y, t) * .82;
      vec2 rel = q - (c.xy + ab * t);
      d = min(d, ellipse(vec2(dot(rel, u), dot(rel, vec2(-u.y, u.x))), vec2(.024, r)));
    }
  }
  return d;
}

vec3 drawFrog(vec3 color, int f, vec2 p) {
  vec4 A = u_frogA[f];
  vec4 B = u_frogB[f];
  vec4 C = u_frogC[f];
  vec4 E = u_frogE[f];
  int palette = int(u_frogD[f].x + .5);
  float submerged = C.w;
  vec2 away = -normalize(SUN);
  vec3 base = color;
  // The flat shadow band: ground-sized, away from the light; further and
  // fainter in the air. Swimmers are in the water and have none.
  if (submerged < .02) {
    float reach = .007 + B.x * .3;
    vec2 qs = frogLocal(f, p - away * reach, 0.0);
    float d = min(bodySDF(f, qs), shadowLegs(f, qs)) * A.w;
    vec3 band = B.x > .02 ? SHADOW : SHADOW_DEEP;
    color *= mix(vec3(1.0), band, cut(d, 1.0 + B.x * 6.0, .8) * (1.0 - min(.4, B.x)));
  }
  float scale = A.w * (1.0 + B.x * LIFT);
  vec2 q = frogLocal(f, p, LIFT);
  vec3 skin = frogSkin(palette);
  vec3 mark = frogMark(palette);
  float soft = ${float(E.frog.soft)};
  float rough = ${float(E.frog.rough)};
  float legs = cut(legsSDF(f, q) * scale, soft, rough);
  color = mix(color, skin, legs);
  // The body's own band falls on the legs beside it: no outline, no modelling.
  float selfBand = .0075 * (1.0 + B.x * .35);
  float body = bodySDF(f, q);
  color *= mix(vec3(1.0), SHADOW, legs * cut(bodySDF(f, frogLocal(f, p - away * selfBand, LIFT)) * scale, soft, .8) * (1.0 - cut(body * scale, soft, rough)));
  color = mix(color, mark, cut(barsSDF(f, q) * scale, .5, rough) * frogBars(palette));
  float bodyMask = cut(body * scale, soft, rough);
  color = mix(color, skin, bodyMask);
  if (bodyMask > 0.0) {
    // Markings, frog-local before the lean.
    vec2 m = q + vec2(E.x, 0.0);
    ivec2 lines = lineRange(palette);
    for (int i = lines.x; i < lines.y; i++) {
      if (LINE_STYLE[i].y < .5) continue;
      float d = segment(m, LINES[i].xy, LINES[i].zw) - LINE_STYLE[i].x * .5;
      color = mix(color, frogAccent(palette), cut(d * scale, .5, rough));
    }
    ivec2 spots = spotRange(palette);
    if (palette == 0) {
      for (int i = spots.x; i < spots.y; i++) {
        vec2 local = rotate(-SPOT_TURN[i]) * (m - SPOTS[i].xy);
        float d = ellipse(local, SPOTS[i].zw + ${float(HALO_GROW)});
        color = mix(color, frogAccent(palette), cut(d * scale, .5, rough));
      }
    }
    for (int i = lines.x; i < lines.y; i++) {
      if (LINE_STYLE[i].y > .5) continue;
      float d = segment(m, LINES[i].xy, LINES[i].zw) - LINE_STYLE[i].x * .5;
      color = mix(color, mark, cut(d * scale, .5, rough));
    }
    for (int i = spots.x; i < spots.y; i++) {
      vec2 local = rotate(-SPOT_TURN[i]) * (m - SPOTS[i].xy);
      color = mix(color, mark, cut(ellipse(local, SPOTS[i].zw) * scale, .5, rough));
    }
    // One highlight: a soft lighter shape down the back, toward the light.
    vec2 l = rotate(-A.z) * SUN;
    vec2 hq = q - vec2(-E.x - .04 + l.x * .06, l.y * .07);
    color = mix(color, frogHighlight(palette), cut(ellipse(hq, vec2(.26, .06)) * scale, .7, rough) * .9);
    // Eyes: gold iris, a dark bar pupil, one tiny catch-light; a lid to blink.
    for (int side = 0; side < 2; side++) {
      vec2 e = vec2(-E.x + .27, side == 0 ? .155 : -.155);
      float eye = length(q - e) - .06;
      if (B.z > .5) {
        color = mix(color, frogLid(palette), cut(eye * scale, .4, rough));
        continue;
      }
      color = mix(color, frogIris(palette), cut(eye * scale, ${float(E.eye.soft)}, ${float(E.eye.rough)}, ${float(E.eye.band)}));
      vec2 pupil = e + vec2(cos(E.y) - 1.0, sin(E.y)) * .014;
      color = mix(color, INK, cut(ellipse(q - pupil, vec2(.046, .022)) * scale, .3, rough, ${float(E.eye.band)}));
      float glint = length(q - e - l * .028) - .013;
      color = mix(color, WHITE, cut(glint * scale, .25, rough, ${float(E.eye.band)}) * .9);
    }
  }
  // Tongue, out to the midge it is catching.
  if (C.z > 0.0) {
    vec2 tip = frogLocal(f, C.xy, LIFT);
    vec2 mouth = vec2(.46 - E.x, 0.0);
    vec2 end = mix(mouth, tip, C.z);
    float tongue = min(capsule(q, mouth, end, .028, .022), length(q - end) - .045);
    color = mix(color, TONGUE, cut(tongue * scale, .5, rough));
  }
  // A swimmer is seen through the water.
  if (submerged >= .02) color = mix(base, mix(color, WATER, submerged * .45), 1.0 - submerged * .4);
  return color;
}

// A swimming frog's wake: two flat ripple-coloured lines in a V behind it.
vec3 drawWake(vec3 color, int f, vec2 p) {
  vec4 A = u_frogA[f];
  float speed = u_frogD[f].y;
  if (speed < .004) return color;
  vec2 w = rotate(-A.z) * (p - A.xy) / A.w;
  if (w.x > 0.0 || w.x < -2.4) return color;
  float d = min(segment(w, vec2(-.35, .2), vec2(-2.2, 1.05)), segment(w, vec2(-.35, -.2), vec2(-2.2, -1.05)));
  float fade = smoothstep(-2.2, -.6, w.x);
  return mix(color, RIPPLE, cut(d * A.w - .0013, .7, .8) * min(speed * 7.0, 1.0) * .6 * fade);
}

// ---- Shade from foliage out of frame ----------------------------------------------

// How much shade falls here (premultiplied: 1 − a + shade colour × a).
vec3 shade(vec2 p) {
  vec3 k = vec3(1.0);
  for (int c = 0; c < ${MAX_SHADE}; c++) {
    vec4 s = u_shade[c];
    if (length(p - s.xy) > s.z + .03) continue;
    vec4 t = sprite(u_shadeSprite[c], p - s.xy, SHADE_SCALE);
    k *= 1.0 - t.a + t.rgb;
  }
  return k;
}

void main() {
  vec2 fragment = gl_FragCoord.xy;
  vec2 uv = fragment / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;
  pixel = 1.0 / u_resolution.y;
  // The grain tile repeats from the top-left corner, as the Canvas pattern does.
  ivec2 cell = ivec2(mod(vec2(floor(fragment.x), u_resolution.y - 1.0 - floor(fragment.y)), GRAIN_TILE));
  vec4 paper = texelFetch(u_grain, cell, 0);
  grain = paper.r;

  // Flat water, with the caustic field posterised into two tones (grain-cut).
  vec3 color = WATER;
  float c = caustics(uv, u_time) + (grain - .5) * CAUSTIC_JITTER;
  color = c > CAUSTIC_STEPS.y ? CAUSTIC_HIGH : c > CAUSTIC_STEPS.x ? CAUSTIC_LOW : WATER;
  color = rippleMarks(color, uv);

  // Two passes, so each frog is drawn from one place in the code (a smaller,
  // faster shader): swimmers first, in the water under the pads; then the
  // pads, the lily, petals and midges; then frogs on pads or in the air.
  vec2 away = -normalize(SUN);
  for (int pass = 0; pass < u_counts.w; pass++) {
    if (pass == 1) {
      for (int i = 0; i < u_padCount; i++) {
        vec2 q = uv - away * PAD_BAND - u_padA[i].xy;
        if (length(q) > u_padA[i].z * 1.1) continue;
        vec4 band = sprite(u_padBand[i], rotate(-u_padA[i].w) * q / u_padLeaf[i].w, 1.0);
        color *= 1.0 - band.a + band.rgb;
      }
      for (int i = 0; i < u_padCount; i++) {
        if (length(uv - u_padA[i].xy) > u_padA[i].z * 1.1) continue;
        color = drawPad(color, i, uv);
      }
      color = drawLily(color, uv);
      color = drawPetals(color, uv, aspect);
      color = drawMidges(color, uv);
    }
    for (int f = 0; f < u_frogCount; f++) {
      bool swimming = u_frogC[f].w >= .02;
      if (swimming != (pass == 0)) continue;
      float d = length(uv - u_frogA[f].xy);
      if (swimming && d < u_frogA[f].w * 2.6) color = drawWake(color, f, uv);
      if (d > u_frogE[f].z + .01 + u_frogB[f].x * .3) continue;
      color = drawFrog(color, f, uv);
    }
  }

  // The drifting shade, over everything.
  color *= shade(uv);

  // The grain and the slow drift, over everything (soft-light).
  color = softLight(clamp(color, 0.0, 1.0), paper.g);
  color = softLight(color, texture(u_drift, vec2(uv.x / aspect, 1.0 - uv.y)).r);
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
}
