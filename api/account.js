import {
  requirePanel, requireSameOrigin, readBody, send, guardConfig, rateLimit,
  verifyPassword, hashPassword, normUser, validUsername, validEmail,
  getAccountByUser, getAccountByEmail, enc, userIndex, emailIndex,
  signSession, setSessionCookie, db, audit, PASSWORD_MIN, dec
} from './_lib.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Self-service account for whoever is signed in: username, email and password.
// Changing the password bumps the account version, which invalidates every
// other sealed session cookie.
export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'account', 60, 60000)) return;

  if (req.method === 'GET') {
    const acc = await requirePanel(req, res);
    if (!acc) return;
    let used = 0;
    try {
      const all = await db.get('codes');
      used = Object.values(all || {}).filter(k => k && k.owner === acc.id).length;
    } catch (e) {}
    return send(res, 200, {
      ok: true,
      user: acc.user,
      email: acc.email ? dec(acc.email) : '',
      role: acc.role,
      quota: Number(acc.quota) || 0,
      used,
      created: acc.created || 0,
      lastLogin: acc.lastLogin || 0
    });
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!requireSameOrigin(req, res)) return;

  const acc = await requirePanel(req, res);
  if (!acc) return;

  const body = await readBody(req);
  const current = String(body.current || '');
  if (!verifyPassword(current, acc.pass)) {
    await sleep(350);
    return send(res, 403, { error: 'current password is wrong' });
  }

  const patch = {};
  let name = acc.user;

  if (body.user != null) {
    const u = normUser(body.user);
    if (u !== normUser(acc.user)) {
      if (!validUsername(u)) {
        return send(res, 400, { error: 'username must be 3-32 characters, letters/numbers/._- only' });
      }
      const taken = await getAccountByUser(u);
      if (taken && taken.id !== acc.id) return send(res, 409, { error: 'that username is taken' });
      patch.user = enc(u);
      patch.uh = userIndex(u);
      name = u;
    }
  }

  let email = acc.email ? dec(acc.email) : '';

  if (body.email != null) {
    const em = normUser(body.email);
    if (em !== email) {
      if (!em) {
        patch.email = null;
        patch.eh = null;
        email = '';
      } else {
        if (!validEmail(em)) return send(res, 400, { error: 'enter a valid email address' });
        const taken = await getAccountByEmail(em);
        if (taken && taken.id !== acc.id) return send(res, 409, { error: 'that email is already in use' });
        patch.email = enc(em);
        patch.eh = emailIndex(em);
        email = em;
      }
    }
  }

  if (body.password) {
    const p = String(body.password);
    if (p.length < PASSWORD_MIN) return send(res, 400, { error: 'password must be at least ' + PASSWORD_MIN + ' characters' });
    if (p === current) return send(res, 400, { error: 'pick a different password' });
    if (email && p.toLowerCase() === email) return send(res, 400, { error: 'do not use your email as the password' });
    patch.pass = hashPassword(p);
    patch.ver = (Number(acc.ver) || 1) + 1;
    patch.passChanged = Date.now();
  }

  if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });

  try {
    await db.patch('accounts/' + acc.id, patch);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  await audit({ id: acc.id, user: name }, 'account.update', Object.keys(patch).join(','), req);

  const ver = Number(patch.ver) || Number(acc.ver) || 1;
  const token = signSession({ t: acc.role === 'admin' ? 'a' : 'r', u: acc.id, n: name, v: ver }, 7);
  setSessionCookie(req, res, token, 7 * 86400);
  return send(res, 200, { ok: true, user: name, email });
}

