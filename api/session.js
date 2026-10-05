import { verifySession, bearer, send, guardConfig, rateLimit } from './_lib.js';

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'session', 60, 60000)) return;
  const s = verifySession(bearer(req));
  if (!s) return send(res, 401, { ok: false });
  return send(res, 200, { ok: true, admin: s.t === 'a' });
}
