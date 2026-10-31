import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
let active = 'safe-a';
const versions = new Set(['safe-a', 'safe-b', 'legacy-guarded', 'legacy-unguarded', 'retained-b']);
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/__deploy' && req.method === 'POST') {
    if (!versions.has(url.searchParams.get('version'))) { res.writeHead(400).end(); return; }
    active = url.searchParams.get('version');
    res.writeHead(204).end(); return;
  }
  const path = url.pathname.startsWith('/assets/') || /\.[a-z]+$/.test(url.pathname) ? url.pathname.slice(1) : 'index.html';
  if (path.split('/').includes('..')) { res.writeHead(400).end(); return; }
  for (const version of [active]) {
    try {
      const bytes = await readFile(resolve('.deployment-build', version, path));
      res.writeHead(200, { 'content-type': ({ '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json', '.webmanifest':'application/manifest+json' })[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(bytes); return;
    } catch { /* Unknown asset returns a real 404. */ }
  }
  res.writeHead(404).end('Not found');
}).listen(4175, '127.0.0.1');
