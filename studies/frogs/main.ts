import { startFrogPage } from './page';

// The frog page on the site (the shared shell, studies/site/). It ships only
// the shell and a still of the pond's first frame; the scene's code loads as
// the picture comes within 300 px of the viewport, and its canvas replaces
// the still once its first frame is drawn. The shell draws the owner's
// border, so the pond mounts without its own bank edge (ownEdge: false).

const loadScene = () => import('@critters/frog-pond').then((module) => module.mountFrogScene);
let scene: ReturnType<typeof loadScene> | null = null;

/** Resolves once the element is on or near the screen. */
const near = (element: HTMLElement) =>
  new Promise<void>((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        resolve();
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(element);
  });

startFrogPage(
  async (container, options) => {
    await near(container);
    scene ??= loadScene();
    return (await scene)(container, options);
  },
  { containerId: 'scene', caption: false, ownEdge: false },
);

if (import.meta.env.DEV) {
  // Dev-only, for the QA harness: the picture's maths in the page.
  void import('@critters/frog-pond/bank').then((bank) => Object.assign(window, { __critterBank: bank }));
}
