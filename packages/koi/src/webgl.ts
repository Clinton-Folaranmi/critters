// The koi's WebGL2 renderer: the pond floor through the water, then the
// shared mesh (shadows, the koi, the surface) from one atlas, then ripple
// highlights on top. Falls back to Canvas 2D through the scene's hooks.

import { startProgram, type RendererHooks, type SceneRenderer } from 'critter-kit';
import { koiAtlas, koiFloor } from './koi-paint';
import { MESH_FLOATS, STRIDE, buildMesh } from './koi-shape';
import type { KoiWorld } from './koi-world';
import { meshFragment, meshVertex, waterFragment, waterVertex } from './shaders';

export function createKoiWebgl(
  canvas: HTMLCanvasElement,
  world: KoiWorld,
  events: Float32Array,
  hooks: RendererHooks = {},
): SceneRenderer {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
  if (!gl) throw new Error('WebGL2 context creation failed.');
  const water = startProgram(gl, waterVertex, waterFragment);
  const mesh = startProgram(gl, meshVertex, meshFragment);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const vertices = new Float32Array(MESH_FLOATS);
  let atlasTexture: WebGLTexture | null = null;
  let floorTexture: WebGLTexture | null = null;
  let floorSource: unknown = null;
  let waterU: Record<string, WebGLUniformLocation | null> | null = null;
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
    waterU = names(water.program, ['u_floor', 'u_resolution', 'u_time', 'u_mode', 'u_events']);
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
    atlasTexture = upload(koiAtlas() as TexImageSource, true);
  };

  return {
    get ready() {
      return ready;
    },
    draw(time: number) {
      if (lost || failed || gl.isContextLost()) return;
      try {
        if (!water.poll() || !mesh.poll()) return;
      } catch (error) {
        failed = true;
        hooks.onFail?.(error);
        return;
      }
      if (!waterU) setup();
      const floor = koiFloor(world.aspect);
      if (floor !== floorSource) {
        if (floorTexture) gl.deleteTexture(floorTexture);
        floorTexture = upload(floor as TexImageSource, false);
        floorSource = floor;
      }
      const w = canvas.width;
      const h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);

      // The floor through the water.
      gl.useProgram(water.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, floorTexture);
      gl.uniform1i(waterU!.u_floor, 0);
      gl.uniform2f(waterU!.u_resolution, w, h);
      gl.uniform1f(waterU!.u_time, time);
      gl.uniform4fv(waterU!.u_events, events);
      gl.uniform1i(waterU!.u_mode, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Shadows, the koi, the surface.
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
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices, 0, ranges.surface * STRIDE);
      gl.uniform1f(meshU!.u_light, 0);
      gl.drawArrays(gl.TRIANGLES, 0, ranges.shadows);
      gl.uniform1f(meshU!.u_light, 1);
      gl.drawArrays(gl.TRIANGLES, ranges.shadows, ranges.koi - ranges.shadows);
      gl.uniform1f(meshU!.u_light, 0.4);
      gl.drawArrays(gl.TRIANGLES, ranges.koi, ranges.surface - ranges.koi);
      gl.bindVertexArray(null);

      // Ripple highlights on the surface, over everything.
      gl.useProgram(water.program);
      gl.uniform1i(waterU!.u_mode, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ready = true;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      if (gl.isContextLost()) return;
      for (const pass of [water, mesh]) gl.deleteProgram(pass.program);
      for (const texture of [atlasTexture, floorTexture]) if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
    },
  };
}
