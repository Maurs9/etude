// A small static server that serves a built site the way GitHub Pages does: dist/etude/ appears under /etude/, a folder
// URL serves its index.html, a folder URL without the trailing slash redirects to it, and responses carry Pages'
// max-age=600. Used by tests/deploy.spec.mjs and `npm run preview` (node scripts/serve.mjs [folder] [port]).
import { realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

export function serve(dir, { port = 0, host = '127.0.0.1' } = {}) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    const send = (status, headers = {}, body) => { res.writeHead(status, headers); res.end(req.method === 'HEAD' ? undefined : body); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { Allow: 'GET, HEAD' });
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      let file = join(root, path);
      if (file !== root && !file.startsWith(root + sep)) return send(404);
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        // A single leading slash: "//etude/" would send the browser to another host.
        if (!path.endsWith('/')) return send(301, { Location: url.pathname.replace(/^\/+/, '/') + '/' + url.search });
        file = join(file, 'index.html');
        info = await stat(file).catch(() => null);
      }
      if (!info?.isFile()) return send(404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
      const body = await readFile(file);
      send(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'max-age=600',
      }, body);
    } catch {
      send(400);
    }
  });
  return new Promise((done, fail) => server.once('error', fail).listen(port, host, () => done(server)));
}

// Run as a script, also through a symlinked path (on macOS, /tmp is one).
const invokedDirectly = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (invokedDirectly()) {
  const [dir = 'dist', port = '8778'] = process.argv.slice(2);
  const server = await serve(dir, { port: Number(port) });
  console.log(`Serving ${resolve(dir)} at http://127.0.0.1:${server.address().port}/etude/ (Ctrl+C to stop)`);
}
