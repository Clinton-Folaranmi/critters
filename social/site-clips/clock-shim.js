// Injected into each page before its own scripts (render.mjs, via
// Page.addScriptToEvaluateOnNewDocument). It puts the page's clock in the
// capture's hands, so a clip shows real-speed motion however slowly the
// frames are taken:
//
// - performance.now(), Date.now() and the timestamps handed to
//   requestAnimationFrame callbacks all read one virtual clock.
// - While loading, the clock follows real time (a real timer pumps the
//   frame callbacks at ~60 Hz) until the scene's first frame is in (its
//   canvas shows: opacity ''), then it holds, so every clip starts from the
//   same world state however long loading took.
// - Then __clip.rebase() restarts the loop from a fixed reading, and after
//   that only window.__clip.step(ms) moves time: it advances the clock
//   and runs the queued frame callbacks once, as a browser frame would.
//
// Math.random is seeded too, so a scene that uses it replays the same way.
// Timers (setTimeout) and CSS transitions stay on real time; the clips start
// after the page's own fades are over. Nothing in the scenes is changed.
(() => {
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now;
  const realTimeout = window.setTimeout.bind(window);
  const dateOrigin = realDateNow() - realNow();
  let now = realNow();
  let queue = new Map();
  let nextId = 1;
  let mode = 'auto';

  const runFrame = () => {
    const callbacks = queue;
    queue = new Map();
    for (const callback of callbacks.values()) {
      try {
        callback(now);
      } catch (error) {
        console.error(error);
      }
    }
  };
  const sceneShown = () => {
    const canvas = document.querySelector('#scene canvas');
    return !!canvas && canvas.style.opacity === '';
  };

  performance.now = () => now;
  Date.now = () => Math.round(dateOrigin + now);
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    queue.delete(id);
  };

  let seed = 20261101;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // The badge-click opening (render.mjs --intro): the page arrived at is
  // stepped from its first moment, sketch and all. Its timers, CSS
  // animations (the view transition, the name settling, the sketch's fade)
  // and the sketch worker's clock all follow the virtual clock, and the
  // scene's first frame is held back until HOLD, as on a first visit, so the
  // pencil has time to draw.
  let intro = false;
  try {
    intro = sessionStorage.getItem('clip-intro') === '1';
    sessionStorage.removeItem('clip-intro');
  } catch {
    // no storage: an ordinary capture
  }
  const HOLD = 2000;
  const origin = now;
  const timers = new Map();
  const workers = [];
  const stepped = new WeakSet();
  let sceneTicks = 0;
  if (intro) {
    mode = 'manual';
    window.setTimeout = (fn, ms = 0, ...args) => {
      const id = nextId++;
      timers.set(id, {
        at: now + Math.max(0, Number(ms) || 0),
        fn: () => (typeof fn === 'function' ? fn(...args) : 0),
      });
      return id;
    };
    window.clearTimeout = (id) => {
      timers.delete(id);
    };
    const RealWorker = window.Worker;
    const workerShim = `
      let now = 0; let queue = new Map(); let next = 1;
      performance.now = () => now;
      self.requestAnimationFrame = (fn) => { const id = next++; queue.set(id, fn); return id; };
      self.cancelAnimationFrame = (id) => queue.delete(id);
      self.addEventListener('message', (event) => {
        if (!event.data || event.data.__clipStep === undefined) return;
        event.stopImmediatePropagation();
        now += event.data.__clipStep;
        const due = queue; queue = new Map();
        for (const fn of due.values()) fn(now);
        self.postMessage({ __clipAck: true });
      });`;
    const shimUrl = URL.createObjectURL(new Blob([workerShim], { type: 'text/javascript' }));
    window.Worker = function (url, options) {
      const href = new URL(String(url), location.href).href;
      if (!/sketch\.js/.test(href)) return new RealWorker(url, options);
      const wrapper = `import ${JSON.stringify(shimUrl)}; import ${JSON.stringify(href)};`;
      const worker = new RealWorker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), {
        ...options,
        type: 'module',
      });
      const entry = { worker, waiting: null };
      worker.addEventListener('message', (event) => {
        if (!event.data || !event.data.__clipAck) return;
        event.stopImmediatePropagation();
        entry.waiting?.();
        entry.waiting = null;
      });
      workers.push(entry);
      return worker;
    };
  }
  const stepIntro = async (ms) => {
    now += ms;
    for (const animation of document.getAnimations()) {
      if (!stepped.has(animation)) {
        stepped.add(animation);
        animation.pause();
      }
      animation.currentTime = (Number(animation.currentTime) || 0) + ms;
    }
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at > now) continue;
      timers.delete(id);
      try {
        timer.fn();
      } catch (error) {
        console.error(error);
      }
    }
    if (mode === 'live') {
      runFrame();
      sceneTicks += 1;
    } else if (now - origin >= HOLD) {
      runFrame();
      // The scene's first frame: from here it runs exactly as in a plain clip.
      if (sceneShown()) window.__clip.rebase();
    }
    await Promise.all(
      workers.map(
        (entry) =>
          new Promise((done) => {
            entry.waiting = done;
            entry.worker.postMessage({ __clipStep: ms });
            realTimeout(done, 400);
          }),
      ),
    );
  };

  let lastReal = realNow();
  const pump = () => {
    if (mode !== 'auto') return;
    // The scene can show its first frame outside a frame callback (a resize, a
    // baked layer arriving): hold before running another frame, so the world
    // never takes a step at the loading clock's uneven pace.
    if (sceneShown()) {
      mode = 'held';
      return;
    }
    const real = realNow();
    now += Math.min(real - lastReal, 50);
    lastReal = real;
    runFrame();
    if (sceneShown()) {
      mode = 'held';
      return;
    }
    realTimeout(pump, 16);
  };
  if (!intro) realTimeout(pump, 16);

  // How long loading took (and so the clock's reading when the scene showed)
  // differs run to run, and a scene's frame time (now - last) rounds
  // differently at different readings, enough to change a later decision. So
  // once the scene is in, the page is hidden for an instant (the scenes stop
  // their loop and forget the last frame's time), the clock is set to a fixed
  // reading and the page shown again: every run steps from the same numbers.
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  const START = 100000;

  window.__clip = {
    /** Restarts the scene's loop from a fixed clock reading (after it's held). */
    rebase() {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      queue.clear();
      const shift = Math.max(0, START - now);
      for (const timer of timers.values()) timer.at += shift;
      now += shift;
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      mode = intro ? 'live' : 'manual';
      return queue.size;
    },
    /** 'auto' while loading, 'held' once the scene's first frame is in, 'manual' when stepping. */
    get mode() {
      return mode;
    },
    get now() {
      return now;
    },
    get intro() {
      return intro;
    },
    /** Frame callbacks the scene has run since its first frame (badge-click page). */
    get sceneTicks() {
      return sceneTicks;
    },
    /** Whether the scene's first frame is in. */
    shown: sceneShown,
    /**
     * Advances the clock by `ms` and runs one frame's callbacks, `count`
     * times (on the badge-click page, a promise: it waits for the sketch).
     */
    step(ms = 1000 / 60, count = 1) {
      if (intro)
        return (async () => {
          for (let i = 0; i < count; i++) await stepIntro(ms);
          return now;
        })();
      mode = 'manual';
      for (let i = 0; i < count; i++) {
        now += ms;
        runFrame();
      }
      return now;
    },
  };
})();
