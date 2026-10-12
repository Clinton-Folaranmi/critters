// Tracks an animal by its brightest pixels (lab footage often has white
// markers glued to the back): per frame, the centroid of the pixels at or
// above --threshold inside a horizontal band. Writes CSV: frame,x,y,pixels.
//
//   node qa/tools/footage/track.mjs <video> --band 292:506 [--threshold 254] [--near 120] [--out track.csv]
//
// --near R: after the first frame, only bright pixels within R px of the
// previous centroid count, so a bright patch elsewhere on the floor can't pull
// the track away (it did, by up to 70 px, before this option existed).
// Check the result on a sheet (sheet.mjs --follow track.csv) before using it:
// a light floor or a reflection inside the band pulls the centroid away.
import { writeFileSync } from 'node:fs';
import { grayFrames, parseArgs, probe } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [video] = positional;
if (!video || !options.band) {
  console.error('Usage: node qa/tools/footage/track.mjs <video> --band y0:y1 [--threshold 254] [--out track.csv]');
  process.exit(1);
}
const info = probe(video);
const [y0, y1] = options.band.split(':').map(Number);
const threshold = Number(options.threshold ?? 254);
const near = Number(options.near ?? 120);
let previous = null;
const lines = ['frame,x,y,pixels'];
let n = 0;
for await (const frame of grayFrames(video, info)) {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let y = y0; y < Math.min(y1, info.height); y++)
    for (let x = 0; x < info.width; x++)
      if (
        frame[y * info.width + x] >= threshold &&
        (!previous || Math.hypot(x - previous[0], y - previous[1]) <= near)
      ) {
        sx += x;
        sy += y;
        count++;
      }
  if (count) previous = [sx / count, sy / count];
  lines.push(count ? `${n},${(sx / count).toFixed(1)},${(sy / count).toFixed(1)},${count}` : `${n},NaN,NaN,0`);
  n++;
}
const out = options.out ?? 'track.csv';
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`${out}: ${n} frames`);
