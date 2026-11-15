// One line puts an animal on any page (built to /embed.js, a classic script):
//
//   <script async src="https://<site>/embed.js" data-animal="frogs"></script>
//
// It puts a frame where the script tag is, as wide as its parent, showing the
// animal's page with ?embed (page.html, site.css: the picture alone on a clear
// page). The frame keeps the picture's shape: wide (1.48) above 640 px, tall
// (0.91) at or below, as on the site.
//
//   data-animal   frogs (the default), ladybug, butterfly, snail, mouse, koi, snake, cockroach
//   data-edge     "none": no border, the scene fills the frame (for a hero or a background)
//   data-ratio    with data-edge="none": the frame's shape, "16/9" or "2" (default: as above),
//                 from 9/16 to 2.2, the shapes the scenes are painted for
//   data-credit   "off": no "Critters" link in the corner
//
// The scenes pause off screen and in a hidden tab (the kit's scene controller),
// and the frame itself loads lazily.
declare const ANIMAL_NAMES: Record<string, string>;

/** The picture's shapes (site.css) and the width at which the page switches between them. */
const WIDE = 1.48;
const TALL = 0.91;
const NARROW = 640;

/** The shapes the scenes are painted for (site.css crops a plain frame beyond them). */
const TALLEST = 9 / 16;
const WIDEST = 2.2;

/** "16/9" or "2" as a number, kept within the painted shapes; 0 if it isn't one. */
function ratio(text: string | undefined): number {
  if (!text) return 0;
  const [w, h = '1'] = text.split('/');
  const value = Number(w) / Number(h);
  return Number.isFinite(value) && value > 0 ? Math.min(WIDEST, Math.max(TALLEST, value)) : 0;
}

function embed(script: HTMLScriptElement) {
  const { animal = 'frogs', edge, credit } = script.dataset;
  const slug = Object.prototype.hasOwnProperty.call(ANIMAL_NAMES, animal) ? animal : 'frogs';
  const plain = edge === 'none';
  const fixed = plain ? ratio(script.dataset.ratio) : 0;
  const frame = document.createElement('iframe');
  frame.src =
    new URL(`${slug}/`, script.src).href + `?embed${plain ? '&edge=none' : ''}${credit === 'off' ? '&credit=off' : ''}`;
  frame.title = `${ANIMAL_NAMES[slug]}: a small interactive animal study`;
  frame.loading = 'lazy';
  // color-scheme: the frame stays clear on a dark page (a frame whose scheme differs from its page's is filled).
  frame.style.cssText = `display: block; width: 100%; border: 0; background: transparent; color-scheme: light; aspect-ratio: ${fixed || WIDE};`;
  script.insertAdjacentElement('afterend', frame);
  if (fixed || typeof ResizeObserver !== 'function') return;
  let tall = false;
  new ResizeObserver(() => {
    const now = frame.clientWidth > 0 && frame.clientWidth <= NARROW;
    if (now === tall) return;
    tall = now;
    frame.style.aspectRatio = String(tall ? TALL : WIDE);
  }).observe(frame);
}

if (document.currentScript instanceof HTMLScriptElement) embed(document.currentScript);
