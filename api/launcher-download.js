import { r6db, verifySession, guardConfig, guardR6, send, rateLimit } from './_lib.js';
import { resolveDownloadUrl } from './_launcher.js';

// GET /api/launcher-download?t=<token>
//
// The only way to reach the build. The token is minted by /api/launcher after
// the order or key checks out, lasts an hour, and is re-checked here against
// the live key record so revoking a key also kills a link already handed out.
//
// The file itself is never proxied: this answers 302 to a storage URL that
// expires on its own, so a 7 MB binary never has to squeeze through a
// function's response limit.

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  if (guardR6(res)) return;
  if (!rateLimit(req, res, 'launcher-dl', 40, 60000)) return;

  const query = (req.query && req.query.t) || new URL(req.url || '/', 'http://localhost').searchParams.get('t');
  const session = verifySession(String(query || ''));
  if (!session || session.t !== 'l' || !session.h) {
    return send(res, 403, { error: 'this download link expired. open the launcher page again.' });
  }

  try {
    const rec = await r6db.get('keys/' + session.h);
    if (!rec) return send(res, 403, { error: 'this key is no longer valid' });
    if (rec.disabled === true || rec.disabled === 'true') return send(res, 403, { error: 'this key was disabled' });
    const exp = parseInt(rec.expires_at, 10) || 0;
    if (exp && Math.floor(Date.now() / 1000) > exp) return send(res, 403, { error: 'this key expired' });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  let target;
  try {
    target = await resolveDownloadUrl();
  } catch (e) {
    return send(res, 502, { error: 'could not reach storage, try again shortly' });
  }
  if (!target || !target.url) return send(res, 503, { error: 'download not configured' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.writeHead(302, { Location: target.url });
  res.end();
}
