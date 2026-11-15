// Style board painter: the frog pond (day) in the grainy flat meadow style.
// Board only. Reads the real world (FrogWorld) and shore maths from the
// bundled package (build/pond.js -> window.Pond); paints with Canvas 2D.
// World units: canvas heights, y up, x 0..aspect. Key light up-right.
/* global Pond */
(() => {
  const TAU = Math.PI * 2;
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

  // ---- Palette ---------------------------------------------------------------
  // Three greens (meadow, leaf, water), white, one warm accent (ochre-gold).
  const P = {
    water: '#6ea596', // open water: flat sage-teal
    shallow: '#86b9a2', // the shelf by the bank, one step lighter
    ripple: '#b4d6c4', // ripple marks
    margin: '#4d8676', // wet margin band under the bank's edge
    meadow: '#8fbf55', // the bank
    meadowDark: '#679a3c', // tufts and reed shadows' base
    leaf: '#4f8f3e', // pads
    leafVein: '#43803a',
    leafAged: '#9aa447', // old pads' rims (toward the accent)
    reed: '#4a7a32',
    stone: '#a7b8a3',
    white: '#f6f3e8',
    gold: '#e3ae3a', // flower centres, eyes: the warm accent
    seed: '#8a6232',
    ink: '#1f2a1c', // pupils, midges
  };
  // Shadow band: a darker version of whatever ground it falls on (multiply).
  const SHADOW = '#8fa79f';
  const SHADOW_DEEP = '#7f998f';

  // The three individuals (FROG_ART_DIRECTION.md), translated to flat colour.
  const LOOKS = [
    { skin: '#82b347', mark: '#2f5523', halo: '#b7d77e', iris: '#d9ae45', bars: 0.85 }, // leaf green, blotches, halos
    { skin: '#ae9156', mark: '#5c4425', pale: '#e6d6a8', iris: '#d07a34', bars: 0.6 }, // bronze-olive, stripe, mask
    { skin: '#a8d044', mark: '#5a8424', ridge: '#f0d062', iris: '#ebcf62', bars: 0.3 }, // bright green, gold ridges
  ];
  const lighten = (c, k) => {
    const [r, g, b] = hex(c);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (k >= 0 ? 255 - v : v) * k)));
    return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  };

  // ---- Noise -----------------------------------------------------------------
  const hash = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y, s) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, s);
    const b = hash(ix + 1, iy, s);
    const c = hash(ix, iy + 1, s);
    const d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const seeded = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // ---- The world at a moment ----------------------------------------------------
  function worldAt(aspect, steps) {
    const ripples = [];
    let time = 0;
    const world = new Pond.FrogWorld(aspect, (x, y, strength) => ripples.push({ x, y, strength, t: time }));
    for (let i = 0; i < steps; i++) {
      time += 1 / 60;
      world.step(1 / 60);
    }
    return { world, ripples: ripples.filter((r) => time - r.t < 1.6).map((r) => ({ ...r, age: time - r.t })), time };
  }

  // ---- Painter -------------------------------------------------------------------
  // ---- r2: the caustic tile from frog-caustics.ts (the same baked web a build would reuse) ----
  let tileCache = null;
  function causticTile() {
    if (tileCache) return tileCache;
    const size = 256;
    const tile = Pond.makeCausticTile(size);
    const a = tile.getContext('2d').getImageData(0, 0, size, size).data;
    const alpha = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) alpha[i] = a[i * 4 + 3] / 255;
    tileCache = { size, alpha };
    return tileCache;
  }
  const sampleTile = (t, u, v) => {
    const n = t.size;
    let x = (u - Math.floor(u)) * n - 0.5;
    let y = (v - Math.floor(v)) * n - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const at = (i, j) => t.alpha[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // Strengths to compare: tone steps over the water, and how dark the shade is.
  const LOOK_R2 = {
    soft: { caustic: ['#7fb2a2', '#93c0ae'], th: [0.47, 0.8], shade: '#d6e0da' },
    bright: { caustic: ['#86b9a7', '#a6cfba'], th: [0.4, 0.68], shade: '#cbd8d1' },
  };
  const LOOP = 6; // seconds: the loop's motion is periodic in this

  function paint(canvas, { aspect, steps, scale = 1, baseH, t = 0, look = 'soft', caustics = true, shade = true }) {
    const L2 = LOOK_R2[look];
    const ph = (t / LOOP) * TAU;
    const H = Math.round(baseH * scale);
    const W = Math.round(baseH * aspect * scale);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const h = H;
    const sx = (x) => x * h;
    const sy = (y) => (1 - y) * h;
    const px = scale; // one 1x pixel at this scale
    // Grain cells as on a display of up to 2x density, so a close crop stays fine-grained.
    // Fine, soft grain: paper tooth at about 0.8 css px (1.6 device px at 2x), as on the ladybug board.
    const gs = 0.8 * scale;
    let roughDefault = 0.8;
    const { world, ripples, time } = worldAt(aspect, steps);
    const sun = [0.45, 0.89];
    const sl = Math.hypot(sun[0], sun[1]);
    const away = [-sun[0] / sl, -sun[1] / sl]; // world, down-left

    // Grain: the same field for every surface and every edge.
    const grain = new Float32Array(W * H);
    const drift = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        grain[i] = 0.5 * vnoise(x / gs, y / gs, 1) + 0.3 * vnoise(x / (gs * 3.2), y / (gs * 3.2), 2) + 0.2 * hash(x, y, 3);
        const wx = x / h;
        const wy = y / h;
        drift[i] = 0.65 * vnoise(wx * 3.2, wy * 3.2, 4) + 0.35 * vnoise(wx * 9, wy * 9, 5);
      }
    }

    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = H;
    const mctx = mask.getContext('2d', { willReadFrequently: true });
    const blurC = document.createElement('canvas');
    blurC.width = W;
    blurC.height = H;
    const bctx = blurC.getContext('2d', { willReadFrequently: true });
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext('2d');

    /**
     * One flat shape: `draw(c)` fills a path in white on the mask; its edge is
     * softened by `soft` 1x-pixels and broken up by the grain, then it's laid
     * on in one flat colour (or multiplied, for a shadow band).
     */
    function shape(draw, color, { soft = 1, alpha = 1, op = 'source-over', box = null, band = 0.16, rough = roughDefault } = {}) {
      const pad = Math.ceil(soft * px * 3) + 2;
      let [x0, y0, x1, y1] = box ? box : [0, 0, W, H];
      x0 = Math.max(0, Math.floor(x0 - pad));
      y0 = Math.max(0, Math.floor(y0 - pad));
      x1 = Math.min(W, Math.ceil(x1 + pad));
      y1 = Math.min(H, Math.ceil(y1 + pad));
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw <= 0 || bh <= 0) return;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(x0, y0, bw, bh);
      mctx.fillStyle = '#fff';
      mctx.strokeStyle = '#fff';
      mctx.save();
      draw(mctx);
      mctx.restore();
      let src = mctx;
      if (soft > 0) {
        bctx.clearRect(x0, y0, bw, bh);
        bctx.filter = `blur(${soft * px}px)`;
        bctx.drawImage(mask, x0, y0, bw, bh, x0, y0, bw, bh);
        bctx.filter = 'none';
        src = bctx;
      }
      const img = src.getImageData(x0, y0, bw, bh);
      const d = img.data;
      const [r, g, b] = hex(color);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const o = (y * bw + x) * 4;
          const a = d[o + 3] / 255;
          if (a === 0) continue;
          const t = 0.5 + (grain[(y + y0) * W + x + x0] - 0.5) * rough;
          const e = Math.min(1, Math.max(0, (a - t + band) / (2 * band)));
          const k = e * e * (3 - 2 * e);
          d[o] = r;
          d[o + 1] = g;
          d[o + 2] = b;
          d[o + 3] = 255 * k * alpha;
        }
      }
      tctx.clearRect(x0, y0, bw, bh);
      tctx.putImageData(img, x0, y0);
      ctx.save();
      ctx.globalCompositeOperation = op;
      ctx.drawImage(tmp, x0, y0, bw, bh, x0, y0, bw, bh);
      ctx.restore();
    }
    const circleBox = (x, y, r) => [sx(x) - r * h, sy(y) - r * h, sx(x) + r * h, sy(y) + r * h];

    // ---- Water ------------------------------------------------------------------
    ctx.fillStyle = P.water;
    ctx.fillRect(0, 0, W, H);

    // ---- r2: stylised caustics, posterised into two flat tones, cut against the grain ----
    // frog-caustics.ts: two copies of the baked web at scales 1 and 0.71, bent by a slow
    // warp, combined as a*.45 + b*.3 + a*b*1.1 (the shader's caustics()). For a seamless
    // loop the copies drift round small circles (period LOOP) instead of in straight lines.
    if (caustics) {
      const tile = causticTile();
      const TILE = Pond.CAUSTIC_CELL * Pond.CAUSTIC_CELLS;
      const r = (0.011 * LOOP) / TAU; // same speed as the shader's drift
      const o1 = [r * Math.cos(ph), r * Math.sin(ph)];
      const o2 = [-r * 0.9 * Math.sin(ph), r * 0.9 * Math.cos(ph)];
      const wr = 0.35; // the warp's noise travels round a circle too
      const w1 = [wr * Math.cos(ph), wr * Math.sin(ph)];
      const [r1, g1, b1] = hex(L2.caustic[0]);
      const [r2, g2, b2] = hex(L2.caustic[1]);
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      for (let y = 0; y < H; y++) {
        const wy = 1 - y / h;
        for (let x = 0; x < W; x++) {
          const wx = x / h;
          const i = y * W + x;
          const qx0 = wx * 2.3, qy0 = wy * 2.3;
          const warpX = vnoise(qx0 + w1[0], qy0 + w1[1], 21) - 0.5;
          const warpY = vnoise(qx0 + 17 - w1[1], qy0 + 17 + w1[0], 22) - 0.5;
          const qx = (wx + warpX * 0.18) / TILE;
          const qy = (wy + warpY * 0.18) / TILE;
          const a = sampleTile(tile, qx - o1[0] / TILE, qy - o1[1] / TILE);
          const b = sampleTile(tile, qx / 0.71 - o2[0] / (TILE * 0.71), qy / 0.71 - o2[1] / (TILE * 0.71));
          const c = a * 0.45 + b * 0.3 + a * b * 1.1;
          const v = c + (grain[i] - 0.5) * 0.16;
          if (v > L2.th[1]) { d[i * 4] = r2; d[i * 4 + 1] = g2; d[i * 4 + 2] = b2; }
          else if (v > L2.th[0]) { d[i * 4] = r1; d[i * 4 + 1] = g1; d[i * 4 + 2] = b1; }
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // ---- Ripples: two or three broken marks each ------------------------------
    const rippleMarks = (rp) => {
      const r0 = 0.02 + rp.age * 0.13;
      const fade = Math.max(0, 1 - rp.age / 1.6);
      const r3 = seeded(Math.floor(rp.x * 1000 + rp.y * 7000));
      for (let ring = 0; ring < 2; ring++) {
        const r = r0 - ring * 0.022;
        if (r <= 0.012) continue;
        const start = r3() * TAU;
        for (let k = 0; k < 3; k++) {
          const a0 = start + k * (TAU / 3) + r3() * 0.3;
          const len = 0.5 + r3() * 0.5;
          shape(
            (c) => {
              c.lineWidth = Math.max(1.4 * px, 0.0032 * h);
              c.lineCap = 'round';
              c.beginPath();
              c.arc(sx(rp.x), sy(rp.y), r * h, a0, a0 + len);
              c.stroke();
            },
            P.ripple,
            { soft: 0.7, alpha: 0.9 * fade * Math.min(1, rp.strength * 2), box: circleBox(rp.x, rp.y, r + 0.01) },
          );
        }
      }
    };
    for (const rp of ripples) rippleMarks(rp);
    // A standing water mark near the open water (sparse detail), away from pads.
    rippleMarks({ x: aspect * 0.86, y: 0.72, age: 0.55, strength: 0.4 });

    // ---- Pads --------------------------------------------------------------------
    const padPath = (c, pad, index, dx = 0, dy = 0, grow = 1) => {
      const bob = pad.bob * Math.sin(pad.bobPhase);
      const radius = pad.radius * (1 + bob * 0.03) * grow;
      const half = pad.notch / 2;
      const damageAt = index * 2.3 + 2;
      c.beginPath();
      c.moveTo(sx(pad.x + dx), sy(pad.y + dy));
      const steps = 72;
      for (let s = 0; s <= steps; s++) {
        const a = half + (s / steps) * (TAU - pad.notch);
        let r = radius * (1 + 0.016 * Math.sin(a * 5 + index * 1.7) + 0.008 * Math.sin(a * 13 + index * 4.1));
        if (pad.damage > 0) {
          const bite = Math.cos(a - damageAt);
          r *= 1 - pad.damage * 0.2 * Math.max(0, (bite - 0.985) / 0.015);
        }
        const wa = a + pad.angle;
        c.lineTo(sx(pad.x + dx + Math.cos(wa) * r), sy(pad.y + dy + Math.sin(wa) * r));
      }
      c.closePath();
    };
    const padOff = 0.011;
    // Board-only scenery pads along the left and bottom, where the bank was, so pads frame
    // every edge (shares of width and height; blended by aspect like the world's homes).
    const tAsp = Math.min(1, Math.max(0, (aspect - 0.91) / (1.48 - 0.91)));
    const EXTRA_WIDE = [[0.015, 0.47, 0.12, 0.3], [0.1, 0.09, 0.135, 0.26], [0.36, 0.0, 0.1, 0.34], [0.02, 0.97, 0.08, 0.28], [0.25, 0.27, 0.05, 0.4]];
    const EXTRA_NARROW = [[-0.01, 0.45, 0.11, 0.3], [0.13, 0.06, 0.13, 0.26], [0.47, -0.01, 0.09, 0.34], [0.02, 0.97, 0.08, 0.28], [0.2, 0.24, 0.05, 0.4]];
    const extras = EXTRA_WIDE.map((e, k) => {
      const n = EXTRA_NARROW[k];
      const u = n[0] + (e[0] - n[0]) * tAsp;
      const v = n[1] + (e[1] - n[1]) * tAsp;
      return { x: u * aspect, y: v, radius: e[2], notch: e[3], angle: k * 1.9 + 2.2, damage: k === 1 ? 0.3 : 0, bob: 0, bobPhase: 0, age: k === 2 ? 0.6 : 0.2 };
    });
    const allPads = [...world.pads, ...extras];
    allPads.forEach((pad, i) => {
      const box = circleBox(pad.x + away[0] * padOff, pad.y + away[1] * padOff, pad.radius * 1.1 + padOff);
      shape((c) => {
        padPath(c, pad, i, away[0] * padOff, away[1] * padOff);
        c.fill();
      }, SHADOW, { soft: 1.6, op: 'multiply', box });
    });
    allPads.forEach((pad, i) => {
      const box = circleBox(pad.x, pad.y, pad.radius * 1.1);
      shape((c) => {
        padPath(c, pad, i);
        c.fill();
      }, P.leaf, { soft: 1.1, box });
      // Old pads: a warm rim (flat), the leaf weathering from the edge.
      if (pad.age > 0.4) {
        shape(
          (c) => {
            padPath(c, pad, i);
            c.fill();
            c.globalCompositeOperation = 'destination-out';
            padPath(c, pad, i, 0, 0, 0.9);
            c.fill();
          },
          P.leafAged,
          { soft: 1.6, alpha: Math.min(0.6, pad.age * 0.75), box },
        );
      }
      // Veins: a few faint radial dry-brush strokes from the stem.
      shape(
        (c) => {
          c.lineCap = 'round';
          c.lineWidth = Math.max(1 * px, 0.0022 * h);
          c.beginPath();
          const half = pad.notch / 2;
          const nv = 9;
          for (let v = 0; v < nv; v++) {
            const a = pad.angle + half + 0.25 + (v / (nv - 1)) * (TAU - pad.notch - 0.5);
            c.moveTo(sx(pad.x + Math.cos(a) * pad.radius * 0.12), sy(pad.y + Math.sin(a) * pad.radius * 0.12));
            c.lineTo(sx(pad.x + Math.cos(a) * pad.radius * 0.78), sy(pad.y + Math.sin(a) * pad.radius * 0.78));
          }
          c.stroke();
        },
        P.leafVein,
        { soft: 0.6, alpha: 0.7, box, band: 0.2 },
      );
    });

    // ---- A water-lily flower on one edge pad, and two loose petals on the water ----
    {
      const flowerAt = (fx, fy, size, rot, petals, ring) => {
        const draw = (dx, dy) => (c) => {
          c.beginPath();
          for (let p = 0; p < petals; p++) {
            const a = rot + (p / petals) * TAU + (ring ? Math.PI / petals : 0);
            const r = size * (ring ? 0.62 : 1);
            const cx = sx(fx + dx + Math.cos(a) * r * 0.55);
            const cy = sy(fy + dy + Math.sin(a) * r * 0.55);
            c.moveTo(cx, cy);
            c.ellipse(cx, cy, r * 0.55 * h, r * 0.24 * h, -a, 0, TAU);
          }
          c.fill();
        };
        return draw;
      };
      const e = extras[1];
      const fx = e.x + 0.03, fy = e.y + 0.035, sz = 0.05;
      const box = circleBox(fx, fy, 0.08);
      const outer = flowerAt(fx, fy, sz, 0.3, 8, false);
      const inner = flowerAt(fx, fy, sz, 0.3, 8, true);
      shape(outer(away[0] * 0.008, away[1] * 0.008), SHADOW_DEEP, { soft: 1.2, op: 'multiply', box });
      shape(outer(0, 0), P.white, { soft: 0.7, box });
      shape(inner(0, 0), '#e9e4d2', { soft: 0.6, box });
      shape((c) => { c.beginPath(); c.arc(sx(fx), sy(fy), sz * 0.16 * h, 0, TAU); c.fill(); }, P.gold, { soft: 0.6, box });
      // Loose petals drifting in open water near the edges.
      for (const [u, v, a] of [[0.9, 0.86, 0.8], [0.13, 0.66, 2.1]]) {
        const x = u * aspect, y = v;
        const b = circleBox(x, y, 0.03);
        const petal = (dx, dy) => (c) => { c.beginPath(); c.ellipse(sx(x + dx), sy(y + dy), 0.011 * h, 0.0048 * h, a, 0, TAU); c.fill(); };
        shape(petal(away[0] * 0.004, away[1] * 0.004), SHADOW, { soft: 0.8, op: 'multiply', box: b });
        shape(petal(0, 0), P.white, { soft: 0.6, box: b });
      }
    }

    // ---- Midges: a few specks with tiny shadows on the water ----------------------
    for (const f of world.flies) {
      const box = circleBox(f.x, f.y, 0.03);
      const hgt = 0.01 + (f.height || 0) * 0.05;
      shape((c) => {
        c.beginPath();
        c.arc(sx(f.x + away[0] * hgt), sy(f.y + away[1] * hgt), 1.4 * px, 0, TAU);
        c.fill();
      }, SHADOW, { soft: 0.6, op: 'multiply', box });
      shape((c) => {
        c.beginPath();
        c.arc(sx(f.x), sy(f.y), 1.3 * px, 0, TAU);
        c.fill();
      }, P.ink, { soft: 0.3, box, alpha: 0.8 });
    }

    roughDefault = 0.45; // animal edges: clean shapes softened by grain, not broken up
    // ---- Frogs -------------------------------------------------------------------
    const FC = Pond.FROG_CAPSULES;
    const LEG_RADII = [
      [0.125, 0.074],
      [0.078, 0.048],
      [0.05, 0.034],
      [0.05, 0.038],
      [0.038, 0.028],
    ];
    const caps = world.capsules;
    const leg = (fi, k) => {
      const o = (fi * FC + k) * 4;
      return [caps[o], caps[o + 1], caps[o + 2], caps[o + 3]];
    };
    const capsulePath = (c, ax, ay, bx, by, ra, rb) => {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      c.moveTo(ax + nx * ra, ay + ny * ra);
      c.lineTo(bx + nx * rb, by + ny * rb);
      c.lineTo(bx - nx * rb, by - ny * rb);
      c.lineTo(ax - nx * ra, ay - ny * ra);
      c.closePath();
      c.moveTo(ax + ra, ay);
      c.arc(ax, ay, ra, 0, TAU);
      c.moveTo(bx + rb, by);
      c.arc(bx, by, rb, 0, TAU);
    };
    const frogT = (c, frog, lift, dx = 0, dy = 0) => {
      const s = frog.size * h * (1 + frog.z * lift);
      c.translate(sx(frog.x + dx), sy(frog.y + dy));
      c.rotate(-frog.bodyHeading);
      c.scale(s * frog.bodyStretch, -s / frog.bodyStretch);
    };
    const bodyShapes = (frog) => {
      const x = -frog.lean;
      const sac = frog.throat;
      const list = [
        [x - 0.1, 0, 0.4, 0.265],
        [x - 0.3, 0, 0.19, 0.235],
        [x + 0.24, 0, 0.24, 0.222],
        [x + 0.41, 0, 0.1, 0.12],
      ];
      for (const side of [1, -1]) {
        list.push([x + 0.27, 0.155 * side, 0.078, 0.078]);
        const r = 0.02 + sac * (side > 0 ? 1.06 : 0.94) * 0.075;
        list.push([x + 0.17, (0.2 + sac * 0.06) * side, r, r]);
      }
      return list;
    };
    const footPath = (c, ax, ay, bx, by, hind, web) => {
      const base = Math.atan2(by - ay, bx - ax);
      const toes = hind ? 5 : 4;
      const spread = hind ? 0.18 + 0.38 * web : 0.62;
      const reach = hind ? 0.23 : 0.11;
      const toeR = hind ? 0.02 : 0.016;
      const tips = [];
      for (let i = 0; i < toes; i++) {
        const k = (i / (toes - 1)) * 2 - 1;
        const a = base + k * spread;
        const l = reach * (0.72 + 0.28 * Math.sin((k * 0.8 + 1) * 1.35));
        tips.push([a, bx + Math.cos(a) * l, by + Math.sin(a) * l]);
        capsulePath(c, bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, toeR, toeR * 1.25);
      }
      if (hind && web > 0.05) {
        c.moveTo(bx, by);
        for (let i = 0; i < toes; i++) {
          const edge = reach * (0.7 + 0.16 * web);
          const [a] = tips[i];
          c.lineTo(bx + Math.cos(a) * edge, by + Math.sin(a) * edge);
          if (i < toes - 1) {
            const mid = (a + tips[i + 1][0]) / 2;
            c.lineTo(bx + Math.cos(mid) * edge * 0.8, by + Math.sin(mid) * edge * 0.8);
          }
        }
        c.closePath();
      }
    };
    const silhouette = (frog, fi, part = 'all') => (c) => {
      c.beginPath();
      if (part !== 'legs')
        for (const [ex, ey, rx, ry] of bodyShapes(frog)) {
          c.moveTo(ex + rx, ey);
          c.ellipse(ex, ey, rx, ry, 0, 0, TAU);
        }
      if (part !== 'body') for (let k = 0; k < FC; k++) {
        const part = k % 5;
        const [ax, ay, bx, by] = leg(fi, k);
        capsulePath(c, ax, ay, bx, by, LEG_RADII[part][0], LEG_RADII[part][1]);
        if (part === 2 || part === 4) footPath(c, ax, ay, bx, by, part === 2, k < 5 ? frog.webL : frog.webR);
      }
      c.fill('nonzero');
    };
    const frogBox = (frog, extra = 0) => circleBox(frog.x, frog.y, frog.size * (1.6 + frog.z) + extra);
    const marks = LOOKS.map((_, i) => {
      const r = seeded(311 + i * 17);
      const inBody = (x, y, m) =>
        ((x + 0.1) / (0.4 - m)) ** 2 + (y / (0.265 - m)) ** 2 < 1 || ((x - 0.22) / (0.2 - m)) ** 2 + (y / (0.2 - m)) ** 2 < 1;
      const spots = (count, x0, x1, ys, r0, r1) => {
        const out = [];
        for (let t = 0; t < 400 && out.length < count; t++) {
          const x = x0 + r() * (x1 - x0);
          const y = (r() * 2 - 1) * ys;
          const rad = r0 + r() * (r1 - r0);
          if (!inBody(x, y, rad + 0.02)) continue;
          if (Math.abs(x - 0.27) < 0.1 && Math.abs(Math.abs(y) - 0.155) < 0.1) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + rad + 0.03)) continue;
          out.push({ x, y, r: rad, rx: rad * (0.85 + r() * 0.3), a: r() * Math.PI });
        }
        return out;
      };
      if (i === 0) return spots(8, -0.44, 0.12, 0.17, 0.035, 0.058);
      if (i === 1) return spots(14, -0.44, 0.3, 0.19, 0.009, 0.015);
      return spots(3, -0.36, 0.05, 0.13, 0.028, 0.04);
    });
    const ellipses = (list, grow, x0) => (c) => {
      c.beginPath();
      for (const s of list) {
        c.moveTo(x0 + s.x + s.rx + grow, s.y);
        c.ellipse(x0 + s.x, s.y, s.rx + grow, s.r + grow, s.a, 0, TAU);
      }
      c.fill();
    };

    const drawFrog = (frog, fi) => {
      const look = LOOKS[frog.palette % LOOKS.length];
      const box = frogBox(frog, 0.03);
      const x0 = -frog.lean;
      const inT = (fn) => (c) => {
        frogT(c, frog, 0.35);
        fn(c);
      };
      // Shadow band: ground-sized, away from the light; further and fainter in the air.
      const reach = 0.007 + frog.z * 0.3;
      shape(
        (c) => {
          frogT(c, frog, 0, away[0] * reach, away[1] * reach);
          silhouette(frog, fi)(c);
        },
        frog.z > 0.02 ? SHADOW : SHADOW_DEEP,
        { soft: 1 + frog.z * 6, op: 'multiply', box: frogBox(frog, reach + 0.03), alpha: 1 - Math.min(0.4, frog.z) },
      );
      // The flat silhouette: legs a step darker, so the body overlapping them reads.
      shape(inT(silhouette(frog, fi, 'legs')), look.skin, { soft: 0.6, box });
      // The body's own offset band falls on the legs beside it (flat, away from the light),
      // which is what separates body from legs: no outline, no modelling.
      const self = 0.0075 * (1 + frog.z * 0.35);
      shape(
        (c) => {
          c.save();
          frogT(c, frog, 0.35);
          silhouette(frog, fi, 'legs')(c);
          c.restore();
          c.globalCompositeOperation = 'source-in';
          frogT(c, frog, 0.35, away[0] * self, away[1] * self);
          silhouette(frog, fi, 'body')(c);
        },
        SHADOW,
        { soft: 0.6, op: 'multiply', box },
      );
      // Leg bars (strong on frog 0, faint on frog 2), as flat dark shapes.
      shape(
        inT((c) => {
          c.beginPath();
          for (let k = 0; k < FC; k++) {
            const part = k % 5;
            if (part > 1) continue;
            const [ax, ay, bx, by] = leg(fi, k);
            const len = Math.hypot(bx - ax, by - ay) || 1;
            const ux = (bx - ax) / len;
            const uy = (by - ay) / len;
            for (const t of part === 0 ? [0.32, 0.64] : [0.28, 0.55, 0.8]) {
              const r = (LEG_RADII[part][0] + (LEG_RADII[part][1] - LEG_RADII[part][0]) * t) * 0.82;
              const cx = ax + (bx - ax) * t;
              const cy = ay + (by - ay) * t;
              c.moveTo(cx, cy);
              c.ellipse(cx, cy, 0.024, r, Math.atan2(uy, ux), 0, TAU);
            }
          }
          c.fill();
        }),
        look.mark,
        { soft: 0.5, alpha: look.bars, box },
      );
      shape(inT(silhouette(frog, fi, 'body')), look.skin, { soft: 0.6, box });
      // Markings.
      if (fi === 0 || frog.palette === 0) {
        shape(inT(ellipses(marks[0], 0.016, x0)), look.halo, { soft: 0.5, box });
        shape(inT(ellipses(marks[0], 0, x0)), look.mark, { soft: 0.5, box });
      }
      if (frog.palette === 1) {
        shape(
          inT((c) => {
            c.lineCap = 'round';
            c.lineWidth = 0.045;
            c.beginPath();
            c.moveTo(x0 - 0.44, 0);
            c.lineTo(x0 + 0.4, 0);
            c.stroke();
          }),
          look.pale,
          { soft: 0.5, box },
        );
        shape(
          inT((c) => {
            c.lineCap = 'round';
            c.lineWidth = 0.055;
            c.beginPath();
            for (const side of [1, -1]) {
              c.moveTo(x0 + 0.1, 0.1 * side);
              c.lineTo(x0 + 0.45, 0.2 * side);
            }
            c.stroke();
            ellipses(marks[1], 0, x0)(c);
          }),
          look.mark,
          { soft: 0.5, box },
        );
      }
      if (frog.palette === 2) {
        shape(
          inT((c) => {
            c.lineCap = 'round';
            c.lineWidth = 0.04;
            c.beginPath();
            for (const side of [1, -1]) {
              c.moveTo(x0 - 0.4, 0.18 * side);
              c.quadraticCurveTo(x0 - 0.1, 0.16 * side, x0 + 0.22, 0.14 * side);
            }
            c.stroke();
          }),
          look.ridge,
          { soft: 0.5, box },
        );
        shape(inT(ellipses(marks[2], 0, x0)), look.mark, { soft: 0.5, box });
      }
      // One highlight: a soft lighter shape down the back, toward the light.
      const cs = Math.cos(-frog.bodyHeading);
      const sn = Math.sin(-frog.bodyHeading);
      const lx = sun[0] * cs - sun[1] * sn;
      const ly = sun[0] * sn + sun[1] * cs;
      shape(
        inT((c) => {
          c.beginPath();
          c.ellipse(x0 - 0.04 + lx * 0.06, ly * 0.07, 0.26, 0.06, 0, 0, TAU);
          c.fill();
        }),
        lighten(look.skin, 0.24),
        { soft: 0.7, alpha: 0.9, box },
      );
      // Eyes: gold iris (the accent), a dark bar pupil, one tiny catch-light.
      const closed = frog.blink > 0.5;
      for (const side of [1, -1]) {
        const ex = x0 + 0.27;
        const ey = 0.155 * side;
        if (closed) {
          shape(
            inT((c) => {
              c.beginPath();
              c.arc(ex, ey, 0.06, 0, TAU);
              c.fill();
            }),
            lighten(look.skin, -0.15),
            { soft: 0.4, box },
          );
          continue;
        }
        shape(
          inT((c) => {
            c.beginPath();
            c.arc(ex, ey, 0.06, 0, TAU);
            c.fill();
          }),
          look.iris,
          { soft: 0.35, box, band: 0.05 },
        );
        const ppx = ex + (Math.cos(frog.look) - 1) * 0.014;
        const ppy = ey + Math.sin(frog.look) * 0.014;
        shape(
          inT((c) => {
            c.beginPath();
            c.ellipse(ppx, ppy, 0.046, 0.022, 0, 0, TAU);
            c.fill();
          }),
          P.ink,
          { soft: 0.3, box, band: 0.05 },
        );
        shape(
          inT((c) => {
            c.beginPath();
            c.arc(ex + lx * 0.028, ey + ly * 0.028, 0.013, 0, TAU);
            c.fill();
          }),
          P.white,
          { soft: 0.25, box, band: 0.05, alpha: 0.9 },
        );
      }
    };
    // Sitting frogs first, the airborne one over everything.
    const order = world.frogs.map((f, i) => i).sort((a, b) => world.frogs[a].z - world.frogs[b].z);
    for (const i of order) drawFrog(world.frogs[i], i);

    // ---- r2: drifting shade from foliage out of frame: big, soft, flat, multiplied ----
    // Leafy clusters of discs entering from the edges; in the loop they sway round small
    // closed paths (a build would let them drift slowly across and wrap).
    if (shade) {
      const clusters = [
        // [u, v, spread, discs, seed, sway phase]
        [-0.02, 0.98, 0.2, 9, 3, 0],
        [1.02, 0.08, 0.22, 10, 7, 2.1],
        [0.62, 1.04, 0.13, 7, 11, 4.0],
        [0.8, 0.84, 0.12, 7, 13, 1.2],
      ];
      shape(
        (c) => {
          c.beginPath();
          for (const [u, v, spread, n, seed, phase] of clusters) {
            const r = seeded(seed * 101);
            const sxw = Math.cos(ph + phase) * 0.025;
            const syw = Math.sin(ph + phase) * 0.018;
            for (let k = 0; k < n; k++) {
              const ang = r() * TAU;
              const dist = Math.sqrt(r()) * spread;
              const rad = spread * (0.28 + r() * 0.3);
              // Each lobe also breathes a little on its own (a leaf moving in the breeze).
              const lw = Math.sin(ph * 1 + k * 1.7 + phase) * 0.006;
              const cx = u * aspect + Math.cos(ang) * dist + sxw + lw;
              const cy = v + Math.sin(ang) * dist + syw - lw;
              c.moveTo(sx(cx) + rad * h, sy(cy));
              c.arc(sx(cx), sy(cy), rad * h, 0, TAU);
            }
          }
          c.fill();
        },
        L2.shade,
        { soft: 4, op: 'multiply', rough: 0.8 },
      );
    }

    // ---- The grain and the slow drift, over everything -----------------------------
    const all = ctx.getImageData(0, 0, W, H);
    const d = all.data;
    for (let i = 0; i < W * H; i++) {
      const g = grain[i] - 0.5;
      const k = (1 + g * 0.3) * (1 + (drift[i] - 0.5) * 0.08);
      const fleck = hash(i, 0, 31) > 0.95 ? 0.07 : 0;
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c] * k;
        d[i * 4 + c] = Math.max(0, Math.min(255, v + (255 - v) * fleck));
      }
    }
    ctx.putImageData(all, 0, 0);
    return { world, W, H };
  }

  window.Board = { paint, P, LOOKS, SHADOW, SHADOW_DEEP };
})();
