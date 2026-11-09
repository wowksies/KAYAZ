   
                                                                         
                                                     
  
                                   
   
process.env.FIREBASE_URL = 'https://fake-db.local';
process.env.FIREBASE_SECRET = 'test-secret';
process.env['R6_Firebase_URL'] = 'https://fake-r6.local';
process.env['R6_Firebase_secret'] = 'r6-test-secret';
process.env.SESSION_SECRET = 'k'.repeat(48);
process.env.ADMIN_EMAIL = 'owner';
process.env.ADMIN_PASSWORD = 'owner-password-123';
process.env.VERCEL = '1';

const store = {};
const split = p => String(p || '').split('/').filter(Boolean);
const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));

function read(path) {
  let cur = store;
  for (const k of split(path)) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}
function write(path, value) {
  const ks = split(path);
  if (!ks.length) return;
  let cur = store;
  for (let i = 0; i < ks.length - 1; i++) {
    if (!cur[ks[i]] || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  cur[ks[ks.length - 1]] = value;
}
function drop(path) {
  const ks = split(path);
  if (!ks.length) return;
  let cur = store;
  for (let i = 0; i < ks.length - 1; i++) cur = cur && cur[ks[i]];
  if (cur && typeof cur === 'object') delete cur[ks[ks.length - 1]];
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const path = (u.host === 'fake-r6.local' ? 'r6/' : '') + u.pathname.replace(/^\//, '').replace(/\.json$/, '');
  const method = String(opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  let value = null;

  if (method === 'GET') value = clone(read(path));
  else if (method === 'PUT') { write(path, body); value = body; }
  else if (method === 'PATCH') {
    const cur = read(path);
    const next = Object.assign({}, cur && typeof cur === 'object' ? clone(cur) : {}, body);
    write(path, next);
    value = next;
  } else if (method === 'POST') {
    const cur = clone(read(path)) || {};
    const id = '-test' + Math.random().toString(36).slice(2, 9);
    cur[id] = body;
    write(path, cur);
    value = { name: id };
  } else if (method === 'DELETE') { drop(path); value = null; }

  return { ok: true, status: 200, text: async () => JSON.stringify(value) };
};

const { sha256, normCode, r6Status } = await import('../api/_lib.js');
const { default: login } = await import('../api/login.js');
const { default: logout } = await import('../api/logout.js');
const { default: session } = await import('../api/session.js');
const { default: keys } = await import('../api/keys.js');
const { default: resellers } = await import('../api/resellers.js');
const { default: account } = await import('../api/account.js');
const { default: audit } = await import('../api/audit.js');
const { default: config } = await import('../api/config.js');
const { default: redeem } = await import('../api/redeem.js');
const { default: games } = await import('../api/games.js');
const { default: credential } = await import('../api/credential.js');

let checks = 0;
let failures = 0;
function ok(name, cond, extra) {
  checks++;
  if (cond) return;
  failures++;
  console.error('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

function req(o = {}) {
  const headers = Object.assign({ host: 'kayaz.xyz', origin: 'https://kayaz.xyz' }, o.headers || {});
  if (o.cookie) headers.cookie = o.cookie;
  return { method: o.method || 'GET', body: o.body, headers, query: o.query };
}
function res() {
  return {
    statusCode: 0,
    headers: {},
    payload: '',
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.payload = String(b); }
  };
}
const json = r => { try { return JSON.parse(r.payload); } catch (e) { return {}; } };
const cookieOf = r => String(r.headers['set-cookie'] || '').split(';')[0];
const setCookie = r => String(r.headers['set-cookie'] || '');

                                                                            
let r = res();
await login(req({ method: 'POST', body: { user: 'owner', password: 'wrong-password' } }), r);
ok('wrong password rejected', r.statusCode === 401, r.statusCode);

r = res();
await login(req({ method: 'POST', body: { user: 'owner', password: 'owner-password-123' } }), r);
ok('bootstrap admin signs in', r.statusCode === 200 && json(r).role === 'admin', json(r));
let adminCookie = cookieOf(r);
ok('session cookie is sealed', /^kz_s=kz1\./.test(adminCookie), adminCookie.slice(0, 30));
ok('cookie is scoped to /api', /Path=\/api/.test(setCookie(r)), setCookie(r));

const adminRec = store.accounts[Object.keys(store.accounts)[0]];
ok('password stored as scrypt hash', /^scrypt\$16384\$8\$1\$/.test(String(adminRec.pass)));
ok('username encrypted at rest', String(adminRec.user).startsWith('kz1.') && !String(adminRec.user).includes('owner'));

r = res();
await config(Object.assign(req(), { query: { __health: '1' } }), r);
ok('public health reveals nothing', r.statusCode === 200 && json(r).ok === true && !json(r).env, json(r));

r = res();
await config(Object.assign(req({ cookie: adminCookie }), { query: { __health: '1' } }), r);
ok('admin health shows config booleans', r.statusCode === 200 && Boolean(json(r).env), json(r));

r = res();
await session(req({ cookie: adminCookie }), r);
ok('sealed cookie authenticates', r.statusCode === 200 && json(r).role === 'admin', json(r));

                                                                            
r = res();
await account(req({ method: 'POST', cookie: adminCookie, body: { current: 'owner-password-123', email: 'owner@kayaz.xyz' } }), r);
ok('admin can set their own email', r.statusCode === 200 && json(r).email === 'owner@kayaz.xyz', json(r));
adminCookie = cookieOf(r);

r = res();
await login(req({ method: 'POST', body: { user: 'owner@kayaz.xyz', password: 'owner-password-123' } }), r);
ok('email signs in', r.statusCode === 200 && json(r).role === 'admin', json(r));

r = res();
await login(req({ method: 'POST', body: { user: 'owner', password: 'owner-password-123' } }), r);
ok('username still signs in', r.statusCode === 200, json(r));

                                                                            
r = res();
await resellers(req({
  method: 'POST',
  cookie: adminCookie,
  body: { user: 'seller1', email: 'seller@kayaz.xyz', password: 'seller-pass-1', role: 'reseller', quota: 2 }
}), r);
ok('admin creates a reseller with an email', r.statusCode === 200, json(r));
const sellerId = json(r).id;

r = res();
await login(req({ method: 'POST', body: { user: 'seller@kayaz.xyz', password: 'seller-pass-1' } }), r);
ok('reseller signs in by email', r.statusCode === 200 && json(r).role === 'reseller', json(r));
let sellerCookie = cookieOf(r);

                                                                            
ok('r6 env vars detected whatever their casing', r6Status().url && r6Status().secret, r6Status());

r = res();
await keys(req({ method: 'POST', cookie: adminCookie, body: { count: 1, label: 'batch-a', owner: sellerId } }), r);
ok('admin issues an r6 key to the reseller', r.statusCode === 200 && json(r).codes.length === 1 && json(r).target === 'r6', json(r));
const sellerCode = (json(r).codes || [])[0];
const sellerHash = sha256(sellerCode);

ok('r6 key format matches the launcher', /^KAYAZ-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(sellerCode), sellerCode);
ok('r6 key is stored under the launcher node', Boolean(store.r6 && store.r6.keys && store.r6.keys[sellerHash]));
ok('r6 key is not in the site store', !(store.codes && store.codes[sellerHash]));
ok('r6 key uses the launcher record shape', (() => {
  const c = store.r6.keys[sellerHash];
  return c.hwid === '' && c.disabled === false && c.active === true && c.expires_at === 0 && c.tier === 'panel' && c.duration_days === 0;
})(), store.r6.keys[sellerHash]);
ok('r6 key label encrypted at rest', String(store.r6.keys[sellerHash].memo).startsWith('kz1.'));
ok('r6 key label is generic for the launcher', store.r6.keys[sellerHash].label === 'KAYAZ R6');
ok('key owner recorded server side', store.r6.keys[sellerHash].owner === sellerId);
ok('plaintext code never stored', !JSON.stringify(store).includes(sellerCode));

r = res();
await keys(req({ method: 'POST', cookie: adminCookie, body: { count: 1, label: 'site-batch', owner: sellerId, target: 'site' } }), r);
ok('admin issues a site key to the reseller', r.statusCode === 200 && json(r).target === 'site', json(r));
const siteCode = (json(r).codes || [])[0];
const siteHash = sha256(normCode(siteCode));
ok('site key is stored in the site store', Boolean(store.codes && store.codes[siteHash]));
ok('site key is not in the r6 store', !store.r6.keys[siteHash]);

r = res();
await keys(req({ cookie: sellerCookie }), r);
ok('reseller sees only their own keys', r.statusCode === 200 && json(r).keys.every(k => k.owner === sellerId), json(r));
ok('owner reads decrypted label', json(r).keys[0].label === 'batch-a', json(r).keys[0] && json(r).keys[0].label);
ok('r6 listing does not leak site keys', json(r).keys.length === 1 && json(r).keys[0].label === 'batch-a', json(r).keys);
ok('quota counts keys in both stores', json(r).used === 2, json(r).used);

r = res();
await keys(Object.assign(req({ cookie: sellerCookie }), { query: { target: 'site' } }), r);
ok('site listing is separate', r.statusCode === 200 && json(r).keys.length === 1 && json(r).keys[0].label === 'site-batch', json(r));

r = res();
await keys(Object.assign(req({ cookie: sellerCookie }), { query: { target: 'evil' } }), r);
ok('unknown target refused', r.statusCode === 400, r.statusCode);

r = res();
await keys(req({ method: 'POST', cookie: sellerCookie, body: { count: 2 } }), r);
ok('reseller quota enforced', r.statusCode === 403, json(r));

r = res();
await resellers(req({ cookie: sellerCookie }), r);
ok('reseller blocked from account management', r.statusCode === 403, r.statusCode);

r = res();
await audit(req({ cookie: sellerCookie }), r);
ok('reseller blocked from the audit trail', r.statusCode === 403, r.statusCode);

r = res();
await games(req({ method: 'POST', cookie: sellerCookie, body: { title: 'x', url: 'https://x.test' } }), r);
ok('reseller blocked from games writes', r.statusCode === 403, r.statusCode);

r = res();
await keys(req({ method: 'POST', cookie: adminCookie, body: { count: 1, label: 'admin-key' } }), r);
const adminHash = sha256((json(r).codes || [])[0]);

r = res();
await keys(req({ method: 'PATCH', cookie: sellerCookie, body: { h: adminHash, revoked: true } }), r);
ok('reseller cannot modify another account key', r.statusCode === 404, r.statusCode);

r = res();
await keys(req({ method: 'DELETE', cookie: sellerCookie, body: { h: adminHash } }), r);
ok('reseller cannot delete another account key', r.statusCode === 404, r.statusCode);

r = res();
await keys(req({ method: 'DELETE', cookie: adminCookie, body: { h: adminHash, target: 'site' } }), r);
ok('a key cannot be deleted through the other store', r.statusCode === 404, r.statusCode);
ok('r6 key survived the cross-store delete', Boolean(store.r6.keys[adminHash]));

                                                                             
r = res();
await redeem(req({ method: 'POST', body: { code: siteCode, device: 'device-test-1' } }), r);
ok('site key redeems', r.statusCode === 200 && Boolean(json(r).token), json(r));
ok('redeem returns the plaintext label', json(r).label === 'site-batch', json(r).label);
const userToken = json(r).token;

r = res();
await session(req({ headers: { authorization: 'Bearer ' + userToken } }), r);
ok('code session still works', r.statusCode === 200 && json(r).role === 'user', json(r));

                                                                             
r = res();
await login(req({ method: 'POST', headers: { origin: 'https://evil.test' }, body: { user: 'seller1', password: 'seller-pass-1' } }), r);
ok('cross-origin login refused', r.statusCode === 403, r.statusCode);

r = res();
await keys(req({ method: 'POST', cookie: sellerCookie, headers: { origin: 'https://evil.test' }, body: { count: 1 } }), r);
ok('cross-origin key call refused', r.statusCode === 403, r.statusCode);

                                                                            
r = res();
await account(req({ method: 'POST', cookie: sellerCookie, body: { current: 'seller-pass-1', password: 'seller-pass-2' } }), r);
ok('password change accepted', r.statusCode === 200, json(r));
sellerCookie = cookieOf(r);

r = res();
await account(req({ method: 'POST', cookie: sellerCookie, body: { current: 'seller-pass-2', password: 'short' } }), r);
ok('short password refused', r.statusCode === 400, json(r));

r = res();
await session(req({ cookie: cookieOf(res()) || '' }), r);
ok('anonymous session refused', r.statusCode === 401, r.statusCode);

r = res();
await login(req({ method: 'POST', body: { user: 'seller1', password: 'seller-pass-1' } }), r);
ok('old password rejected', r.statusCode === 401, r.statusCode);

                                                                             
r = res();
await games(req({ cookie: adminCookie }), r);
ok('admin reads games with a cookie session', r.statusCode === 200, r.statusCode);

r = res();
await games(req({ method: 'POST', cookie: adminCookie, body: { title: 'Test Game', url: 'https://example.test/g', cat: 'Test' } }), r);
ok('admin can add a game', r.statusCode === 200, json(r));

r = res();
await audit(req({ cookie: adminCookie }), r);
const events = json(r).events || [];
ok('audit returns events', r.statusCode === 200 && events.length > 0, events.length);
ok('audit records logins and key creation', events.some(e => e.action === 'login') && events.some(e => e.action === 'keys.create'), events.map(e => e.action));
ok('audit names are readable for the admin', events.some(e => e.who === 'owner'), events.map(e => e.who));

                                                                            
const dump = JSON.stringify(store);
ok('no plaintext usernames at rest', !dump.includes('seller1') && !dump.includes('owner@kayaz.xyz'));
ok('no plaintext labels at rest', !dump.includes('batch-a') && !dump.includes('site-batch'));

                                                                             
r = res();
await logout(req({ method: 'POST', cookie: adminCookie }), r);
ok('logout expires the cookie', /Max-Age=0/.test(setCookie(r)), setCookie(r));


                                                                             
r = res();
await credential(req({ method: 'OPTIONS', headers: { origin: 'null' } }), r);
ok('credential preflight allows the local tool', r.statusCode === 204 && r.headers['access-control-allow-origin'] === 'null', r.headers);

r = res();
await credential(req({ method: 'POST', headers: { origin: 'null' }, body: { user: 'owner@kayaz.xyz', current: 'nope-nope-nope', email: 'x@kayaz.xyz' } }), r);
ok('credential needs the current password', r.statusCode === 401, r.statusCode);

r = res();
await credential(req({ method: 'POST', headers: { origin: 'https://evil.test' }, body: { user: 'owner@kayaz.xyz', current: 'owner-password-123', email: 'x@kayaz.xyz' } }), r);
ok('credential refuses foreign origins', r.statusCode === 403, r.statusCode);

r = res();
await credential(req({ method: 'POST', headers: { origin: 'null' }, body: { user: 'seller1', current: 'seller-pass-2', email: 'seller2@kayaz.xyz' } }), r);
ok('credential refuses non-admin accounts', r.statusCode === 403, r.statusCode);

r = res();
await credential(req({ method: 'POST', headers: { origin: 'null' }, body: { user: 'owner@kayaz.xyz', current: 'owner-password-123', email: 'owner2@kayaz.xyz', password: 'owner-password-456' } }), r);
ok('admin changes website email + password', r.statusCode === 200 && json(r).email === 'owner2@kayaz.xyz', json(r));

r = res();
await login(req({ method: 'POST', body: { user: 'owner@kayaz.xyz', password: 'owner-password-123' } }), r);
ok('old admin password rejected', r.statusCode === 401, r.statusCode);

r = res();
await login(req({ method: 'POST', body: { user: 'owner2@kayaz.xyz', password: 'owner-password-456' } }), r);
ok('new admin credentials work', r.statusCode === 200 && json(r).role === 'admin', json(r));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} failing`);
  process.exit(1);
}
