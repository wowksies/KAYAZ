import {
  requirePanel, requireSameOrigin, readBody, send, guardConfig, rateLimit,
  getAccounts, createAccount, getAccountByUser, getAccountByEmail, hashPassword,
  normUser, validUsername, validEmail, validDiscordId, enc, userIndex, emailIndex, dec, db, audit, PASSWORD_MIN
} from './_lib.js';

                                                                             
                                                          
function quotaOf(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100000, n)) : 0;
}

                                                            
function adminsAfter(all, id, patch) {
  let n = 0;
  for (const [cid, a] of Object.entries(all || {})) {
    if (!a || a.role !== 'admin') continue;
    const role = cid === id && patch && patch.role ? patch.role : a.role;
    const disabled = cid === id && patch && patch.disabled != null ? patch.disabled : Boolean(a.disabled);
    if (role === 'admin' && !disabled) n++;
  }
  return n;
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'resellers', 60, 60000)) return;

  const me = await requirePanel(req, res, ['admin']);
  if (!me) return;

  let all;
  try {
    all = await getAccounts();
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  let codes = {};
  try {
    codes = (await db.get('codes')) || {};
  } catch (e) {}

  const used = {};
  for (const c of Object.values(codes)) {
    if (c && c.owner) used[c.owner] = (used[c.owner] || 0) + 1;
  }

  if (req.method === 'GET') {
    const list = Object.entries(all).map(([id, a]) => ({
      id,
      user: dec(a.user),
      email: a.email ? dec(a.email) : '',
      role: a.role,
      disabled: Boolean(a.disabled),
      quota: Number(a.quota) || 0,
      used: used[id] || 0,
      created: a.created || 0,
      discordId: a.discordId || '',
      lastLogin: a.lastLogin || 0
    })).sort((x, y) => {
      if (x.role !== y.role) return x.role === 'admin' ? -1 : 1;
      return String(x.user).localeCompare(String(y.user));
    });
    return send(res, 200, { resellers: list, me: me.id });
  }

  if (req.method === 'POST') {
    if (!requireSameOrigin(req, res)) return;
    const b = await readBody(req);
    try {
      const created = await createAccount({
        user: b.user,
        email: b.email,
        password: b.password,
        role: b.role === 'admin' ? 'admin' : 'reseller',
        quota: quotaOf(b.quota),
        discordId: String(b.discordId || '').trim(),
        by: me.id
      });
      await audit(me, 'account.create', dec(created.user), req);
      return send(res, 200, { ok: true, id: created.id, user: dec(created.user) });
    } catch (err) {
      return send(res, 400, { error: String((err && err.message) || 'could not create the account') });
    }
  }

  if (req.method === 'PATCH') {
    if (!requireSameOrigin(req, res)) return;
    const b = await readBody(req);
    const id = String(b.id || '');
    const target = all[id];
    if (!target) return send(res, 404, { error: 'not found' });
    if (id === me.id) return send(res, 400, { error: 'change your own account in the account tab' });

    const patch = {};

    if (b.password) {
      const p = String(b.password);
      if (p.length < PASSWORD_MIN) return send(res, 400, { error: 'password must be at least ' + PASSWORD_MIN + ' characters' });
      if (p.length > 200) return send(res, 400, { error: 'password must be 200 characters or fewer' });
      patch.pass = hashPassword(p);
      patch.ver = (Number(target.ver) || 1) + 1;
      patch.passChanged = Date.now();
    }

    if (b.user != null) {
      const u = normUser(b.user);
      if (u !== normUser(dec(target.user))) {
        if (!validUsername(u)) {
          return send(res, 400, { error: 'username must be 3-32 characters, letters/numbers/._- only' });
        }
        const taken = await getAccountByUser(u);
        if (taken && taken.id !== id) return send(res, 409, { error: 'that username is taken' });
        patch.user = enc(u);
        patch.uh = userIndex(u);
      }
    }

    if (b.email != null) {
      const em = normUser(b.email);
      const current = target.email ? dec(target.email) : '';
      if (em !== current) {
        if (!em) {
          patch.email = null;
          patch.eh = null;
        } else {
          if (!validEmail(em)) return send(res, 400, { error: 'enter a valid email address' });
          const taken = await getAccountByEmail(em);
          if (taken && taken.id !== id) return send(res, 409, { error: 'that email is already in use' });
          patch.email = enc(em);
          patch.eh = emailIndex(em);
        }
      }
    }

    if (b.discordId != null) {
      const did = String(b.discordId).trim();
      if (did && !validDiscordId(did)) return send(res, 400, { error: 'enter a valid Discord user ID' });
      patch.discordId = did || null;
    }

    if (b.role) {
      if (b.role !== 'admin' && b.role !== 'reseller') return send(res, 400, { error: 'bad role' });
      patch.role = b.role;
    }

    if (b.quota != null) patch.quota = quotaOf(b.quota);

    if (typeof b.disabled === 'boolean') {
      patch.disabled = b.disabled;
      if (b.disabled) patch.ver = (Number(target.ver) || 1) + 1;
    }

    if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });
    if (adminsAfter(all, id, patch) < 1) return send(res, 400, { error: 'this would leave no active admin' });

    try {
      await db.patch('accounts/' + id, patch);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    await audit(me, 'account.update', dec(target.user), req);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    if (!requireSameOrigin(req, res)) return;
    const b = await readBody(req);
    const id = String(b.id || '');
    const target = all[id];
    if (!target) return send(res, 404, { error: 'not found' });
    if (id === me.id) return send(res, 400, { error: 'you cannot delete your own account' });
    if (adminsAfter(all, id, { role: 'reseller' }) < 1) {
      return send(res, 400, { error: 'this would leave no active admin' });
    }
    try {
      await db.del('accounts/' + id);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    await audit(me, 'account.delete', dec(target.user), req);
    return send(res, 200, { ok: true });
  }

  res.setHeader('allow', 'GET, POST, PATCH, DELETE');
  return send(res, 405, { error: 'method' });
}
