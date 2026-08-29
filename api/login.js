import { checkAdminCreds, signSession, readBody, send, guardConfig } from './_lib.js';

const hits = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 600000) { rec.n = 0; rec.t = now; }
  if (rec.n >= 8) return send(res, 429, { error: 'too many attempts, wait a bit' });
  const { email, password } = await readBody(req);
  if (!checkAdminCreds(email, password)) {
    rec.n++; hits.set(ip, rec);
    await new Promise(r => setTimeout(r, 400));
    return send(res, 401, { error: 'wrong email or password' });
  }
  hits.delete(ip);
  return send(res, 200, { token: signSession({ t: 'a' }, 7) });
}
