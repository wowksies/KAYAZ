import {
  db, r6db, r6Configured, sha256, normCode, makeCode, makeLauncherKey, requirePanel, requireSameOrigin,
  readBody, send, guardConfig, rateLimit, enc, dec, getAccount, audit
} from './_lib.js';

function cleanLabel(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function validHash(h) {
  return /^[a-f0-9]{64}$/.test(String(h || ''));
}

function pickTarget(v) {
  const t = String(v || 'r6').toLowerCase();
  return t === 'r6' || t === 'site' ? t : '';
}

function storeFor(target) {
  return target === 'site' ? db : r6db;
}

function nodeFor(target) {
  return target === 'site' ? 'codes' : 'keys';
}

async function ownedCount(owner) {
  let used = 0;
  if (r6Configured()) {
    try {
      const all = await r6db.get('keys');
      used += Object.values(all || {}).filter(k => k && k.owner === owner).length;
    } catch (e) {}
  }
  const site = await db.get('codes');
  used += Object.values(site || {}).filter(k => k && k.owner === owner).length;
  return used;
}

function r6Record(h, c) {
  return {
    h,
    label: c.memo ? dec(c.memo) : (c.label || ''),
    shown: c.shown || ('••••-' + h.slice(0, 4)),
    used: Boolean(c.hwid),
    revoked: c.disabled === true || c.disabled === 'true' || c.active === false,
    created: c.created || 0,
    usedAt: 0,
    owner: c.owner || '',
    ownerName: c.ownerName ? dec(c.ownerName) : (c.email || 'sellaut'),
    invitedName: '',
    invitedTo: ''
  };
}

function siteRecord(h, c) {
  return {
    h,
    label: dec(c.label),
    shown: c.shown || '',
    used: Boolean(c.device),
    revoked: Boolean(c.revoked),
    created: c.created || 0,
    usedAt: c.usedAt || 0,
    owner: c.owner || '',
    ownerName: c.owner ? dec(c.ownerName) : 'legacy',
    invitedName: dec(c.invitedName),
    invitedTo: c.invited ? dec(c.invited.name || '') : ''
  };
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'keys', 90, 60000)) return;

  const acc = await requirePanel(req, res);
  if (!acc) return;
  const isAdmin = acc.role === 'admin';

  if (req.method === 'GET') {
    const target = pickTarget(req.query && req.query.target);
    if (!target) return send(res, 400, { error: 'bad target' });
    if (target === 'r6' && !r6Configured()) return send(res, 503, { error: 'r6 key store not configured' });

    let all;
    try {
      all = await storeFor(target).get(nodeFor(target));
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }

    const shape = target === 'r6' ? r6Record : siteRecord;
    const rows = Object.entries(all || {})
      .map(([h, c]) => (c ? shape(h, c) : null))
      .filter(k => k && (isAdmin || k.owner === acc.id))
      .sort((a, b) => b.created - a.created);

    let used = 0;
    try {
      used = await ownedCount(acc.id);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    return send(res, 200, {
      keys: rows,
      target,
      me: acc.id,
      role: acc.role,
      quota: Number(acc.quota) || 0,
      used
    });
  }

  if (req.method === 'POST') {
    if (!requireSameOrigin(req, res)) return;

    const body = await readBody(req);
    const target = pickTarget(body.target);
    if (!target) return send(res, 400, { error: 'bad target' });
    if (target === 'r6' && !r6Configured()) return send(res, 503, { error: 'r6 key store not configured' });

    let n = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), isAdmin ? 50 : 20);
    const label = cleanLabel(body.label);

    let owner = acc.id;
    let ownerName = acc.user;

    if (isAdmin && body.owner) {
      const targetAcc = await getAccount(String(body.owner));
      if (!targetAcc) return send(res, 400, { error: 'unknown account' });
      owner = targetAcc.id;
      ownerName = dec(targetAcc.user);
    }

    if (!isAdmin) {
      const quota = Number(acc.quota) || 0;
      if (quota > 0) {
        let used;
        try {
          used = await ownedCount(acc.id);
        } catch (e) {
          return send(res, 500, { error: 'server error' });
        }
        if (used + n > quota) {
          return send(res, 403, {
            error: 'key allowance reached - ' + used + ' of ' + quota + ' used',
            quota, used, left: Math.max(0, quota - used)
          });
        }
      }
    }

    const store = storeFor(target);
    const node = nodeFor(target);
    const made = [];
    for (let i = 0; i < n; i++) {
      try {
        if (target === 'r6') {
          const code = makeLauncherKey();
          const h = sha256(code);
          await store.put(node + '/' + h, {
            created: Date.now(),
            label: 'KAYAZ R6',
            memo: enc(label),
            shown: '••••-' + code.slice(-4),
            tier: 'panel',
            duration_days: 0,
            expires_at: 0,
            disabled: false,
            active: true,
            hwid: '',
            order: '',
            email: '',
            owner,
            ownerName: enc(ownerName)
          });
          made.push(code);
        } else {
          const code = makeCode();
          const h = sha256(normCode(code));
          await store.put(node + '/' + h, {
            created: Date.now(),
            label: enc(label),
            shown: code.slice(0, 4) + '••••',
            device: null,
            revoked: false,
            owner,
            ownerName: enc(ownerName)
          });
          made.push(code);
        }
      } catch (e) {}
    }
    if (!made.length) return send(res, 500, { error: 'could not create keys' });
    await audit(acc, 'keys.create', made.length + ' keys (' + target + ')' + (owner !== acc.id ? ' for ' + ownerName : ''), req);
    return send(res, 200, { codes: made, target });
  }

  if (req.method === 'PATCH') {
    if (!requireSameOrigin(req, res)) return;

    const { h, revoked, reset, target: rawTarget } = await readBody(req);
    const target = pickTarget(rawTarget);
    if (!target) return send(res, 400, { error: 'bad target' });
    if (target === 'r6' && !r6Configured()) return send(res, 503, { error: 'r6 key store not configured' });
    if (!validHash(h)) return send(res, 400, { error: 'bad key' });

    const store = storeFor(target);
    const node = nodeFor(target);
    let rec;
    try {
      rec = await store.get(node + '/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    if (!rec || (!isAdmin && rec.owner !== acc.id)) return send(res, 404, { error: 'not found' });

    const patch = {};
    if (target === 'r6') {
      if (typeof revoked === 'boolean') {
        patch.disabled = revoked;
        patch.active = !revoked;
      }
      if (reset) patch.hwid = '';
    } else {
      if (typeof revoked === 'boolean') patch.revoked = revoked;
      if (reset) { patch.device = null; patch.usedAt = 0; }
    }
    if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });

    try {
      await store.patch(node + '/' + h, patch);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    await audit(acc, patch.revoked === undefined && patch.disabled === undefined ? 'key.unbind' : (revoked ? 'key.revoke' : 'key.restore'), target + ':' + h.slice(0, 12), req);
    return send(res, 200, { ok: true, target });
  }

  if (req.method === 'DELETE') {
    if (!requireSameOrigin(req, res)) return;

    const body = await readBody(req);
    const target = pickTarget(body.target);
    if (!target) return send(res, 400, { error: 'bad target' });
    if (target === 'r6' && !r6Configured()) return send(res, 503, { error: 'r6 key store not configured' });

    const store = storeFor(target);
    const node = nodeFor(target);

    if (body.all === 'unused') {
      let all;
      try {
        all = await store.get(node);
      } catch (e) {
        return send(res, 500, { error: 'server error' });
      }
      let removed = 0;
      for (const [k, v] of Object.entries(all || {})) {
        if (!v || (target === 'r6' ? v.hwid : v.device)) continue;
        if (target === 'r6' && !v.owner) continue;
        if (!isAdmin && v.owner !== acc.id) continue;
        try { await store.del(node + '/' + k); removed++; } catch (e) {}
      }
      await audit(acc, 'keys.prune', removed + ' (' + target + ')', req);
      return send(res, 200, { removed, target });
    }

    const h = body.h;
    if (!validHash(h)) return send(res, 400, { error: 'bad key' });

    let rec;
    try {
      rec = await store.get(node + '/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    if (!rec || (!isAdmin && rec.owner !== acc.id)) return send(res, 404, { error: 'not found' });

    try {
      await store.del(node + '/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    await audit(acc, 'key.delete', target + ':' + h.slice(0, 12), req);
    return send(res, 200, { ok: true, target });
  }

  res.setHeader('allow', 'GET, POST, PATCH, DELETE');
  return send(res, 405, { error: 'method' });
}
