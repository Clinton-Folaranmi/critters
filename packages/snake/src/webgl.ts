// The grass snake's WebGL2 renderer: the sunlit mossy bank and embedded stones
// floor, then the shared mesh (shadows, fallen leaves, forked tongue, snake
// body, overhanging grass shadows and foreground grass blades) from one atlas,
// then subtle tap-rustle rings. Falls back to Canvas 2D through the scene's hooks.

import { startProgram, type RendererHooks, type SceneRenderer } from 'critter-kit';
import { floorFragment, floorVertex, meshFragment, meshVertex } from './shaders';
import { snakeAtlas, snakeFloor } from './snake-paint';
import { MESH_FLOATS, STRIDE, buildMesh } from './snake-shape';
import type { SnakeWorld } from './snake-world';

export function createSnakeWebgl(
  canvas: HTMLCanvasElement,
  world: SnakeWorld,
  events: Float32Array,
  hooks: RendererHooks = {},
): SceneRenderer {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
  if (!gl) throw new Error('WebGL2 context creation failed.');
  const floorPass = startProgram(gl, floorVertex, floorFragment);
  const mesh = startProgram(gl, meshVertex, meshFragment);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const vertices = new Float32Array(MESH_FLOATS);
  let atlasTexture: WebGLTexture | null = null;
  let floorTexture: WebGLTexture | null = null;
  let floorSource: unknown = null;
  let floorU: Record<string, WebGLUniformLocation | null> | null = null;
  let meshU: Record<string, WebGLUniformLocation | null> | null = null;
  let ready = false;
  let lost = false;
  let failed = false;

  const onLost = (event: Event) => {
    event.preventDefault();
    if (lost) return;
    lost = true;
    hooks.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const upload = (source: TexImageSource, mipmaps: boolean) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
  };

  const setup = () => {
    const names = (program: WebGLProgram, list: string[]) =>
      Object.fromEntries(list.map((name) => [name, gl.getUniformLocation(program, name)]));
    floorU = names(floorPass.program, ['u_floor', 'u_resolution', 'u_time', 'u_mode', 'u_events']);
    meshU = names(mesh.program, ['u_atlas', 'u_time', 'u_light', 'u_aspect']);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
    const attribute = (name: string, size: number, offset: number) => {
      const at = gl.getAttribLocation(mesh.program, name);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
    };
    attribute('a_position', 2, 0);
    attribute('a_st', 2, 2);
    attribute('a_alpha', 1, 4);
    gl.bindVertexArray(null);
    atlasTexture = upload(snakeAtlas() as TexImageSource, false);
  };

  return {
    get ready() {
      return ready;
    },
    draw(time: number) {
      if (lost || failed || gl.isContextLost()) return;
      try {
        if (!floorPass.poll() || !mesh.poll()) return;
      } catch (error) {
        failed = true;
        hooks.onFail?.(error);
        return;
      }
      if (!floorU) setup();
      const floor = snakeFloor(world.aspect);
      if (floor !== floorSource) {
        if (floorTexture) gl.deleteTexture(floorTexture);
        floorTexture = upload(floor as TexImageSource, false);
        floorSource = floor;
      }
      const w = canvas.width;
      const h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);

      // 1. Sunlit mossy bank and embedded meadow stones floor.
      gl.useProgram(floorPass.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, floorTexture);
      gl.uniform1i(floorU!.u_floor, 0);
      gl.uniform2f(floorU!.u_resolution, w, h);
      gl.uniform1f(floorU!.u_time, time);
      gl.uniform4fv(floorU!.u_events, events);
      gl.uniform1i(floorU!.u_mode, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. Shadows, fallen leaves, forked tongue, snake body, and foreground overhanging grass blades.
      const ranges = buildMesh(world, vertices);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(mesh.program);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(meshU!.u_atlas, 0);
      gl.uniform1f(meshU!.u_time, time);
      gl.uniform1f(meshU!.u_aspect, w / h);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices, 0, ranges.canopy * STRIDE);

      // Ground shadows & scent markers:
      gl.uniform1f(meshU!.u_light, 0);
      gl.drawArrays(gl.TRIANGLES, 0, ranges.shadows);
      // Fallen leaves under the snake:
      gl.uniform1f(meshU!.u_light, 0.45);
      gl.drawArrays(gl.TRIANGLES, ranges.shadows, ranges.surface - ranges.shadows);
      // Forked tongue and snake body:
      gl.uniform1f(meshU!.u_light, 1);
      gl.drawArrays(gl.TRIANGLES, ranges.surface, ranges.snake - ranges.surface);
      // Overhanging grass shadows cast across the snake and ground:
      gl.uniform1f(meshU!.u_light, 0);
      gl.drawArrays(gl.TRIANGLES, ranges.snake, ranges.canopyShadow - ranges.snake);
      // Overhanging grass blades in the foreground canopy:
      gl.uniform1f(meshU!.u_light, 0.85);
      gl.drawArrays(gl.TRIANGLES, ranges.canopyShadow, ranges.canopy - ranges.canopyShadow);
      gl.bindVertexArray(null);

      // 3. Subtle grass-rustle shimmer ring where tapped.
      gl.useProgram(floorPass.program);
      gl.uniform1i(floorU!.u_mode, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ready = true;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      if (gl.isContextLost()) return;
      for (const pass of [floorPass, mesh]) gl.deleteProgram(pass.program);
      for (const texture of [atlasTexture, floorTexture]) if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
    },
  };
}
