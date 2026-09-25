import { makeCanvas, seeded } from './frog-math';

// Sunlight focused by a rippled surface into a bright web on the pond bed.

/** Cells across the tile; one cell is 1/6.5 of the pond's height. */
export const CAUSTIC_CELLS = 7;
export const CAUSTIC_CELL = 1 / 6.5;

/**
 * A tileable caustic pattern (white, with the brightness in alpha): the thin
 * bright edges between neighbouring cells, baked once. Both renderers slide
 * two copies past each other at different scales; the WebGL scene also
 * warps them with the moving surface. That is far cheaper than computing
 * moving cells per pixel, and keeps the two renderers' light identical.
 */
export function makeCausticTile(size: number) {
  const random = seeded(5147);
  const cells = CAUSTIC_CELLS;
  const points = Array.from({ length: cells * cells }, () => [random(), random()] as const);
  const tile = makeCanvas(size, size);
  const ctx = tile.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return tile;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      let d1 = 9;
      let d2 = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = (ix + ox + cells) % cells;
          const cy = (iy + oy + cells) % cells;
          const [px, py] = points[cy * cells + cx];
          const dx = ix + ox + 0.15 + px * 0.7 - gx;
          const dy = iy + oy + 0.15 + py * 0.7 - gy;
          const d = Math.hypot(dx, dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const v = Math.exp(-(d2 - d1) * 9);
      const o = (y * size + x) * 4;
      image.data[o] = 255;
      image.data[o + 1] = 250;
      image.data[o + 2] = 215;
      image.data[o + 3] = Math.round(v * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}
