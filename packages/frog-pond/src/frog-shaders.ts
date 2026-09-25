import { BANK_GLSL, REED_BLADES, REED_HEADS, REED_SHADOW } from './frog-bank';
import { CAUSTIC_CELL, CAUSTIC_CELLS } from './frog-caustics';
import { glslFloat } from './frog-math';
import { FROG_LOOKS, FROG_PALETTES, FROG_TONGUE, SUN_GLOW, type FrogTheme } from './frog-theme';
import { FORE_TOE, FROG_LIFT, HIND_TOE, MAX_FLIES, MAX_MOTES, MAX_PADS } from './frog-world';

/** Fireflies (or midges) and motes share one list in the shader. */
export const MAX_SPECKS = MAX_FLIES + MAX_MOTES;

export const frogVertexShader = /* glsl */ `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0); }`;

const float = (value: number) => glslFloat(value);
const vec3 = (c: readonly number[]) => `vec3(${c.map(float).join(',')})`;
/** A GLSL function giving one colour of each frog's look (FROG_LOOKS), by palette index. */
const lookFunction = (name: string, key: 'skin' | 'mark' | 'belly' | 'iris') => /* glsl */ `vec3 ${name}(int palette) {
${FROG_LOOKS.slice(1)
  .map((look, i) => `  if (palette == ${i + 1}) return ${vec3(look[key])};`)
  .join('\n')}
  return ${vec3(FROG_LOOKS[0][key])};
}`;

function themeConstants(theme: FrogTheme) {
  const t = FROG_PALETTES[theme];
  return /* glsl */ `const float DAY = ${theme === 'day' ? '1.0' : '0.0'};
const vec3 LIGHT = ${vec3(t.light)};
// The key light: a sunset beyond the top-right at night, a high sun by day.
const vec2 SUN = vec2(${float(t.sun[0])}, ${float(t.sun[1])});
const float BED_SHADOW_REACH = ${float(t.bedShadowReach)};
const vec3 WATER_SHALLOW = ${vec3(t.waterShallow)};
const vec3 WATER_DEEP = ${vec3(t.waterDeep)};
const float TURBIDITY = ${float(t.turbidity)};
const vec3 SKY = ${vec3(t.sky)};
const float SKY_REFLECT = ${float(t.skyReflect)};
const vec3 MUD_DARK = ${vec3(t.mudDark)};
const vec3 MUD = ${vec3(t.mud)};
const vec3 SAND = ${vec3(t.sand)};
const vec3 STONE_DARK = ${vec3(t.stoneDark)};
const vec3 STONE_LIGHT = ${vec3(t.stoneLight)};
const float BED_LIGHT = ${float(t.bedLight)};
const float CAUSTICS = ${float(t.caustics)};
const vec3 PAD_A = ${vec3(t.padA)};
const vec3 PAD_B = ${vec3(t.padB)};
const vec3 PAD_AGED = ${vec3(t.padAged)};
const vec3 PAD_YOUNG = ${vec3(t.padYoung)};
const vec3 REED_NEAR = ${vec3(t.reedNear)};
const vec3 REED_FAR = ${vec3(t.reedFar)};
const vec3 REED_EDGE = ${vec3(t.reedEdge)};
const vec3 REED_HEAD = ${vec3(t.reedHead)};
const vec3 REED_HEAD_RIM = ${vec3(t.reedHeadRim)};
const float PAD_SHADOW = ${float(t.padShadow)};
const vec3 FLY_GLOW = ${vec3(t.flyGlow)};
const vec3 FLY_BODY = ${vec3(t.flyBody)};
const vec3 TONGUE = ${vec3(FROG_TONGUE)};
// Where the light is reflected in the water, as shares of width and height.
const vec2 GLOW = vec2(${float(SUN_GLOW[0])}, ${float(SUN_GLOW[1])});
const float REED_SHADOW = ${float(REED_SHADOW)};
const float SHADOW = ${float(t.shadow)};
const float VIGNETTE = ${float(t.vignette)};
const float CAUSTIC_TILE = ${float(CAUSTIC_CELL * CAUSTIC_CELLS)};
const float LIFT = ${float(FROG_LIFT)};
const float HIND_TOE = ${float(HIND_TOE)};
const float FORE_TOE = ${float(FORE_TOE)};
const float PI = 3.14159265;`;
}

// The shore, from frog-bank.ts; both programs need it.
const BANK = BANK_GLSL;

// Noise, hashing and SDF helpers shared by both programs.
const SHADER_UTILS = /* glsl */ `// Sine-free hash: stable at large pixel coordinates, where fract(sin(...))
// loses precision and shows up as banding.
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
float fbm(vec2 p) {
  return noise(p) * .55 + noise(p * 2.03 + 7.1) * .3 + noise(p * 4.1 + 3.7) * .15;
}
// rotate(a) * v turns v counter-clockwise by a (GLSL matrices are column-major).
mat2 rotate(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, s, -s, c);
}
float smin(float a, float b, float k) {
  float h = clamp(.5 + .5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float ellipse(vec2 p, vec2 r) {
  return (length(p / r) - 1.0) * min(r.x, r.y);
}
float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h) - mix(ra, rb, h);
}`;

