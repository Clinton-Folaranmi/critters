// Shared by the live preview and the video export. Returns RGBA pixels whose alpha is the scene mask.
export function makeMask(settings, resolution = 512) {
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  function hash(x, y) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const tx = smooth(x - ix),
      ty = smooth(y - iy);
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), tx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), tx), ty);
  }
  const radius = (Number(settings.radius) / 100) * resolution;
  const width = (Number(settings.fade) / 100) * resolution;
  const strength = Number(settings.strength) / 100;
  const roughness = Number(settings.roughness) / 100;
  const grain = Number(settings.grain) / 100;
  const data = new Uint8ClampedArray(resolution * resolution * 4);
  const half = resolution / 2;
  for (let y = 0; y < resolution; y++)
    for (let x = 0; x < resolution; x++) {
      const qx = Math.abs(x + 0.5 - half) - (half - radius);
      const qy = Math.abs(y + 0.5 - half) - (half - radius);
      const signed = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const uneven = roughness
        ? roughness * 50 * (0.7 * (noise(x / 46, y / 46) - 0.5) + 0.3 * (noise(x / 17, y / 17) - 0.5))
        : 0;
      const distance = -signed + uneven - (8 + roughness * 25);
      const fade = width > 0 ? smooth(distance / width) : Number(distance >= 0);
      let alpha = distance < 0 ? 0 : Math.pow(fade, 0.2 + 2.3 * strength);
      if (distance >= 0 && width > 0 && grain) {
        const speckle = 0.7 * hash(Math.floor(x / 2), Math.floor(y / 2)) + 0.3 * hash(x, y);
        alpha *= 1 + grain * 1.2 * (speckle - 0.5) * (1 - fade);
      }
      data[(y * resolution + x) * 4 + 3] = Math.round(255 * clamp(alpha));
    }
  return data;
}
