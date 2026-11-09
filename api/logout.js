import { clearSessionCookie, destroyPanelSession, send, guardConfig, requireSameOrigin } from './_lib.js';

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!requireSameOrigin(req, res)) return;
  await destroyPanelSession(req);
  clearSessionCookie(req, res);
  return send(res, 200, { ok: true });
}
