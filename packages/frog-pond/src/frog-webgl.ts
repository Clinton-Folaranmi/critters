import { startProgram } from './gl-utils';
import { REED_BLADES, reedBlades } from './frog-bank';
import { bakeCaustics, trackBank, type BakedBank } from './frog-bank-layer';
import { MAX_SPECKS, frogBedShader, frogFragmentShader, frogVertexShader } from './frog-shaders';
import type { FrogTheme } from './frog-theme';
import { FROG_CAPSULES, MAX_FLIES, MAX_PADS, type FrogWorld } from './frog-world';

export interface FrogRenderer {
  /** Draws a frame once everything it needs is ready; until then it only gets ready. */
  draw(time: number): void;
  /** True once it has drawn a full frame, bank and all. */
  readonly ready: boolean;
  /** The bank being shown, for hit tests; null until the first one is baked. */
  readonly bank: BakedBank | null;
  dispose(): void;
}

export interface FrogRendererHooks {
  /** The context was lost: draw() does nothing from now on. Called once. */
  onLost?: () => void;
  /** Setting up failed after the renderer was made (a shader didn't compile). */
  onFail?: (error: unknown) => void;
  /** Something new to show arrived between frames (a freshly baked bank). */
  onChange?: () => void;
}

/** How far outside the reeds' roots and tips their bend, width and shadow can reach. */
const REED_MARGIN = 0.035;

