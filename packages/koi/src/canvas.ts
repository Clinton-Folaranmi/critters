// The koi's Canvas 2D fallback (spec A-8): the same floor, the same mesh and
// the same atlas as WebGL2, each triangle drawn with an affine transform. It
// leaves out only the water's moving light and the ripples' bending of the
// floor; ripples are drawn as rings.

import { makeCanvas, type SceneRenderer } from '@critters/critter-kit';
import { koiAtlas, koiFloor } from './koi-paint';
import { ATLAS, MESH_FLOATS, RIPPLE, STRIDE, buildMesh } from './koi-shape';
import type { KoiWorld } from './koi-world';
import { KOI_PALETTE as P } from './theme';

const css = (c: readonly number[], alpha: number) => `rgba(${c.map((n) => Math.round(n * 255)).join(',')},${alpha})`;

export function createKoiCanvas(canvas: HTMLCanvasElement, world: KoiWorld, events: Float32Array): SceneRenderer {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D context creation failed.');
  const ctx = context;
  const atlas = koiAtlas() as CanvasImageSource;
  const vertices = new Float32Array(MESH_FLOATS);
  let ready = false;
  // Strips of triangles overlap by half a pixel so they meet without a gap.
  // Drawn straight onto the picture, a translucent fin would show every
  // overlap as a line, so the fins and the body are drawn into a layer with
  // 'copy' (each triangle replaces what's under it), then laid on at once.
  let layer: OffscreenCanvas | HTMLCanvasElement = makeCanvas(1, 1);
  let layerCtx = layer.getContext('2d') as CanvasRenderingContext2D;

  /** Draws triangles [from, to) of the mesh (vertex indices) with `target`. */
  const triangles = (target: CanvasRenderingContext2D, from: number, to: number, h: number, copy = false) => {
    const ctx = target;
    ctx.globalCompositeOperation = copy ? 'copy' : 'source-over';
    const size = ATLAS.size;
    for (let v = from; v + 2 < to; v += 3) {
      const o = v * STRIDE;
      const alpha = vertices[o + 4];
      if (alpha <= 0.002) continue;
      const x0 = vertices[o] * h;
      const y0 = (1 - vertices[o + 1]) * h;
      const s0 = vertices[o + 2] * size;
      const t0 = vertices[o + 3] * size;
      const x1 = vertices[o + STRIDE] * h;
      const y1 = (1 - vertices[o + STRIDE + 1]) * h;
      const s1 = vertices[o + STRIDE + 2] * size;
      const t1 = vertices[o + STRIDE + 3] * size;
      const x2 = vertices[o + STRIDE * 2] * h;
      const y2 = (1 - vertices[o + STRIDE * 2 + 1]) * h;
      const s2 = vertices[o + STRIDE * 2 + 2] * size;
      const t2 = vertices[o + STRIDE * 2 + 3] * size;
      // The affine map from atlas to screen that takes the triangle's corners to each other.
      const det = s0 * (t1 - t2) + s1 * (t2 - t0) + s2 * (t0 - t1);
      if (Math.abs(det) < 1e-9) continue;
      const a = (x0 * (t1 - t2) + x1 * (t2 - t0) + x2 * (t0 - t1)) / det;
      const b = (y0 * (t1 - t2) + y1 * (t2 - t0) + y2 * (t0 - t1)) / det;
      const c = (x0 * (s2 - s1) + x1 * (s0 - s2) + x2 * (s1 - s0)) / det;
      const d = (y0 * (s2 - s1) + y1 * (s0 - s2) + y2 * (s1 - s0)) / det;
      const e = (x0 * (s1 * t2 - s2 * t1) + x1 * (s2 * t0 - s0 * t2) + x2 * (s0 * t1 - s1 * t0)) / det;
      const f = (y0 * (s1 * t2 - s2 * t1) + y1 * (s2 * t0 - s0 * t2) + y2 * (s0 * t1 - s1 * t0)) / det;
      // Clip to the triangle, grown by half a pixel so neighbours meet without a seam.
      const cx = (x0 + x1 + x2) / 3;
      const cy = (y0 + y1 + y2) / 3;
      const grow = (x: number, y: number) => {
        const dx = x - cx;
        const dy = y - cy;
        const k = 1 + 0.6 / (Math.hypot(dx, dy) || 1);
        return [cx + dx * k, cy + dy * k] as const;
      };
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...grow(x0, y0));
      ctx.lineTo(...grow(x1, y1));
      ctx.lineTo(...grow(x2, y2));
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.transform(a, b, c, d, e, f);
      const sx = Math.max(0, Math.floor(Math.min(s0, s1, s2)) - 2);
      const sy = Math.max(0, Math.floor(Math.min(t0, t1, t2)) - 2);
      const sw = Math.min(size, Math.ceil(Math.max(s0, s1, s2)) + 2) - sx;
      const sh = Math.min(size, Math.ceil(Math.max(t0, t1, t2)) + 2) - sy;
      if (sw > 0 && sh > 0) ctx.drawImage(atlas, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  /** Triangles [from, to) drawn into the layer without seams, then onto the picture. */
  const layered = (from: number, to: number, w: number, h: number) => {
    if (layer.width !== w || layer.height !== h) {
      layer = makeCanvas(w, h);
      layerCtx = layer.getContext('2d') as CanvasRenderingContext2D;
    }
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, w, h);
    triangles(layerCtx, from, to, h, true);
    ctx.globalAlpha = 1;
    ctx.drawImage(layer as CanvasImageSource, 0, 0);
  };

  return {
    get ready() {
      return ready;
    },
    draw(time: number) {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(koiFloor(world.aspect) as CanvasImageSource, 0, 0, w, h);

      const ranges = buildMesh(world, vertices);
      layered(0, ranges.fishShadow, w, h);
      triangles(ctx, ranges.fishShadow, ranges.shadows, h);
      layered(ranges.shadows, ranges.fins, w, h);
      layered(ranges.fins, ranges.koi, w, h);
      triangles(ctx, ranges.koi, ranges.surface, h);

      // Ripples: a light ring and a faint dark one inside it.
      ctx.globalAlpha = 1;
      for (let i = 0; i < events.length; i += 4) {
        const born = events[i + 2];
        const age = time - born;
        if (born <= 0 || age < 0 || age > RIPPLE.life) continue;
        const fade = (1 - age / RIPPLE.life) ** 2 * events[i + 3];
        const x = events[i] * h;
        const y = (1 - events[i + 1]) * h;
        for (const [share, strength] of [
          [1, 1],
          [0.62, 0.6],
        ] as const) {
          const radius = (0.012 + age * RIPPLE.speed * share) * h;
          ctx.lineWidth = Math.max(1, RIPPLE.width * h * 0.9);
          ctx.strokeStyle = css(P.ripple, 0.32 * fade * strength);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = css(P.shadow, 0.18 * fade * strength);
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0, radius - RIPPLE.width * h * 1.4), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ready = true;
    },
    dispose() {},
  };
}
