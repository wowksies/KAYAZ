import {
  db, sha256, normCode, makeCode, requirePanel, requireSameOrigin, readBody, send,
  guardConfig, rateLimit, enc, dec, getAccount, audit
} from './_lib.js';

                                                                            
                                                                           
                                                         
function cleanLabel(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function validHash(h) {
  return /^[a-f0-9]{64}$/.test(String(h || ''));
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'keys', 90, 60000)) return;

  const acc = await requirePanel(req, res);
  if (!acc) return;
  const isAdmin = acc.role === 'admin';

  if (req.method === 'GET') {
    let all;
    try {
      all = await db.get('codes');
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    const rows = Object.entries(all || {})
      .filter(([, c]) => c && (isAdmin || c.owner === acc.id))
      .map(([h, c]) => ({
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
      }))
      .sort((a, b) => b.created - a.created);

    const used = rows.filter(k => k.owner === acc.id).length;
    return send(res, 200, { keys: rows, me: acc.id, role: acc.role, quota: Number(acc.quota) || 0, used });
  }

  if (req.method === 'POST') {
    if (!requireSameOrigin(req, res)) return;

    const body = await readBody(req);
    let n = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), isAdmin ? 50 : 20);
    const label = cleanLabel(body.label);

    let owner = acc.id;
    let ownerName = acc.user;

    if (isAdmin && body.owner) {
      const target = await getAccount(String(body.owner));
      if (!target) return send(res, 400, { error: 'unknown account' });
      owner = target.id;
      ownerName = dec(target.user);
    }

    if (!isAdmin) {
      const quota = Number(acc.quota) || 0;
      if (quota > 0) {
        let all;
        try {
          all = await db.get('codes');
        } catch (e) {
          return send(res, 500, { error: 'server error' });
        }
        const used = Object.values(all || {}).filter(k => k && k.owner === acc.id).length;
        if (used + n > quota) {
          return send(res, 403, {
            error: 'key allowance reached - ' + used + ' of ' + quota + ' used',
            quota, used, left: Math.max(0, quota - used)
          });
        }
      }
    }

    const made = [];
    for (let i = 0; i < n; i++) {
      const code = makeCode();
      const h = sha256(normCode(code));
      try {
        await db.put('codes/' + h, {
          created: Date.now(),
          label: enc(label),
          shown: code.slice(0, 4) + '••••',
          device: null,
          revoked: false,
          owner,
          ownerName: enc(ownerName)
        });
        made.push(code);
      } catch (e) {}
    }
    if (!made.length) return send(res, 500, { error: 'could not create keys' });
    await audit(acc, 'keys.create', made.length + ' keys' + (owner !== acc.id ? ' for ' + ownerName : ''), req);
    return send(res, 200, { codes: made });
  }

  if (req.method === 'PATCH') {
    if (!requireSameOrigin(req, res)) return;

    const { h, revoked, reset } = await readBody(req);
    if (!validHash(h)) return send(res, 400, { error: 'bad key' });

    let rec;
    try {
      rec = await db.get('codes/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    if (!rec || (!isAdmin && rec.owner !== acc.id)) return send(res, 404, { error: 'not found' });

    const patch = {};
    if (typeof revoked === 'boolean') patch.revoked = revoked;
    if (reset) { patch.device = null; patch.usedAt = 0; }
    if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });

    try {
      await db.patch('codes/' + h, patch);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    await audit(acc, patch.revoked === undefined ? 'key.unbind' : (patch.revoked ? 'key.revoke' : 'key.restore'), h.slice(0, 12), req);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    if (!requireSameOrigin(req, res)) return;

    const body = await readBody(req);

    if (body.all === 'unused') {
      let all;
      try {
        all = await db.get('codes');
      } catch (e) {
        return send(res, 500, { error: 'server error' });
      }
      let removed = 0;
      for (const [k, v] of Object.entries(all || {})) {
        if (!v || v.device) continue;
        if (!isAdmin && v.owner !== acc.id) continue;
        try { await db.del('codes/' + k); removed++; } catch (e) {}
      }
      await audit(acc, 'keys.prune', String(removed), req);
      return send(res, 200, { removed });
    }

    const h = body.h;
    if (!validHash(h)) return send(res, 400, { error: 'bad key' });

    let rec;
    try {
      rec = await db.get('codes/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    if (!rec || (!isAdmin && rec.owner !== acc.id)) return send(res, 404, { error: 'not found' });

    try {
      await db.del('codes/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    await audit(acc, 'key.delete', h.slice(0, 12), req);
    return send(res, 200, { ok: true });
  }

  res.setHeader('allow', 'GET, POST, PATCH, DELETE');
  return send(res, 405, { error: 'method' });
}
