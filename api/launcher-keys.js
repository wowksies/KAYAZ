import { r6db, requireAdmin, readBody, send, guardConfig, guardR6, rateLimit } from './_lib.js';

// Admin surface for the R6 launcher key store: the same records the client
// validates against, so revoking here takes effect on the buyer's next launch.
// Also owns the hardware ban list the launcher checks before it even looks at
// a key.
//
// Everything is behind requireAdmin; the R6 database is never touched from the
// browser.

const HEX64 = /^[a-f0-9]{64}$/;

function shape(h, v) {
  return {
    h,
    label: v.label || '',
    tier: v.tier || '',
    order: v.order || '',
    email: v.email || '',
    days: v.duration_days || 0,
    expiresAt: v.expires_at || 0,
    disabled: v.disabled === true || v.disabled === 'true',
    hwid: v.hwid || '',
    bound: Boolean(v.hwid),
    created: v.created || 0
  };
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (guardR6(res)) return;
  if (!rateLimit(req, res, 'launcher-keys', 60, 60000)) return;
  if (!requireAdmin(req)) return send(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET') {
    let keys, bans;
    try {
      keys = await r6db.get('keys');
      bans = await r6db.get('bans');
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    const list = Object.entries(keys || {})
      .map(([h, v]) => shape(h, v || {}))
      .sort((a, b) => b.created - a.created)
      .slice(0, 500);
    const banList = Object.entries(bans || {}).map(([hwid, v]) => ({
      hwid,
      reason: (v && v.reason) || '',
      at: (v && v.at) || 0
    }));
    return send(res, 200, { keys: list, bans: banList });
  }

  if (req.method === 'PATCH') {
    const { h, disabled, reset } = await readBody(req);
    if (!HEX64.test(String(h || ''))) return send(res, 400, { error: 'bad key' });
    const patch = {};
    if (typeof disabled === 'boolean') {
      patch.disabled = disabled;
      patch.active = !disabled;
    }
    if (reset) patch.hwid = '';
    if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });
    try {
      await r6db.patch('keys/' + h, patch);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    return send(res, 200, { ok: true });
  }

  // Ban / unban a machine fingerprint. The launcher checks bans/<hwid> before
  // it even reads the key record.
  if (req.method === 'POST') {
    const { hwid, banned, reason } = await readBody(req);
    const id = String(hwid || '').trim().slice(0, 128);
    if (!id) return send(res, 400, { error: 'bad hwid' });
    try {
      if (banned === false) await r6db.del('bans/' + id);
      else await r6db.put('bans/' + id, { at: Date.now(), reason: String(reason || '').slice(0, 120) });
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    const { h, all } = await readBody(req);
    if (all === 'expired') {
      let list;
      try {
        list = await r6db.get('keys');
      } catch (e) {
        return send(res, 500, { error: 'server error' });
      }
      const now = Math.floor(Date.now() / 1000);
      let removed = 0;
      for (const [k, v] of Object.entries(list || {})) {
        const exp = parseInt(v && v.expires_at, 10) || 0;
        if (exp && exp < now) {
          try {
            await r6db.del('keys/' + k);
            removed++;
          } catch (e) {}
        }
      }
      return send(res, 200, { removed });
    }
    if (!HEX64.test(String(h || ''))) return send(res, 400, { error: 'bad key' });
    try {
      await r6db.del('keys/' + h);
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'method' });
}
