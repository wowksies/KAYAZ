import crypto from 'node:crypto';
import { db, r6db, guardConfig, guardR6, rawBody, send, sha256, makeLauncherKey } from './_lib.js';

// SellAuth order webhook -> mint a KAYAZ R6 launcher key.
//
// Point a webhook at POST /api/sellauth for the order.completed event (and
// order.paid if you want the key to exist the moment payment lands). The
// signature is verified over the exact request bytes before anything is
// parsed, the delivery id is recorded once so retries cannot mint two keys,
// and the order is then written to both databases: the key itself into the R6
// launcher store the client reads, and a copy of the order into the storefront
// db so the /launcher page can hand the buyer their key back later.
//
// Env:
//   SELLAUTH_WEBHOOK_SECRET  the signing secret from storefront > developers
//   SELLAUTH_API_KEY         optional, used only to fill in a missing email
//   THREEDAYID / SEVENDAYID / ONEMONTHID / SEASONALID   product or variant ids
//   SEASONAL_DAYS            length of the seasonal term, default 90

const TERM_DAYS = { threeDays: 3, sevenDays: 7, oneMonth: 30 };
const TERM_LABEL = { threeDays: '3 Days', sevenDays: '7 Days', oneMonth: '1 Month', seasonal: 'Seasonal' };

function secretKeys(secret) {
  const out = [];
  const stripped = secret.replace(/^whsec_/, '');
  const decoded = Buffer.from(stripped, 'base64');
  if (decoded.length) out.push(decoded);
  if (!decoded.length || decoded.toString('base64').replace(/=+$/, '') !== stripped.replace(/=+$/, '')) {
    out.push(Buffer.from(secret, 'utf8'));
  }
  return out;
}

function timingEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Standard Webhooks (webhook-id / webhook-timestamp / webhook-signature) plus
// the legacy hex Signature header, both against the raw body.
export function verifySellauth(req, raw) {
  const secret = process.env.SELLAUTH_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const headers = req.headers || {};
  const legacy = String(headers.signature || '');
  const sigHeader = String(headers['webhook-signature'] || '');
  const id = String(headers['webhook-id'] || '');
  const ts = String(headers['webhook-timestamp'] || '');

  for (const key of secretKeys(secret)) {
    if (legacy) {
      const want = crypto.createHmac('sha256', key).update(raw).digest('hex');
      if (timingEqual(Buffer.from(legacy, 'hex'), Buffer.from(want, 'hex'))) return true;
    }
    if (sigHeader && id && ts) {
      const signed = Buffer.concat([Buffer.from(`${id}.${ts}.`), raw]);
      const want = crypto.createHmac('sha256', key).update(signed).digest('base64');
      for (const part of sigHeader.split(' ')) {
        const [version, value] = part.split(',');
        if (version === 'v1' && value) {
          if (timingEqual(Buffer.from(value, 'base64'), Buffer.from(want, 'base64'))) return true;
        }
      }
    }
  }
  return false;
}

function pickEmail(payload) {
  const d = payload.data || {};
  const ci = d.customer_information || {};
  const candidates = [
    ci.email,
    ci.customer && ci.customer.email,
    d.email,
    d.customer && d.customer.email,
    d.customer_email
  ];
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v.includes('@')) return v.toLowerCase();
  }
  return '';
}

function pickItems(payload) {
  const d = payload.data || {};
  const list = d.line_items || d.items || d.products || [];
  return Array.isArray(list) ? list : [];
}

