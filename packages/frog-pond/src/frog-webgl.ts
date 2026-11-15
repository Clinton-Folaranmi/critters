import { startProgram } from 'critter-kit';
import {
  GRAIN_TILE,
  causticTileJob,
  makeDrift,
  makeGrainTile,
  paintAtlas,
  type GrainTile,
  type AtlasJob,
  type SpriteAtlas,
} from './frog-caustics';
import { MAX_SHADE, RIPPLE_ARCS, RIPPLE_SLOTS, frogFragmentShader, frogVertexShader } from './frog-shaders';
import { FROG_EDGES, FROG_PALETTE, SHADE_CLUSTERS, shadeCentre } from './frog-theme';
import { FROG_CAPSULES, FROG_LIFT, MAX_FLIES, MAX_PADS, type Frog, type FrogWorld } from './frog-world';

export interface FrogRenderer {
  /** Draws a frame once everything it needs is ready; until then it only gets ready. */
  draw(time: number): void;
  /** True once it has drawn a full frame. */
  readonly ready: boolean;
  dispose(): void;
}

export interface FrogRendererHooks {
  /** The context was lost: draw() does nothing from now on. Called once. */
  onLost?: () => void;
  /** Setting up failed after the renderer was made (a shader didn't compile). */
  onFail?: (error: unknown) => void;
  /** Something new to show arrived between frames. */
  onChange?: () => void;
}

/** Device pixels per CSS pixel for this canvas, to the nearest quarter (the grain is sized in CSS px). */
export const canvasRatio = (canvas: HTMLCanvasElement) =>
  Math.max(0.5, Math.round((canvas.width / Math.max(1, canvas.clientWidth || canvas.width)) * 4) / 4);

// A small LCG at module level, so drawing ripples allocates nothing.
let arcSeed = 0;
const nextArc = () => {
  arcSeed = (Math.imul(arcSeed, 1664525) + 1013904223) >>> 0;
  return arcSeed / 4294967296;
};

/**
 * Where each ripple's broken arcs start and how long they are (2 rings × 3
 * arcs, world angles), the same for both renderers: seeded by where it is.
 */
export function rippleArcs(x: number, y: number, out: Float32Array, o: number) {
  arcSeed = (Math.imul(Math.floor(x * 1000 + y * 7000), 2654435761) + 7) >>> 0;
  const start = nextArc() * Math.PI * 2;
  for (let ring = 0; ring < 2; ring++) {
    for (let k = 0; k < 3; k++) {
      const i = o + (ring * 3 + k) * 2;
      out[i] = start + ring * 0.6 + k * ((Math.PI * 2) / 3) + nextArc() * 0.3;
      out[i + 1] = 0.5 + nextArc() * 0.5;
    }
  }
}

/**
 * The sprites both renderers lay on (pads and shade), painted for the
 * canvas's height a slice at a time off the frame (see paintAtlas). Until a
 * new one is done the last one stays in use; `atlas` is null only before the
 * first is ready. onReady is called when one is.
 */
export function atlasBaker(world: FrogWorld, onReady: () => void) {
  let shown: SpriteAtlas | null = null;
  let job: AtlasJob | null = null;
  let wantedH = 0;
  let wantedRatio = 0;
  let wantedPads = 0;
  let timer = 0;
  const pump = () => {
    timer = 0;
    if (!job) return;
    if (job.work(8)) {
      shown = job.atlas;
      job = null;
      onReady();
    } else timer = window.setTimeout(pump, 0);
  };
  return {
    get atlas() {
      return shown;
    },
    /** Starts painting for this size and grain, unless that's already done or under way. */
    fit(h: number, ratio: number, grain: GrainTile) {
      if (h === wantedH && ratio === wantedRatio && world.pads.length === wantedPads) return;
      wantedH = h;
      wantedRatio = ratio;
      wantedPads = world.pads.length;
      job = paintAtlasFor(world, h, ratio, grain);
      window.clearTimeout(timer);
      pump();
    },
    dispose() {
      window.clearTimeout(timer);
      job = null;
    },
  };
}

