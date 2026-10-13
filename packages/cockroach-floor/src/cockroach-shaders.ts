// The GPU renderer's shaders (spec A-6, A-7): one full-screen pass, with
// every colour and shape constant generated from cockroach-theme.ts and
// cockroach-shape.ts, so the Canvas renderer and the hit test draw the same
// thing. /* glsl */ templates are minified at build (F-7).

import { glslFloat } from '@critters/critter-kit';
import { COCKROACH_PALETTE as P } from './cockroach-theme';
import { CAPSULES, LEG_NAMES, LEG_SEGMENTS, MAX_CRUMBS } from './cockroach-world';
import {
  ANTENNA_RADIUS,
  BODY_PARTS,
  LEG_RADII,
  PRONOTUM_BACK,
  SEGMENT_LINES,
  SHADOW_OFFSET,
  SHADOW_SOFTNESS,
  TEGMINA_BACK,
  bodyGlsl,
} from './cockroach-shape';

/** A float literal, parenthesised so a negative one can follow a minus sign (the minifier drops spaces). */
const float = (value: number) => (value < 0 ? `(${glslFloat(value)})` : glslFloat(value));
const vec3 = (c: readonly number[]) => `vec3(${c.map(float).join(',')})`;
const LEG_CAPSULES = LEG_NAMES.length * LEG_SEGMENTS;

export const vertexShader = /* glsl */ `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0); }`;

export const fragmentShader = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_resolution;
// The cockroach: centre (world units), drawn heading (radians), one body length (world units).
uniform vec4 u_body;
// Legs then antennae, in the cockroach's own frame (BL): x0, y0, x1, y1.
uniform vec4 u_caps[${CAPSULES}];
// Crumbs: x, y (world units), how much is left (0 … 1).
uniform vec3 u_crumbs[${MAX_CRUMBS}];
out vec4 outColor;

const vec2 SUN = vec2(${float(P.sun[0])}, ${float(P.sun[1])});
const vec3 LIGHT = ${vec3(P.light)};
const vec3 FLOOR = ${vec3(P.floor)};
const vec3 GRAIN = ${vec3(P.floorGrain)};
const vec3 MOTTLE = ${vec3(P.floorMottle)};
const vec3 PRONOTUM = ${vec3(P.pronotum)};
const vec3 PRONOTUM_EDGE = ${vec3(P.pronotumEdge)};
const vec3 TEGMINA = ${vec3(P.tegmina)};
const vec3 ABDOMEN = ${vec3(P.abdomen)};
const vec3 SEGMENT = ${vec3(P.segmentLine)};
const vec3 LEG = ${vec3(P.leg)};
const vec3 ANTENNA = ${vec3(P.antenna)};
const vec3 CRUMB = ${vec3(P.crumb)};
const vec3 CRUMB_SHADE = ${vec3(P.crumbShade)};

// Sine-free hash and value noise: stable at large pixel coordinates.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), u.x), u.y);
}

${bodyGlsl(float)}

float capD(vec2 p, vec4 c, float r) {
  vec2 a = c.xy, b = c.zw, ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h) - r;
}
float capRadius(int i) {
  if (i < ${LEG_CAPSULES}) {
    int s = i - (i / ${LEG_SEGMENTS}) * ${LEG_SEGMENTS};
    return s == 0 ? ${float(LEG_RADII[0])} : s == 1 ? ${float(LEG_RADII[1])} : ${float(LEG_RADII[2])};
  }
  return ${float(ANTENNA_RADIUS)};
}
/** Distance to the whole drawn animal (BL). */
float shapeD(vec2 q) {
  float d = bodyD(q);
  for (int i = 0; i < ${CAPSULES}; i++) d = min(d, capD(q, u_caps[i], capRadius(i)));
  return d;
}

