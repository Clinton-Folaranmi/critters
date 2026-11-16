// How the frog pond is painted, and everything both renderers must agree on:
// the palette, the frogs' looks and markings, the drifting shade, and the
// copy. The WebGL shader is generated from these values and the Canvas 2D
// fallback reads them directly, so the two stay the same picture.
//
// Day Chorus in the grainy flat meadow style (docs/FROG_VISUAL_DIRECTION.md
// r0, board r2, soft strength): flat colour fields, one fine grain over
// everything with the edges cut against it, flat offset shadow bands from one
// key light up and to the right, sparse small details, a small palette.
// Water only. The board's painter, docs/frog-board/painter-r2.js, is the
// reference for every value here.

type RGB = readonly [number, number, number];

/** '#rrggbb' as 0 … 1 channels. */
const hex = (value: string): RGB => [
  parseInt(value.slice(1, 3), 16) / 255,
  parseInt(value.slice(3, 5), 16) / 255,
  parseInt(value.slice(5, 7), 16) / 255,
];

export const FROG_PALETTE = {
  /** Direction the key light comes from, in the pond plane (y up). */
  sun: [0.45, 0.89] as const,
  /** Open water: one flat sage-teal field. */
  water: hex('#6ea596'),
  /** Caustics: the frog-caustics.ts web posterised into two flat tones a step lighter than the water. */
  causticLow: hex('#7fb2a2'),
  causticHigh: hex('#93c0ae'),
  /** Where the caustic field crosses into each tone. */
  causticSteps: [0.47, 0.8] as const,
  /** How much the grain jitters those steps, so their edges break up like every other edge. */
  causticJitter: 0.16,
  /** Ripple marks and a swimmer's wake. */
  ripple: hex('#b4d6c4'),
  /** Pads: the leaf, its veins, and old pads' weathered rims. */
  leaf: hex('#4f8f3e'),
  leafVein: hex('#43803a'),
  leafAged: hex('#9aa447'),
  /** The water lily and its loose petals; the inner ring; its gold centre. */
  white: hex('#f6f3e8'),
  petalInner: hex('#e9e4d2'),
  gold: hex('#e3ae3a'),
  /** Pupils and midges. */
  ink: hex('#1f2a1c'),
  /** Offset shadow bands, multiplied over whatever they fall on: in the air, and in contact. */
  shadow: hex('#8fa79f'),
  shadowDeep: hex('#7f998f'),
  /** The drifting foliage shade, multiplied over everything (about −14 %). */
  shade: hex('#d6e0da'),
};
export type FrogPalette = typeof FROG_PALETTE;

/**
 * The grain over everything, applied last as soft-light (the same formula in
 * both renderers): `paper` is how far the fine grain moves a colour, `drift`
 * the slow world-space mottle, `fleck` the sparse light flecks.
 */
export const FROG_GRAIN = {
  /** Size of the grain's finest cell, in CSS pixels (paper tooth). */
  cell: 0.8,
  paper: 0.4,
  drift: 0.2,
  fleck: 0.12,
  /** Share of pixels that carry a light fleck. */
  fleckShare: 0.05,
};

/**
 * How shapes' edges are cut against the grain: a blur of `soft` CSS px, then
 * the grain moves the threshold by `rough`; `band` is how sharp the cut is.
 */
export const FROG_EDGES = {
  pad: { soft: 1.1, rough: 0.8 },
  padShadow: { soft: 1.6, rough: 0.8 },
  vein: { soft: 0.6, rough: 0.8, band: 0.2, alpha: 0.7 },
  frog: { soft: 0.6, rough: 0.45 },
  eye: { soft: 0.35, rough: 0.45, band: 0.05 },
  shade: { soft: 4, rough: 0.8 },
  band: 0.16,
};

/** How far a pad's flat band falls from it, away from the light (world units). */
export const PAD_BAND = 0.011;

