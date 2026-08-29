import { db, requireAdmin, requireUser, readBody, send, guardConfig } from './_lib.js';

function clean(g) {
  const s = v => String(v || '').slice(0, 400);
  const title = s(g.title).trim();
  const url = s(g.url).trim();
  if (!title || !/^https?:\/\//i.test(url)) return null;
  const img = s(g.img).trim();
  return {
    title,
    url,
    cat: (s(g.cat).trim() || 'Game').slice(0, 40),
    img: /^(https?:\/\/|data:image\/)/i.test(img) ? img.slice(0, 400000) : '',
    kb: Boolean(g.kb),
    created: Date.now()
  };
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;

  if (req.method === 'GET') {
    if (!requireUser(req)) return send(res, 401, { error: 'unauthorized' });
    let all;
    try { all = await db.get('games'); } catch (e) { return send(res, 500, { error: 'server error' }); }
    const list = Object.entries(all || {}).map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return send(res, 200, { games: list });
  }

  if (!requireAdmin(req)) return send(res, 401, { error: 'unauthorized' });

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (Array.isArray(body.bulk)) {
      const items = body.bulk.map(clean).filter(Boolean).slice(0, 400);
      let n = 0;
      for (const it of items) { try { await db.push('games', it); n++; } catch (e) {} }
      return send(res, 200, { added: n });
    }
    const g = clean(body);
    if (!g) return send(res, 400, { error: 'title and a valid http(s) url are required' });
    let r;
    try { r = await db.push('games', g); } catch (e) { return send(res, 500, { error: 'server error' }); }
    return send(res, 200, { id: r && r.name, game: g });
  }

  if (req.method === 'DELETE') {
    const { id } = await readBody(req);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return send(res, 400, { error: 'bad id' });
    try { await db.del('games/' + id); } catch (e) { return send(res, 500, { error: 'server error' }); }
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'method' });
}
