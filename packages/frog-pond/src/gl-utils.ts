// WebGL helpers shared by the studies (only what they use).

/**
 * Compiles and links a program without waiting for it. With
 * KHR_parallel_shader_compile the driver compiles in the background; poll()
 * returns false until the program is ready, then true (and throws if it
 * failed). Without the extension, the first poll() waits for it.
 */
export function startProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL program creation failed.');
  const shaders = [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const;
  const compiled = shaders.map(([type, source]) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL shader creation failed.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  let done = false;
  return {
    program,
    poll() {
      if (done) return true;
      if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
      done = true;
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log =
          compiled
            .map((shader) => gl.getShaderInfoLog(shader))
            .filter(Boolean)
            .join('\n') ||
          gl.getProgramInfoLog(program) ||
          'WebGL program linking failed.';
        for (const shader of compiled) gl.deleteShader(shader);
        gl.deleteProgram(program);
        throw new Error(log);
      }
      for (const shader of compiled) {
        gl.detachShader(program, shader);
        gl.deleteShader(shader);
      }
      return true;
    },
  };
}
