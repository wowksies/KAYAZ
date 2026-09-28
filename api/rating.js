import { db, sha256, readBody, send, guardConfig } from './_lib.js';

// Public star ratings for blog pages. One vote per device: the browser keeps a random
// device id and sends it with each rating; rating again replaces that device's vote.
const PAGES = new Set(['r6-internal']);

async function summary(page) {
  const all = (await db.get('ratings/' + page)) || {};
  let sum = 0, count = 0;
  for (const r of Object.values(all)) {
    const v = r && Number(r.v);
    if (v >= 1 && v <= 5) { sum += v; count++; }
  }
  return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count };
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
    const key = sha256(page + ':' + device).slice(0, 32);
    try {
      if (value === 0) await db.del('ratings/' + page + '/' + key);
      else await db.put('ratings/' + page + '/' + key, { v: value, t: Date.now() });
      return send(res, 200, await summary(page));
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
  }

  res.setHeader('allow', 'GET, POST');
  return send(res, 405, { error: 'method not allowed' });
}
