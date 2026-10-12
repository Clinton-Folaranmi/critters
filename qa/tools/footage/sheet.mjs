// Contact sheets from a clip, for screening and for checking measurements by
// eye (docs/FOOTAGE_SCREENING.md). Tiles run in reading order; the frame
// numbers of every tile are printed and written next to the image.
//
//   node qa/tools/footage/sheet.mjs <video> --out sheet.png
//       30 frames spread over the whole clip (screening)
//   node qa/tools/footage/sheet.mjs <video> --out s.png --from 20 --to 80 --step 2
//       a range of frames
//   options: --cols 6  --width 360 (tile width, px)  --crop w:h:x:y (fixed crop)
//            --follow track.csv --size w:h [--offset dx:dy] (crop centred on the tracked body)
//            --grid 20 (floor grid every 20 px, fixed to the frame, so a planted foot stays in its square)
//            --boxes footfalls.json (draw each footfall's box on the frames where it is planted;
//              with --stances stances.json the boxes are coloured by leg)
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg, parseArgs, probe } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [video] = positional;
if (!video || !options.out) {
  console.error('Usage: node qa/tools/footage/sheet.mjs <video> --out sheet.png [options]');
  process.exit(1);
}
const info = probe(video);
const total = Math.round(info.duration * info.fps);
const cols = Number(options.cols ?? 6);
const tileWidth = Number(options.width ?? 360);

let frames;
if (options.from !== undefined) {
  const from = Number(options.from);
  const to = Math.min(Number(options.to ?? total - 1), total - 1);
  const step = Number(options.step ?? 1);
  frames = [];
  for (let n = from; n <= to; n += step) frames.push(n);
} else {
  frames = Array.from({ length: 30 }, (_, k) => Math.min(total - 1, Math.round((k * total) / 30)));
}

const track = options.follow
  ? new Map(
      readFileSync(options.follow, 'utf8')
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => line.split(',').map(Number))
        .map(([n, x, y]) => [n, [x, y]]),
    )
  : null;
const [boxW, boxH] = (options.size ?? '340:200').split(':').map(Number);
const [offX, offY] = (options.offset ?? '0:0').split(':').map(Number);

const LEG_COLOURS = { L1: 'red', L2: 'orange', L3: 'yellow', R1: 'lime', R2: 'cyan', R3: 'magenta' };
const PALETTE = ['red', 'lime', 'blue', 'yellow', 'magenta', 'cyan', 'orange', 'white'];
const footfalls = options.boxes ? JSON.parse(readFileSync(options.boxes, 'utf8')).footfalls : [];
const legOf = new Map();
if (options.stances) {
  const { legs } = JSON.parse(readFileSync(options.stances, 'utf8'));
  for (const [leg, list] of Object.entries(legs))
    for (const s of list) if (s.footfall !== undefined) legOf.set(s.footfall, leg);
}

const work = mkdtempSync(join(tmpdir(), 'critters-sheet-'));
try {
  const select = frames.map((n) => `eq(n\\,${n})`).join('+');
  ffmpeg(['-i', video, '-vf', `select='${select}'`, '-vsync', '0', join(work, 'raw-%05d.png')]);
  const raws = readdirSync(work)
    .filter((f) => f.startsWith('raw-'))
    .sort();
  raws.forEach((file, k) => {
    const n = frames[k];
    const filters = [];
    for (const f of footfalls) {
      if (n < f.td || n > f.lo) continue;
      const colour = legOf.has(f.id) ? LEG_COLOURS[legOf.get(f.id)] : PALETTE[f.id % PALETTE.length];
      filters.push(`drawbox=x=${Math.round(f.x) - 9}:y=${Math.round(f.y) - 9}:w=18:h=18:c=${colour}:t=2`);
    }
    if (options.grid) filters.push(`drawgrid=w=${options.grid}:h=${options.grid}:t=1:c=red@0.35`);
    if (track) {
      const [x, y] = track.get(n) ?? [info.width / 2, info.height / 2];
      const left = Math.max(0, Math.min(info.width - boxW, Math.round(x + offX - boxW / 2)));
      const top = Math.max(0, Math.min(info.height - boxH, Math.round(y + offY - boxH / 2)));
      filters.push(`crop=${boxW}:${boxH}:${left}:${top}`);
    } else if (options.crop) filters.push(`crop=${options.crop}`);
    filters.push(`scale=${tileWidth}:-2`);
    ffmpeg(['-i', join(work, file), '-vf', filters.join(','), join(work, `tile-${String(k).padStart(5, '0')}.png`)]);
  });
  const rows = Math.ceil(raws.length / cols);
  ffmpeg([
    '-framerate',
    '1',
    '-i',
    join(work, 'tile-%05d.png'),
    '-vf',
    `tile=${cols}x${rows}:padding=4:color=black`,
    '-frames:v',
    '1',
    options.out,
  ]);
} finally {
  rmSync(work, { recursive: true, force: true });
}
const key = frames.map((n, k) => `tile ${k}: frame ${n} (${(n / info.fps).toFixed(3)} s in the file)`).join('\n');
writeFileSync(`${options.out}.txt`, `${video}\n${cols} columns, reading order\n${key}\n`);
console.log(`${options.out}: ${frames.length} tiles, frames ${frames[0]}–${frames.at(-1)} (key in ${options.out}.txt)`);
