// JS and GLSL agree: shoreDistance / openDistance on a grid (rendered to a
// float target), and the bed pass's depth vs shelfDepth(), which the Canvas
// renderer uses. Runs in the bake page (qa/.out/pages/bake.html).
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, pages, report }) => {
  const T = THRESHOLDS.parity;
  await page.goto(`${pages}bake.html`);
  const results = await page.eval(`(() => {
    const out = {};
    for (const [W, H] of [[880, 595], [375, 412]]) {
      const aspect = W / H;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const gl = c.getContext('webgl2');
      gl.getExtension('EXT_color_buffer_float');
      const vs = shaders.frogVertexShader;
      const fs = '#version 300 es\\nprecision highp float;\\nout vec4 o;\\nuniform vec2 u_resolution;\\n' + bank.BANK_GLSL +
        '\\nvoid main() { vec2 uv = gl_FragCoord.xy / u_resolution.y; float a = u_resolution.x / u_resolution.y; o = vec4(shoreDistance(uv, a), openDistance(uv, a), 0.0, 1.0); }';
      const prog = createProgram(gl, vs, fs);
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, W, H);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, W, H); gl.useProgram(prog); gl.bindVertexArray(gl.createVertexArray());
      gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), W, H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px);
      let shore = 0, open = 0, flips = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4; const wx = (x + .5) / H, wy = (y + .5) / H;
        const js = bank.shoreDistance(wx, wy, aspect), jo = bank.openDistance(wx, wy, aspect);
        shore = Math.max(shore, Math.abs(js - px[o])); open = Math.max(open, Math.abs(jo - px[o + 1]));
        if (Math.sign(js) !== Math.sign(px[o]) && Math.abs(js) > 1e-6) flips++;
      }
      // Bed depth (8-bit alpha) vs shelfDepth (the Canvas renderer's; no floor noise).
      const bedProg = createProgram(gl, vs, shaders.frogBedShader('night'));
      const t8 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t8); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t8, 0);
      gl.useProgram(bedProg); gl.uniform2f(gl.getUniformLocation(bedProg, 'u_resolution'), W, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
      let sum = 0, max = 0, n = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const e = Math.abs(bank.shelfDepth((x + .5) / H, (y + .5) / H, aspect) - b[(y * W + x) * 4 + 3] / 255);
        sum += e; max = Math.max(max, e); n++;
      }
      out[W + 'x' + H] = { shore, open, flips, depthMean: sum / n, depthMax: max };
    }
    return out;
  })()`);
  for (const [size, r] of Object.entries(results)) {
    report.measure(`${size}: shoreDistance, largest JS − GLSL`, r.shore, T.shoreAbs);
    report.measure(`${size}: openDistance, largest JS − GLSL`, r.open, T.shoreAbs);
    report.measure(`${size}: water/land sign flips`, r.flips, T.signFlips);
    report.measure(`${size}: bed depth vs shelfDepth(), mean difference`, +r.depthMean.toFixed(3), T.depthMeanAbs);
    report.info(`${size}: bed depth vs shelfDepth(), largest difference`, +r.depthMax.toFixed(3));
  }
};