function idSet(...values) {
  const out = new Set();
  for (const v of values) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

// Match the purchased line item to a term by id first (the ids already used by
// the storefront) and by title second, so a renamed product still lands.
function termFor(items) {
  const env = process.env;
  const seasonalDays = Math.max(1, parseInt(env.SEASONAL_DAYS, 10) || 90);
  const byId = [
    { key: 'threeDays', ids: idSet(env.THREEDAYID) },
    { key: 'sevenDays', ids: idSet(env.SEVENDAYID) },
    { key: 'oneMonth', ids: idSet(env.ONEMONTHID) },
    { key: 'seasonal', ids: idSet(env.SEASONALID) }
  ];

  for (const item of items) {
    const ids = idSet(item.product_id, item.productId, item.product_variant_id, item.variantId, item.variant_id);
    for (const term of byId) {
      for (const id of ids) {
        if (term.ids.has(id)) return { key: term.key, days: termDays(term.key, seasonalDays) };
      }
    }
  }

  const title = items.map(i => `${i.product_title || i.title || ''} ${i.variant_title || ''}`).join(' ').toLowerCase();
  // Nothing matched. Grant the shortest term rather than the longest: over
  // granting on a parse failure is a straight revenue leak, under granting is
  // something the admin can see (guess is stored) and fix by hand.
  if (!title) return { key: 'threeDays', days: TERM_DAYS.threeDays, guess: true };
  if (/(season|lifetime|perm)/.test(title)) return { key: 'seasonal', days: seasonalDays };
  if (/(3\s*day|three\s*day)/.test(title)) return { key: 'threeDays', days: TERM_DAYS.threeDays };
  if (/(7\s*day|seven\s*day|week)/.test(title)) return { key: 'sevenDays', days: TERM_DAYS.sevenDays };
  if (/(month|30\s*day|28\s*day)/.test(title)) return { key: 'oneMonth', days: TERM_DAYS.oneMonth };
  return { key: 'threeDays', days: TERM_DAYS.threeDays, guess: true };
}

function termDays(key, seasonalDays) {
  return key === 'seasonal' ? seasonalDays : TERM_DAYS[key];
}

// Best effort: only used when the payload did not carry an email or any line
// items, which the current order events do include.
async function fetchOrder(orderId) {
  const apiKey = process.env.SELLAUTH_API_KEY || '';
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
  if (process.env.X_STORE || process.env.SHOP_SLUG) headers['X-STORE'] = process.env.X_STORE || process.env.SHOP_SLUG;
  try {
    const res = await fetch(`https://sell.app/api/v2/orders/${encodeURIComponent(orderId)}`, { headers });
    if (!res.ok) return null;
    const body = await res.json();
    const d = body.data || body;
    return {
      email: String((d.customer && d.customer.email) || d.email || '').toLowerCase(),
      items: Array.isArray(d.line_items) ? d.line_items : []
    };
  } catch (e) {
    return null;
  }
}

async function fulfil(payload) {
  const data = payload.data || {};
  const orderId = String(data.id || data.order_id || '').replace(/\D/g, '');
  if (!orderId) return { skipped: 'no order id' };

  // Reusing the stored order keeps order.paid -> order.completed from minting
  // a second key, and keeps webhook retries idempotent.
  const existing = await db.get('orders/' + orderId);
  if (existing && existing.key) return { orderId, reused: true };

  let email = pickEmail(payload);
  let items = pickItems(payload);
  if (!email || !items.length) {
    const detail = await fetchOrder(orderId);
    if (detail) {
      email = email || detail.email;
      if (!items.length) items = detail.items;
    }
  }

  const term = termFor(items);
  const key = makeLauncherKey();
  const hash = sha256(key);
  const now = Date.now();
  const expiresAt = Math.floor(now / 1000) + term.days * 86400;
  const title = items.map(i => i.product_title || i.title || '').filter(Boolean).join(', ').slice(0, 80);

  // The shape the launcher reads: keys/<sha256(key)> -> { disabled, expires_at, hwid }.
  // hwid stays empty so the first machine to redeem the key binds to it.
  await r6db.put('keys/' + hash, {
    created: now,
    label: TERM_LABEL[term.key] || '',
    tier: term.key,
    duration_days: term.days,
    expires_at: expiresAt,
    disabled: false,
    active: true,
    hwid: '',
    order: orderId,
    email: email || ''
  });

  await db.put('orders/' + orderId, {
    created: now,
    event: payload.event || '',
    email: email || '',
    key,
    hash,
    term: term.key,
    days: term.days,
    expiresAt,
    product: title,
    status: 'active',
    guess: Boolean(term.guess)
  });

  return { orderId, term: term.key, days: term.days };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  if (guardR6(res)) return;

  if (!process.env.SELLAUTH_WEBHOOK_SECRET) {
    return send(res, 503, { error: 'webhook secret not configured' });
  }

  const raw = await rawBody(req);
  if (!verifySellauth(req, raw)) return send(res, 401, { error: 'bad signature' });

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return send(res, 400, { error: 'bad json' });
  }

  const eventId = String(payload.id || '');
  if (!eventId) return send(res, 400, { error: 'missing event id' });

  // Record the delivery before doing any work, so a crash or a retry can never
  // be mistaken for a fresh event.
  const seen = await db.get('hooks/' + eventId);
  if (seen) return send(res, 200, { ok: true, duplicate: true });
  await db.put('hooks/' + eventId, { at: Date.now(), event: String(payload.event || '') });

  const event = String(payload.event || '');
  if (event === 'order.completed' || event === 'order.paid') {
    try {
      const result = await fulfil(payload);
      await db.patch('hooks/' + eventId, { done: true, result: JSON.stringify(result) });
    } catch (e) {
      // Keep the 2xx: the inbox row is stored, so this can be replayed by hand.
      await db.patch('hooks/' + eventId, { done: false, error: String((e && e.message) || e) });
    }
  }

  return send(res, 200, { ok: true });
}
