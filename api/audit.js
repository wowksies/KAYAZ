import { requirePanel, send, guardConfig, rateLimit, db, dec } from './_lib.js';

// Admin-only audit trail: who did what, newest first. The trail never contains
// passwords, codes, hashes or session tokens.
export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'audit', 40, 60000)) return;

  const me = await requirePanel(req, res, ['admin']);
  if (!me) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });

  let all;
  try {
    all = (await db.get('audit')) || {};
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  const events = Object.keys(all)
    .sort()
    .reverse()
    .slice(0, 150)
    .map(id => {
      const r = all[id] || {};
      return {
        id,
        at: Number(r.at) || 0,
        who: dec(r.who) || 'system',
        action: String(r.action || ''),
        target: dec(r.target) || '',
        ip: String(r.ip || '')
      };
    });

  return send(res, 200, { events });
}
