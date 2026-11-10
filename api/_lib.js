import crypto from 'node:crypto';

   
                                    
  
                                                                             
                                                                            
  
                                                                                
                                                                               
                                                       
                                                                               
                                                                                
                                                                      
                                                                            
                                                                        
                                                                     
  
                
                                                                               
                                                                               
                                                                            
                                                                             
                                                                      
   

function envFirst(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  const want = names.map(n => n.toLowerCase());
  for (const k of Object.keys(process.env)) {
    if (want.includes(k.toLowerCase()) && process.env[k]) return process.env[k];
  }
  return '';
}

const DB_URL = (process.env.FIREBASE_DB_URL || process.env.FIREBASE_URL || '').replace(/\/$/, '');
const DB_SECRET = process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SECRET || '';
const R6_DB_URL = envFirst('R6_FIREBASE_URL', 'R6_FIREBASE_DB_URL').replace(/\/$/, '');
const R6_DB_SECRET = envFirst('R6_FIREBASE_SECRET', 'R6_FIREBASE_DB_SECRET');
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DATA_KEY = process.env.DATA_KEY || '';
const ADMIN_USER = (process.env.ADMIN_EMAIL || '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export const COOKIE = 'kz_s';
export const DEVICE_COOKIE = 'kz_d';
export const ROLES = ['admin', 'reseller'];
export const PASSWORD_MIN = 12;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const USER_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function configured() {
  return Boolean(DB_URL && DB_SECRET && SESSION_SECRET);
}

export function r6Configured() {
  return Boolean(R6_DB_URL && R6_DB_SECRET);
}

export function r6Status() {
  return { url: Boolean(R6_DB_URL), secret: Boolean(R6_DB_SECRET) };
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function normCode(s) {
  return String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normUser(s) {
  return String(s || '').trim().toLowerCase();
}

export function validUsername(u) {
  return USER_RE.test(String(u || ''));
}

export function validEmail(e) {
  const v = String(e || '');
  return v.length <= 64 && EMAIL_RE.test(v);
}

export function validDiscordId(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}

export function discordLoginEnabled() {
  return process.env.DISCORD_LOGIN === '1';
}

export function discordOwnerId() {
  const id = String(process.env.DISCORD_OWNER_ID || process.env.OWNER_ID || '').trim();
  return validDiscordId(id) ? id : '';
}

                                                                        
export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

                                                                              
                                                                             
                                                         
function material() {
  return DATA_KEY || SESSION_SECRET + '|kayaz';
}

function subkey(label) {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(material(), 'utf8'), Buffer.from('kayaz-v1', 'utf8'), Buffer.from(label, 'utf8'), 32)
  );
}

const K_DATA = subkey('data');

                                                                              
                                                                            
                                                                              
                
export function enc(value) {
  const plain = String(value == null ? '' : value);
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', K_DATA, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'kz1.' + iv.toString('base64url') + '.' + Buffer.concat([ct, c.getAuthTag()]).toString('base64url');
}

export function dec(value) {
  const s = String(value == null ? '' : value);
  if (!s.startsWith('kz1.')) return s;
  const parts = s.split('.');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const buf = Buffer.from(parts[2], 'base64url');
    if (buf.length < 17) return '';
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(0, buf.length - 16);
    const d = crypto.createDecipheriv('aes-256-gcm', K_DATA, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (e) {
    return '';
  }
}

                                                                                
export function userIndex(user) {
  return crypto.createHmac('sha256', K_DATA).update('user|' + normUser(user)).digest('hex');
}

export function emailIndex(email) {
  return crypto.createHmac('sha256', K_DATA).update('email|' + normUser(email)).digest('hex');
}

                                                                             
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password).normalize('NFKC'), salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('hex'), key.toString('hex')].join('$');
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!N || !r || !p) return false;
  if (N < 16384 || N > 1048576 || r < 8 || r > 32 || p < 1 || p > 8) return false;
  let salt, want;
  try { salt = Buffer.from(parts[4], 'hex'); want = Buffer.from(parts[5], 'hex'); } catch (e) { return false; }
  if (!salt.length || salt.length > 64 || want.length < 16 || want.length > 64) return false;
  let got;
  try {
    got = crypto.scryptSync(String(password).normalize('NFKC'), salt, want.length, { N, r, p, maxmem: SCRYPT.maxmem });
  } catch (e) {
    return false;
  }
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

                                                                                
                                 
export const DUMMY_HASH = hashPassword('kayaz-dummy-' + crypto.randomBytes(12).toString('hex'));

                                                                             
export function signSession(payload, days) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + (days || 30) * 86400000 };
  return enc('s1|' + JSON.stringify(body));
}

