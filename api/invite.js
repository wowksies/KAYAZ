import { db, sha256, normCode, makeCode, requireUser, readBody, send, guardConfig } from './_lib.js';

// A redeemed user may invite exactly one person, and must name them.
// The invite is a normal code (redeems on one browser) whose record remembers who
// it was made for and which code made it. The full invite code is stored on the
// parent record so the inviter can reopen the popup and copy it again; it is only
// ever returned to the session that owns the parent code.

function cleanName(n) {
  return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export default async function handler(req, res) {
  if (guardConfig(res)) return;
  res.setHeader('cache-control', 'no-store');

  const s = requireUser(req);
  if (!s || s.t !== 'u' || !/^[a-f0-9]{64}$/.test(String(s.c || ''))) {
    return send(res, 401, { error: 'unauthorized' });
  }
  const parentH = s.c;

  let parent;
  try { parent = await db.get('codes/' + parentH); } catch (e) { return send(res, 500, { error: 'server error' }); }
  if (!parent || parent.revoked) return send(res, 403, { error: 'your access is not active' });

  if (req.method === 'GET') {
    const inv = parent.invited || null;
    return send(res, 200, { invited: inv ? { name: inv.name, code: inv.code } : null });
  }

  if (req.method === 'POST') {
    if (parent.invited) {
      return send(res, 409, { error: 'you already invited someone', invited: { name: parent.invited.name, code: parent.invited.code } });
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
        label: 'invite: ' + name,
        shown: code.slice(0, 4) + '••••',
        device: null,
        revoked: false,
        invitedName: name,
        parentH: parentH
      });
      await db.patch('codes/' + parentH, { invited: { name: name, code: code, h: childH, at: Date.now() } });
    } catch (e) { return send(res, 500, { error: 'server error' }); }
    return send(res, 200, { invited: { name: name, code: code } });
  }

  res.setHeader('allow', 'GET, POST');
  return send(res, 405, { error: 'method' });
}
