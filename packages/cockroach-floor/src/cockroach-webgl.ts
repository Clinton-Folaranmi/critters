// The GPU renderer (spec A-8): one full-screen pass of cockroach-shaders.ts.
// The program compiles in the background (F-3), so draw() only gets ready
// until it links; a lost context makes draw() a no-op and tells the scene,
// which switches to the Canvas renderer.

import { startProgram, type RendererHooks, type SceneRenderer } from 'critter-kit';
import { fragmentShader, vertexShader } from './cockroach-shaders';
import { MAX_CRUMBS, type CockroachWorld } from './cockroach-world';

export function createCockroachWebgl(
  canvas: HTMLCanvasElement,
  world: CockroachWorld,
  hooks: RendererHooks = {},
): SceneRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 context creation failed.');
  const pass = startProgram(gl, vertexShader, fragmentShader);
  const vao = gl.createVertexArray();
  const crumbs = new Float32Array(MAX_CRUMBS * 3);
  let loc: Record<string, WebGLUniformLocation | null> | null = null;
  let ready = false;
  let lost = false;
  let failed = false;
  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (lost) return;
    lost = true;
    hooks.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const linked = () => {
    try {
      if (!pass.poll()) return false;
    } catch (error) {
      failed = true;
      hooks.onFail?.(error);
      return false;
    }
    if (!loc) {
      const names = ['u_resolution', 'u_body', 'u_caps[0]', 'u_crumbs[0]'];
      loc = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(pass.program, name)]));
    }
    return true;
  };

  return {
    get ready() {
      return ready;
    },
    draw() {
      if (lost || failed || gl.isContextLost() || !linked() || !loc) return;
      const r = world.roach;
      world.crumbs.forEach((c, i) => {
        crumbs[i * 3] = c.x;
        crumbs[i * 3 + 1] = c.y;
        crumbs[i * 3 + 2] = c.left;
      });
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(pass.program);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
      gl.uniform4f(loc.u_body, r.x, r.y, r.bodyHeading, r.size);
      gl.uniform4fv(loc['u_caps[0]'], world.capsules);
      gl.uniform3fv(loc['u_crumbs[0]'], crumbs);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ready = true;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (!gl.isContextLost()) {
        gl.deleteProgram(pass.program);
        gl.deleteVertexArray(vao);
      }
    },
  };
}
