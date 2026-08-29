import { db, sha256, normCode, signSession, readBody, send, guardConfig } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  const { code, device } = await readBody(req);
  const c = normCode(code);
  const dev = String(device || '').slice(0, 64);
  if (c.length < 6 || !dev) return send(res, 400, { error: 'bad request' });
  const h = sha256(c);
  let rec;
  try { rec = await db.get('codes/' + h); } catch (e) { return send(res, 500, { error: 'server error' }); }
  if (!rec || rec.revoked) return send(res, 403, { error: 'invalid code' });
  if (rec.device && rec.device !== dev) return send(res, 403, { error: 'code already used on another device' });
  if (!rec.device) {
    try { await db.patch('codes/' + h, { device: dev, usedAt: Date.now() }); }
    catch (e) { return send(res, 500, { error: 'server error' }); }
  }
  return send(res, 200, { token: signSession({ t: 'u', d: dev, c: h }, 60), label: rec.label || null });
}
