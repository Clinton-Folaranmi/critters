// The Canvas 2D fallback (spec A-8, F-8): the same floor, crumbs, shadow and
// cockroach as the GPU renderer, from the same shape and theme modules, drawn
// with paths. Loaded only when WebGL can't be used.

import { makeCanvas, seeded, type RendererHooks, type SceneRenderer } from 'critter-kit';
import {
  ANTENNA_RADIUS,
  BODY_PARTS,
  LEG_RADII,
  PRONOTUM_BACK,
  SEGMENT_LINES,
  SHADOW_OFFSET,
  SHADOW_SOFTNESS,
  TEGMINA_BACK,
  bodyOutline,
} from './cockroach-shape';
import { COCKROACH_PALETTE as P } from './cockroach-theme';
import { CAPSULES, LEG_NAMES, LEG_SEGMENTS, type CockroachWorld } from './cockroach-world';

type RGB = readonly [number, number, number];
const css = (c: RGB, alpha = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
const LEG_CAPSULES = LEG_NAMES.length * LEG_SEGMENTS;

/** The floor, painted once per size: base colour, soft mottle, fine grain. */
function paintFloor(width: number, height: number) {
  const layer = makeCanvas(width, height);
  const ctx = layer.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = css(P.floor);
  ctx.fillRect(0, 0, width, height);
  const random = seeded(31);
  // Mottle: large soft blots.
  for (let i = 0; i < 90; i++) {
    const x = random() * width;
    const y = random() * height;
    const r = (0.04 + random() * 0.08) * height;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(P.floorMottle, 0.35));
    g.addColorStop(1, css(P.floorMottle, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grain: fine specks.
  ctx.fillStyle = css(P.floorGrain, 0.5);
  for (let i = 0; i < (width * height) / 90; i++) ctx.fillRect(random() * width, random() * height, 1.2, 1.2);
  return layer;
}

export function createCockroachCanvas(
  canvas: HTMLCanvasElement,
  world: CockroachWorld,
  hooks: RendererHooks = {},
): SceneRenderer {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context creation failed.');
  const ctx = context;
  void hooks;
  let floor: ReturnType<typeof makeCanvas> | null = null;
  let ready = false;

  /** Maps the cockroach's own frame (BL, y to its left) onto the canvas. */
  const toRoach = (h: number) => {
    const r = world.roach;
    const k = h * r.size;
    const c = Math.cos(r.bodyHeading);
    const s = Math.sin(r.bodyHeading);
    ctx.setTransform(k * c, -k * s, -k * s, -k * c, h * r.x, h * (1 - r.y));
  };
  const outline = bodyOutline();
  const bodyPath = () => {
    ctx.beginPath();
    for (let i = 0; i < outline.length; i += 2) ctx.lineTo(outline[i], outline[i + 1]);
    ctx.closePath();
  };
  /** A cross-body curve x = x0 + bend·(y/0.2)², as the shader draws the seams and segment lines. */
  const curve = (x0: number, bend: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const y = -0.26 + (i / 20) * 0.52;
      const x = x0 + bend * (y / 0.2) ** 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  const capsule = (k: number, radius: number) => {
    const o = k * 4;
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    ctx.moveTo(world.capsules[o], world.capsules[o + 1]);
    ctx.lineTo(world.capsules[o + 2], world.capsules[o + 3]);
    ctx.stroke();
  };
  const legRadius = (k: number) => LEG_RADII[k % LEG_SEGMENTS];

  return {
    get ready() {
      return ready;
    },
    draw() {
      const w = canvas.width;
      const h = canvas.height;
      if (!floor || floor.width !== w || floor.height !== h) floor = paintFloor(w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(floor as CanvasImageSource, 0, 0);

      // Crumbs.
      world.crumbs.forEach((c, i) => {
        if (c.left <= 0) return;
        const r = 0.011 * (0.35 + 0.65 * c.left) * h;
        const x = c.x * h;
        const y = (1 - c.y) * h;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.arc(x - P.sun[0] * r * 0.5, y + P.sun[1] * r * 0.5, r * 1.1, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(x + P.sun[0] * r * 0.4, y - P.sun[1] * r * 0.4, 0, x, y, r * 1.2);
        g.addColorStop(0, css(P.crumb));
        g.addColorStop(1, css(P.crumbShade));
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const rr = r * (1 + 0.18 * Math.sin(-a * 5 + i * 2.1));
          if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.fill();
      });

      const r = world.roach;
      // Shadow: the same shape, offset away from the light and blurred.
      ctx.save();
      ctx.filter = `blur(${(SHADOW_SOFTNESS * 0.45 * h * r.size).toFixed(1)}px)`;
      ctx.globalAlpha = P.shadow;
      ctx.translate(-P.sun[0] * SHADOW_OFFSET * h * r.size, P.sun[1] * SHADOW_OFFSET * h * r.size);
      const base = ctx.getTransform();
      toRoach(h);
      ctx.setTransform(base.multiply(ctx.getTransform()));
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      bodyPath();
      ctx.fill();
      for (let k = 0; k < CAPSULES; k++) capsule(k, k < LEG_CAPSULES ? legRadius(k) : ANTENNA_RADIUS);
      ctx.restore();

      toRoach(h);
      ctx.lineCap = 'round';
      // Legs, under the body.
      for (let k = 0; k < LEG_CAPSULES; k++) {
        ctx.strokeStyle = css([P.leg[0] * 0.6, P.leg[1] * 0.6, P.leg[2] * 0.6]);
        capsule(k, legRadius(k));
        ctx.strokeStyle = css(P.leg);
        capsule(k, legRadius(k) * 0.55);
      }
      // Body: base colours by region, clipped to the outline.
      ctx.save();
      bodyPath();
      ctx.clip();
      ctx.fillStyle = css(P.abdomen);
      ctx.fillRect(-0.6, -0.3, 1.2, 0.6);
      const region = (x0: number, bend: number, colour: RGB) => {
        curve(x0, bend);
        ctx.lineTo(0.6, 0.26);
        ctx.lineTo(0.6, -0.26);
        ctx.closePath();
        ctx.fillStyle = css(colour);
        ctx.fill();
      };
      region(TEGMINA_BACK, -0.09, P.tegmina);
      region(PRONOTUM_BACK, -0.05, P.pronotum);
      // The pronotum's pale margin.
      const [pc, prx, pry] = BODY_PARTS.pronotum;
      ctx.save();
      curve(PRONOTUM_BACK, -0.05);
      ctx.lineTo(0.6, 0.26);
      ctx.lineTo(0.6, -0.26);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = css(P.pronotumEdge, 0.8);
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.ellipse(pc, 0, prx - 0.018, pry - 0.018, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Segment lines and seams.
      ctx.strokeStyle = css(P.segmentLine, 0.8);
      ctx.lineWidth = 0.012;
      for (const x of SEGMENT_LINES) {
        curve(x, 0.035);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.014;
      curve(PRONOTUM_BACK, -0.05);
      ctx.stroke();
      curve(TEGMINA_BACK, -0.09);
      ctx.stroke();
      // Dome shading toward the light, and the sheen facing it.
      const c = Math.cos(r.bodyHeading);
      const s = Math.sin(r.bodyHeading);
      const sx = P.sun[0] * c + P.sun[1] * s;
      const sy = -P.sun[0] * s + P.sun[1] * c;
      const shade = ctx.createRadialGradient(sx * 0.12, sy * 0.05, 0.02, 0, 0, 0.55);
      shade.addColorStop(0, 'rgba(255,255,255,0.14)');
      shade.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = shade;
      ctx.fillRect(-0.6, -0.3, 1.2, 0.6);
      const sheen = ctx.createRadialGradient(sx * 0.2, sy * 0.08, 0, sx * 0.2, sy * 0.08, 0.18);
      sheen.addColorStop(0, css(P.light, P.sheen * 0.45));
      sheen.addColorStop(1, css(P.light, 0));
      ctx.fillStyle = sheen;
      ctx.fillRect(-0.6, -0.3, 1.2, 0.6);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.02;
      bodyPath();
      ctx.stroke();
      // Antennae.
      ctx.strokeStyle = css(P.antenna);
      for (let k = LEG_CAPSULES; k < CAPSULES; k++) capsule(k, ANTENNA_RADIUS);

      // Vignette.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${(1 - P.vignette).toFixed(2)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      ready = true;
    },
    dispose() {
      floor = null;
    },
  };
}
