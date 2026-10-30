import type { FrogSceneHandle, FrogSceneOptions } from '@critters/frog-pond';
import { FROG_COPY, FROG_INSTRUCTIONS } from '@critters/frog-pond/theme';

// The frog pond page, shared by the site's frog page (main.ts, in the site
// shell: studies/site/) and the single-file standalone
// (standalone/frogs/entry.ts: Day Chorus, with its caption). How to play
// fills #hint either way (on the site, for screen readers only). The copy
// comes from FROG_COPY and FROG_INSTRUCTIONS.

/** Mounts the scene; the demo loads its code first, the standalone has it already. */
export type MountPond = (container: HTMLElement, options: FrogSceneOptions) => Promise<FrogSceneHandle>;

export interface FrogPageOptions {
  /** The scene's container: 'pond' in the standalone, 'scene' in the site shell. */
  containerId?: string;
  /** False: the page has its own title and caption (the site shell), so leave them be. */
  caption?: boolean;
  /** False: the page draws the picture's border (the site shell), not the pond's bank edge. */
  ownEdge?: boolean;
}

export function startFrogPage(
  mount: MountPond,
  { containerId = 'pond', caption = true, ownEdge }: FrogPageOptions = {},
) {
  const container = document.getElementById(containerId);
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
  if (caption) {
    document.title = FROG_COPY.title;
    text('eyebrow', FROG_COPY.eyebrow);
    text('title', FROG_COPY.title);
    text('lede', FROG_COPY.lede);
  }

  /** (Re)starts the pond: at first, and when the reduced-motion setting changes. */
  function start() {
    if (hint) hint.hidden = query.matches;
    scene?.dispose();
    scene = null;
    const mine = ++ticket;
    mount(container!, { reducedMotion: query.matches, describedBy: 'hint', ownEdge }).then(
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