// Throws on any setup failure it can see at once, so the scene can fall back
// to a fresh canvas. The shaders compile in the background
// (KHR_parallel_shader_compile where available) and the bank is baked in a
// worker, so the first draw() calls only get ready; a compile failure then
// reaches onFail. If the context is lost later, onLost is called once and
// draw() becomes a no-op; the scene decides what replaces this renderer.
export function createFrogWebgl(
  canvas: HTMLCanvasElement,
  world: FrogWorld,
  ripples: Float32Array,
  theme: FrogTheme,
  hooks: FrogRendererHooks = {},
): FrogRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 context creation failed.');
  const pond = startProgram(gl, frogVertexShader, frogFragmentShader(theme));
  const bed = startProgram(gl, frogVertexShader, frogBedShader(theme));
  const program = pond.program;
  const vao = gl.createVertexArray();
  // The riverbed never moves, so it is painted once per canvas size into
  // this texture (colour, and depth in alpha) and sampled by the pond pass.
  const bedTexture = gl.createTexture();
  const bedFramebuffer = gl.createFramebuffer();
  // The bank (frog-bank-paint.ts), laid over the water: the same picture the
  // Canvas renderer draws.
  const bankTexture = gl.createTexture();
  // By day, the baked caustic web (see frog-caustics.ts), tiled; it is made
  // off the main thread, like the bank.
  const causticTexture = gl.createTexture();
  let causticsReady = theme !== 'day';
  let disposed = false;
  if (!causticsReady) {
    bakeCaustics(256).then(
      (tile) => {
        if (disposed || gl.isContextLost()) return;
        gl.bindTexture(gl.TEXTURE_2D, causticTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, tile);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        causticsReady = true;
        hooks.onChange?.();
      },
      (error: unknown) => hooks.onFail?.(error),
    );
  }
  let bedWidth = 0;
  let bedHeight = 0;
  const paintBed = () => {
    bedWidth = canvas.width;
    bedHeight = canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, bedTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bedWidth, bedHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bedFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bedTexture, 0);
    gl.viewport(0, 0, bedWidth, bedHeight);
    gl.useProgram(bed.program);
    gl.bindVertexArray(vao);
    gl.uniform2f(gl.getUniformLocation(bed.program, 'u_resolution'), bedWidth, bedHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  // A worker hands the bank over as an ImageBitmap, which some browsers
  // upload without the flip and premultiply asked for below; drawn into a
  // plain 2D canvas first, every source uploads the same way.
  let uploaded: BakedBank | null = null;
  const uploadBank = (bank: BakedBank) => {
    let source = bank.image;
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
      const copy = new OffscreenCanvas(source.width, source.height);
      copy.getContext('2d')?.drawImage(source, 0, 0);
      source = copy;
    }
    gl.bindTexture(gl.TEXTURE_2D, bankTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    uploaded = bank;
  };
  const bank = trackBank(theme, () => hooks.onChange?.());

  const names = [
    'u_resolution',
    'u_time',
    'u_ripples[0]',
    'u_padCount',
    'u_padA[0]',
    'u_padB[0]',
    'u_padC[0]',
    'u_padD[0]',
    'u_frogCount',
    'u_frogA[0]',
    'u_frogB[0]',
    'u_frogC[0]',
    'u_frogD[0]',
    'u_frogE[0]',
    'u_legs[0]',
    'u_flyCount',
    'u_flies[0]',
    'u_moteBox',
    'u_bed',
    'u_caustic',
    'u_bank',
    'u_reedEnds[0]',
    'u_reedShape[0]',
    'u_reedBox',
  ] as const;
  // Uniform locations can only be read once the program has linked.
  let loc: Record<(typeof names)[number], WebGLUniformLocation | null> | null = null;
  const padA = new Float32Array(MAX_PADS * 4);
  const padB = new Float32Array(MAX_PADS * 4);
  const padC = new Float32Array(MAX_PADS * 4);
  const padD = new Float32Array(MAX_PADS * 4);
  const frogA = new Float32Array(12);
  const frogB = new Float32Array(12);
  const frogC = new Float32Array(12);
  const frogD = new Float32Array(12);
  const frogE = new Float32Array(12);
  const legs = new Float32Array(3 * FROG_CAPSULES * 4);
  const flies = new Float32Array(MAX_SPECKS * 4);
  const reedEnds = new Float32Array(REED_BLADES * 4);
  const reedShape = new Float32Array(REED_BLADES * 4);
  const reedBox = new Float32Array(4);
  const day = theme === 'day';

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

  /** Whether the programs have finished linking (polling costs nothing once they have). */
  const compiled = () => {
    if (loc) return true;
    try {
      if (!pond.poll() || !bed.poll()) return false;
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

  const renderer: FrogRenderer = {
    get ready() {
      return ready;
    },
    get bank() {
      return bank.bank;
    },
    draw(time) {
      if (lost || failed || gl.isContextLost()) return;
      bank.fit(canvas.width, canvas.height);
      if (!compiled() || !loc) return;
      const shown = bank.bank;
      if (!shown || !causticsReady) return;
      if (shown !== uploaded) uploadBank(shown);
      if (canvas.width !== bedWidth || canvas.height !== bedHeight) paintBed();
      gl.viewport(0, 0, canvas.width, canvas.height);
      const pads = world.pads;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const o = i * 4;
        padA[o] = pad.x;
        padA[o + 1] = pad.y;
        padA[o + 2] = pad.radius;
        padA[o + 3] = pad.angle;
        padB[o] = pad.notch;
        padB[o + 1] = pad.bob * Math.sin(pad.bobPhase);
        padB[o + 2] = pad.age;
        padB[o + 3] = pad.damage;
        padC[o] = pad.loadX;
        padC[o + 1] = pad.loadY;
        padC[o + 2] = pad.load;
        padD[o] = pad.pressX;
        padD[o + 1] = pad.pressY;
        padD[o + 2] = pad.press;
      }
      const frogs = world.frogs;
      for (let i = 0; i < frogs.length; i++) {
        const frog = frogs[i];
        const o = i * 4;
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
        frogE[o + 2] = frog.impact;
        frogE[o + 3] = frog.startle;
      }
      legs.set(world.capsules);
      // Fireflies glow (night); midges are simply there or not (day). The
      // motes come after the flies, with a box round the lit ones.
      for (let i = 0; i < world.flies.length; i++) {
        const fly = world.flies[i];
        flies[i * 4] = fly.x;
        flies[i * 4 + 1] = fly.y;
        flies[i * 4 + 2] = fly.respawn > 0 ? 0 : day ? fly.fade : fly.glow;
        flies[i * 4 + 3] = fly.height;
      }
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < world.motes.length; i++) {
        const mote = world.motes[i];
        const o = (MAX_FLIES + i) * 4;
        const glow = world.moteGlow(mote);
        flies[o] = mote.x;
        flies[o + 1] = mote.y;
        flies[o + 2] = glow;
        flies[o + 3] = mote.height;
        if (glow <= 0) continue;
        x0 = Math.min(x0, mote.x);
        x1 = Math.max(x1, mote.x);
        y0 = Math.min(y0, mote.y - mote.height);
        y1 = Math.max(y1, mote.y);
      }
      reedBlades(canvas.width / canvas.height, time, reedEnds, reedShape, reedBox);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.u_time, time);
      gl.uniform4fv(loc['u_reedEnds[0]'], reedEnds);
      gl.uniform4fv(loc['u_reedShape[0]'], reedShape);
      gl.uniform4f(
        loc.u_reedBox,
        reedBox[0] - REED_MARGIN,
        reedBox[1] - REED_MARGIN,
        reedBox[2] + REED_MARGIN,
        reedBox[3] + REED_MARGIN,
      );
      gl.uniform4fv(loc['u_ripples[0]'], ripples);
      gl.uniform1i(loc.u_padCount, pads.length);
      gl.uniform4fv(loc['u_padA[0]'], padA);
      gl.uniform4fv(loc['u_padB[0]'], padB);
      gl.uniform4fv(loc['u_padC[0]'], padC);
      gl.uniform4fv(loc['u_padD[0]'], padD);
      gl.uniform1i(loc.u_frogCount, frogs.length);
      gl.uniform4fv(loc['u_frogA[0]'], frogA);
      gl.uniform4fv(loc['u_frogB[0]'], frogB);
      gl.uniform4fv(loc['u_frogC[0]'], frogC);
      gl.uniform4fv(loc['u_frogD[0]'], frogD);
      gl.uniform4fv(loc['u_frogE[0]'], frogE);
      gl.uniform4fv(loc['u_legs[0]'], legs);
      gl.uniform1i(loc.u_flyCount, world.flies.length);
      gl.uniform4fv(loc['u_flies[0]'], flies);
      // A glow reaches about 0.065 out (see speckAbove in the shader).
      gl.uniform4f(loc.u_moteBox, x0 - 0.07, y0 - 0.07, x1 + 0.07, y1 + 0.07);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bedTexture);
      gl.uniform1i(loc.u_bed, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, causticTexture);
      gl.uniform1i(loc.u_caustic, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, bankTexture);
      gl.uniform1i(loc.u_bank, 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ready = true;
    },
    dispose() {
      disposed = true;
      bank.dispose();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (gl.isContextLost()) return;
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteProgram(bed.program);
      gl.deleteTexture(bedTexture);
      gl.deleteTexture(causticTexture);
      gl.deleteTexture(bankTexture);
      gl.deleteFramebuffer(bedFramebuffer);
    },
  };
  return renderer;
}
