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

function parseDuration(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === 'lifetime' || v === 0 || v === '0') return 0;
  let n;
  if (typeof v === 'number') n = v;
  else {
    const s = String(v).trim().toLowerCase();
    const m = s.match(/^([0-9]+)\s*(d|days?|w|weeks?|m|months?|y|years?)?$/);
    if (!m) return null;
    n = parseInt(m[1], 10);
    const u = m[2] || 'd';
    if (u.startsWith('w')) n *= 7;
    else if (u.startsWith('m')) n *= 30;
    else if (u.startsWith('y')) n *= 365;
  }
  if (!Number.isFinite(n) || n < 0 || n > 3650) return null;
  return n;
}

function validHwid(h) {
  return /^[a-f0-9]{32,96}$/.test(String(h || '').toLowerCase());
}

function cleanReason(v) {
  return String(v || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 256);
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
    invitedTo: '',
    // r6 only: how long is left, so the panel can show "7d left" / "expired" / "lifetime"
    // without the client needing to know the schema.
    durationDays: Number(c.duration_days) || 0,
    expiresAt: Number(c.expires_at) || 0,
    hwid: String(c.hwid || '')
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

  // ── bans sub-route ────────────────────────────────────────────────────
  // Lives under /api/keys to keep the Vercel Hobby function count at 12.
  // Admin-only on every verb: resellers never need to see or touch bans.
  const bodyKind = req.method === 'GET'
    ? (req.query && req.query.kind)
    : null;
  const needsBody = req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE';
  let parsedBody = null;
  async function body() {
    if (parsedBody === null) parsedBody = await readBody(req);
    return parsedBody;
  }
  const kind = bodyKind || (needsBody ? ((await body()).kind) : null);
  if (kind === 'bans') {
    if (!isAdmin) return send(res, 403, { error: 'admin only' });
    if (!r6Configured()) return send(res, 503, { error: 'r6 key store not configured' });

    if (req.method === 'GET') {
      let all;
      try { all = await r6db.get('bans'); } catch (e) { return send(res, 500, { error: 'server error' }); }
      const rows = Object.entries(all || {})
        .map(([hwid, v]) => v ? { hwid, at: Number(v.at) || 0, reason: String(v.reason || '') } : null)
        .filter(Boolean)
        .sort((a, b) => b.at - a.at);
      return send(res, 200, { bans: rows });
    }

    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;
      const b = await body();
      const hwid = String(b.hwid || '').toLowerCase();
      if (!validHwid(hwid)) return send(res, 400, { error: 'bad hwid' });
      const reason = cleanReason(b.reason) || 'manual';
      try {
        await r6db.put('bans/' + hwid, { at: Math.floor(Date.now() / 1000), reason });
      } catch (e) { return send(res, 500, { error: 'server error' }); }
      await audit(acc, 'ban.add', hwid.slice(0, 16) + (reason ? ' (' + reason + ')' : ''), req);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (!requireSameOrigin(req, res)) return;
      const b = await body();
      const hwid = String(b.hwid || '').toLowerCase();
      if (!validHwid(hwid)) return send(res, 400, { error: 'bad hwid' });
      try { await r6db.del('bans/' + hwid); } catch (e) { return send(res, 500, { error: 'server error' }); }
      await audit(acc, 'ban.remove', hwid.slice(0, 16), req);
      return send(res, 200, { ok: true });
    }

    res.setHeader('allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'method' });
  }

  // ── logs sub-route ────────────────────────────────────────────────────
  // Admin-only. Reads session logs out of github.com/wowksies/KAYAZ under
  // logs/<key_id>/<host_hwid8>/<session_name> (the Cloudflare Worker puts
  // them there, authenticated by the EXT's ECDSA token -- see
  // needed/Worker/src/index.ts /v1/upload-log).
  //
  //   GET /api/keys?kind=logs                      -> every key_id folder
  //   GET /api/keys?kind=logs&key_id=<hex>         -> the sessions under it
  //   GET /api/keys?kind=logs&path=<repo-path>     -> that one log's bytes
  //
  // Needs the Vercel env GITHUB_LOGS_PAT (same PAT the Worker uses).
  if (kind === 'logs') {
    if (!isAdmin) return send(res, 403, { error: 'admin only' });
    if (req.method !== 'GET') { res.setHeader('allow', 'GET'); return send(res, 405, { error: 'method' }); }
    const pat = process.env.GITHUB_LOGS_PAT || '';
    if (!pat) return send(res, 503, { error: 'logs not configured (GITHUB_LOGS_PAT missing)' });

    const gh = async (p) => {
      const r = await fetch('https://api.github.com/repos/wowksies/KAYAZ/contents/' + p, {
        headers: {
          authorization: 'Bearer ' + pat,
          accept: 'application/vnd.github+json',
          'user-agent': 'kayaz-panel',
        },
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('github ' + r.status);
      return r.json();
    };
    const safePath = (p) => {
      // Only allow paths under logs/, no .. segments, printable chars.
      const s = String(p || '');
      if (!/^logs\/[A-Za-z0-9._\/-]{1,200}$/.test(s)) return null;
      if (s.includes('..')) return null;
      return s;
    };

    const q = req.query || {};
    try {
      // Single file content
      if (q.path) {
        const p = safePath(q.path);
        if (!p) return send(res, 400, { error: 'bad path' });
        const j = await gh(p);
        if (!j || Array.isArray(j)) return send(res, 404, { error: 'not found' });
        // size cap so a huge file cannot blow the response: 1 MB rendered.
        const bytes = Number(j.size) || 0;
        if (bytes > 1_500_000) {
          return send(res, 413, { error: 'log too large to view in panel (' + bytes + ' bytes)' });
        }
        const text = Buffer.from(String(j.content || ''), 'base64').toString('utf8');
        return send(res, 200, { path: p, size: bytes, text });
      }

      // One key_id's sessions
      if (q.key_id) {
        const kid = String(q.key_id).toLowerCase();
        if (!/^[a-f0-9]{8,16}$/.test(kid)) return send(res, 400, { error: 'bad key_id' });
        const machines = await gh('logs/' + kid);
        if (!Array.isArray(machines)) return send(res, 200, { key_id: kid, machines: [] });
        const out = [];
        for (const m of machines) {
          if (m.type !== 'dir') continue;
          const sessions = await gh('logs/' + kid + '/' + m.name);
          if (!Array.isArray(sessions)) continue;
          out.push({
            machine: m.name,
            sessions: sessions
              .filter(s => s.type === 'file')
              .map(s => ({ name: s.name, size: s.size, path: s.path, sha: s.sha }))
              .sort((a, b) => b.name.localeCompare(a.name)),
          });
        }
        return send(res, 200, { key_id: kid, machines: out });
      }

      // The top-level listing: every key_id folder + a count of sessions.
      const kids = await gh('logs');
      if (!Array.isArray(kids)) return send(res, 200, { keys: [] });
      const rows = [];
      for (const d of kids) {
        if (d.type !== 'dir') continue;
        let sessions = 0, machines = [];
        try {
          const ms = await gh('logs/' + d.name);
          if (Array.isArray(ms)) {
            for (const m of ms) {
              if (m.type !== 'dir') continue;
              machines.push(m.name);
              const ss = await gh('logs/' + d.name + '/' + m.name);
              if (Array.isArray(ss)) sessions += ss.filter(s => s.type === 'file').length;
            }
          }
        } catch (e) {}
        rows.push({ key_id: d.name, machines, sessions });
      }
      rows.sort((a, b) => a.key_id.localeCompare(b.key_id));
      return send(res, 200, { keys: rows });
    } catch (e) {
      return send(res, 502, { error: 'github: ' + String(e.message || e) });
    }
  }

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

    const bod = parsedBody || await readBody(req);
    const target = pickTarget(bod.target);
    if (!target) return send(res, 400, { error: 'bad target' });
    if (target === 'r6' && !r6Configured()) return send(res, 503, { error: 'r6 key store not configured' });

    let n = Math.min(Math.max(parseInt(bod.count, 10) || 1, 1), isAdmin ? 50 : 20);
    const label = cleanLabel(bod.label);
    // Duration: only honoured for r6 (site keys have no expiry). null = lifetime.
    // Resellers get the same choices as admins; the quota check below still
    // caps their total key count.
    const durationDays = target === 'r6' ? parseDuration(bod.duration) : null;
    if (target === 'r6' && bod.duration !== undefined && bod.duration !== '' && durationDays === null)
      return send(res, 400, { error: 'bad duration' });

    let owner = acc.id;
    let ownerName = acc.user;

    if (isAdmin && bod.owner) {
      const targetAcc = await getAccount(String(bod.owner));
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
          // expires_at is seconds-since-epoch (matches how the Worker reads
          // it; needed/Worker/src/index.ts treats 0/missing/empty as
          // lifetime). duration_days is kept purely for the panel's UI.
          const d = durationDays === null ? 0 : durationDays;
          const exp = d > 0 ? Math.floor(Date.now() / 1000) + d * 86400 : 0;
          await store.put(node + '/' + h, {
            created: Date.now(),
            label: 'KAYAZ R6',
            memo: enc(label),
            shown: '••••-' + code.slice(-4),
            tier: 'panel',
            duration_days: d,
            expires_at: exp,
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

    const bod = parsedBody || await readBody(req);
    const { h, revoked, reset, duration, banHwid, target: rawTarget } = bod;
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

    // Shortcut: ban the key's bound HWID straight from the key row. Admin
    // only; needs an actual bound hwid.
    if (banHwid) {
      if (!isAdmin) return send(res, 403, { error: 'admin only' });
      if (target !== 'r6') return send(res, 400, { error: 'ban only for r6' });
      const hwid = String(rec.hwid || '').toLowerCase();
      if (!validHwid(hwid)) return send(res, 400, { error: 'key is not bound' });
      const reason = cleanReason(bod.banReason) || ('key ' + h.slice(0, 12));
      try {
        await r6db.put('bans/' + hwid, { at: Math.floor(Date.now() / 1000), reason });
      } catch (e) { return send(res, 500, { error: 'server error' }); }
      await audit(acc, 'ban.add', hwid.slice(0, 16) + ' (from key ' + h.slice(0, 12) + ')', req);
      return send(res, 200, { ok: true, banned: hwid });
    }

    const patch = {};
    if (target === 'r6') {
      if (typeof revoked === 'boolean') {
        patch.disabled = revoked;
        patch.active = !revoked;
      }
      if (reset) patch.hwid = '';
      if (duration !== undefined && duration !== '') {
        const d = parseDuration(duration);
        if (d === null) return send(res, 400, { error: 'bad duration' });
        patch.duration_days = d;
        patch.expires_at = d > 0 ? Math.floor(Date.now() / 1000) + d * 86400 : 0;
      }
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
    const act = patch.expires_at !== undefined
      ? 'key.duration'
      : (patch.revoked === undefined && patch.disabled === undefined
          ? 'key.unbind'
          : (revoked ? 'key.revoke' : 'key.restore'));
    await audit(acc, act, target + ':' + h.slice(0, 12), req);
    return send(res, 200, { ok: true, target });
  }

  if (req.method === 'DELETE') {
    if (!requireSameOrigin(req, res)) return;

    const body = parsedBody || await readBody(req);
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
