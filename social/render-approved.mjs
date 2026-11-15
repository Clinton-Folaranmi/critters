// Renders a 15-second square post from each scene capture named on the command line, with the
// exact settings and edge mask live.html uses:
//
//   node social/render-approved.mjs <scene.mp4> [<scene.mp4> …]
//
// <name>-fullbleed-15s.mp4 becomes <name>-post-15s.mp4 beside it (any other name gains "-post").
// Clips aren't kept in git. Requires ffmpeg.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { makeMask } from './edge-mask.js';

const dir = dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(readFileSync(join(dir, 'approved-settings.json'), 'utf8'));
const resolution = 512;
const sources = process.argv.slice(2);
if (!sources.length) {
  console.error('Usage: node social/render-approved.mjs <scene.mp4> [<scene.mp4> …]');
  process.exit(1);
}
/** Where a source's post goes: beside it, "fullbleed" swapped for "post". */
const postFor = (source) => {
  const name = basename(source, extname(source));
  return join(
    dirname(source),
    `${name.includes('fullbleed') ? name.replace('fullbleed', 'post') : `${name}-post`}.mp4`,
  );
};
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

  for (const source of sources.map((path) => resolve(path))) {
    const output = postFor(source);
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-i',
      source,
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
      output,
    ]);
    console.log(`${output}: ${artwork} px artwork, ${inset} px padding, 15 s`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
