// Render the two 15-second posts from the exact settings and edge mask used by live.html.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeMask } from './edge-mask.js';

const dir = dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(readFileSync(join(dir, 'approved-settings.json'), 'utf8'));
const resolution = 512;
const work = mkdtempSync(join(tmpdir(), 'critters-social-'));
const maskRaw = join(work, 'approved-mask.rgba');
const maskPng = join(work, 'approved-mask.png');
try {
  writeFileSync(maskRaw, Buffer.from(makeMask(settings, resolution)));
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pixel_format',
    'rgba',
    '-video_size',
    `${resolution}x${resolution}`,
    '-i',
    maskRaw,
    '-frames:v',
    '1',
    '-pix_fmt',
    'rgba',
    maskPng,
  ]);

  const canvas = 1080;
  const artwork = Math.round((canvas * settings.size) / 100 / 2) * 2;
  const inset = (canvas - artwork) / 2;
  const filter =
    `[0:v]scale=${artwork}:${artwork}:flags=lanczos,format=rgba[scene];` +
    `[1:v]format=rgba,alphaextract,scale=${artwork}:${artwork}:flags=lanczos[mask];` +
    `[scene][mask]alphamerge[soft];` +
    `color=c=0xF1EFE6:s=${canvas}x${canvas}:r=30:d=15[paper];` +
    `[paper][soft]overlay=${inset}:${inset}:shortest=1,format=yuv420p[out]`;

  for (const [source, output] of [
    ['ladybug-fullbleed-15s.mp4', 'ladybug-post-15s.mp4'],
    ['frog-fullbleed-15s.mp4', 'frogs-post-15s.mp4'],
  ]) {
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(dir, source),
      '-loop',
      '1',
      '-framerate',
      '30',
      '-i',
      maskPng,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-frames:v',
      '450',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      join(dir, output),
    ]);
    console.log(`${output}: ${artwork} px artwork, ${inset} px padding, 15 s`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