export async function createPanelSession(acc, name, ver, req) {
  const sid = crypto.randomBytes(18).toString('hex');
  const now = Date.now();
  const exp = now + 7 * 86400000;
  await db.put('sessions/' + sid, {
    u: acc.id,
    v: Number(ver) || 1,
    at: now,
    exp,
    ua: sha256('ua:' + String((req.headers && req.headers['user-agent']) || '').slice(0, 300)).slice(0, 16),
    ip: sha256('ip:' + clientIp(req)).slice(0, 16)
  });
  return signSession({ t: acc.role === 'admin' ? 'a' : 'r', u: acc.id, n: name, v: Number(ver) || 1, sid }, 7);
}

export async function destroyPanelSession(req) {
  const s = verifySession(cookies(req)[COOKIE]);
  if (!s || !s.sid) return;
  try { await db.del('sessions/' + s.sid); } catch (e) {}
}

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function legacyVerify(token) {
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [p, sig] = parts;
  const want = b64u(crypto.createHmac('sha256', SESSION_SECRET).update(p).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const t = p.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(t + '='.repeat((4 - (t.length % 4)) % 4), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

export function verifySession(token) {
  const t = String(token || '');
  if (!t) return null;
  let body = null;
  if (t.startsWith('kz1.')) {
    const raw = dec(t);
    if (raw.startsWith('s1|')) {
      try { body = JSON.parse(raw.slice(3)); } catch (e) { body = null; }
    }
  } else {
                                                                                
                                                 
    body = legacyVerify(t);
  }
  if (!body || typeof body.exp !== 'number' || Date.now() > body.exp) return null;
  return body;
}

export function cookies(req) {
  const out = {};
  const raw = String((req.headers && req.headers.cookie) || '').slice(0, 8192);
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || k.length > 64 || v.length > 4096) return;
    try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
  });
  return out;
}

function isHttps(req) {
  const proto = String((req.headers && req.headers['x-forwarded-proto']) || '').split(',')[0].trim().toLowerCase();
  return proto === 'https' || process.env.VERCEL === '1';
}

                                                                             
                                                                  
export function setSessionCookie(req, res, token, maxAge) {
  const bits = [COOKIE + '=' + token, 'Path=/api', 'HttpOnly', 'SameSite=Strict', 'Max-Age=' + Math.max(0, Math.floor(maxAge))];
  if (isHttps(req)) bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}

export function setDeviceCookie(req, res, token, maxAge) {
  const bits = [DEVICE_COOKIE + '=' + token, 'Path=/api', 'HttpOnly', 'SameSite=Strict', 'Max-Age=' + Math.max(0, Math.floor(maxAge))];
  if (isHttps(req)) bits.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', list.concat(bits.join('; ')));
}

export function trustedDevice(req, acc) {
  const d = verifySession(cookies(req)[DEVICE_COOKIE]);
  if (!d || d.t !== 'd' || d.u !== acc.id) return false;
  return (Number(d.v) || 1) === (Number(acc.ver) || 1);
}

export function clearSessionCookie(req, res) {
  setSessionCookie(req, res, '', 0);
}

                                                                             
export function accountId() {
  return 'a' + crypto.randomBytes(9).toString('hex');
}

export async function getAccounts() {
  return (await db.get('accounts')) || {};
}

export async function getAccount(id) {
  if (!/^a[a-f0-9]{18}$/.test(String(id || ''))) return null;
  const a = await db.get('accounts/' + id);
  return a ? { id, ...a } : null;
}

export async function getAccountByUser(user) {
  const idx = userIndex(user);
  const all = await getAccounts();
  for (const [id, a] of Object.entries(all)) {
    if (a && a.uh === idx) return { id, ...a };
  }
  return null;
}

export async function getAccountByEmail(email) {
  const idx = emailIndex(email);
  const all = await getAccounts();
  for (const [id, a] of Object.entries(all)) {
    if (a && a.eh === idx) return { id, ...a };
  }
  return null;
}

                                                
export async function getAccountByLogin(login) {
  const l = normUser(login);
  if (!l) return null;
  const uh = userIndex(l);
  const eh = emailIndex(l);
  const all = await getAccounts();
  for (const [id, a] of Object.entries(all)) {
    if (!a) continue;
    if (a.uh === uh || (a.eh && a.eh === eh)) return { id, ...a };
  }
  return null;
}

