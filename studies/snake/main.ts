import type { SceneHandle } from '@critters/snake';
import { SNAKE_COPY, SNAKE_INSTRUCTIONS } from '@critters/snake';

// The grass snake page. The scene's code loads as the wooden deck comes within
// 300 px of the viewport (F-1); with reduced motion it shows one still and no
// loop (I-5).

const container = document.getElementById('deck');
const hint = document.getElementById('hint');
const text = (id: string, value: string) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};
text('eyebrow', SNAKE_COPY.eyebrow);
text('title', SNAKE_COPY.title);
text('lede', SNAKE_COPY.lede);
if (hint) {
  for (const step of SNAKE_INSTRUCTIONS.steps) {
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
let scene: SceneHandle | null = null;
const start = async () => {
  if (!container) return;
  if (hint) hint.hidden = query.matches;
  scene?.dispose();
  const { mountSnakeScene } = await import('./mount');
  scene = mountSnakeScene(container, { reducedMotion: query.matches, describedBy: 'hint' });
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
