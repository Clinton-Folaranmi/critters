// Both renderers draw the same picture (spec A-7).
//
// 1. Shared maths: the Canvas renderer bends its caustics with a JS port of
//    the shader's hash() and noise() (glslHash, glslNoise in
//    frog-caustics.ts). The shipped fragment shader's own functions are
//    rendered on a grid to a float target and compared with the JS.
// 2. The same frame: one world, one moment, drawn by WebGL and then (after a
//    forced context loss) by the Canvas fallback, at desktop and phone size.
//    Compared as the mean colour of 16 px blocks, so it catches anything
//    drawn in the wrong place, size or colour (a pad, a frog, the shade)
//    while allowing the Canvas caustics' coarser posterising.
import { build } from 'esbuild';
import { THRESHOLDS } from '../thresholds.mjs';

const GRID = 192;
/**
 * Grid point (i, j) → noise-space coordinates, 0 … 64: the range the warp
 * reads in the first ten minutes (p × 2.3 + 17 + t × 0.07). Float32 rounding
 * in the shader grows with the coordinates, so the range matters.
 */
const SPAN = 64 / GRID;
const at = (i, j) => [i * SPAN + 0.137, j * SPAN + 0.291];

/** glslHash and glslNoise from the source, bundled for Node. */
async function jsNoise() {
  const out = await build({
    entryPoints: ['packages/frog-pond/src/frog-caustics.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    conditions: ['source'],
    define: { 'import.meta.env.DEV': 'false' },
    write: false,
    logLevel: 'warning',
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}

export default async ({ page, pages, site, report }) => {
  const T = THRESHOLDS.parity;

  // ---- 1. hash() and noise(), GLSL vs JS -----------------------------------------
  await page.goto(`${pages}bake.html`);
  const glsl = await page.eval(`(() => {
    // Pull a function out of the shipped (minified) shader by its signature.
    const source = shaders.frogFragmentShader();
    const take = (head) => {
      const start = source.search(new RegExp(head + '\\\\s*\\\\('));
      if (start < 0) throw new Error('no ' + head + ' in the fragment shader');
      let depth = 0, i = source.indexOf('{', start);
      for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) break; }
      return source.slice(start, i + 1);
    };
    const fs = '#version 300 es\\nprecision highp float;\\nout vec4 o;\\n' +
      [take('float hash'), take('vec2 gradient'), take('float noise')].join('\\n') +
      '\\nvoid main() { vec2 g = floor(gl_FragCoord.xy); vec2 p = vec2(g.x * ${SPAN} + 0.137, g.y * ${SPAN} + 0.291);' +
      ' o = vec4(hash(floor(p)), noise(p), 0.0, 1.0); }';
    const W = ${GRID}, H = ${GRID};
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const gl = c.getContext('webgl2');
    gl.getExtension('EXT_color_buffer_float');
    const prog = createProgram(gl, shaders.frogVertexShader, fs);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, W, H);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, W, H); gl.useProgram(prog); gl.bindVertexArray(gl.createVertexArray());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Float32Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px);
    const hash = [], noise = [];
    for (let k = 0; k < W * H; k++) { hash.push(px[k * 4]); noise.push(px[k * 4 + 1]); }
    return { hash, noise };
  })()`);
  const { glslHash, glslNoise } = await jsNoise();
  let hashMax = 0;
  let noiseMax = 0;
  let hashOff = 0;
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i;
      const [x, y] = at(i, j);
      // hash() is fed lattice points (as noise() feeds it); compare it there.
      const h = Math.abs(glslHash(Math.floor(x), Math.floor(y)) - glsl.hash[k]);
      // fract() wraps: 0.9999 and 0.0001 are neighbours.
      const hw = Math.min(h, 1 - h);
      hashMax = Math.max(hashMax, hw);
      if (hw > 1 / 255) hashOff++;
      noiseMax = Math.max(noiseMax, Math.abs(glslNoise(x, y) - glsl.noise[k]));
    }
  report.measure('noise(): largest JS − GLSL', +noiseMax.toExponential(2), T.noiseAbs);
  report.info(
    `hash() on lattice points: largest JS − GLSL; samples more than 1/255 apart (of ${GRID * GRID})`,
    `${hashMax.toExponential(2)}; ${hashOff}`,
  );

  // ---- 2. The same frame from both renderers --------------------------------------
  for (const [shape, width, height, mobile] of [
    ['desktop', 1600, 1100, false],
    ['phone', 375, 812, true],
  ]) {
    await page.viewport(width, height, 1, mobile);
    await page.goto(`${site}?dpr=fixed`);
    await page.ready();
    await page.sleep(300);
    await page.freeze();
    const r = await page.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Top-down RGBA of whatever renderer has the canvas now.
      const grab = () => {
        const c = document.querySelector('canvas'); const w = c.width, h = c.height;
        if (__critterMode() === 'canvas') return { w, h, data: c.getContext('2d').getImageData(0, 0, w, h).data };
        const gl = c.getContext('webgl2'); const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const data = new Uint8Array(px.length);
        for (let y = 0; y < h; y++) data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        return { w, h, data };
      };
      __critterAdvance(0);
      const gl = grab();
      if (__critterMode() !== 'webgl2') return { error: 'not WebGL to start with' };
      // Lose the context: the same world moves to the Canvas renderer. No time
      // passes while frozen; wait (well inside the 2.5 s WebGL retry) for it to
      // get ready, i.e. for its first drawn pixels.
      __critterLoseContext();
      let cv = null;
      for (let k = 0; k < 40; k++) {
        await sleep(50);
        if (__critterMode() !== 'canvas') continue;
        __critterAdvance(0);
        const g = grab();
        if (g.data[3 + 4 * (g.w * (g.h >> 1) + (g.w >> 1))] > 0) { cv = g; break; }
      }
      if (!cv) return { error: 'the Canvas renderer drew nothing within 2 s' };
      if (cv.w !== gl.w || cv.h !== gl.h) return { error: 'sizes differ: ' + gl.w + 'x' + gl.h + ' vs ' + cv.w + 'x' + cv.h };
      const { w, h } = gl, B = 16;
      const blocks = [];
      let pixel = 0, n = 0;
      for (let by = 0; by + B <= h; by += B) for (let bx = 0; bx + B <= w; bx += B) {
        const a = [0, 0, 0], b = [0, 0, 0];
        for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
          const o = (y * w + x) * 4;
          for (let ch = 0; ch < 3; ch++) { a[ch] += gl.data[o + ch]; b[ch] += cv.data[o + ch]; pixel += Math.abs(gl.data[o + ch] - cv.data[o + ch]) / 3; }
          n++;
        }
        blocks.push({ d: Math.max(...a.map((v, ch) => Math.abs(v - b[ch]) / (B * B))), x: bx, y: by });
      }
      blocks.sort((p, q) => p.d - q.d);
      const worst = blocks.at(-1);
      return { size: w + 'x' + h, blocks: blocks.length, p99: blocks[Math.floor(blocks.length * 0.99)].d, max: worst.d, at: [worst.x, worst.y], pixel: pixel / n };
    })()`);
    if (r.error) {
      report.expect(`${shape}: both renderers drew the frame`, false, r.error);
      continue;
    }
    report.measure(`${shape}: 16 px blocks, 99th percentile colour difference`, +r.p99.toFixed(1), T.blockP99);
    report.measure(`${shape}: 16 px blocks, largest colour difference`, +r.max.toFixed(1), T.blockMax);
    report.info(
      `${shape}: mean per-pixel difference, worst block at (px), blocks, size`,
      `${r.pixel.toFixed(1)}, (${r.at.join(', ')}), ${r.blocks}, ${r.size}`,
    );
  }
};
