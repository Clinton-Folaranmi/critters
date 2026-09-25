import { startFrogPage } from './page';

// The demo page. It ships only the caption, the switch and a still of the
// pond's first frame (stills.css); the scene's code loads as the pond comes
// within 300 px of the viewport, and its canvas replaces the still once its
// first frame is drawn.

const loadScene = () => import('@animal-farm/frog-pond').then((module) => module.mountFrogScene);
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

startFrogPage(async (container, options) => {
  await near(container);
  scene ??= loadScene();
  return (await scene)(container, options);
});

if (import.meta.env.DEV) {
  // Dev-only, for the QA harness: the shore maths in the page.
  void import('@animal-farm/frog-pond/bank').then((bank) => Object.assign(window, { __frogBank: bank }));
}