function paintAtlasFor(world: FrogWorld, h: number, ratio: number, grain: GrainTile): AtlasJob {
  return paintAtlas(world.pads, h, ratio, grain, {
    leaf: FROG_PALETTE.leaf,
    vein: FROG_PALETTE.leafVein,
    aged: FROG_PALETTE.leafAged,
    band: FROG_PALETTE.shadow,
    shade: FROG_PALETTE.shade,
    edges: FROG_EDGES,
    clusters: SHADE_CLUSTERS,
  });
}

/** How far from its centre any part of a frog reaches (world units): legs, toes and all. */
export function frogReach(world: FrogWorld, frog: Frog, index: number) {
  const c = world.capsules;
  let reach = 0.55;
  for (let k = 0; k < FROG_CAPSULES; k++) {
    const o = (index * FROG_CAPSULES + k) * 4;
    reach = Math.max(reach, Math.hypot(c[o + 2], c[o + 3]) + 0.36);
  }
  return reach * frog.size * (1 + frog.z * FROG_LIFT) * Math.max(frog.bodyStretch, 1 / frog.bodyStretch);
}

/** Indices of the frogs in drawing order: lowest first, so a leaper passes over the others. */
export function frogOrder(world: FrogWorld, out: Int32Array) {
  const n = world.frogs.length;
  for (let i = 0; i < n; i++) out[i] = i;
  for (let i = 1; i < n; i++) {
    const v = out[i];
    let j = i - 1;
    while (j >= 0 && world.frogs[out[j]].z > world.frogs[v].z) {
      out[j + 1] = out[j];
      j--;
    }
    out[j + 1] = v;
  }
  return n;
}

