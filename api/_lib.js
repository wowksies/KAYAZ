import crypto from 'node:crypto';

const DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
const DB_SECRET = process.env.FIREBASE_DB_SECRET || '';
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
