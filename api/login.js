import crypto from 'node:crypto';
import {
  db, r6db, r6Configured, sha256, normUser, verifyPassword, DUMMY_HASH, getAccountByLogin, getAccount, bootstrapAdmin,
  createPanelSession, setSessionCookie, setDeviceCookie, signSession, trustedDevice,
  discordLoginEnabled, discordOwnerId, validDiscordId, safeEqual,
  send, guardConfig, rateLimit, requireSameOrigin, readBody, dec, clientIp, audit
} from './_lib.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const challengeDb = r6Configured() ? r6db : db;

async function finishLogin(acc, name, req, res) {
  const role = acc.role === 'admin' ? 'admin' : 'reseller';
  const ver = Number(acc.ver) || 1;
  let token;
  try {
    token = await createPanelSession(acc, name, ver, req);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  setSessionCookie(req, res, token, 7 * 86400);
  if (discordLoginEnabled()) {
    setDeviceCookie(req, res, signSession({ t: 'd', u: acc.id, v: ver }, 30), 30 * 86400);
  }
  try {
    await db.patch('accounts/' + acc.id, {
      lastLogin: Date.now(),
      lastIp: sha256('ip:' + clientIp(req)).slice(0, 16)
    });
  } catch (e) {}
  await audit({ id: acc.id, user: name }, 'login', role, req);
  return send(res, 200, { ok: true, role, user: name });
}

async function completeChallenge(req, res, body) {
  if (!discordLoginEnabled()) return send(res, 400, { error: 'discord verification is not enabled' });
  if (!rateLimit(req, res, 'login-verify', 20, 600000)) return;
  const id = String(body.challengeId || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return send(res, 401, { error: 'code expired, sign in again' });
  const code = String(body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return send(res, 401, { error: 'enter the six digit code' });
  let rec;
  try {
    rec = await challengeDb.get('loginChallenges/' + id);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  if (!rec || !rec.u || Number(rec.exp) <= Date.now()) {
    if (rec) {
      try { await challengeDb.del('loginChallenges/' + id); } catch (e) {}
    }
    return send(res, 401, { error: 'code expired, sign in again' });
  }
  if (rec.status === 'failed') {
    try { await challengeDb.del('loginChallenges/' + id); } catch (e) {}
    return send(res, 502, { error: 'the code could not be sent, check your Discord DMs and try again' });
  }
  if (rec.status !== 'sent' || !rec.codeHash) {
    return send(res, 409, { error: 'the code is still being sent, wait a few seconds' });
  }
  if (!safeEqual(sha256(code + ':' + id), rec.codeHash)) {
    const attempts = (Number(rec.attempts) || 0) + 1;
    if (attempts >= 5) {
      try { await challengeDb.del('loginChallenges/' + id); } catch (e) {}
    } else {
      try { await challengeDb.patch('loginChallenges/' + id, { attempts }); } catch (e) {}
    }
    return send(res, 401, { error: 'wrong or expired code' });
  }
  let acc;
  try {
    acc = await getAccount(rec.u);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  if (!acc || acc.disabled) {
    try { await challengeDb.del('loginChallenges/' + id); } catch (e) {}
    return send(res, 401, { error: 'sign in again' });
  }
  try { await challengeDb.del('loginChallenges/' + id); } catch (e) {}
  return finishLogin(acc, dec(acc.user), req, res);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  if (!requireSameOrigin(req, res)) return;
  if (!rateLimit(req, res, 'login', 30, 600000)) return;

  const body = await readBody(req);
  if (body.challengeId) return completeChallenge(req, res, body);

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

  if (discordLoginEnabled() && !trustedDevice(req, acc)) {
    const discordId = validDiscordId(acc.discordId) ? String(acc.discordId) : discordOwnerId();
    if (!discordId) return send(res, 503, { error: 'discord login verification is not configured' });
    const challengeId = crypto.randomBytes(16).toString('hex');
    try {
      await challengeDb.put('loginChallenges/' + challengeId, {
        u: acc.id,
        discordId,
        at: now,
        exp: now + 5 * 60 * 1000,
        status: 'pending',
        attempts: 0
      });
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    return send(res, 202, { ok: false, challenge: 'discord', challengeId, expiresIn: 300 });
  }

  return finishLogin(acc, dec(acc.user) || user, req, res);
}
