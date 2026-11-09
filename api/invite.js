import {
  db, sha256, normCode, makeCode, activeCodeUser, readBody, send, guardConfig, rateLimit, enc, dec
} from './_lib.js';

function cleanName(n) {
  return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'invite', 30, 60000)) return;
  res.setHeader('cache-control', 'no-store');

  let auth;
  try {
    auth = await activeCodeUser(req);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  if (!auth) return send(res, 401, { error: 'unauthorized' });

  const parentH = auth.s.c;
  const parent = auth.rec;

  if (req.method === 'GET') {
    const inv = parent.invited || null;
    return send(res, 200, { invited: inv ? { name: dec(inv.name), code: dec(inv.code) } : null });
  }

  if (req.method === 'POST') {
    if (parent.invited) {
      return send(res, 409, {
        error: 'you already invited someone',
        invited: { name: dec(parent.invited.name), code: dec(parent.invited.code) }
      });
    }
    const body = await readBody(req);
    const name = cleanName(body.name);
    if (name.length < 2) return send(res, 400, { error: 'enter their name' });

    const code = makeCode();
    const childH = sha256(normCode(code));
    try {
      const clash = await db.get('codes/' + childH);
      if (clash) return send(res, 500, { error: 'please try again' });
      await db.put('codes/' + childH, {
        created: Date.now(),
        label: enc('invite: ' + name),
        shown: code.slice(0, 4) + '••••',
        device: null,
        revoked: false,
        invitedName: enc(name),
        parentH: parentH
      });
      await db.patch('codes/' + parentH, {
        invited: { name: enc(name), code: enc(code), h: childH, at: Date.now() }
      });
    } catch (e) {
      return send(res, 500, { error: 'server error' });
    }
    return send(res, 200, { invited: { name: name, code: code } });
  }

  res.setHeader('allow', 'GET, POST');
  return send(res, 405, { error: 'method' });
}