/** Each frog is an individual (FROG_ART_DIRECTION.md), in flat colour. */
export interface FrogLook {
  skin: RGB;
  /** Blotches, bars, the mask and speckle. */
  mark: RGB;
  /** The pale accent: blotch halos (0), the mid-back stripe (1), the gold ridges (2). */
  accent: RGB;
  iris: RGB;
  /** How strong the leg bars are. */
  bars: number;
}
export const FROG_LOOKS: readonly FrogLook[] = [
  { skin: hex('#82b347'), mark: hex('#2f5523'), accent: hex('#b7d77e'), iris: hex('#d9ae45'), bars: 0.85 },
  { skin: hex('#ae9156'), mark: hex('#5c4425'), accent: hex('#e6d6a8'), iris: hex('#d07a34'), bars: 0.6 },
  { skin: hex('#a8d044'), mark: hex('#5a8424'), accent: hex('#f0d062'), iris: hex('#ebcf62'), bars: 0.3 },
];
export const FROG_TONGUE: RGB = [0.76, 0.38, 0.4];

/** A colour moved toward white (k > 0) or black (k < 0), as the board's lighten(). */
export const lighten = (c: RGB, k: number): RGB =>
  c.map((v) => Math.min(1, Math.max(0, k >= 0 ? v + (1 - v) * k : v + v * k))) as unknown as RGB;

/** The board's seeded generator (painter-r2.js), so the markings match it exactly. */
const lcg = (start: number) => {
  let seed = start;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

/** One marking spot, frog-local body lengths: centre, radius across, radius along, turn. */
export interface Spot {
  x: number;
  y: number;
  r: number;
  rx: number;
  a: number;
}

/** Each look's dorsal spots (painter-r2.js `marks`). */
export const FROG_SPOTS: readonly (readonly Spot[])[] = FROG_LOOKS.map((_, i) => {
  const random = lcg(311 + i * 17);
  const inBody = (x: number, y: number, m: number) =>
    ((x + 0.1) / (0.4 - m)) ** 2 + (y / (0.265 - m)) ** 2 < 1 ||
    ((x - 0.22) / (0.2 - m)) ** 2 + (y / (0.2 - m)) ** 2 < 1;
  const spots = (count: number, x0: number, x1: number, ys: number, r0: number, r1: number) => {
    const out: Spot[] = [];
    for (let t = 0; t < 400 && out.length < count; t++) {
      const x = x0 + random() * (x1 - x0);
      const y = (random() * 2 - 1) * ys;
      const r = r0 + random() * (r1 - r0);
      if (!inBody(x, y, r + 0.02)) continue;
      if (Math.abs(x - 0.27) < 0.1 && Math.abs(Math.abs(y) - 0.155) < 0.1) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 0.03)) continue;
      out.push({ x, y, r, rx: r * (0.85 + random() * 0.3), a: random() * Math.PI });
    }
    return out;
  };
  if (i === 0) return spots(8, -0.44, 0.12, 0.17, 0.035, 0.058);
  if (i === 1) return spots(14, -0.44, 0.3, 0.19, 0.009, 0.015);
  return spots(3, -0.36, 0.05, 0.13, 0.028, 0.04);
});
/** How far frog 0's pale halo reaches beyond each blotch. */
export const HALO_GROW = 0.016;

/**
 * Line markings, frog-local (before the lean): [x0, y0, x1, y1, width, colour]
 * where colour 0 is the mark and 1 the accent. Frog 1's stripe and eye mask,
 * frog 2's ridges (the board's curve, as three straight pieces each side).
 */
const ridge = (side: number) => {
  const at = (t: number) => {
    const u = 1 - t;
    return [u * u * -0.4 + 2 * u * t * -0.1 + t * t * 0.22, side * (u * u * 0.18 + 2 * u * t * 0.16 + t * t * 0.14)];
  };
  const out: number[][] = [];
  for (let k = 0; k < 3; k++) {
    const [ax, ay] = at(k / 3);
    const [bx, by] = at((k + 1) / 3);
    out.push([ax, ay, bx, by, 0.04, 1]);
  }
  return out;
};
export const FROG_LINES: readonly (readonly (readonly number[])[])[] = [
  [],
  [
    [-0.44, 0, 0.4, 0, 0.045, 1],
    [0.1, 0.1, 0.45, 0.2, 0.055, 0],
    [0.1, -0.1, 0.45, -0.2, 0.055, 0],
  ],
  [...ridge(1), ...ridge(-1)],
];

