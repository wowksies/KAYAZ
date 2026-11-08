import {
  panelAccount, verifySession, bearer, send, guardConfig, rateLimit, clearSessionCookie
} from './_lib.js';

                                                                        
                                                                        
export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'session', 120, 60000)) return;

  let acc = null;
  try {
    acc = await panelAccount(req);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  if (acc) {
    return send(res, 200, { ok: true, admin: acc.role === 'admin', role: acc.role, user: acc.user });
  }

                                                                          
  const s = verifySession(bearer(req));
  if (s && s.t === 'u') return send(res, 200, { ok: true, admin: false, role: 'user' });

  clearSessionCookie(req, res);
  return send(res, 401, { ok: false });
}
