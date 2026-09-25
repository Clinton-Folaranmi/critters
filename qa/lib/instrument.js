// Injected before any page script: counts what the frog scene creates and frees.
(() => {
  const s = (window.__audit = {
    gl: 0,
    glLost: 0,
    raf: 0,
    rafLive: new Set(),
    ro: { made: 0, observing: 0, disconnected: 0 },
    listeners: new Map(),
    timeouts: new Set(),
    intervals: new Set(),
  });
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const known = this.__ctx;
    const ctx = getContext.call(this, type, ...rest);
    if (type === 'webgl2' && ctx && !known) {
      s.gl++;
      this.__ctx = ctx;
    }
    return ctx;
  };
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    const id = raf((t) => {
      s.rafLive.delete(id);
      s.raf++;
      cb(t);
    });
    s.rafLive.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    s.rafLive.delete(id);
    caf(id);
  };
  // Workers started and terminated, and messages posted to them (bake jobs).
  s.workers = { made: 0, terminated: 0, posted: 0 };
  const W = window.Worker;
  if (W) {
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        s.workers.made++;
      }
      postMessage(...a) {
        s.workers.posted++;
        return super.postMessage(...a);
      }
      terminate() {
        s.workers.terminated++;
        return super.terminate();
      }
    };
  }
  const RO = window.ResizeObserver;
  window.ResizeObserver = class extends RO {
    constructor(cb) {
      super(cb);
      s.ro.made++;
      this.__n = 0;
    }
    observe(t, o) {
      this.__n++;
      s.ro.observing++;
      return super.observe(t, o);
    }
    unobserve(t) {
      if (this.__n > 0) {
        this.__n--;
        s.ro.observing--;
      }
      return super.unobserve(t);
    }
    disconnect() {
      s.ro.observing -= this.__n;
      this.__n = 0;
      s.ro.disconnected++;
      return super.disconnect();
    }
  };
  for (const [name, target] of [
    ['window', window],
    ['document', document],
  ]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, opts) => {
      const key = name + ':' + type;
      const set = s.listeners.get(key) ?? new Set();
      set.add(fn);
      s.listeners.set(key, set);
      return add(type, fn, opts);
    };
    target.removeEventListener = (type, fn, opts) => {
      s.listeners.get(name + ':' + type)?.delete(fn);
      return remove(type, fn, opts);
    };
  }
  window.__auditSummary = () => ({
    glContexts: s.gl,
    rafPending: s.rafLive.size,
    ro: s.ro,
    listeners: Object.fromEntries(
      [...s.listeners]
        .filter(([k]) => /visibilitychange|pointerdown|keydown|resize/.test(k))
        .map(([k, v]) => [k, v.size]),
    ),
    workers: s.workers,
    canvases: document.querySelectorAll('canvas').length,
  });
})();