/**
 * Shade from foliage out of frame: sprays of leaves (pointed, leaf-shaped
 * lobes rather than discs) that drift slowly across the pond and wrap round.
 * Each cluster: where it is at t = 0 (share of width, height), and its leaves
 * relative to that point (x, y, turn, half length, half width; world units).
 */
export const SHADE_DRIFT = [0.0085, -0.0035] as const;
/** The shade wraps round a field this much bigger than the picture (world units). */
export const SHADE_MARGIN = 0.8;
export interface ShadeCluster {
  u: number;
  v: number;
  /** Bounding radius of the cluster's leaves, from its point. */
  reach: number;
  leaves: readonly (readonly [number, number, number, number, number])[];
}
export const SHADE_CLUSTERS: readonly ShadeCluster[] = [
  [-0.02, 0.98, 0.2, 11, 3],
  [1.02, 0.08, 0.22, 12, 7],
  [0.62, 1.04, 0.14, 8, 11],
  [0.8, 0.84, 0.12, 8, 13],
].map(([u, v, spread, count, seed]) => {
  const random = lcg(seed * 101);
  const leaves: (readonly [number, number, number, number, number])[] = [];
  let reach = 0;
  // A spray: leaves set round the cluster's point, each pointing roughly out
  // from it (as leaves on twigs from one branch), sizes varied.
  for (let k = 0; k < count; k++) {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * spread * 0.8;
    const length = spread * (0.32 + random() * 0.28);
    const width = length * (0.36 + random() * 0.12);
    const turn = angle + (random() - 0.5) * 0.9;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    leaves.push([x, y, turn, length, width]);
    reach = Math.max(reach, Math.hypot(x, y) + length);
  }
  return { u, v, reach, leaves };
});

/** Where a shade cluster's point is at `time` (world units), wrapping round the picture. */
export function shadeCentre(cluster: ShadeCluster, aspect: number, time: number, out: Float32Array, o: number) {
  const wrap = (value: number, size: number) => {
    const span = size + SHADE_MARGIN;
    return ((((value + SHADE_MARGIN / 2) % span) + span) % span) - SHADE_MARGIN / 2;
  };
  out[o] = wrap(cluster.u * aspect + SHADE_DRIFT[0] * time, aspect);
  out[o + 1] = wrap(cluster.v + SHADE_DRIFT[1] * time, 1);
}

/**
 * The scenery the board adds on the water: the water lily on pad 9 (offset
 * from the pad's centre, size, turn) and the loose petals (share of width,
 * height, turn).
 */
export const LILY = { pad: 9, dx: 0.03, dy: 0.035, size: 0.05, turn: 0.3, petals: 8 } as const;
export const LOOSE_PETALS = [
  [0.9, 0.86, 0.8],
  [0.13, 0.66, 2.1],
] as const;

/** Ripple marks: how fast the rings grow, how long they last (s). */
export const RIPPLE = { start: 0.02, speed: 0.13, life: 1.6, gap: 0.022 } as const;

/** Visible copy for the study. */
export const FROG_COPY = {
  eyebrow: 'An interactive day study',
  title: 'Day Chorus',
  lede: 'Three frogs, a scatter of pads, open water and a high sun.',
  description: 'A small interactive study of frogs on lily pads in a sunlit pond.',
  motionLabel: 'An interactive sunlit pond where three frogs sit on lily pads on open water.',
  stillLabel:
    'A still illustration of three frogs on lily pads in a sunlit pond, with a white water lily and dappled light on the water.',
} as const;

/** How to play: as one sentence, and as a list. */
export const FROG_INSTRUCTIONS = {
  sentence:
    'Watch a while, or tap a frog to make it leap, a pad to rock it, or the water to ripple it. Enter or Space drops a pebble in the middle of the pond.',
  steps: [
    'Tap a frog to make it leap',
    'Tap a pad to set it rocking',
    'Tap the water for a ripple',
    'Enter or Space drops a pebble in the middle',
  ],
} as const;