// Pond depth and stones: used only by the riverbed pass.
const BED_FUNCTIONS = /* glsl */ `// ---- Riverbed and water ----------------------------------------------------

// 0 at the bank … 1 over the deepest part: the shelf (frog-bank.ts) on an
// uneven floor rather than a smooth bowl.
float pondDepth(vec2 p, float aspect) {
  float floorShape = fbm(p * 1.7 + 4.3) - .5;
  return clamp(shelfDepth(p, aspect) + floorShape * .5 * smoothstep(0.0, .12, shoreDistance(p, aspect)), 0.0, 1.0);
}

// Irregular stones on a jittered grid: each cell may hold one rounded,
// elongated stone. x: cover, y: light on its domed top, z: the darker ring
// where it sits in the silt, w: a per-stone tone.
vec4 stones(vec2 p, float scale, float density) {
  vec2 g = p * scale;
  vec2 i = floor(g);
  vec2 f = fract(g);
  float best = 9.0;
  vec2 bestQ = vec2(0.0);
  float tone = 0.0;
  float sunk = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(x, y);
      if (hash(c + scale) > density) continue;
      vec2 centre = vec2(x, y) + .22 + .56 * vec2(hash(c + 3.1), hash(c + 7.7));
      float a = hash(c + 11.3) * PI;
      float grow = hash(c + 5.2);
      vec2 size = vec2(.12 + .3 * grow * grow, .1 + .16 * grow * hash(c + 9.4) + .04);
      vec2 q = (rotate(-a) * (f - centre)) / size;
      float e = length(q);
      if (e < best) {
        best = e;
        bestQ = rotate(a) * q;
        tone = hash(c + 1.9);
        sunk = hash(c + 4.4);
      }
    }
  }
  // Many stones are part-sunk in the silt: a ragged, softer outline.
  float edge = 1.0 - sunk * .35 * (noise(p * scale * 3.1 + tone * 9.0) + .2);
  float cover = 1.0 - smoothstep(edge - .16 - sunk * .1, edge, best);
  float h = sqrt(max(0.0, 1.0 - best * best));
  vec3 n = normalize(vec3(bestQ * .85, h + .2));
  float lit = clamp(dot(n, normalize(vec3(SUN, .9))), 0.0, 1.0);
  float ring = smoothstep(1.5, 1.0, best) * (1.0 - cover);
  return vec4(cover, lit, ring, tone);
}

// The riverbed's own colour (before light, water and caustics reach it)
// and its depth. Nothing here moves, so it is rendered once per size into a
// texture that the pond shader samples through the moving surface.
vec4 bedAlbedo(vec2 p, float aspect) {
  float depth = pondDepth(p, aspect);
  // The bed: dark silt, paler sand toward the shallows, and stones, larger
  // ones scattered sparsely, pebbles gathering toward the bank.
  float silt = fbm(p * vec2(4.0, 6.0) + 11.0);
  float sandy = smoothstep(.42, .72, fbm(p * 1.4 + 3.0)) * (.3 + .7 * (1.0 - depth));
  vec3 bed = mix(MUD_DARK, MUD, silt);
  bed = mix(bed, SAND * (.85 + .3 * silt), sandy);
  // Darker organic patches (old leaves, weed) and a fine sediment grain.
  float rot = smoothstep(.55, .78, fbm(p * 3.1 + 21.0));
  bed = mix(bed, MUD_DARK * vec3(.8, .85, .7), rot * .55);
  bed *= .9 + .2 * noise(p * 60.0);
  // Algae greens the stones in patches, more so out in the deeper water.
  float moss = smoothstep(.35, .75, fbm(p * 2.6 + 40.0)) * (.35 + .5 * depth);
  vec3 algae = mix(STONE_DARK, WATER_SHALLOW, .55);
  vec4 big = stones(p, 6.0, .06 + (1.0 - depth) * .22);
  vec4 small = stones(p + 3.7, 15.0, .06 + (1.0 - depth) * .4);
  bed *= 1.0 - .3 * max(big.z, small.z * .7);
  vec3 bigStone = mix(mix(STONE_DARK, STONE_LIGHT, .2 + .7 * big.w), algae, moss);
  vec3 smallStone = mix(mix(STONE_DARK, STONE_LIGHT, .15 + .7 * small.w), algae, moss * .8);
  // Stone tops catch the key light, warm at night.
  vec3 catchLight = mix(vec3(1.0), LIGHT * 1.35, .5 - DAY * .5);
  bed = mix(bed, bigStone * (.62 + .48 * big.y) * mix(vec3(1.0), catchLight, big.y), big.x);
  bed = mix(bed, smallStone * (.66 + .42 * small.y) * mix(vec3(1.0), catchLight, small.y), small.x * (1.0 - big.x));
  return vec4(clamp(bed, 0.0, 1.0), depth);
}`;

/**
 * The riverbed pass: colour and depth of the bed for every pixel, rendered
 * into a texture once per canvas size (see frog-webgl.ts).
 */