void main() {
  float h = u_resolution.y;
  vec2 p = gl_FragCoord.xy / h;
  float aspect = u_resolution.x / h;

  // The floor: pale, with fine grain and a soft mottle.
  vec3 col = FLOOR;
  col = mix(col, MOTTLE, smoothstep(0.35, 0.75, noise(p * 9.0)) * 0.6);
  col = mix(col, GRAIN, smoothstep(0.62, 0.95, noise(gl_FragCoord.xy * 0.55)) * 0.5);

  // Crumbs, with a small contact shadow away from the light.
  for (int i = 0; i < ${MAX_CRUMBS}; i++) {
    vec3 c = u_crumbs[i];
    if (c.z <= 0.0) continue;
    float r = 0.011 * (0.35 + 0.65 * c.z);
    vec2 d = p - c.xy;
    float wobble = 1.0 + 0.18 * sin(atan(d.y, d.x) * 5.0 + float(i) * 2.1);
    float shade = 1.0 - smoothstep(r * 0.6, r * 1.5, length(d + SUN * r * 0.5));
    col *= 1.0 - 0.25 * shade;
    float body = 1.0 - smoothstep(r * wobble - 1.0 / h, r * wobble + 1.0 / h, length(d));
    vec3 lit = mix(CRUMB_SHADE, CRUMB, clamp(0.6 + 0.6 * dot(normalize(d + 1e-5), SUN), 0.0, 1.0));
    col = mix(col, lit, body);
  }

  // The cockroach, in its own frame (BL), detailed only near it (F-10).
  float size = u_body.w;
  float ch = cos(u_body.z), sh = sin(u_body.z);
  vec2 w = (p - u_body.xy) / size;
  vec2 q = vec2(w.x * ch + w.y * sh, -w.x * sh + w.y * ch);
  if (length(q) < 1.6) {
    float px = 1.0 / (h * size);
    vec2 sunLocal = vec2(SUN.x * ch + SUN.y * sh, -SUN.x * sh + SUN.y * ch);
    // Shadow: the same shape, offset away from the light, soft (P-7, V-5).
    float sd = shapeD(q + sunLocal * ${float(SHADOW_OFFSET)});
    col *= 1.0 - ${float(P.shadow)} * (1.0 - smoothstep(-${float(SHADOW_SOFTNESS * 0.3)}, ${float(SHADOW_SOFTNESS)}, sd));

    // Legs (under the body).
    for (int i = 0; i < ${LEG_CAPSULES}; i++) {
      float r = capRadius(i);
      float d = capD(q, u_caps[i], r);
      float a = 1.0 - smoothstep(-px, px, d);
      float edge = smoothstep(-r, 0.0, d);
      col = mix(col, LEG * (1.05 - 0.45 * edge), a);
    }

    // Body: a dome lit from the key light, the pronotum's pale margin, wing pads, segment lines.
    float bd = bodyD(q);
    float inside = 1.0 - smoothstep(-px, px, bd);
    if (inside > 0.0) {
      float yy = q.y / 0.2;
      vec3 base = q.x > ${float(PRONOTUM_BACK)} - 0.05 * yy * yy ? PRONOTUM
                : q.x > ${float(TEGMINA_BACK)} - 0.09 * yy * yy ? TEGMINA : ABDOMEN;
      vec3 pr = vec3(${float(BODY_PARTS.pronotum[0])}, ${float(BODY_PARTS.pronotum[1])}, ${float(BODY_PARTS.pronotum[2])});
      float pd = ellipseD(q - vec2(pr.x, 0.0), pr.yz);
      if (q.x > ${float(PRONOTUM_BACK)} - 0.05 * yy * yy) base = mix(base, PRONOTUM_EDGE, smoothstep(-0.05, -0.012, pd) * 0.85);
      if (q.x < ${float(TEGMINA_BACK)} - 0.09 * yy * yy) {
        ${SEGMENT_LINES.map((x) => `base = mix(base, SEGMENT, (1.0 - smoothstep(0.0, 0.006 + px, abs(q.x - ${float(x)} - 0.035 * yy * yy))) * 0.8);`).join('\n        ')}
      }
      // Seams: where the pronotum and the wing pads end.
      base *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.007 + px, abs(q.x - ${float(PRONOTUM_BACK)} + 0.05 * yy * yy)));
      base *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.007 + px, abs(q.x - ${float(TEGMINA_BACK)} + 0.09 * yy * yy)));
      vec2 e = vec2(q.x / 0.5, q.y / 0.2);
      vec3 n = normalize(vec3(e * 0.85, sqrt(max(0.0, 1.0 - dot(e, e)))));
      vec3 l = normalize(vec3(sunLocal * 0.7, 0.75));
      float diffuse = 0.62 + 0.5 * dot(n, l);
      float sheen = pow(max(dot(reflect(-l, n), vec3(0, 0, 1)), 0.0), 22.0) * ${float(P.sheen)};
      vec3 body = base * diffuse + LIGHT * sheen;
      // A thin dark rim reads the outline against the floor.
      body *= 1.0 - 0.35 * smoothstep(-0.02, 0.0, bd);
      col = mix(col, body, inside);
    }

    // Antennae (over everything, from the head).
    for (int i = ${LEG_CAPSULES}; i < ${CAPSULES}; i++) {
      float d = capD(q, u_caps[i], ${float(ANTENNA_RADIUS)});
      col = mix(col, ANTENNA, 1.0 - smoothstep(-px * 0.7, px * 0.7, d));
    }
  }

  // Vignette, with the picture's edge done by the page's mask (E-11).
  vec2 v = (p - vec2(aspect * 0.5, 0.5)) / vec2(aspect * 0.5, 0.5);
  col *= mix(${float(P.vignette)}, 1.0, 1.0 - smoothstep(0.4, 1.4, dot(v, v)));
  outColor = vec4(col, 1.0);
}`;
