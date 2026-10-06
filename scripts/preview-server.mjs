/**
 * Local preview server for the static storefront.
 *
 * Serves the repo root. For /api/* it does one of two things:
 *
 *   live  - when the Firebase env vars are present it loads .env.local (or
 *           .env, both gitignored) and calls the real handlers in api/, so a
 *           genuine launcher key can be checked before anything is deployed.
 *
 *   stub  - otherwise it answers /api/* with empty storefront config and a
 *           fake launcher payload, so the pages render offline. In stub mode
 *           the demo order 4321 and the demo key KAYAZ-4H7M-QW2N-XR9P are the
 *           only ones that work, real keys are refused on purpose.
 *
 * Run: node scripts/preview-server.mjs [port]   (default 8103)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8103;

// Optional local env, never committed. Loaded before anything reads process.env.
for (const name of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(root, name));
  } catch (e) {
    // Node older than 20.12 has no loadEnvFile, and a missing file throws.
  }
}

const liveApi = Boolean(
  (process.env.FIREBASE_DB_URL || process.env.FIREBASE_URL) &&
  (process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SECRET) &&
  (process.env.R6_Firebase_URL || process.env.R6_FIREBASE_URL) &&
  (process.env.R6_Firebase_secret || process.env.R6_FIREBASE_SECRET) &&
  process.env.SESSION_SECRET
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
};

// Hand the request to the same module Vercel would run, with the small bits of
// the Vercel request shape the handlers expect.
async function runApi(req, res, pathname) {
  const name = pathname.slice('/api/'.length).replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return false;
  let mod;
  try {
    mod = await import(pathToFileURL(path.join(root, 'api', name + '.js')).href);
  } catch (e) {
    return false;
  }
  if (typeof mod.default !== 'function') return false;

  req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = obj => {
    res.setHeader('content-type', TYPES['.json']);
    res.end(JSON.stringify(obj));
  };
  await mod.default(req, res);
  return true;
}

function stubApi(pathname, req, res) {
  if (pathname === '/api/launcher') {
    const DEMO_KEY = 'KAYAZ-4H7M-QW2N-XR9P';
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let sent = {};
      try { sent = JSON.parse(body || '{}'); } catch (e) {}
      const known = String(sent.order || '') === '4321' || String(sent.key || '').trim().toUpperCase() === DEMO_KEY;
      res.writeHead(known ? 200 : 404, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
      res.end(JSON.stringify(known ? {
        ok: true,
        key: DEMO_KEY,
        term: '7 Days',
        termKey: 'sevenDays',
        days: 7,
        expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400,
        bound: false,
        email: 'demo@example.com',
        download: '/api/launcher-download?t=preview',
        downloadExpiresIn: 3600,
        preview: true
      } : { error: 'that key is not valid' }));
    });
    return;
  }
  res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify({ ok: true, mode: 'variants', shopId: null, shopUrl: 'https://kayaz.mysellauth.com', ready: false, products: [] }));
}

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (pathname.startsWith('/api/')) {
    if (liveApi) {
      try {
        if (await runApi(req, res, pathname)) return;
      } catch (e) {
        res.writeHead(500, { 'content-type': TYPES['.json'] });
        res.end(JSON.stringify({ error: 'handler crashed: ' + (e && e.message) }));
        return;
      }
    }
    stubApi(pathname, req, res);
    return;
  }

  let file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    if (!path.extname(file)) file = path.join(file, 'index.html');
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`preview: http://127.0.0.1:${port} (serving ${root})`);
  console.log(liveApi
    ? 'api: live, calling the real handlers with the env from .env.local / .env'
    : 'api: stubbed, no Firebase env found. Put it in .env.local to test real keys.');
});
