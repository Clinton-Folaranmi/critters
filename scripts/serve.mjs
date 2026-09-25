// A small static file server (no dependencies) for the built site:
//
//   node scripts/serve.mjs [dir] [port]     default dist/site on :4173
//
// The QA harness imports serve() to put a build on a free port.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Serves `dir` on `port` (0: any free one). Resolves to { url, close }. */
export function serve(dir, port = 0) {
  const root = resolve(dir);
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
      let file = normalize(join(root, path));
      if (!file.startsWith(root)) throw new Error('outside the root');
      if ((await stat(file)).isDirectory()) {
        if (!path.endsWith('/')) {
          response.writeHead(301, { location: `${path}/` }).end();
          return;
        }
        file = join(file, 'index.html');
      }
      await stat(file);
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((done) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address();
      done({ url: `http://127.0.0.1:${bound}/`, close: () => new Promise((closed) => server.close(closed)) });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'dist/site';
  const { url } = await serve(dir, Number(process.argv[3] ?? 4173));
  console.log(`Serving ${dir} at ${url}`);
}