export async function createAccount({ user, email, password, role, quota, by, discordId }) {
  const u = normUser(user);
  const em = normUser(email || '');
  if (!validUsername(u)) throw new Error('username must be 3-32 characters, letters/numbers/._- only');
  if (em && !validEmail(em)) throw new Error('enter a valid email address');
  if (String(password || '').length < PASSWORD_MIN) {
    throw new Error('password must be at least ' + PASSWORD_MIN + ' characters');
  }
  if (String(password || '').length > 200) throw new Error('password must be 200 characters or fewer');
  if (!ROLES.includes(role)) throw new Error('bad role');
  if (discordId && !validDiscordId(discordId)) throw new Error('enter a valid Discord user ID');
  if (await getAccountByUser(u)) throw new Error('that username is taken');
  if (em && await getAccountByEmail(em)) throw new Error('that email is already in use');

  const id = accountId();
  const rec = {
    user: enc(u),
    uh: userIndex(u),
    role,
    pass: hashPassword(password),
    quota: Math.max(0, Math.min(100000, parseInt(quota, 10) || 0)),
    created: Date.now(),
    ver: 1,
    disabled: false,
    by: String(by || '').slice(0, 40)
  };
  if (em) {
    rec.email = enc(em);
    rec.eh = emailIndex(em);
  }
  if (discordId) rec.discordId = String(discordId);
  await db.put('accounts/' + id, rec);
  return { id, ...rec };
}

                                                                              
                                                         
export async function bootstrapAdmin(user, password) {
  if (!ADMIN_USER || !ADMIN_PASSWORD) return null;
  if (normUser(user) !== normUser(ADMIN_USER)) return null;
  if (!safeEqual(password, ADMIN_PASSWORD)) return null;
  const all = await getAccounts();
  const hasAdmin = Object.values(all).some(a => a && a.role === 'admin');
  if (hasAdmin) return null;
  const id = accountId();
  const u = normUser(ADMIN_USER);
  const rec = {
    user: enc(u),
    uh: userIndex(u),
    role: 'admin',
    pass: hashPassword(ADMIN_PASSWORD),
    quota: 0,
    created: Date.now(),
    ver: 1,
    disabled: false,
    by: 'bootstrap'
  };
  if (validEmail(u)) {
    rec.email = enc(u);
    rec.eh = emailIndex(u);
  }
  await db.put('accounts/' + id, rec);
  return { id, ...rec };
}

export async function panelAccount(req) {
  const s = verifySession(cookies(req)[COOKIE]);
  if (!s || (s.t !== 'a' && s.t !== 'r') || !s.u) return null;
  if (!/^[a-f0-9]{36}$/.test(String(s.sid || ''))) return null;
  const sess = await db.get('sessions/' + s.sid);
  if (!sess || sess.u !== s.u || Number(sess.exp) <= Date.now()) return null;
  if ((Number(sess.v) || 1) !== (Number(s.v) || 1)) return null;
  const acc = await getAccount(s.u);
  if (!acc || acc.disabled) return null;
  if ((Number(acc.ver) || 1) !== (Number(s.v) || 1)) return null;
  return { ...acc, user: dec(acc.user) };
}

export async function activeCodeUser(req) {
  const s = requireUser(req);
  if (!s || s.t !== 'u' || !/^[a-f0-9]{64}$/.test(String(s.c || ''))) return null;
  const rec = await db.get('codes/' + s.c);
  if (!rec || rec.revoked) return null;
  if (!rec.device || rec.device !== String(s.d || '')) return null;
  return { s, rec };
}

export async function requirePanel(req, res, roles) {
  if (guardConfig(res)) return null;
  let acc = null;
  try {
    acc = await panelAccount(req);
  } catch (e) {
    send(res, 500, { error: 'server error' });
    return null;
  }
  if (!acc) {
    clearSessionCookie(req, res);
    send(res, 401, { error: 'sign in again' });
    return null;
  }
  if (roles && !roles.includes(acc.role)) {
    send(res, 403, { error: 'forbidden' });
    return null;
  }
  return acc;
}

                                                                             
export async function audit(acc, action, target, req) {
  try {
    await db.push('audit', {
      at: Date.now(),
      by: acc && acc.id ? acc.id : 'system',
      who: enc((acc && acc.user) || 'system'),
      action: String(action || '').slice(0, 40),
      target: enc(String(target || '').slice(0, 80)),
      ip: req ? sha256('ip:' + clientIp(req)).slice(0, 16) : ''
    });
                                                                       
    if (Math.random() < 0.05) await pruneAudit();
  } catch (e) {}
}