// Throws on any setup failure it can see at once, so the scene can fall back
// to a fresh canvas. The shader compiles in the background
// (KHR_parallel_shader_compile where available), so the first draw() calls
// only get ready; a compile failure then reaches onFail. If the context is
// lost later, onLost is called once and draw() becomes a no-op.
export function createFrogWebgl(
  canvas: HTMLCanvasElement,
  world: FrogWorld,
  ripples: Float32Array,
  hooks: FrogRendererHooks = {},
): FrogRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 context creation failed.');
  const pond = startProgram(gl, frogVertexShader, frogFragmentShader());
  const program = pond.program;
  const vao = gl.createVertexArray();

  const texture = (filter: number, wrap: number) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  };
  // The caustic web (frog-caustics.ts), painted a slice at a time, then tiled.
  const causticTexture = texture(gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT);
  const causticJob = causticTileJob(256);
  let causticReady = false;
  const uploadCaustics = () => {
    causticReady = causticJob.work(6);
    if (!causticReady) return;
    gl.bindTexture(gl.TEXTURE_2D, causticTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, causticJob.tile);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  // The grain, remade when the pixel density changes; the drift, when the aspect does.
  const grainTexture = texture(gl.NEAREST, gl.REPEAT);
  const driftTexture = texture(gl.LINEAR, gl.CLAMP_TO_EDGE);
  let grain: GrainTile | null = null;
  let driftAspect = 0;
  // The pads and shade, painted once per size (paintAtlas), shared with the Canvas renderer.
  const atlasTexture = texture(gl.LINEAR, gl.CLAMP_TO_EDGE);
  const baker = atlasBaker(world, () => hooks.onChange?.());
  let atlas: SpriteAtlas | null = null;

  const names = [
    'u_resolution',
    'u_time',
    'u_ratio',
    'u_ripples[0]',
    'u_arcs[0]',
    'u_padCount',
    'u_counts',
    'u_padA[0]',
    'u_padB[0]',
    'u_padC[0]',
    'u_frogCount',
    'u_frogA[0]',
    'u_frogB[0]',
    'u_frogC[0]',
    'u_frogD[0]',
    'u_frogE[0]',
    'u_legs[0]',
    'u_flyCount',
    'u_flies[0]',
    'u_shade[0]',
    'u_padLeaf[0]',
    'u_padBand[0]',
    'u_shadeSprite[0]',
    'u_atlas',
    'u_atlasSize',
    'u_atlasH',
    'u_caustic',
    'u_grain',
    'u_drift',
  ] as const;
  // Uniform locations can only be read once the program has linked.
  let loc: Record<(typeof names)[number], WebGLUniformLocation | null> | null = null;
  const padA = new Float32Array(MAX_PADS * 4);
  const padB = new Float32Array(MAX_PADS * 4);
  const padC = new Float32Array(MAX_PADS * 4);
  const frogA = new Float32Array(12);
  const frogB = new Float32Array(12);
  const frogC = new Float32Array(12);
  const frogD = new Float32Array(12);
  const frogE = new Float32Array(12);
  const legs = new Float32Array(3 * FROG_CAPSULES * 4);
  const flies = new Float32Array(MAX_FLIES * 4);
  const shade = new Float32Array(MAX_SHADE * 4);
  const padLeaf = new Float32Array(MAX_PADS * 4);
  const padBand = new Float32Array(MAX_PADS * 4);
  const shadeSprite = new Float32Array(MAX_SHADE * 4);
  const arcs = new Float32Array(RIPPLE_SLOTS * RIPPLE_ARCS * 2);
  const order = new Int32Array(3);

  let lost = false;
  let failed = false;
  let ready = false;
  const onContextLost = (event: Event) => {
    // Allows the browser to restore the context; the scene rebuilds anyway.
    event.preventDefault();
    if (lost) return;
    lost = true;
    hooks.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  /** Whether the program has finished linking (polling costs nothing once it has). */
  const compiled = () => {
    if (loc) return true;
    try {
      if (!pond.poll()) return false;
    } catch (error) {
      failed = true;
      hooks.onFail?.(error);
      return false;
    }
    loc = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as NonNullable<
      typeof loc
    >;
    return true;
  };

  /** The tiles that depend on the canvas: painted once per density and aspect. */
  const fitTiles = (aspect: number) => {
    const ratio = canvasRatio(canvas);
    if (!grain || grain.ratio !== ratio) {
      grain = makeGrainTile(ratio);
      gl.bindTexture(gl.TEXTURE_2D, grainTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, GRAIN_TILE, GRAIN_TILE, 0, gl.RGBA, gl.UNSIGNED_BYTE, grain.pixels);
    }
    const rounded = Math.round(aspect * 100) / 100;
    if (rounded !== driftAspect) {
      driftAspect = rounded;
      const drift = makeDrift(rounded);
      gl.bindTexture(gl.TEXTURE_2D, driftTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drift.width, drift.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, drift.pixels);
    }
    baker.fit(canvas.height, ratio, grain);
    if (baker.atlas && baker.atlas !== atlas) {
      atlas = baker.atlas;
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      for (let i = 0; i < atlas.leaves.length; i++) {
        padLeaf[i * 4] = atlas.leaves[i].x;
        padLeaf[i * 4 + 1] = atlas.leaves[i].y;
        padLeaf[i * 4 + 2] = atlas.leaves[i].half;
        padBand[i * 4] = atlas.bands[i].x;
        padBand[i * 4 + 1] = atlas.bands[i].y;
        padBand[i * 4 + 2] = atlas.bands[i].half;
      }
      for (let i = 0; i < atlas.shade.length; i++) {
        shadeSprite[i * 4] = atlas.shade[i].x;
        shadeSprite[i * 4 + 1] = atlas.shade[i].y;
        shadeSprite[i * 4 + 2] = atlas.shade[i].half;
      }
    }
    return ratio;
  };

  const renderer: FrogRenderer = {
    get ready() {
      return ready;
    },
    draw(time) {
      if (lost || failed || gl.isContextLost()) return;
      if (!causticReady) uploadCaustics();
      if (!compiled() || !loc || !causticReady) return;
      const aspect = canvas.width / Math.max(1, canvas.height);
      const ratio = fitTiles(aspect);
      if (!atlas) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      const pads = world.pads;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const o = i * 4;
        padA[o] = pad.x;
        padA[o + 1] = pad.y;
        padA[o + 2] = pad.radius * (1 + pad.bob * Math.sin(pad.bobPhase) * 0.03);
        padA[o + 3] = pad.angle;
        padB[o] = pad.notch;
        padB[o + 1] = pad.age;
        padB[o + 2] = pad.damage;
        padB[o + 3] = pad.press;
        padC[o] = pad.pressX;
        padC[o + 1] = pad.pressY;
        padC[o + 2] = pad.radius;
        padLeaf[o + 3] = 1 + pad.bob * Math.sin(pad.bobPhase) * 0.03;
      }
      const frogs = world.frogs;
      const count = frogOrder(world, order);
      for (let n = 0; n < count; n++) {
        const i = order[n];
        const frog = frogs[i];
        const o = n * 4;
        frogA[o] = frog.x;
        frogA[o + 1] = frog.y;
        frogA[o + 2] = frog.bodyHeading;
        frogA[o + 3] = frog.size;
        frogB[o] = frog.z;
        frogB[o + 1] = frog.bodyStretch;
        frogB[o + 2] = frog.blink;
        frogB[o + 3] = frog.throat;
        frogC[o] = frog.tongueX;
        frogC[o + 1] = frog.tongueY;
        frogC[o + 2] = frog.tongue;
        frogC[o + 3] = frog.submerge;
        frogD[o] = frog.palette;
        frogD[o + 1] = frog.submerge >= 0.02 ? frog.speed : 0;
        frogD[o + 2] = frog.webL;
        frogD[o + 3] = frog.webR;
        frogE[o] = frog.lean;
        frogE[o + 1] = frog.look;
        frogE[o + 2] = frogReach(world, frog, i);
        const from = i * FROG_CAPSULES * 4;
        const to = n * FROG_CAPSULES * 4;
        for (let k = 0; k < FROG_CAPSULES * 4; k++) legs[to + k] = world.capsules[from + k];
      }
      // Midges are simply there or not (fade), and gone while respawning.
      for (let i = 0; i < world.flies.length; i++) {
        const fly = world.flies[i];
        flies[i * 4] = fly.x;
        flies[i * 4 + 1] = fly.y;
        flies[i * 4 + 2] = fly.respawn > 0 ? 0 : fly.fade;
        flies[i * 4 + 3] = fly.height;
      }
      for (let i = 0; i < RIPPLE_SLOTS; i++) rippleArcs(ripples[i * 4], ripples[i * 4 + 1], arcs, i * RIPPLE_ARCS * 2);
      for (let i = 0; i < SHADE_CLUSTERS.length; i++) {
        shadeCentre(SHADE_CLUSTERS[i], aspect, time, shade, i * 4);
        shade[i * 4 + 2] = SHADE_CLUSTERS[i].reach;
      }
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.u_time, time);
      gl.uniform1f(loc.u_ratio, ratio);
      gl.uniform4fv(loc['u_ripples[0]'], ripples);
      gl.uniform4fv(loc['u_arcs[0]'], arcs);
      gl.uniform1i(loc.u_padCount, pads.length);
      gl.uniform4i(loc.u_counts, FROG_CAPSULES, RIPPLE_SLOTS, RIPPLE_ARCS, 2);
      gl.uniform4fv(loc['u_padA[0]'], padA);
      gl.uniform4fv(loc['u_padB[0]'], padB);
      gl.uniform4fv(loc['u_padC[0]'], padC);
      gl.uniform1i(loc.u_frogCount, count);
      gl.uniform4fv(loc['u_frogA[0]'], frogA);
      gl.uniform4fv(loc['u_frogB[0]'], frogB);
      gl.uniform4fv(loc['u_frogC[0]'], frogC);
      gl.uniform4fv(loc['u_frogD[0]'], frogD);
      gl.uniform4fv(loc['u_frogE[0]'], frogE);
      gl.uniform4fv(loc['u_legs[0]'], legs);
      gl.uniform1i(loc.u_flyCount, world.flies.length);
      gl.uniform4fv(loc['u_flies[0]'], flies);
      gl.uniform4fv(loc['u_shade[0]'], shade);
      gl.uniform4fv(loc['u_padLeaf[0]'], padLeaf);
      gl.uniform4fv(loc['u_padBand[0]'], padBand);
      gl.uniform4fv(loc['u_shadeSprite[0]'], shadeSprite);
      if (atlas) gl.uniform2f(loc.u_atlasSize, atlas.canvas.width, atlas.canvas.height);
      gl.uniform1f(loc.u_atlasH, atlas?.h ?? canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, causticTexture);
      gl.uniform1i(loc.u_caustic, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, grainTexture);
      gl.uniform1i(loc.u_grain, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, driftTexture);
      gl.uniform1i(loc.u_drift, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(loc.u_atlas, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ready = true;
    },
    dispose() {
      baker.dispose();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (gl.isContextLost()) return;
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteTexture(causticTexture);
      gl.deleteTexture(grainTexture);
      gl.deleteTexture(driftTexture);
      gl.deleteTexture(atlasTexture);
    },
  };
  return renderer;
}
