import { db, sha256, normCode, makeCode, requireAdmin, readBody, send, guardConfig } from './_lib.js';

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!requireAdmin(req)) return send(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET') {
    let all;
    try { all = await db.get('codes'); } catch (e) { return send(res, 500, { error: 'server error' }); }
    const list = Object.entries(all || {}).map(([h, c]) => ({
      h,
      label: c.label || '',
      shown: c.shown || '',
      used: Boolean(c.device),
      revoked: Boolean(c.revoked),
      created: c.created || 0,
      usedAt: c.usedAt || 0
    })).sort((a, b) => b.created - a.created);
    return send(res, 200, { keys: list });
  }

  if (req.method === 'POST') {
    const { count, label } = await readBody(req);
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50);
    const made = [];
    for (let i = 0; i < n; i++) {
      const code = makeCode();
      const h = sha256(normCode(code));
      try {
        await db.put('codes/' + h, {
          created: Date.now(),
          label: String(label || '').slice(0, 60),
          shown: code.slice(0, 4) + '••••',
          device: null,
          revoked: false
        });
        made.push(code);
      } catch (e) {}
    }
    return send(res, 200, { codes: made });
  }

  if (req.method === 'DELETE') {
    const { h, all } = await readBody(req);
    if (all === 'unused') {
      let list;
      try { list = await db.get('codes'); } catch (e) { return send(res, 500, { error: 'server error' }); }
      let n = 0;
      for (const [k, v] of Object.entries(list || {})) {
        if (!v.device) { try { await db.del('codes/' + k); n++; } catch (e) {} }
      }
      return send(res, 200, { removed: n });
    }
    if (!h || !/^[a-f0-9]{64}$/.test(h)) return send(res, 400, { error: 'bad key' });
    try { await db.del('codes/' + h); } catch (e) { return send(res, 500, { error: 'server error' }); }
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PATCH') {
    const { h, revoked, reset } = await readBody(req);
    if (!h || !/^[a-f0-9]{64}$/.test(h)) return send(res, 400, { error: 'bad key' });
    const patch = {};
    if (typeof revoked === 'boolean') patch.revoked = revoked;
    if (reset) { patch.device = null; patch.usedAt = 0; }
    if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });
    try { await db.patch('codes/' + h, patch); } catch (e) { return send(res, 500, { error: 'server error' }); }
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'method' });
}