export function frogBedShader(theme: FrogTheme) {
  return /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
${themeConstants(theme)}
${SHADER_UTILS}
${BANK}
${BED_FUNCTIONS}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.y;
  outColor = bedAlbedo(uv, u_resolution.x / u_resolution.y);
}`;
}

// A pond seen from above, in one of two lights (see frog-theme.ts): a
// riverbed of silt, sand and stones under a water column that deepens toward
// the middle, the sky and sun reflected in the surface, floating lily pads
// that shade the bed, frogs built from signed-distance shapes around a
// rigged pose (see frog-world.ts), fireflies or midges, and reeds.
// Coordinates are canvas-height units, y up. Frog-local coordinates are body
// lengths, snout toward +x.
export function frogFragmentShader(theme: FrogTheme) {
  return /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_ripples[8];
uniform int u_padCount;
uniform vec4 u_padA[${MAX_PADS}];  // x, y, radius, angle
uniform vec4 u_padB[${MAX_PADS}];  // notch, bob, age, rim damage
uniform vec4 u_padC[${MAX_PADS}];  // load x, y (pad-local), load
uniform vec4 u_padD[${MAX_PADS}];  // press x, y (pad-local), press
uniform int u_frogCount;
uniform vec4 u_frogA[3];  // x, y, body heading, body length
uniform vec4 u_frogB[3];  // height, stretch, blink, throat
uniform vec4 u_frogC[3];  // tongue tip x, y, tongue extension, submerged
uniform vec4 u_frogD[3];  // palette, swim speed, left web, right web
uniform vec4 u_frogE[3];  // lean, look, impact, startle
uniform vec4 u_legs[30];  // frog-local capsules: a.xy, b.xy
uniform int u_flyCount;  // fireflies (or midges); the motes follow them in u_flies
uniform vec4 u_flies[${MAX_SPECKS}];  // x, y, glow (night) or visibility (day), height
uniform vec4 u_moteBox;  // where the motes are (x0, y0, x1, y1), glow and shadows included
uniform sampler2D u_bed;  // riverbed colour and depth (frogBedShader)
uniform sampler2D u_caustic;  // tileable caustic web, brightness in alpha (day only)
uniform sampler2D u_bank;  // the bank, premultiplied (frog-bank-paint.ts)
uniform vec4 u_reedEnds[${REED_BLADES}];  // per blade: root.xy, tip.xy (reedBlades)
uniform vec4 u_reedShape[${REED_BLADES}];  // per blade: width, bend, tone
uniform vec4 u_reedBox;  // the reeds' bounding box, shadows included

${themeConstants(theme)}
${SHADER_UTILS}
${BANK}
vec3 rippleField(vec2 p) {
  vec3 result = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 r = u_ripples[i];
    float age = u_time - r.z;
    if (r.z > 0.0 && age >= 0.0 && age < 3.0) {
      vec2 delta = p - r.xy;
      float d = length(delta);
      float front = d - age * .17;
      float ring = exp(-abs(front) * 80.0);
      float echo = exp(-abs(front + .022) * 95.0) * .45;
      float fade = exp(-age * 1.3) * r.w;
      result.x += (ring - echo * .6) * fade;
      result.yz += delta / max(d, .0001) * (ring - echo) * fade;
    }
  }
  return result;
}

// ---- Lily pad outline (the bed needs it for the pads' shadows) -------------

float padShape(int i, vec2 p, out vec2 local) {
  vec4 A = u_padA[i];
  vec4 B = u_padB[i];
  float radius = A.z * (1.0 + B.y * .03);
  local = rotate(-A.w) * (p - A.xy);
  float a = atan(local.y, local.x);
  float r = length(local);
  float edge = radius * (1.0 + .016 * sin(a * 5.0 + float(i) * 1.7)
    + .008 * sin(a * 13.0 + float(i) * 4.1));
  float circle = r - edge;
  float halfNotch = B.x * .5;
  float wedge = abs(a) < halfNotch
    ? -r * sin(halfNotch - abs(a))
    : r * sin(min(abs(a) - halfNotch, 1.5));
  float d = max(circle, -wedge + .0015);
  // Older pads have a torn bite or two out of the rim.
  if (B.w > 0.0) {
    float bite = float(i) * 2.3 + 2.0;
    d = max(d, -(length(local - vec2(cos(bite), sin(bite)) * radius * 1.03) - radius * .17 * B.w));
    bite += 1.9;
    d = max(d, -(length(local - vec2(cos(bite), sin(bite)) * radius * 1.01) - radius * .08 * B.w));
  }
  return d;
}

// ---- Water ------------------------------------------------------------------

// Sunlight focused by the moving surface into a bright, shifting web on the
// bed: two copies of a baked cellular pattern (frog-caustics.ts) sliding
// past each other, bent by the surface. The same tile, scales and speeds as
// the Canvas fallback.
float caustics(vec2 p, float t) {
  vec2 warp = vec2(noise(p * 2.3 + t * .07), noise(p * 2.3 + 17.0 - t * .06)) - .5;
  vec2 q = (p + warp * .18) / CAUSTIC_TILE;
  float a = texture(u_caustic, q - t * vec2(.011, .006) / CAUSTIC_TILE).a;
  float b = texture(u_caustic, q / .71 - t * vec2(-.008, .01) / (CAUSTIC_TILE * .71)).a;
  return a * .45 + b * .3 + a * b * 1.1;
}

// Pads, and swimming frogs, block the light from the bed. The key light is
// high and to the upper right, so their shadows fall down and to the left,
// further and softer over deeper water.
float bedShadow(vec2 p, float depth) {
  vec2 reach = -normalize(SUN) * (.006 + depth * BED_SHADOW_REACH);
  vec2 q = p - reach;
  float blur = .004 + depth * .016;
  float shade = 0.0;
  for (int i = 0; i < ${MAX_PADS}; i++) {
    if (i >= u_padCount) break;
    if (length(q - u_padA[i].xy) > u_padA[i].z * 1.1 + blur) continue;
    vec2 local;
    float d = padShape(i, q, local);
    shade = max(shade, 1.0 - smoothstep(-blur, blur, d));
  }
  for (int f = 0; f < 3; f++) {
    if (f >= u_frogCount) break;
    if (u_frogC[f].w < .02) continue;
    vec4 A = u_frogA[f];
    vec2 local = rotate(-A.z) * (q - A.xy) / A.w;
    float d = (length(local / vec2(.62, .36)) - 1.0) * .3 * A.w;
    shade = max(shade, (1.0 - smoothstep(-blur, blur * 1.5, d)) * .8);
  }
  return shade;
}

vec3 water(vec2 p, vec3 wave, float aspect) {
  float t = u_time;
  // Seen through a moving surface the bed wobbles a little: more over deep
  // water, and under the passing ripples.
  float depth = texture(u_bed, p / vec2(aspect, 1.0)).a;
  vec2 surface = vec2(noise(p * 5.5 + t * vec2(.05, .08)), noise(p * 5.5 + 9.0 - t * vec2(.07, .04))) - .5;
  vec2 b = p + wave.yz * (.008 + depth * .018) + surface * .005 * (.35 + depth);
  vec3 bed = texture(u_bed, b / vec2(aspect, 1.0)).rgb;

  // Light on the bed: shaded under anything floating, and by day focused
  // into caustics that the ripples bend as they pass.
  float shade = bedShadow(p, depth);
  // At night the low light only really reaches the bed on the sunset side.
  vec2 toGlow = (p - GLOW * vec2(aspect, 1.0)) * vec2(1.05, 1.9);
  float bedGlow = exp(-dot(toGlow, toGlow) * 1.6);
  float light = BED_LIGHT * (1.0 - shade * SHADOW * 1.15) * (1.0 + (1.0 - DAY) * bedGlow * 1.6);
  if (CAUSTICS > 0.0) {
    float c = caustics(b + wave.yz * .02, t);
    light += c * CAUSTICS * (1.0 - shade) * (1.0 - depth * .35);
  }
  bed *= light;

  // The water column: clear over the shallows, deepening in colour toward
  // the middle, where less of the bed shows through.
  float column = 1.0 - exp(-(.22 + depth * 1.2) * TURBIDITY);
  vec3 color = mix(bed, mix(WATER_SHALLOW, WATER_DEEP, depth), column);

  // The surface: the sky reflected, brighter toward the light.
  float streak = fbm(vec2(p.x * 1.4, p.y * 3.2) + vec2(-t * .012, 3.0));
  vec3 sky = mix(SKY * .7, SKY, clamp(smoothstep(0.0, 1.15, p.y) * .8 + (streak - .5) * .35, 0.0, 1.0));
  color = mix(color, sky, SKY_REFLECT);
  vec2 sun = (p - GLOW * vec2(aspect, 1.0)) * vec2(1.05, 1.9);
  float glow = exp(-dot(sun, sun) * 2.6);
  color += LIGHT * glow * (DAY > .5 ? .16 + .12 * streak : .42 + .45 * streak);
  // Wind ripples catch the light in small glints: soft at night, crisp
  // sparkles in the sun.
  float glint = smoothstep(DAY > .5 ? .8 : .72, .9, fbm(rotate(.5) * p * vec2(34.0, 46.0) + t * vec2(.04, .11)));
  color += LIGHT * glint * (DAY > .5 ? glow * .9 + .1 : glow * .55 + .035);
  // Broken, slow horizontal reflections keep the surface itself alive.
  float reflection = smoothstep(.66, .86,
    noise(rotate(-.12) * p * vec2(8.0, 24.0) + vec2(t * .008, -t * .014)));
  color += mix(SKY * .5, LIGHT, .72) * reflection * (DAY > .5 ? .035 : .018 + glow * .075);
  // Moving ripples: brighter crests facing the light, darker troughs.
  float slope = dot(wave.yz, normalize(SUN));
  color *= 1.0 + clamp(slope * .9, -.35, .5);
  color += (LIGHT * .5 + .1) * max(wave.x, 0.0) * ((DAY > .5 ? .2 : .12) + glow * .4);
  return color;
}

// ---- Lily pads --------------------------------------------------------------

vec3 padColor(int i, vec2 local, float d) {
  vec4 A = u_padA[i];
  vec4 B = u_padB[i];
  vec4 C = u_padC[i];
  vec4 D = u_padD[i];
  float r = length(local) / A.z;
  float a = atan(local.y, local.x);
  float age = B.z;
  vec3 leaf = mix(PAD_A, PAD_B, noise(local * 40.0 + float(i) * 3.0));
  // Older pads yellow and brown from the rim inward, in patches.
  float blotch = noise(local * 22.0 + float(i) * 7.0);
  leaf = mix(leaf, PAD_AGED, age * smoothstep(.5, 1.0, r + blotch * .25) * (.35 + .65 * blotch));
  // Young pads keep a bronze-red rim.
  leaf = mix(leaf, PAD_YOUNG, (1.0 - smoothstep(0.0, .35, age)) * smoothstep(.84, .98, r) * .5);
  // Veins radiate from the centre.
  float vein = smoothstep(.93, 1.0, abs(cos(a * 6.5 + (noise(local * 18.0) - .5) * 2.4)))
    * smoothstep(.08, .25, r) * (1.0 - smoothstep(.85, 1.0, r));
  leaf *= 1.0 - vein * .15;
  leaf *= .85 + .15 * smoothstep(0.0, .2, r);
  // A frog's weight presses a shallow dip into the leaf, with a wet edge.
  float loaded = length(local - C.xy) / A.z;
  leaf *= 1.0 - .13 * C.z * (1.0 - smoothstep(0.0, .55, loaded));
  leaf += vec3(.02, .04, .05) * C.z * exp(-pow((loaded - .5) / .06, 2.0));
  // A tap or landing leaves a brief dimple that fills back in.
  float pressed = length(local - D.xy) / A.z;
  leaf *= 1.0 - .28 * D.z * (1.0 - smoothstep(0.0, .3, pressed));
  leaf += LIGHT * .14 * D.z * exp(-pow((pressed - .28 - (1.0 - D.z) * .25) / .05, 2.0));
  // A slightly upturned rim catches the light; a dark line where it meets water.
  float rim = smoothstep(-.006, -.001, d);
  leaf = mix(leaf, leaf * 1.25 + vec3(.02, .02, .01), rim * .6);
  vec2 sun = rotate(-A.w) * SUN;
  vec2 dir = normalize(local + 1e-5);
  float sheen = pow(max(0.0, dot(dir, sun)), 3.0) * smoothstep(.4, 1.0, r);
  leaf += LIGHT * sheen * (DAY > .5 ? .1 : .16);
  leaf += vec3(.05, .07, .06) * B.y * .5;
  return leaf;
}

// ---- Frogs ------------------------------------------------------------------

// Each frog is an individual: skin, marking, belly and eye colour (FROG_LOOKS).
${lookFunction('frogSkin', 'skin')}
${lookFunction('frogMark', 'mark')}
${lookFunction('frogBelly', 'belly')}
${lookFunction('frogIris', 'iris')}

// World point to frog-local body-length units. Height scales the frog up
// only slightly (lift 0 gives the ground-sized footprint for its shadow);
// stretch squashes or elongates it.
vec2 frogLocal(int f, vec2 p, float lift) {
  vec4 A = u_frogA[f];
  vec4 B = u_frogB[f];
  vec2 local = rotate(-A.z) * (p - A.xy) / (A.w * (1.0 + B.x * lift));
  return vec2(local.x / B.y, local.y * B.y);
}

// A fan of toes from an ankle or wrist, pointing along dir; hind feet are
// webbed between the toes. Returns the distance, and whether the nearest
// part is membrane rather than toe.
float foot(vec2 q, vec2 ankle, vec2 dir, float spread, float len, float toeR, int toes, float web, out float membrane) {
  vec2 p = q - ankle;
  vec2 f = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
  float d = 1e5;
  float span = float(toes - 1);
  for (int i = 0; i < 5; i++) {
    if (i >= toes) break;
    float k = float(i) / span * 2.0 - 1.0;
    float a = k * spread;
    // The outer-middle toe is the longest.
    float l = len * (.72 + .28 * sin((k * .8 + 1.0) * 1.35));
    vec2 tip = vec2(cos(a), sin(a)) * l;
    d = min(d, capsule(f, vec2(0.0), tip, toeR * 1.25, toeR * .75));
    d = min(d, length(f - tip) - toeR * 1.3);
  }
  membrane = 0.0;
  if (web > .05) {
    float r = length(f);
    float ang = atan(f.y, f.x);
    float between = fract((ang + spread) / (2.0 * spread) * span);
    // On the push the web should read as one soft paddle first, toes second.
    float edge = len * (.72 + .16 * web) * (1.0 - .1 * sin(between * PI));
    float m = max(r - edge, (abs(ang) - spread) * r);
    if (m < d) membrane = 1.0;
    d = min(d, m);
  }
  return d;
}

// x: distance; y: nearest part (0 thigh, 1 shin, 2 foot, 3 upper arm,
// 4 forearm, 5 toe, 6 web); z: position along that part. With full off,
// feet are simple discs (enough for a shadow).
vec3 legsSDF(int f, vec2 q, bool full) {
  vec4 D = u_frogD[f];
  float d = 1e5;
  vec3 best = vec3(1e5, 0.0, 0.0);
  for (int k = 0; k < 10; k++) {
    vec4 c = u_legs[f * 10 + k];
    int part = k % 5;
    vec2 radius = part == 0 ? vec2(.125, .074) : part == 1 ? vec2(.078, .048)
      : part == 2 ? vec2(.05, .034) : part == 3 ? vec2(.05, .038) : vec2(.038, .028);
    vec2 ab = c.zw - c.xy;
    float h = clamp(dot(q - c.xy, ab) / dot(ab, ab), 0.0, 1.0);
    float dk = length(q - c.xy - ab * h) - mix(radius.x, radius.y, h);
    if (dk < best.x) best = vec3(dk, float(part), h);
    d = smin(d, dk, .03);
    if (part == 2 || part == 4) {
      bool hind = part == 2;
      vec2 dir = normalize(ab);
      float len = hind ? HIND_TOE : FORE_TOE;
      float fd;
      float membrane = 0.0;
      if (full) {
        float web = k < 5 ? D.z : D.w;
        fd = foot(q, c.zw, dir, hind ? .18 + .38 * web : .62, len, hind ? .02 : .013,
          hind ? 5 : 4, hind ? web : 0.0, membrane);
      } else {
        fd = length(q - c.zw - dir * len * .45) - len * .5;
      }
      if (fd < best.x) best = vec3(fd, membrane > .5 ? 6.0 : 5.0, 0.0);
      d = smin(d, fd, .012);
    }
  }
  return vec3(d, best.yz);
}

float bodySDF(int f, vec2 q) {
  float throat = u_frogB[f].w;
  q.x += u_frogE[f].x;
  // Broad back and hips, a narrower head, a rounded snout.
  float d = ellipse(q - vec2(-.1, 0.0), vec2(.4, .265));
  d = smin(d, ellipse(q - vec2(-.3, 0.0), vec2(.19, .235)), .06);
  d = smin(d, ellipse(q - vec2(.24, 0.0), vec2(.24, .222)), .08);
  d = smin(d, ellipse(q - vec2(.41, 0.0), vec2(.1, .12)), .06);
  vec2 eyeQ = vec2(q.x - .27, abs(q.y) - .155);
  d = smin(d, length(eyeQ) - .078, .03);
  // Paired vocal sacs, the left one fractionally the larger.
  float sac = throat * (q.y > 0.0 ? 1.06 : .94);
  vec2 sacQ = vec2(q.x - .17, abs(q.y) - (.2 + sac * .06));
  d = smin(d, length(sacQ) - (.02 + sac * .075), .05);
  return d;
}

// Dark (x) and pale (y) dorsal markings, different for each frog.
vec2 markings(int palette, vec2 q) {
  vec2 warp = vec2(noise(q * 3.0 + 1.7), noise(q * 3.0 + 8.3)) - .5;
  if (palette == 1) {
    // A pale mid-back stripe, a dark mask through the eye, sparse speckle.
    float stripe = exp(-pow(q.y / .024, 2.0)) * smoothstep(-.48, -.3, q.x) * smoothstep(.46, .3, q.x);
    float mask = smoothstep(.035, .012, abs(abs(q.y) - .16 - (q.x - .27) * .35))
      * smoothstep(.06, .12, q.x) * smoothstep(.5, .4, q.x);
    float speckle = smoothstep(.73, .76, noise(q * 12.0 + warp * 2.0 + 4.0));
    return vec2(max(mask * .8, speckle * .7), stripe);
  }
  if (palette == 2) {
    // Gold ridges down each side of the back, and just a few spots.
    float ridge = exp(-pow((abs(q.y) - .15 + q.x * .07) / .02, 2.0))
      * smoothstep(-.44, -.28, q.x) * smoothstep(.26, .1, q.x);
    float spots = smoothstep(.69, .72, noise(q * 4.2 + warp + 21.0)) * smoothstep(.2, -.05, q.x);
    return vec2(spots * .8, ridge);
  }
  // Rounded dark blotches, pale-edged, over the back and hips.
  float n = noise(q * 10.0 + warp * 1.2 + 11.3);
  float blotch = smoothstep(.65, .68, n) * smoothstep(.22, 0.0, q.x - .08);
  float halo = smoothstep(.61, .65, n) * (1.0 - blotch);
  return vec2(blotch, halo * .35);
}

vec3 drawFrog(vec3 color, int f, vec2 p, float aa, vec3 waterTint) {
  vec4 A = u_frogA[f];
  vec4 B = u_frogB[f];
  vec4 C = u_frogC[f];
  vec4 E = u_frogE[f];
  int palette = int(u_frogD[f].x + .5);
  float scale = A.w * (1.0 + B.x * LIFT);
  float px = aa / scale;
  float submerged = C.w;
  float soft = px * (1.0 + submerged * 2.5);
  float alpha = 1.0 - submerged * .4;
  vec2 q = frogLocal(f, p, LIFT);
  vec2 sun = rotate(-A.z) * SUN;
  vec3 skin = frogSkin(palette);
  vec3 mark = frogMark(palette);
  vec3 belly = frogBelly(palette);
  float barStrength = ${FROG_LOOKS.map((look, i) => (i < FROG_LOOKS.length - 1 ? `palette == ${i} ? ${float(look.bars)} : ` : float(look.bars))).join('')};

  // Legs first, beneath the body.
  vec3 legs = legsSDF(f, q, true);
  float legMask = 1.0 - smoothstep(-soft, soft, legs.x);
  if (legMask > 0.0) {
    int part = int(legs.y + .5);
    vec3 c = skin * .84;
    // Dark cross-bars on thighs and shins, and a crease at each knee.
    if (part <= 1) {
      float bars = smoothstep(.2, .55, sin(legs.z * PI * (part == 0 ? 3.0 : 4.0) + float(f)));
      c = mix(c, mark, bars * barStrength);
      float knee = part == 0 ? smoothstep(.75, 1.0, legs.z) : smoothstep(.25, 0.0, legs.z);
      c *= 1.0 - knee * .25;
    }
    // Toes are paler at the tips; webbing is thin and lets the water through.
    if (part == 5) c = mix(c, belly * .75, .25);
    if (part == 6) c = mix(skin * .95 + vec3(.05, .04, 0.0), waterTint, .3);
    // Rounded limbs: lit along the sunward side, dark at the edge.
    c *= .72 + .38 * smoothstep(0.0, -.045, legs.x);
    c = mix(c, c * .55, smoothstep(-.012, 0.0, legs.x));
    c = mix(c, waterTint, submerged * .45);
    color = mix(color, c, legMask * alpha);
  }

  // Body.
  float body = bodySDF(f, q);
  float bodyMask = 1.0 - smoothstep(-soft, soft, body);
  if (bodyMask > 0.0) {
    vec2 bq = q + vec2(E.x, 0.0);
    vec3 c = skin;
    vec2 marks = markings(palette, bq);
    c = mix(c, mark, marks.x);
    c = mix(c, belly * .78, marks.y * .55);
    // Two pale folds along the back.
    float fold = exp(-pow((abs(bq.y) - .15 + bq.x * .06) / .016, 2.0))
      * smoothstep(-.45, -.3, bq.x) * smoothstep(.28, .12, bq.x);
    c = mix(c, c * 1.35 + vec3(.06, .05, .02), fold * .45);
    // Rounded back; the pale belly shows along the flanks; a dark line
    // where the body turns under.
    float dome = smoothstep(0.0, -.2, body);
    c *= .64 + .44 * dome;
    float flank = smoothstep(-.055, -.025, body) * (1.0 - smoothstep(-.014, -.004, body));
    c = mix(c, belly * .62, flank * .5 * smoothstep(.12, .22, abs(bq.y)) * smoothstep(.3, .1, bq.x));
    c = mix(c, c * .42, smoothstep(-.014, 0.0, body));
    // The key light along the sunward flank (warm at night).
    c += LIGHT * .1 * smoothstep(-.1, 0.0, body) * max(0.0, dot(normalize(bq + 1e-4), sun));
    // Wet skin: a soft sheen down the spine and a few crisp catch-lights.
    vec2 hq = (bq - vec2(-.06, 0.0) - sun * .07) / vec2(.26, .055);
    float sheen = exp(-dot(hq, hq)) * dome;
    float glints = smoothstep(.76, .8, noise(bq * 10.0 + float(palette) * 3.0))
      * dome * max(0.0, dot(normalize(bq + 1e-4), sun));
    c += vec3(.95, .9, .75) * (sheen * .08 + glints * .12);
    // The throat sac pales as it swells.
    float sac = B.w * (bq.y > 0.0 ? 1.06 : .94);
    vec2 sacQ = vec2(bq.x - .17, abs(bq.y) - (.2 + sac * .06));
    c = mix(c, belly * .95, smoothstep(.02 + sac * .075, 0.0, length(sacQ)) * sac * .75);
    // Eyes: iris, horizontal pupil turned toward what the frog watches,
    // a catch-light, and lids for blinking.
    vec2 eyeQ = vec2(bq.x - .27, abs(bq.y) - .155);
    float eye = length(eyeQ);
    if (eye < .09) {
      vec3 iris = mix(frogIris(palette) * .7, frogIris(palette), smoothstep(.06, .0, eye));
      // eyeQ mirrors the right eye onto the left, so mirror the gaze too.
      vec2 look = (vec2(cos(E.y), sin(E.y) * sign(bq.y + 1e-5)) - vec2(1.0, 0.0)) * .016;
      float pupil = 1.0 - smoothstep(.95, 1.1, length((eyeQ - look) / vec2(.046, .024)));
      iris = mix(iris, vec3(.03, .03, .02), pupil);
      iris += smoothstep(.018, .0, length(eyeQ - sun * .03)) * .65;
      float eyeMask = smoothstep(.068, .058, eye);
      vec3 lid = skin * .8;
      float closed = max(smoothstep(.2, .8, B.z), E.w * .35);
      c = mix(c, c * .5, smoothstep(.085, .068, eye) * (1.0 - eyeMask));
      c = mix(c, mix(iris, lid, closed), eyeMask);
    }
    c = mix(c, waterTint, submerged * .45);
    color = mix(color, c, bodyMask * alpha);
  }

  // Tongue, out to the firefly it is catching.
  if (C.z > 0.0) {
    vec2 tip = frogLocal(f, C.xy, LIFT);
    vec2 mouth = vec2(.46, 0.0);
    vec2 end = mix(mouth, tip, C.z);
    float tongue = min(capsule(q, mouth, end, .028, .022), length(q - end) - .045);
    color = mix(color, TONGUE, 1.0 - smoothstep(-px, px, tongue));
  }
  return color;
}

// The shadow keeps the frog's ground-sized footprint; height only moves it
// away along the light, softens it and makes it fainter.
float frogShadow(int f, vec2 p) {
  float h = u_frogB[f].x;
  // Cast away from the key light, which is up and to the right.
  vec2 offset = -normalize(SUN) * (.0094 + h * .336);
  vec2 q = frogLocal(f, p - offset, 0.0);
  float d = min(bodySDF(f, q), legsSDF(f, q, false).x + .01);
  float blur = .04 + h * .7;
  float strength = SHADOW * (1.0 - smoothstep(0.0, .3, h) * .45);
  return (1.0 - smoothstep(-blur * .5, blur, d)) * strength * (1.0 - u_frogC[f].w);
}

// A swimming frog's V-shaped wake, brighter just after a kick.
float wake(int f, vec2 p) {
  vec4 A = u_frogA[f];
  float speed = u_frogD[f].y;
  if (speed < .004) return 0.0;
  vec2 w = rotate(-A.z) * (p - A.xy) / A.w;
  float behind = -w.x - .3;
  if (behind <= 0.0 || behind > 3.0) return 0.0;
  float spread = .2 + behind * .42;
  float arm = exp(-pow((abs(w.y) - spread) / (.05 + behind * .035), 2.0));
  return arm * exp(-behind * 1.1) * smoothstep(0.0, .25, behind) * min(speed * 7.0, 1.0);
}

// ---- Fireflies, midges and motes -------------------------------------------

// Below everything that floats: at night a firefly's glow reflected in the
// water, offset by its height; by day a midge's tiny soft shadow. Pixels
// too far off to matter skip the exponentials.
vec3 speckBelow(vec3 color, vec4 fly, vec2 uv) {
  if (fly.z <= 0.0) return color;
  if (DAY > .5) {
    vec2 d = uv - fly.xy + normalize(SUN) * fly.w * .6;
    float r2 = dot(d, d);
    if (r2 > .0002) return color;
    return color * (1.0 - .22 * fly.z * exp(-r2 / .000018));
  }
  vec2 d = uv - fly.xy + vec2(0.0, fly.w);
  float r2 = dot(d, d);
  if (r2 > .002) return color;
  return color + FLY_GLOW * .9 * fly.z * .22 * exp(-r2 / .00022);
}

// Above everything: at night a firefly's glow; by day a midge, a dark speck
// with a flicker of wings that catch the sun.
vec3 speckAbove(vec3 color, vec4 fly, vec2 uv, float i) {
  if (fly.z <= 0.0) return color;
  vec2 d = uv - fly.xy;
  float r2 = dot(d, d);
  if (DAY > .5) {
    if (r2 > .0003) return color;
    float beat = .5 + .5 * sin(u_time * 60.0 + i * 1.7);
    vec2 wing = vec2(abs(d.x) - .0032, d.y - .0008);
    float wings = exp(-dot(wing, wing) / (.0000045 + beat * .000003));
    color = mix(color, FLY_GLOW, wings * .45 * fly.z);
    return mix(color, FLY_BODY, exp(-r2 / .0000028) * .9 * fly.z);
  }
  if (r2 > .004) return color;
  return color + FLY_GLOW * fly.z * (exp(-r2 / .0000075) * 1.2 + exp(-r2 / .00045) * .3);
}

bool nearMotes(vec2 p) {
  return p.x > u_moteBox.x && p.y > u_moteBox.y && p.x < u_moteBox.z && p.y < u_moteBox.w;
}

// ---- Foreground reeds -------------------------------------------------------

// Distance to blade k, a tapered, gently bent blade (reedBlades in
// frog-bank.ts); y is the side of the blade's axis (-1 … 1), z how far along it.
vec3 blade(vec2 p, int k) {
  vec2 root = u_reedEnds[k].xy;
  vec2 axis = u_reedEnds[k].zw - root;
  float h = clamp(dot(p - root, axis) / dot(axis, axis), 0.0, 1.0);
  vec2 n = normalize(vec2(-axis.y, axis.x));
  vec2 centre = root + axis * h + n * sin(h * PI) * u_reedShape[k].y;
  float breadth = u_reedShape[k].x * (1.0 - h * .88) + .0005;
  vec2 rel = p - centre;
  return vec3(length(rel) - breadth, clamp(dot(rel, n) / breadth, -1.0, 1.0), h);
}

// Whether p is anywhere near blade k (its root-to-tip box, grown by its
// width and bend), so most pixels skip the blade entirely.
bool nearBlade(vec2 p, int k) {
  vec4 e = u_reedEnds[k];
  float grow = u_reedShape[k].x + abs(u_reedShape[k].y) + .004;
  return p.x > min(e.x, e.z) - grow && p.x < max(e.x, e.z) + grow && p.y > min(e.y, e.w) - grow && p.y < max(e.y, e.w) + grow;
}

// A seed head on blade k, four fifths of the way up.
float seedHead(vec2 p, int k, vec2 size) {
  vec2 root = u_reedEnds[k].xy;
  vec2 axis = normalize(u_reedEnds[k].zw - root);
  vec2 centre = mix(root, u_reedEnds[k].zw, .8);
  return ellipse(rotate(atan(axis.x, axis.y)) * (p - centre), size);
}

// Two clumps of reeds growing at the water's edge (on the left bank and the
// bottom bank), the far blades hazier, each casting a soft shadow away from
// the light, and a seed head on one stem in each clump.
vec3 reeds(vec3 color, vec2 p, float aa) {
  if (p.x < u_reedBox.x || p.y < u_reedBox.y || p.x > u_reedBox.z || p.y > u_reedBox.w) return color;
  vec2 offset = -normalize(SUN) * REED_SHADOW;
  float shade = 0.0;
  for (int k = 0; k < ${REED_BLADES}; k++) {
    if (!nearBlade(p - offset, k)) continue;
    shade = max(shade, 1.0 - smoothstep(-aa * 3.0, aa * 3.0, blade(p - offset, k).x));
  }
  color *= 1.0 - shade * SHADOW * .45;
  for (int k = 0; k < ${REED_BLADES}; k++) {
    if (!nearBlade(p, k)) continue;
    vec3 b = blade(p, k);
    float mask = 1.0 - smoothstep(-aa, aa, b.x);
    if (mask <= 0.0) continue;
    float tone = u_reedShape[k].z;
    // Nearer blades are darker; further ones take a little of the haze.
    vec3 c = mix(REED_NEAR, REED_FAR, tone);
    c *= .75 + .45 * b.z;
    // A mid-rib, and the sunward edge catching warm light toward the tip.
    c *= 1.0 - .25 * exp(-b.y * b.y * 30.0);
    c += REED_EDGE * smoothstep(.15, .95, -b.y) * smoothstep(.2, .8, b.z) * (.2 + tone * .35);
    color = mix(color, c, mask * .97);
  }
  float head = min(seedHead(p, ${REED_HEADS[0][0]}, vec2(${float(REED_HEADS[0][1])}, ${float(REED_HEADS[0][2])})),
    seedHead(p, ${REED_HEADS[1][0]}, vec2(${float(REED_HEADS[1][1])}, ${float(REED_HEADS[1][2])})));
  vec3 brown = REED_HEAD + REED_HEAD_RIM * smoothstep(-.005, 0.0, head);
  return mix(color, brown, 1.0 - smoothstep(-aa, aa, head));
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 uv = pixel / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;
  float aa = 1.3 / u_resolution.y;
  vec3 wave = rippleField(uv);
  vec3 color = water(uv, wave, aspect);
  vec3 waterTint = color;

  // At night the fireflies' glow is reflected, offset by each one's height;
  // by day the midges throw tiny soft shadows on the water instead. The
  // motes (only ever a few, close together) are looked at only near them.
  for (int i = 0; i < ${MAX_FLIES}; i++) {
    if (i >= u_flyCount) break;
    color = speckBelow(color, u_flies[i], uv);
  }
  if (nearMotes(uv)) {
    for (int i = ${MAX_FLIES}; i < ${MAX_SPECKS}; i++) color = speckBelow(color, u_flies[i], uv);
  }

  // Swimming frogs are in the water, under the pads, trailing a wake.
  for (int f = 0; f < 3; f++) {
    if (f >= u_frogCount) break;
    if (u_frogC[f].w < .02) continue;
    if (length(uv - u_frogA[f].xy) > u_frogA[f].w * 4.2) continue;
    color += (LIGHT * .35 + .06) * wake(f, uv) * (DAY > .5 ? .16 : .1);
    if (length(uv - u_frogA[f].xy) > u_frogA[f].w * 1.6) continue;
    color = drawFrog(color, f, uv + wave.yz * .002, aa, waterTint);
  }

  // Lily pads, each with a soft contact shadow on the water.
  for (int i = 0; i < ${MAX_PADS}; i++) {
    if (i >= u_padCount) break;
    if (length(uv - u_padA[i].xy) > u_padA[i].z * 1.4) continue;
    vec2 local;
    // A contact shadow on the surface, cast away from the light. (The bed
    // gets its own, deeper shadow in water().)
    float shadow = padShape(i, uv + normalize(SUN) * .0072, local);
    color *= 1.0 - (1.0 - smoothstep(0.0, .014, shadow)) * PAD_SHADOW;
    float d = padShape(i, uv, local);
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask > 0.0) color = mix(color, padColor(i, local, d), mask);
  }

  // The bank over the water's edge (and over a swimmer close to it).
  vec4 bank = texture(u_bank, pixel / u_resolution);
  color = color * (1.0 - bank.a) + bank.rgb;

  // Frogs on pads or in the air, with shadows that separate as they rise.
  // They come after the bank: a leap near the shore passes over the grass.
  for (int f = 0; f < 3; f++) {
    if (f >= u_frogCount) break;
    if (u_frogC[f].w >= .02) continue;
    // A fully extended leg and its toes reach about 1.4 body lengths; the
    // shadow sits a little further off as the frog rises.
    float reach = u_frogA[f].w * (1.6 + u_frogB[f].x * 6.0);
    if (length(uv - u_frogA[f].xy) > reach) continue;
    color *= 1.0 - frogShadow(f, uv);
    color = drawFrog(color, f, uv, aa, waterTint);
  }

  // Fireflies at night; by day, midges. Motes from the grass are drawn the
  // same way.
  for (int i = 0; i < ${MAX_FLIES}; i++) {
    if (i >= u_flyCount) break;
    color = speckAbove(color, u_flies[i], uv, float(i));
  }
  if (nearMotes(uv)) {
    for (int i = ${MAX_FLIES}; i < ${MAX_SPECKS}; i++) color = speckAbove(color, u_flies[i], uv, float(i));
  }

  color = reeds(color, uv, aa);
  float vignette = smoothstep(.95, .3,
    length((uv - vec2(aspect * .5, .5)) / vec2(aspect * .68, .78)));
  color *= VIGNETTE + vignette * (1.0 - VIGNETTE);
  color += (hash(floor(pixel * .72)) - .5) * (DAY > .5 ? .04 : .05);
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
}