async function pruneAudit() {
  try {
    const all = (await db.get('audit')) || {};
    const ids = Object.keys(all).sort();
    for (let i = 0; i < ids.length - 800; i++) {
      try { await db.del('audit/' + ids[i]); } catch (e) {}
    }
  } catch (e) {}
}

                                                                             
export function requestHost(req) {
  return String((req.headers && (req.headers.host || req.headers['x-forwarded-host'])) || '')
    .split(',')[0].trim().toLowerCase();
}

                                                                              
                                                                              
                                                                 
export function sameOrigin(req) {
  const host = requestHost(req);
  if (!host) return false;
  const src = (req.headers && (req.headers.origin || req.headers.referer)) || '';
  if (!src) return false;
  try {
    return new URL(src).host.toLowerCase() === host;
  } catch (e) {
    return false;
  }
}

export function requireSameOrigin(req, res) {
  if (sameOrigin(req)) return true;
  send(res, 403, { error: 'bad origin' });
  return false;
}

                                                                             
export function bearer(req) {
  const h = (req.headers && req.headers.authorization) || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export function requireUser(req) {
  const s = verifySession(bearer(req));
  return s && (s.t === 'u' || s.t === 'a') ? s : null;
}

export function makeCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = n => Array.from(crypto.randomBytes(n)).map(b => alpha[b % alpha.length]).join('');
  return pick(4) + '-' + pick(4) + '-' + pick(4);
}

export function makeLauncherKey() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = n => Array.from(crypto.randomBytes(n)).map(b => alpha[b % alpha.length]).join('');
  return 'KAYAZ-' + pick(4) + '-' + pick(4) + '-' + pick(4) + '-' + pick(4);
}

                                                                             
async function dbFetchAt(base, secret, path, opts = {}) {
  const url = `${base}/${path}.json?auth=${encodeURIComponent(secret)}`;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new Error('db unavailable');
  }
  if (!res.ok) throw new Error('db ' + res.status);
  const txt = await res.text();
  return txt && txt !== 'null' ? JSON.parse(txt) : null;
}

async function dbFetch(path, opts = {}) {
  if (!configured()) throw new Error('unconfigured');
  return dbFetchAt(DB_URL, DB_SECRET, path, opts);
}

async function r6Fetch(path, opts = {}) {
  if (!r6Configured()) throw new Error('unconfigured');
  return dbFetchAt(R6_DB_URL, R6_DB_SECRET, path, opts);
}

export const db = {
  get: p => dbFetch(p),
  put: (p, v) => dbFetch(p, { method: 'PUT', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  patch: (p, v) => dbFetch(p, { method: 'PATCH', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  push: (p, v) => dbFetch(p, { method: 'POST', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  del: p => dbFetch(p, { method: 'DELETE' })
};

export const r6db = {
  get: p => r6Fetch(p),
  put: (p, v) => r6Fetch(p, { method: 'PUT', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  patch: (p, v) => r6Fetch(p, { method: 'PATCH', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  push: (p, v) => r6Fetch(p, { method: 'POST', body: JSON.stringify(v), headers: { 'content-type': 'application/json' } }),
  del: p => r6Fetch(p, { method: 'DELETE' })
};

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(Array.isArray(req.body) ? {} : req.body);
  return new Promise(resolve => {
    let d = '';
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', c => {
      d += c;
      if (d.length > 8e6) {
        finish({});
        try { req.destroy(); } catch (e) {}
      }
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(d || '{}');
        finish(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch (e) {
        finish({});
      }
    });
    req.on('error', () => finish({}));
    req.on('aborted', () => finish({}));
    req.on('close', () => finish({}));
  });
}

export function send(res, code, obj) {
  res.status(code);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.end(JSON.stringify(obj));
}

export function guardConfig(res) {
  if (configured()) return false;
  send(res, 503, { error: 'server not configured' });
  return true;
}

                                                                            
                                                                               
                                                                              
                   
const buckets = new Map();

export function clientIp(req) {
  const h = req.headers || {};
  const fwd = String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64);
  return fwd || (req.socket && req.socket.remoteAddress) || 'x';
}

export function rateLimit(req, res, name, max, windowMs) {
  const ip = clientIp(req);
  const key = name + '|' + ip;
  const now = Date.now();
  if (buckets.size > 5000) {
    const cutoff = now - 3600000;
    for (const [k, v] of buckets) if (!v || v.t < cutoff) buckets.delete(k);
    while (buckets.size > 10000) {
      const first = buckets.keys().next().value;
      if (!first) break;
      buckets.delete(first);
    }
  }
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
