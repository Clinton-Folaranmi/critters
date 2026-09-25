import type { FrogSceneHandle, FrogSceneOptions } from '@animal-farm/frog-pond';
import { FROG_COPY, FROG_INSTRUCTIONS, FROG_THEMES, type FrogTheme } from '@animal-farm/frog-pond/theme';

// The frog pond page, shared by the demo (main.ts) and the single-file
// standalone (standalone/frogs/entry.ts): the pond in either light, with a
// Night | Day switch. The light can be picked in the address too (#day). All
// the copy comes from FROG_COPY and FROG_INSTRUCTIONS.

/** Mounts the scene; the demo loads its code first, the standalone has it already. */
export type MountPond = (container: HTMLElement, options: FrogSceneOptions) => Promise<FrogSceneHandle>;

export function startFrogPage(mount: MountPond) {
  const container = document.getElementById('pond');
  const hint = document.getElementById('hint');
  const lights = document.getElementById('lights');
  if (!container) return;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scene: FrogSceneHandle | null = null;
  let light: FrogTheme = window.location.hash === '#day' ? 'day' : 'night';
  let ticket = 0;

  const text = (id: string, value: string) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  // How to play, with the keys set as keys.
  if (hint) {
    for (const step of FROG_INSTRUCTIONS.steps) {
      const item = document.createElement('li');
      for (const part of step.split(/(Enter|Space)/)) {
        if (part === 'Enter' || part === 'Space') {
          const key = document.createElement('kbd');
          key.textContent = part;
          item.appendChild(key);
        } else if (part) {
          item.appendChild(document.createTextNode(part));
        }
      }
      hint.appendChild(item);
    }
  }

  const buttons = FROG_THEMES.map((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = FROG_COPY[theme].light;
    button.addEventListener('click', () => {
      if (theme === light) return;
      light = theme;
      try {
        history.replaceState(null, '', `#${theme}`);
      } catch {
        // Some sandboxes refuse; the light just isn't kept in the address.
      }
      start();
    });
    lights?.appendChild(button);
    return button;
  });

  function start() {
    const copy = FROG_COPY[light];
    document.documentElement.dataset.light = light;
    document.title = copy.title;
    text('eyebrow', copy.eyebrow);
    text('title', copy.title);
    text('lede', copy.lede);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(FROG_THEMES[i] === light)));
    if (hint) hint.hidden = query.matches;
    scene?.dispose();
    scene = null;
    const mine = ++ticket;
    mount(container!, { reducedMotion: query.matches, describedBy: 'hint', theme: light }).then(
      (mounted) => {
        // Switched again while this one was loading: keep only the latest.
        if (mine === ticket) scene = mounted;
        else mounted.dispose();
      },
      (error: unknown) => console.error('[frog-pond] The pond could not load.', error),
    );
  }
  query.addEventListener('change', start);
  start();

  if (import.meta.env.DEV) {
    // Dev-only, for the QA harness: take the pond off the page for good.
    Object.assign(window, {
      __frogPageDispose() {
        ticket += 1;
        query.removeEventListener('change', start);
        scene?.dispose();
        scene = null;
      },
    });
  }
}
