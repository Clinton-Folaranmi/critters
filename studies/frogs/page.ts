import type { FrogSceneHandle, FrogSceneOptions } from '@critters/frog-pond';
import { FROG_COPY, FROG_INSTRUCTIONS } from '@critters/frog-pond/theme';

// The frog pond page, shared by the demo (main.ts) and the single-file
// standalone (standalone/frogs/entry.ts): Day Chorus, with its caption and
// how to play. All the copy comes from FROG_COPY and FROG_INSTRUCTIONS.

/** Mounts the scene; the demo loads its code first, the standalone has it already. */
export type MountPond = (container: HTMLElement, options: FrogSceneOptions) => Promise<FrogSceneHandle>;

export function startFrogPage(mount: MountPond) {
  const container = document.getElementById('pond');
  const hint = document.getElementById('hint');
  if (!container) return;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scene: FrogSceneHandle | null = null;
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
  document.title = FROG_COPY.title;
  text('eyebrow', FROG_COPY.eyebrow);
  text('title', FROG_COPY.title);
  text('lede', FROG_COPY.lede);

  /** (Re)starts the pond: at first, and when the reduced-motion setting changes. */
  function start() {
    if (hint) hint.hidden = query.matches;
    scene?.dispose();
    scene = null;
    const mine = ++ticket;
    mount(container!, { reducedMotion: query.matches, describedBy: 'hint' }).then(
      (mounted) => {
        // Restarted while this one was loading: keep only the latest.
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
      __critterPageDispose() {
        ticket += 1;
        query.removeEventListener('change', start);
        scene?.dispose();
        scene = null;
      },
    });
  }
}
