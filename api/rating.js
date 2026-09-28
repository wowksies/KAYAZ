import crypto from 'node:crypto';
import { db, sha256, readBody, send, guardConfig } from './_lib.js';

// Public star ratings for blog pages.
// One vote per device AND one vote per IP: the browser keeps a random device id, and the
// server also looks at the caller's IP. Rating again from the same device, or from another
// device on the same IP, replaces the earlier vote instead of adding one. Device ids and
// IPs are only stored as salted hashes.
const PAGES = new Set(['r6-internal']);
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 30;                    // rating saves per IP per window

function hash(kind, page, value) {
  const salt = process.env.SESSION_SECRET || '';
  return crypto.createHmac('sha256', salt).update(kind + ':' + page + ':' + value).digest('hex').slice(0, 32);
}

function clientIp(req) {
  const h = req.headers || {};
  const fwd = String(h['x-forwarded-for'] || h['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(h['x-real-ip'] || '').trim() || (req.socket && req.socket.remoteAddress) || '';
}

async function summary(page) {
  const all = (await db.get('ratings/' + page)) || {};
  let sum = 0, count = 0;
  for (const r of Object.values(all)) {
    const v = r && Number(r.v);
    if (v >= 1 && v <= 5) { sum += v; count++; }
  }
  return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count };
}

// true when this IP has used up its saves for the current window
async function limited(ipKey) {
  const path = 'ratingHits/' + ipKey;
  const now = Date.now();
  const hit = (await db.get(path)) || {};
  const fresh = !hit.t || now - hit.t > RATE_WINDOW_MS;
  const n = fresh ? 1 : (Number(hit.n) || 0) + 1;
  if (!fresh && n > RATE_MAX) return true;
  await db.put(path, { n, t: fresh ? now : hit.t });
  return false;
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'GET') {
    const page = String((req.query && req.query.page) || '');
    if (!PAGES.has(page)) return send(res, 400, { error: 'unknown page' });
    try { return send(res, 200, await summary(page)); } catch (e) { return send(res, 500, { error: 'server error' }); }
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const page = String(body.page || '');
    const device = String(body.device || '');
    const value = Number(body.value);
    if (!PAGES.has(page)) return send(res, 400, { error: 'unknown page' });
    if (!/^[A-Za-z0-9-]{16,64}$/.test(device)) return send(res, 400, { error: 'bad device' });
    if (!Number.isInteger(value) || value < 0 || value > 5) return send(res, 400, { error: 'bad value' });

    const devKey = hash('dev', page, device);
    const ip = clientIp(req);
    const ipKey = ip ? hash('ip', page, ip) : '';
    const votes = 'ratings/' + page + '/';
    const ipIndex = 'ratingIps/' + page + '/';
    try {
      if (ipKey && await limited(ipKey)) return send(res, 429, { error: 'too many ratings, try again later' });

      // votes saved before the IP limit used a plain hash of the device id
      const legacy = sha256(page + ':' + device).slice(0, 32);
      if (legacy !== devKey) await db.del(votes + legacy);

      // a different device already voted from this IP: that vote gets replaced by this one
      // (only if that vote still belongs to this IP; a device that moved on keeps its vote)
      const prevDev = ipKey ? await db.get(ipIndex + ipKey) : null;
      if (prevDev && prevDev !== devKey) {
        const prev = await db.get(votes + prevDev);
        if (prev && prev.ip === ipKey) await db.del(votes + prevDev);
      }

      if (value === 0) {
        await db.del(votes + devKey);
        if (ipKey) await db.del(ipIndex + ipKey);
      } else {
        await db.put(votes + devKey, { v: value, t: Date.now(), ip: ipKey });
        if (ipKey) await db.put(ipIndex + ipKey, devKey);
      }
      return send(res, 200, await summary(page));
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
  }

  res.setHeader('allow', 'GET, POST');
  return send(res, 405, { error: 'method not allowed' });
}
