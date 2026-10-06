import crypto from 'node:crypto';

// Accept either FIREBASE_DB_URL/FIREBASE_DB_SECRET or the shorter
// FIREBASE_URL/FIREBASE_SECRET names used in the Vercel project env.
const DB_URL = (process.env.FIREBASE_DB_URL || process.env.FIREBASE_URL || '').replace(/\/$/, '');
const DB_SECRET = process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export function configured() {
  return Boolean(DB_URL && DB_SECRET && SESSION_SECRET);
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function normCode(s) {
  return String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(t + '='.repeat((4 - (t.length % 4)) % 4), 'base64');
}

export function signSession(payload, days) {
  const body = { ...payload, exp: Date.now() + (days || 30) * 86400000 };
  const p = b64u(JSON.stringify(body));
  const sig = b64u(crypto.createHmac('sha256', SESSION_SECRET).update(p).digest());
  return p + '.' + sig;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', SESSION_SECRET).update(p).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try { body = JSON.parse(unb64u(p).toString('utf8')); } catch (e) { return null; }
  if (!body || typeof body.exp !== 'number' || Date.now() > body.exp) return null;
  return body;
}

export function checkAdminCreds(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return false;
  const eo = crypto.createHash('sha256').update(e).digest();
  const et = crypto.createHash('sha256').update(ADMIN_EMAIL).digest();
  const po = crypto.createHash('sha256').update(p).digest();
  const pt = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(eo, et) && crypto.timingSafeEqual(po, pt);
}

export function makeCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = n => Array.from(crypto.randomBytes(n)).map(b => alpha[b % alpha.length]).join('');
  return pick(4) + '-' + pick(4) + '-' + pick(4);
}

async function dbFetch(path, opts = {}) {
  if (!configured()) throw new Error('unconfigured');
  const url = `${DB_URL}/${path}.json?auth=${encodeURIComponent(DB_SECRET)}`;
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error('db ' + res.status);
  const txt = await res.text();
  return txt && txt !== 'null' ? JSON.parse(txt) : null;
}

export const db = {
  get: p => dbFetch(p),
  put: (p, v) => dbFetch(p, { method: 'PUT', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  patch: (p, v) => dbFetch(p, { method: 'PATCH', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  push: (p, v) => dbFetch(p, { method: 'POST', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  del: p => dbFetch(p, { method: 'DELETE' })
};

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 8e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Raw request bytes, untouched. Webhook signatures are computed over the exact
// body, so this must never pass through JSON.parse/stringify first.
export function rawBody(req, limit = 2e6) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  if (req.body && typeof req.body === 'object') return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  return new Promise(resolve => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

// ---- the R6 launcher key store ------------------------------------------
// A second, entirely separate Firebase project: the one the KAYAZ R6 launcher
// and its in-game guard read at keys/<sha256(key)>. It is never exposed to the
// browser -- the URL and secret stay in the function environment, and every
// call below happens server side.
//
// Env: R6_Firebase_URL / R6_Firebase_secret (fall back to the upper-case
// spellings, since Vercel passes names through exactly as typed).
const R6_URL = (process.env.R6_Firebase_URL || process.env.R6_FIREBASE_URL || '').replace(/\/$/, '');
const R6_SECRET = process.env.R6_Firebase_secret || process.env.R6_FIREBASE_SECRET || '';

export function r6configured() {
  return Boolean(R6_URL && R6_SECRET);
}

async function r6Fetch(path, opts = {}) {
  if (!r6configured()) throw new Error('r6 unconfigured');
  const url = `${R6_URL}/${path}.json?auth=${encodeURIComponent(R6_SECRET)}`;
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error('r6 ' + res.status);
  const txt = await res.text();
  return txt && txt !== 'null' ? JSON.parse(txt) : null;
}

export const r6db = {
  get: p => r6Fetch(p),
  put: (p, v) => r6Fetch(p, { method: 'PUT', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  patch: (p, v) => r6Fetch(p, { method: 'PATCH', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  del: p => r6Fetch(p, { method: 'DELETE' })
};

export function guardR6(res) {
  if (r6configured()) return false;
  send(res, 503, { error: 'launcher database not configured' });
  return true;
}

// Launcher keys are hashed by the client exactly as the user typed them, so the
// literal string is the credential: keys/<sha256(literal)> has to match. The
// format is fixed-width and upper case to keep that predictable.
export function makeLauncherKey() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = n => Array.from(crypto.randomBytes(n)).map(b => alpha[b % alpha.length]).join('');
  return 'KAYAZ-' + pick(4) + '-' + pick(4) + '-' + pick(4);
}

export function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export function requireAdmin(req) {
  const s = verifySession(bearer(req));
  return s && s.t === 'a' ? s : null;
}

export function requireUser(req) {
  const s = verifySession(bearer(req));
  return s && (s.t === 'u' || s.t === 'a') ? s : null;
}

export function send(res, code, obj) {
  res.status(code).setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}

export function guardConfig(res) {
  if (configured()) return false;
  send(res, 503, { error: 'server not configured' });
  return true;
}

// ---- shared rate limiting -----------------------------------------------
// Best effort fixed window limiter keyed by client ip. Good enough to blunt
// abuse on a small serverless API without pulling in a dependency.
const buckets = new Map();

export function clientIp(req) {
  const h = req.headers || {};
  const fwd = String(h['x-forwarded-for'] || h['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(h['x-real-ip'] || '').trim() || (req.socket && req.socket.remoteAddress) || 'x';
}

// Returns true when the request should be allowed, false when the limit is hit.
export function rateLimit(req, res, name, max, windowMs) {
  const ip = clientIp(req);
  const key = name + '|' + ip;
  const now = Date.now();
  let rec = buckets.get(key);
  if (!rec || now - rec.t > windowMs) { rec = { n: 0, t: now }; buckets.set(key, rec); }
  rec.n++;
  const left = Math.max(0, max - rec.n);
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(left));
  if (rec.n > max) {
    const retry = Math.ceil((rec.t + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(retry));
    send(res, 429, { error: 'too many requests, slow down' });
    return false;
  }
  return true;
}
