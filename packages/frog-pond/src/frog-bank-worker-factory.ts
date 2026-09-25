/**
 * Starts the bank painter's worker (frog-bank-worker.ts). The builds emit it
 * as its own classic script, `frog-bank-worker.js`, next to the module that
 * holds this code (scripts/build.mjs). The single-file standalone build
 * swaps this module for one that starts the page's own script as the worker
 * (scripts/esbuild-plugins.mjs). If the file can't be loaded, the bank layer
 * paints on the page instead (frog-bank-layer.ts).
 */
export function startBankWorker(): Worker {
  return new Worker(new URL('./frog-bank-worker.js', import.meta.url));
}
