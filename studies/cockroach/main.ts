import type { CockroachSceneHandle } from '@critters/cockroach-floor';
import { COCKROACH_COPY, COCKROACH_INSTRUCTIONS } from '@critters/cockroach-floor';

// The cockroach page. The scene's code loads as the floor comes within
// 300 px of the viewport (F-1); with reduced motion it shows one still and no
// loop (I-5).

const container = document.getElementById('floor');
const hint = document.getElementById('hint');
const text = (id: string, value: string) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};
text('eyebrow', COCKROACH_COPY.eyebrow);
text('title', COCKROACH_COPY.title);
text('lede', COCKROACH_COPY.lede);
if (hint) {
  for (const step of COCKROACH_INSTRUCTIONS.steps) {
    const item = document.createElement('li');
    for (const part of step.split(/(Enter|Space)/)) {
      if (part === 'Enter' || part === 'Space') {
        const key = document.createElement('kbd');
        key.textContent = part;
        item.appendChild(key);
      } else if (part) item.appendChild(document.createTextNode(part));
    }
    hint.appendChild(item);
  }
}

const query = window.matchMedia('(prefers-reduced-motion: reduce)');
let scene: CockroachSceneHandle | null = null;
const start = async () => {
  if (!container) return;
  if (hint) hint.hidden = query.matches;
  scene?.dispose();
  const { mountCockroachScene } = await import('./mount');
  scene = mountCockroachScene(container, { reducedMotion: query.matches, describedBy: 'hint' });
};
// Dev-only: ?eager mounts at once, for a hidden preview pane (where nothing intersects).
const eager = import.meta.env.DEV && new URLSearchParams(window.location.search).has('eager');
if (container && eager) void start();
else if (container) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void start();
    },
    { rootMargin: '300px 0px' },
  );
  observer.observe(container);
  query.addEventListener('change', () => void start());
}
