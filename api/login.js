import {
  db, sha256, normUser, verifyPassword, DUMMY_HASH, getAccountByLogin, bootstrapAdmin,
  createPanelSession, setSessionCookie, send, guardConfig, rateLimit, requireSameOrigin,
  readBody, dec, clientIp, audit
} from './_lib.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

                                                                         
                                                                     
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  if (!requireSameOrigin(req, res)) return;
  if (!rateLimit(req, res, 'login', 30, 600000)) return;

  const body = await readBody(req);
  const user = normUser(body.user || body.username || body.email || '');
  const password = String(body.password || '');
  const generic = { error: 'wrong username or password' };

  if (!user || !password || password.length > 200 || user.length > 64) {
    await sleep(400);
    return send(res, 401, generic);
  }

  const key = 'authfail/' + sha256('u:' + user);
  let fail = null;
  try {
    fail = await db.get(key);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  const now = Date.now();
  if (fail && Number(fail.until) > now) {
    res.setHeader('Retry-After', String(Math.ceil((Number(fail.until) - now) / 1000)));
    return send(res, 429, { error: 'too many attempts, try again later' });
  }

  let acc = null;
  try {
    acc = await getAccountByLogin(user);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  let ok = false;
  if (acc && !acc.disabled) ok = verifyPassword(password, acc.pass);
  else verifyPassword(password, DUMMY_HASH);                                   

  if (!ok) {
    let boot = null;
    try {
      boot = await bootstrapAdmin(user, password);
    } catch (e) {
      boot = null;
    }
    if (!boot) {
      const fails = (Number(fail && fail.fails) || 0) + 1;
      const wait = fails >= 5 ? Math.min(3600, 60 * Math.pow(2, fails - 5)) : 0;
      try {
        await db.put(key, { fails, until: now + wait * 1000, updated: now });
      } catch (e) {}
      await sleep(400 + Math.random() * 250);
      return send(res, 401, generic);
    }
    acc = boot;
  }

  try {
    await db.del(key);
  } catch (e) {}

  const role = acc.role === 'admin' ? 'admin' : 'reseller';
  const ver = Number(acc.ver) || 1;
  const name = dec(acc.user) || user;
  let token;
  try {
    token = await createPanelSession(acc, name, ver, req);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  setSessionCookie(req, res, token, 7 * 86400);

  try {
    await db.patch('accounts/' + acc.id, {
      lastLogin: Date.now(),
      lastIp: sha256('ip:' + clientIp(req)).slice(0, 16)
    });
  } catch (e) {}

  await audit({ id: acc.id, user: name }, 'login', role, req);
  return send(res, 200, { ok: true, role, user: name });
}
