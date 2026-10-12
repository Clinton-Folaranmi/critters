// Shared helpers for the footage tools: probing a clip, streaming its frames
// as grayscale bytes, and writing images. Needs ffmpeg and ffprobe on the
// PATH (not an npm dependency; footage work is done on a person's machine).
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/** Width, height, frame rate (file playback, not capture) and duration of the first video stream. */
export function probe(video) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,r_frame_rate:format=duration',
      '-of',
      'json',
      video,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`ffprobe failed on ${video}: ${result.stderr}`);
  const info = JSON.parse(result.stdout);
  const [num, den] = info.streams[0].r_frame_rate.split('/').map(Number);
  return {
    width: info.streams[0].width,
    height: info.streams[0].height,
    fps: num / den,
    duration: Number(info.format.duration),
  };
}

/** Every frame of `video` as one byte per pixel (grayscale), in order. */
export async function* grayFrames(video, { width, height }) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', video, '-vf', 'format=gray', '-f', 'rawvideo', '-']);
  const size = width * height;
  let buffer = Buffer.alloc(0);
  for await (const chunk of ff.stdout) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= size) {
      yield new Uint8Array(buffer.subarray(0, size));
      buffer = buffer.subarray(size);
    }
  }
}

/** Writes an 8-bit grayscale image as PNG (through ffmpeg). */
export function writeGrayPng(file, pixels, width, height) {
  const pgm = Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`), Buffer.from(pixels)]);
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'pgm_pipe', '-i', '-', file], { input: pgm });
  if (result.status !== 0) throw new Error(`ffmpeg could not write ${file}: ${result.stderr}`);
}

/** Runs ffmpeg with a filter on one input, throwing on failure. */
export function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
}

/** `--name value` and `--flag` arguments after the positional ones. */
export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) options[key] = true;
      else {
        options[key] = next;
        i++;
      }
    } else positional.push(argv[i]);
  }
  return { positional, options };
}

/** Writes JSON with a trailing newline. */
export const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
