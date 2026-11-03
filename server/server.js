// GRAND BRAWL server: serves the built game (dist/) and hosts authoritative online matches over WebSocket.
//   npm start            -> build + serve on http://localhost:8080 (ws at /ws)
//   PORT=9000 npm run serve
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRoomManager } from './rooms.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(root, process.env.GB_STATIC || 'dist');
const PORT = +process.env.PORT || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.map': 'application/json', '.woff2': 'font/woff2' };

export function startServer({ port = PORT, quiet = false } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.count() })); return; }
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (!p || p.endsWith('/')) p += 'index.html';
      const file = resolve(DIST, p);
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end('error');
    }
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
  const rooms = createRoomManager({ log: quiet ? () => {} : (...a) => console.log('[rooms]', ...a) });
  wss.on('connection', (ws, req) => rooms.connect(ws, req));
  return new Promise((ok) => server.listen(port, () => {
    if (!quiet) console.log(`GRAND BRAWL server running at http://localhost:${port}  (online play: ws://localhost:${port}/ws)`);
    ok({ server, wss, rooms, port: server.address().port, close: () => new Promise((r) => { rooms.shutdown(); for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); if (server.closeAllConnections) server.closeAllConnections(); }) });
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
void join;
