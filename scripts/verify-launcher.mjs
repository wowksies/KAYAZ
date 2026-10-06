/**
 * End to end check for the launcher key flow, run against two stub Firebase
 * REST databases so nothing real is ever touched.
 *
 *   node scripts/verify-launcher.mjs
 *
 * Covers the SellAuth webhook signature, key minting, replay and double
 * fulfilment, the delivery lookup, the download gate and revocation. The
 * GitHub asset lookup at the end does hit the real GitHub API, since that is
 * the only way to prove the redirect is real; everything else is local.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

// ---------- stub Firebase, one instance per database ----------
function makeFirebase(secret) {
  const store = {};
  const parts = p => p.split('/').filter(Boolean);
  const get = p => { let c = store; for (const k of parts(p)) { if (c == null || typeof c !== 'object') return null; c = c[k]; } return c === undefined ? null : c; };
  const set = (p, v) => { const ps = parts(p); let c = store; for (let i = 0; i < ps.length - 1; i++) { if (typeof c[ps[i]] !== 'object' || c[ps[i]] === null) c[ps[i]] = {}; c = c[ps[i]]; } c[ps[ps.length - 1]] = v; };
  const del = p => { const ps = parts(p); let c = store; for (let i = 0; i < ps.length - 1; i++) c = c && c[ps[i]]; if (c) delete c[ps[ps.length - 1]]; };
  const merge = (p, v) => {
    const ps = parts(p); let c = store;
    for (let i = 0; i < ps.length - 1; i++) { if (typeof c[ps[i]] !== 'object' || c[ps[i]] === null) c[ps[i]] = {}; c = c[ps[i]]; }
    const last = ps[ps.length - 1]; const cur = c[last];
    if (cur && typeof cur === 'object' && !Array.isArray(cur) && v && typeof v === 'object' && !Array.isArray(v)) c[last] = { ...cur, ...v };
    else c[last] = v;
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('auth') !== secret) { res.writeHead(401); return res.end('{"error":"Permission denied"}'); }
    const p = decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      if (req.method === 'GET') {
        const v = get(p);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(v === null ? 'null' : JSON.stringify(v));
      }
      const parsed = body ? JSON.parse(body) : null;
      if (req.method === 'PUT') set(p, parsed);
      else if (req.method === 'PATCH') merge(p, parsed);
      else if (req.method === 'DELETE') del(p);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(parsed));
    });
  });
  return { server, store, get };
}

function makeReq({ method = 'POST', url = '/', headers = {}, json, raw }) {
  const payload = raw !== undefined ? Buffer.from(raw, 'utf8') : json !== undefined ? Buffer.from(JSON.stringify(json), 'utf8') : Buffer.alloc(0);
  const listeners = {};
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    (listeners.data || []).forEach(f => f(payload));
    (listeners.end || []).forEach(f => f());
  };
  const req = {
    method, url, headers, socket: { remoteAddress: '127.0.0.1' }, body: json,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); if (ev === 'data' || ev === 'end') queueMicrotask(start); return req; },
    destroy() {}
  };
  return req;
}

function makeRes() {
  const out = { status: 0, headers: {}, body: '' };
  const res = {
    out,
    status(c) { out.status = c; return res; },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; return res; },
    writeHead(c, h) { out.status = c; for (const [k, v] of Object.entries(h || {})) out.headers[k.toLowerCase()] = v; return res; },
    json(o) { out.body = JSON.stringify(o); },
    end(b) { if (b !== undefined) out.body += Buffer.isBuffer(b) ? b.toString() : String(b); }
  };
  return res;
}

async function call(fn, opts) {
  const res = makeRes();
  await fn(makeReq(opts), res);
  let body = null;
  try { body = JSON.parse(res.out.body); } catch (e) {}
  return { status: res.out.status, headers: res.out.headers, body, raw: res.out.body };
}

const site = makeFirebase('site-secret');
const r6 = makeFirebase('r6-secret');
await new Promise(r => site.server.listen(0, '127.0.0.1', r));
await new Promise(r => r6.server.listen(0, '127.0.0.1', r));

process.env.FIREBASE_DB_URL = 'http://127.0.0.1:' + site.server.address().port;
process.env.FIREBASE_DB_SECRET = 'site-secret';
process.env.R6_Firebase_URL = 'http://127.0.0.1:' + r6.server.address().port;
process.env.R6_Firebase_secret = 'r6-secret';
process.env.SESSION_SECRET = 'session-secret';
process.env.THREEDAYID = '101';
process.env.SEVENDAYID = '102';
process.env.ONEMONTHID = '103';
process.env.SEASONALID = '104';
process.env.SEASONAL_DAYS = '90';
process.env.LAUNCHER_GH_REPO = 'wowksies/kayazlauncher';
process.env.LAUNCHER_GH_TAG = 'launcher';
process.env.LAUNCHER_GH_ASSET = 'KAYAZ.exe';

const whSecretRaw = crypto.randomBytes(32).toString('base64');
process.env.SELLAUTH_WEBHOOK_SECRET = 'whsec_' + whSecretRaw;

const sellauth = (await import(pathToFileURL(REPO + '/api/sellauth.js').href)).default;
const launcher = (await import(pathToFileURL(REPO + '/api/launcher.js').href)).default;
const download = (await import(pathToFileURL(REPO + '/api/launcher-download.js').href)).default;

function signedDelivery(event, data, { tamper = false } = {}) {
  const payload = { id: crypto.randomUUID(), created_at: new Date().toISOString(), event, version: '1', data, store: 1 };
  const raw = JSON.stringify(payload);
  const id = 'msg_' + crypto.randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(whSecretRaw, 'base64');
  const sig = crypto.createHmac('sha256', key).update(Buffer.concat([Buffer.from(id + '.' + ts + '.'), Buffer.from(raw)])).digest('base64');
  return {
    payload, raw,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': 'v1,' + (tamper ? Buffer.from('nope').toString('base64') : sig)
    }
  };
}

console.log('\n1. webhook signature');
{
  const d = signedDelivery('order.completed', { id: 9001 }, { tamper: true });
  const r = await call(sellauth, { url: '/api/sellauth', headers: d.headers, raw: d.raw });
  check('forged signature rejected 401', r.status === 401, JSON.stringify(r.body));
}
{
  const r = await call(sellauth, { url: '/api/sellauth', headers: {}, raw: '{}' });
  check('unsigned body rejected 401', r.status === 401, JSON.stringify(r.body));
}
{
  const r = await call(sellauth, { url: '/api/sellauth', headers: { signature: 'deadbeef' }, raw: '{}' });
  check('legacy header with junk rejected 401', r.status === 401, JSON.stringify(r.body));
}
{
  const raw = '{"id":"x","event":"order.completed"}';
  const key = Buffer.from(whSecretRaw, 'base64');
  const headers = { signature: crypto.createHmac('sha256', key).update(Buffer.from(raw)).digest('hex') };
  const r = await call(sellauth, { url: '/api/sellauth', headers, raw });
  check('legacy hex signature accepted', r.status === 200, JSON.stringify(r.body));
}

console.log('\n2. order.completed mints the key into the R6 database');
let minted = null;
{
  const d = signedDelivery('order.completed', {
    id: 4321,
    customer_information: { email: 'Buyer@Example.com' },
    line_items: [{ product_id: 102, product_title: 'KAYAZ R6, 7 Days', variant_title: '7 Days' }]
  });
  const r = await call(sellauth, { url: '/api/sellauth', headers: d.headers, raw: d.raw });
  check('webhook answered 2xx', r.status === 200, JSON.stringify(r.body));

  const order = site.get('orders/4321');
  check('order stored in storefront db', !!order, JSON.stringify(site.store));
  check('order email lower-cased', order && order.email === 'buyer@example.com', order && order.email);
  check('term resolved from the 7 day variant id', order && order.term === 'sevenDays' && order.days === 7, order && order.term + '/' + order.days);
  check('key format looks right', order && /^KAYAZ-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(order.key), order && order.key);
  minted = order;

  const hash = crypto.createHash('sha256').update(order.key).digest('hex');
  check('key hash is sha256 of the literal key', hash === order.hash, hash);
  const rec = r6.get('keys/' + hash);
  check('key record exists in R6 db', !!rec, JSON.stringify(r6.store));
  check('record is enabled', rec && rec.disabled === false, JSON.stringify(rec));
  check('record is unbound so first launch binds it', rec && rec.hwid === '', JSON.stringify(rec));
  check('expiry is about 7 days out', rec && Math.abs(rec.expires_at - (Math.floor(Date.now() / 1000) + 7 * 86400)) < 60, rec && String(rec.expires_at));
  check('record carries the three fields the launcher reads', rec && 'disabled' in rec && 'expires_at' in rec && 'hwid' in rec, Object.keys(rec || {}).join(','));
}

console.log('\n3. replay and double fulfilment');
{
  const d = signedDelivery('order.completed', { id: 4321, customer_information: { email: 'buyer@example.com' }, line_items: [{ product_id: 102 }] });
  await call(sellauth, { url: '/api/sellauth', headers: d.headers, raw: d.raw });
  const dup = await call(sellauth, { url: '/api/sellauth', headers: d.headers, raw: d.raw });
  check('same delivery id acknowledged as duplicate', dup.status === 200 && dup.body && dup.body.duplicate === true, JSON.stringify(dup.body));
  check('no second key minted', Object.keys(r6.store.keys || {}).length === 1, Object.keys(r6.store.keys || {}).join(','));

  const paid = signedDelivery('order.paid', { id: 4321, customer_information: { email: 'buyer@example.com' }, line_items: [{ product_id: 102 }] });
  await call(sellauth, { url: '/api/sellauth', headers: paid.headers, raw: paid.raw });
  const after = site.get('orders/4321');
  check('order.paid after order.completed reuses the key', after && after.key === minted.key, after && after.key);
  check('R6 db still holds exactly one key', Object.keys(r6.store.keys || {}).length === 1);
}

console.log('\n3b. an unreadable payload still gets a key, on the shortest term');
{
  const d = signedDelivery('order.completed', { id: 5150 });
  const r = await call(sellauth, { url: '/api/sellauth', headers: d.headers, raw: d.raw });
  check('the webhook still answers 2xx', r.status === 200, JSON.stringify(r.body));
  const order = site.get('orders/5150');
  check('a key is still minted so the buyer is not stranded', !!order && !!order.key, JSON.stringify(order));
  check('the term falls back to the shortest one', order && order.days === 3, order && String(order.days));
  check('the guess is flagged for the admin', order && order.guess === true, JSON.stringify(order && order.guess));
}

console.log('\n4. delivery page lookup');
{
  const r = await call(launcher, { json: { order: '4321', email: 'buyer@example.com' } });
  check('order plus matching email returns the key', r.status === 200 && r.body.key === minted.key, JSON.stringify(r.body));
  check('a download link is returned', r.status === 200 && /^\/api\/launcher-download\?t=/.test(r.body.download || ''), r.body && r.body.download);
}
{
  const r = await call(launcher, { json: { order: '4321', email: 'someone.else@example.com' } });
  check('mismatched email refused 403', r.status === 403, JSON.stringify(r.body));
}
{
  const r = await call(launcher, { json: { order: '9999', email: 'buyer@example.com' } });
  check('unknown order is 404', r.status === 404, JSON.stringify(r.body));
}
{
  const r = await call(launcher, { json: { key: minted.key } });
  check('pasting the key works on its own', r.status === 200 && r.body.key === minted.key, JSON.stringify(r.body));
}
{
  const r = await call(launcher, { json: { key: 'KAYAZ-AAAA-BBBB-CCCC' } });
  check('a made up key is refused', r.status === 404, JSON.stringify(r.body));
}
{
  const r = await call(launcher, { json: { key: '  ' + minted.key.toLowerCase() + '  ' } });
  check('lower case paste still resolves on the site', r.status === 200, JSON.stringify(r.body));
}

console.log('\n5. download gate');
const token = (await call(launcher, { json: { key: minted.key } })).body.download;
{
  const r = await call(download, { method: 'GET', url: '/api/launcher-download?t=rubbish' });
  check('bogus token refused 403', r.status === 403, JSON.stringify(r.body));
}
{
  const r = await call(download, { method: 'GET', url: '/api/launcher-download?t=' });
  check('missing token refused 403', r.status === 403, JSON.stringify(r.body));
}
{
  const r = await call(download, { method: 'GET', url: token });
  check('valid token answers 302', r.status === 302, 'status=' + r.status + ' body=' + r.raw);
  const loc = r.headers.location || '';
  check('redirect points at signed storage', /^https:\/\/release-assets\.githubusercontent\.com\//.test(loc), loc.slice(0, 100));
}

console.log('\n6. revoking a key kills a link already handed out');
{
  const hash = minted.hash;
  r6.store.keys[hash].disabled = true;
  const r = await call(download, { method: 'GET', url: token });
  check('disabled key blocks the download', r.status === 403, JSON.stringify(r.body));
  const r2 = await call(launcher, { json: { key: minted.key } });
  check('disabled key blocks the lookup and says so', r2.status === 403 && /disabled/.test(r2.body.error || ''), JSON.stringify(r2.body));
  r6.store.keys[hash].disabled = false;
  r6.store.keys[hash].expires_at = Math.floor(Date.now() / 1000) - 10;
  const r3 = await call(download, { method: 'GET', url: token });
  check('expired key blocks the download', r3.status === 403, JSON.stringify(r3.body));
  const r4 = await call(launcher, { json: { key: minted.key } });
  check('expired key reports why', r4.status === 403 && /expired/.test(r4.body.error || ''), JSON.stringify(r4.body));
}

console.log('\n7. the browser never sees the R6 database');
{
  const files = ['index.html', 'launcher/index.html', 'dashboard/index.html', 'assets/seed-games.js', 'assets/evil-eye.js', 'assets/tech-text.js'];
  const leaked = [];
  for (const f of files) {
    let t = '';
    try { t = fs.readFileSync(REPO + '/' + f, 'utf8'); } catch (e) { continue; }
    if (/firebasedatabase\.app|R6_Firebase|j2mQuc0Z/i.test(t)) leaked.push(f);
  }
  check('no client-served file mentions the R6 endpoint or secret', leaked.length === 0, leaked.join(','));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
site.server.close();
r6.server.close();
process.exit(fail ? 1 : 0);
