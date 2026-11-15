// The koi's WebGL2 shaders. Colours come from the theme (spec A-6); the
// shapes come from the shared mesh and atlas (koi-shape.ts, koi-paint.ts).
// What only the GPU adds: the water's moving light (caustics) over the floor
// and the koi's back, and ripples that bend the floor seen through them.

import { glslFloat } from 'critter-kit';
import { RIPPLE } from './koi-shape';
import { KOI_PALETTE as P } from './theme';

const vec3 = (c: readonly number[]) => `vec3(${c.map((n) => glslFloat(n)).join(',')})`;

const CAUSTIC = /* glsl */ `
float caustic(vec2 p, float t){
  vec2 q = p * 11.0;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    q = mat2(0.8, -0.6, 0.6, 0.8) * q * 1.35 + vec2(t * 0.31, -t * 0.27);
    c += abs(sin(q.x + sin(q.y * 0.9 + t)) * cos(q.y + sin(q.x * 1.1 - t)));
  }
  return pow(clamp(1.0 - c / 1.6, 0.0, 1.0), 3.0);
}`;

const RIPPLES = /* glsl */ `
uniform vec4 u_events[8];
// Height of the ripples at p, and its gradient (for bending the floor and catching the light).
vec3 ripples(vec2 p){
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 e = u_events[i];
    float age = u_time - e.z;
    if (e.z <= 0.0 || age < 0.0 || age > ${glslFloat(RIPPLE.life)}) continue;
    float fade = pow(1.0 - age / ${glslFloat(RIPPLE.life)}, 2.0) * e.w;
    vec2 d = p - e.xy;
    float r = length(d) + 1e-5;
    for (int k = 0; k < 2; k++) {
      float radius = 0.012 + age * ${glslFloat(RIPPLE.speed)} * (k == 0 ? 1.0 : 0.62);
      float x = (r - radius) / ${glslFloat(RIPPLE.width)};
      float h = sin(x * 2.2) * exp(-x * x) * fade * (k == 0 ? 1.0 : 0.6);
      float dh = (2.2 * cos(x * 2.2) - 2.0 * x * sin(x * 2.2)) * exp(-x * x) * fade * (k == 0 ? 1.0 : 0.6);
      sum += vec3(h, d / r * dh);
    }
  }
  return sum;
}`;

export const waterVertex = /* glsl */ `#version 300 es
const vec2 V[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main(){ gl_Position = vec4(V[gl_VertexID], 0.0, 1.0); }`;

export const waterFragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_floor;
uniform vec2 u_resolution;
uniform float u_time;
/** 0: the floor seen through the water; 1: ripple highlights on the surface (drawn last). */
uniform int u_mode;
out vec4 outColor;
${CAUSTIC}
${RIPPLES}
void main(){
  float h = u_resolution.y;
  float aspect = u_resolution.x / h;
  vec2 p = gl_FragCoord.xy / h;
  vec3 rip = ripples(p);
  if (u_mode == 1) {
    // Light caught on the side of each ring facing the upper left; shade on the other.
    float lit = dot(rip.yz, normalize(vec2(-0.6, 0.8)));
    vec3 col = lit > 0.0 ? ${vec3(P.ripple)} : ${vec3(P.shadow)};
    float a = clamp(abs(lit) * 0.11, 0.0, 0.5);
    outColor = vec4(col * a, a);
    return;
  }
  // The floor, bent a little by the surface and by any ripple.
  vec2 wobble = 0.0012 * vec2(sin(p.y * 31.0 + u_time * 0.6), cos(p.x * 27.0 - u_time * 0.5));
  vec2 st = (p + wobble + rip.yz * 0.0016) / vec2(aspect, 1.0);
  vec3 col = texture(u_floor, vec2(st.x, 1.0 - st.y)).rgb;
  col += ${vec3(P.sheen)} * caustic(p, u_time) * 0.075;
  outColor = vec4(col, 1.0);
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
/** How much of the water's moving light falls on this layer (the koi just under the surface). */
uniform float u_light;
in vec2 v_st;
in float v_alpha;
in vec2 v_world;
out vec4 outColor;
${CAUSTIC}
void main(){
  vec4 c = texture(u_atlas, v_st) * v_alpha;
  c.rgb *= 1.0 + u_light * 0.16 * caustic(v_world, u_time);
  outColor = c;
}`;
