// The grass snake's WebGL2 shaders. Colours come from the theme (spec A-6);
// shapes come from the shared mesh and atlas (snake-shape.ts, snake-paint.ts).
// What the GPU adds: native screen-space mineral/soil micro-grain so the
// meadow floor is tack-sharp at any DPI, warm woodland-canopy dappled sunlight
// shared across the bank, the snake and the overhanging grass blades, and a
// subtle sunlit dust/rustle shimmer where a visitor taps.

import { glslFloat } from '@critters/critter-kit';
import { RING } from './snake-shape';
import { SNAKE_PALETTE as P } from './theme';

const vec3 = (c: readonly number[]) => `vec3(${c.map((n) => glslFloat(n)).join(',')})`;

const DAPPLE = /* glsl */ `
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float dapple(vec2 p, float t){
  vec2 q = p * 5.2;
  float a = sin(q.x + 0.55 * sin(q.y * 1.35 + t * 0.28)) * cos(q.y - 0.55 * cos(q.x * 1.15 - t * 0.24));
  vec2 r = p * 11.4 + vec2(1.7, -0.9);
  float b = sin(r.x - 0.4 * cos(r.y * 1.2 - t * 0.35)) * cos(r.y + 0.4 * sin(r.x * 1.3 + t * 0.31));
  return smoothstep(0.18, 0.84, 0.5 + 0.34 * a + 0.16 * b);
}`;

const RINGS = /* glsl */ `
uniform vec4 u_events[8];
vec3 rings(vec2 p){
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 e = u_events[i];
    float age = u_time - e.z;
    if (e.z <= 0.0 || age < 0.0 || age > ${glslFloat(RING.life)}) continue;
    float fade = pow(1.0 - age / ${glslFloat(RING.life)}, 2.2) * e.w;
    vec2 d = p - e.xy;
    float r = length(d) + 1e-5;
    for (int k = 0; k < 2; k++) {
      float radius = 0.012 + age * ${glslFloat(RING.speed)} * (k == 0 ? 1.0 : 0.58);
      float x = (r - radius) / ${glslFloat(RING.width)};
      float h = sin(x * 2.0) * exp(-x * x) * fade * (k == 0 ? 1.0 : 0.5);
      float dh = (2.0 * cos(x * 2.0) - 2.0 * x * sin(x * 2.0)) * exp(-x * x) * fade * (k == 0 ? 1.0 : 0.5);
      sum += vec3(h, d / r * dh);
    }
  }
  return sum;
}`;

export const floorVertex = /* glsl */ `#version 300 es
const vec2 V[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main(){ gl_Position = vec4(V[gl_VertexID], 0.0, 1.0); }`;

export const floorFragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_floor;
uniform vec2 u_resolution;
uniform float u_time;
/** 0: sunlit mossy bank & stones floor; 1: subtle grass-rustle shimmer ring where tapped. */
uniform int u_mode;
out vec4 outColor;
${DAPPLE}
${RINGS}
void main(){
  float h = u_resolution.y;
  float aspect = u_resolution.x / h;
  vec2 p = gl_FragCoord.xy / h;
  vec3 rip = rings(p);
  if (u_mode == 1) {
    float lit = dot(rip.yz, normalize(vec2(0.65, 0.76)));
    vec3 col = lit > 0.0 ? ${vec3(P.ring)} : ${vec3(P.shadow)};
    float a = clamp(abs(lit) * 0.075, 0.0, 0.34);
    outColor = vec4(col * a, a);
    return;
  }
  vec2 st = p / vec2(aspect, 1.0);
  vec3 col = texture(u_floor, vec2(st.x, 1.0 - st.y)).rgb;
  // Crisp native-resolution mineral/soil micro-grain so the ground never looks blurry.
  float micro = (hash21(floor(gl_FragCoord.xy * 0.75)) - 0.5) * 0.026;
  col += micro;
  // Warm woodland-canopy dappled sunlight patches across the bank and stones.
  float sunPatch = dapple(p, u_time);
  col = mix(col * 0.93, col + ${vec3(P.sun)} * 0.058, sunPatch);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const meshVertex = /* glsl */ `#version 300 es
in vec2 a_position;
in vec2 a_st;
in float a_alpha;
uniform float u_aspect;
out vec2 v_st;
out float v_alpha;
out vec2 v_world;
void main(){
  v_st = a_st;
  v_alpha = a_alpha;
  v_world = a_position;
  gl_Position = vec4(a_position.x / u_aspect * 2.0 - 1.0, a_position.y * 2.0 - 1.0, 0.0, 1.0);
}`;

export const meshFragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform float u_time;
uniform float u_light;
in vec2 v_st;
in float v_alpha;
in vec2 v_world;
out vec4 outColor;
${DAPPLE}
void main(){
  vec4 c = texture(u_atlas, v_st) * v_alpha;
  float sunPatch = dapple(v_world, u_time);
  c.rgb *= 1.0 + u_light * (0.11 * sunPatch - 0.03);
  outColor = c;
}`;
