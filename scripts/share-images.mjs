// Makes the link-preview picture and the tab icon for each animal, from the
// stills and badges the site already has (macOS only: it uses sips):
//
//   node scripts/share-images.mjs
//
//   studies/site/share/<slug>.jpg   1200 × 630, what a shared link shows
//   studies/site/icons/<slug>.png   64 × 64, the tab icon
//
// The results are committed, so the site builds anywhere. Run it again when a
// still or a badge changes.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ANIMALS } from '../studies/site/animals.mjs';

const sips = (...args) => execFileSync('sips', args, { stdio: ['ignore', 'ignore', 'inherit'] });
const size = (file) => {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return [Number(/pixelWidth: (\d+)/.exec(out)[1]), Number(/pixelHeight: (\d+)/.exec(out)[1])];
};

mkdirSync('studies/site/share', { recursive: true });
mkdirSync('studies/site/icons', { recursive: true });
for (const animal of ANIMALS) {
  // The frog's stills live with its page; the others' with the shell.
  const still = animal.still.wide.startsWith('../assets/')
    ? animal.still.wide.replace('../assets/', 'studies/site/')
    : `studies/${animal.slug}/${animal.still.wide}`;
  const share = `studies/site/share/${animal.slug}.jpg`;
  sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '82', still, '--out', share);
  // Fill 1200 × 630, then crop to it from the centre.
  const [w, h] = size(share);
  const scale = Math.max(1200 / w, 630 / h);
  sips('-z', String(Math.round(h * scale)), String(Math.round(w * scale)), share);
  sips('-c', '630', '1200', share);
  const icon = `studies/site/icons/${animal.slug}.png`;
  sips('-s', 'format', 'png', '-z', '64', '64', `studies/site/badges/${animal.slug}.jpg`, '--out', icon);
  console.log(`${share}, ${icon}`);
}
