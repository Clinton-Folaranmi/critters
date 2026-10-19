/** A point in a two-dimensional body chain. */
export interface ChainPoint {
  x: number;
  y: number;
}

/**
 * Keeps a polyline at its authored segment lengths while limiting each bend.
 * `points[0]` is the driven head and stays fixed; each later point is pulled
 * toward where it is now, at its segment's length from the one before.
 * `maxBend` is the largest angle between adjacent segments, in radians.
 * Mutates the supplied points and allocates nothing.
 */
export function followChain(points: ChainPoint[], lengths: readonly number[], maxBend: number) {
  if (points.length < 2 || lengths.length < points.length - 1) return;

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    let dx = point.x - previous.x;
    let dy = point.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1e-9) {
      dx /= distance;
      dy /= distance;
    } else if (i > 1) {
      dx = previous.x - points[i - 2].x;
      dy = previous.y - points[i - 2].y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
    } else {
      dx = -1;
      dy = 0;
    }

    if (i > 1) {
      const before = points[i - 2];
      const base = Math.atan2(previous.y - before.y, previous.x - before.x);
      let turn = Math.atan2(dy, dx) - base;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      if (Math.abs(turn) > maxBend) {
        const angle = base + Math.sign(turn) * maxBend;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      }
    }

    point.x = previous.x + dx * lengths[i - 1];
    point.y = previous.y + dy * lengths[i - 1];
  }
}

/**
 * The path a head has taken, as samples a fixed distance apart (newest
 * first), so a body can follow it: each part of the body is where the head
 * was a set distance ago (follow-the-leader). Samples are only added as the
 * head travels, so a body that stops stays where it is.
 */
export interface Trail {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly spacing: number;
  /** Index of the newest sample. */
  newest: number;
}

/** A straight trail of at least `length` behind (x, y), laid out opposite `heading`. */
export function createTrail(length: number, spacing: number, x: number, y: number, heading: number): Trail {
  const count = Math.ceil(length / spacing) + 3;
  const trail: Trail = { x: new Float64Array(count), y: new Float64Array(count), spacing, newest: 0 };
  resetTrail(trail, x, y, heading);
  return trail;
}

/** Lays the trail out straight behind (x, y) again. */
export function resetTrail(trail: Trail, x: number, y: number, heading: number) {
  trail.newest = 0;
  for (let k = 0; k < trail.x.length; k++) {
    trail.x[k] = x - Math.cos(heading) * k * trail.spacing;
    trail.y[k] = y - Math.sin(heading) * k * trail.spacing;
  }
}

/** Records the head at (x, y): adds samples, a spacing apart, while it is a spacing or more past the newest. */
export function recordTrail(trail: Trail, x: number, y: number) {
  const n = trail.x.length;
  for (let guard = 0; guard < n; guard++) {
    const lx = trail.x[trail.newest];
    const ly = trail.y[trail.newest];
    const d = Math.hypot(x - lx, y - ly);
    if (d < trail.spacing) return;
    const next = (trail.newest - 1 + n) % n;
    trail.x[next] = lx + ((x - lx) / d) * trail.spacing;
    trail.y[next] = ly + ((y - ly) / d) * trail.spacing;
    trail.newest = next;
  }
}

/**
 * The point `back` along the path behind the head at (headX, headY), into
 * `out`. Beyond the oldest sample the path is continued in a straight line.
 */
export function sampleTrail(trail: Trail, headX: number, headY: number, back: number, out: ChainPoint) {
  const n = trail.x.length;
  let ax = headX;
  let ay = headY;
  let left = back;
  for (let k = 0; k < n; k++) {
    const index = (trail.newest + k) % n;
    const bx = trail.x[index];
    const by = trail.y[index];
    const d = Math.hypot(bx - ax, by - ay);
    if (d >= left && d > 1e-12) {
      out.x = ax + ((bx - ax) * left) / d;
      out.y = ay + ((by - ay) * left) / d;
      return out;
    }
    left -= d;
    if (k < n - 1) {
      ax = bx;
      ay = by;
    }
  }
  // Past the end: carry on in the direction of the last two samples.
  const last = (trail.newest + n - 1) % n;
  const prev = (trail.newest + n - 2) % n;
  const dx = trail.x[last] - trail.x[prev];
  const dy = trail.y[last] - trail.y[prev];
  const d = Math.hypot(dx, dy) || 1;
  out.x = trail.x[last] + (dx / d) * left;
  out.y = trail.y[last] + (dy / d) * left;
  return out;
}
