import { verifySession, bearer, send, guardConfig } from './_lib.js';

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  const s = verifySession(bearer(req));
  if (!s) return send(res, 401, { ok: false });
  return send(res, 200, { ok: true, admin: s.t === 'a' });
}
