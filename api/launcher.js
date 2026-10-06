import { db, r6db, guardConfig, guardR6, sha256, signSession, readBody, send, rateLimit } from './_lib.js';
import { launcherConfigured } from './_launcher.js';

// The page behind the SellAuth post-purchase redirect.
//
// The buyer arrives at /launcher?order=<id>&email=<email> and this endpoint
// answers with their key and a short-lived download link. Two ways in:
//
//   { order, email }  the redirect URL. Both must match the stored order, so
//                     guessing an order number is not enough on its own.
//   { key }           a buyer who lost the link pastes the key instead. The key
//                     is its own credential, which is the whole point of it.
//
// Nothing here ever returns the Firebase URL or secret; those live only in the
// function environment and are used by the server on the buyer's behalf.

const DOWNLOAD_TTL_HOURS = 1;
const TERM_LABEL = { threeDays: '3 Days', sevenDays: '7 Days', oneMonth: '1 Month', seasonal: 'Seasonal' };

function keyCandidates(literal) {
  const trimmed = String(literal || '').trim();
  const out = [];
  if (trimmed) out.push(trimmed);
  const upper = trimmed.toUpperCase();
  if (upper && upper !== trimmed) out.push(upper);
  return out;
}

// The launcher reads keys/<sha256(literal)> plus { disabled, expires_at, hwid }.
async function loadKey(hash) {
  const rec = await r6db.get('keys/' + hash);
  return rec && typeof rec === 'object' ? rec : null;
}

function checkKey(rec) {
  if (!rec) return 'key not found';
  if (rec.disabled === true || rec.disabled === 'true') return 'this key was disabled';
  if (rec.active === false) return 'this key is not active';
  const exp = parseInt(rec.expires_at, 10) || 0;
  if (exp && Math.floor(Date.now() / 1000) > exp) return 'this key expired';
  return '';
}

function okResponse(res, { key, hash, rec, term, days, expiresAt, email }) {
  const token = signSession({ t: 'l', h: hash }, DOWNLOAD_TTL_HOURS / 24);
  // Send the friendly label, the raw key is kept alongside for the dashboard.
  const termKey = term || (rec && rec.tier) || '';
  return send(res, 200, {
    ok: true,
    key: key || '',
    term: TERM_LABEL[termKey] || termKey,
    termKey,
    days: days || (rec && rec.duration_days) || 0,
    expiresAt: expiresAt || (rec && parseInt(rec.expires_at, 10)) || 0,
    bound: Boolean(rec && rec.hwid),
    email: email || '',
    download: '/api/launcher-download?t=' + encodeURIComponent(token),
    downloadExpiresIn: DOWNLOAD_TTL_HOURS * 3600
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  if (guardR6(res)) return;
  if (!launcherConfigured()) return send(res, 503, { error: 'launcher download not configured' });
  if (!rateLimit(req, res, 'launcher', 30, 600000)) return;

  const { order, email, key } = await readBody(req);

  // ---- path 1: a key the buyer already has -------------------------------
  if (key) {
    for (const literal of keyCandidates(key)) {
      const hash = sha256(literal);
      let rec;
      try {
        rec = await loadKey(hash);
      } catch (e) {
        return send(res, 500, { error: 'server error' });
      }
      if (!rec) continue;
      // The record exists, so say why it will not work rather than claiming
      // the key is unknown.
      const problem = checkKey(rec);
      if (problem) return send(res, 403, { error: problem });
      return okResponse(res, { key: literal, hash, rec });
    }
    return send(res, 404, { error: 'that key is not valid' });
  }

  // ---- path 2: the post-purchase redirect --------------------------------
  const orderId = String(order || '').replace(/\D/g, '');
  const emailIn = String(email || '').trim().toLowerCase();
  if (!orderId) return send(res, 400, { error: 'missing order' });

  let record;
  try {
    record = await db.get('orders/' + orderId);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  if (!record || !record.key) {
    return send(res, 404, { error: 'we have no launcher for that order yet, give it a minute and reload' });
  }

  // The order's email is the second factor on this path. When the webhook
  // could not read one, fall back to asking for the key rather than letting an
  // order number alone through.
  if (record.email) {
    if (!emailIn || emailIn !== String(record.email).toLowerCase()) {
      return send(res, 403, { error: 'that email does not match this order. enter your key instead.' });
    }
  } else if (!emailIn) {
    return send(res, 403, { error: 'enter the key from your purchase email' });
  }

  let rec = null;
  try {
    rec = await loadKey(record.hash);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  const problem = checkKey(rec);
  if (problem) return send(res, 403, { error: problem });

  return okResponse(res, {
    key: record.key,
    hash: record.hash,
    rec,
    term: record.term,
    days: record.days,
    expiresAt: record.expiresAt,
    email: record.email
  });
}
