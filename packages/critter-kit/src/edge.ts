// The picture's designed edge (spec E-11 to E-14): a squarish oval (a
// superellipse) a little in from the canvas all round, used three ways — as
// the tap rule (nothing outside it is interactive), as a CSS mask that fades
// the picture into the page, and as a focus ring just outside it.

export interface PictureEdgeOptions {
  /** Gap between the outline and the canvas's sides and top/bottom, world units. */
  inset?: readonly [number, number];
  /** The superellipse's exponent n in |x|^n + |y|^n = 1 (2 is an ellipse; higher is squarer). */
  power?: number;
  /** How far the mask's soft edge is blurred, in the mask's 1000-high units. */
  softness?: number;
  /** Turbulence that roughens the edge (the frog pond's bank): 0 for a clean one. */
  ragged?: number;
}

export interface PictureEdge {
  /** Below 1 inside the outline, 1 on it, above 1 outside (taps beyond 1 do nothing). */
  distance(x: number, y: number, aspect: number): number;
  maskUrl(aspect: number): string;
  ringUrl(aspect: number, width: number): string;
}

export function createPictureEdge(options: PictureEdgeOptions = {}): PictureEdge {
  const [insetX, insetY] = options.inset ?? [0.05, 0.05];
  const power = options.power ?? 2 / 0.6;
  const softness = options.softness ?? 14;
  const ragged = options.ragged ?? 0;
  const radii = (aspect: number) => [aspect / 2 - insetX, 0.5 - insetY] as const;
  /** The outline as an SVG path in a viewBox 1000 high, grown by `grow` world units. */
  const path = (aspect: number, grow = 0) => {
    const [rx, ry] = radii(aspect);
    const e = 2 / power;
    const points: string[] = [];
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = aspect / 2 + (rx + grow) * Math.sign(c) * Math.abs(c) ** e;
      const y = 0.5 + (ry + grow) * Math.sign(s) * Math.abs(s) ** e;
      points.push(`${(x * 1000).toFixed(1)} ${((1 - y) * 1000).toFixed(1)}`);
    }
    return `M${points.join('L')}Z`;
  };
  const svg = (aspect: number, body: string) =>
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${(aspect * 1000).toFixed(0)} 1000' preserveAspectRatio='none'>${body}</svg>`;
  const cssUrl = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
  return {
    distance(x, y, aspect) {
      const [rx, ry] = radii(aspect);
      const dx = Math.abs(x - aspect / 2) / rx;
      const dy = Math.abs(y - 0.5) / ry;
      return (dx ** power + dy ** power) ** (1 / power);
    },
    maskUrl(aspect) {
      const rough = ragged
        ? `<feTurbulence type='fractalNoise' baseFrequency='.016' numOctaves='4' seed='7'/>` +
          `<feDisplacementMap in='SourceGraphic' scale='${ragged}' xChannelSelector='R' yChannelSelector='G'/>`
        : '';
      return cssUrl(
        svg(
          aspect,
          `<filter id='r' x='-10%' y='-10%' width='120%' height='120%'>${rough}` +
            `<feGaussianBlur stdDeviation='${softness}'/></filter>` +
            `<path d='${path(aspect)}' fill='black' filter='url(#r)'/>`,
        ),
      );
    },
    ringUrl(aspect, width) {
      return cssUrl(
        svg(
          aspect,
          `<path d='${path(aspect, 0.03)}' fill='none' stroke='black' ` +
            `stroke-width='${width}' stroke-linejoin='round' vector-effect='non-scaling-stroke'/>`,
        ),
      );
    },
  };
}
