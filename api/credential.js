import {
  db, sha256, normUser, verifyPassword, DUMMY_HASH, getAccountByLogin, hashPassword,
  validEmail, enc, emailIndex, getAccountByEmail, readBody, send, guardConfig,
  rateLimit, audit, PASSWORD_MIN, dec
} from './_lib.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

   
                                                                      
  
                                                                              
                                                                               
                                                                        
  
          
                                                                            
                                                                              
                                                  
                                                                               
                                                               
   
function cors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  res.setHeader('Vary', 'Origin');
  if (origin !== 'null') return;
  res.setHeader('Access-Control-Allow-Origin', 'null');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  cors(req, res);
  if (origin && origin !== 'null') return send(res, 403, { error: 'bad origin' });

  if (req.method === 'OPTIONS') {
    res.status(204);
    res.setHeader('cache-control', 'no-store');
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (guardConfig(res)) return;
  if (!rateLimit(req, res, 'credential', 10, 600000)) return;

  const body = await readBody(req);
  const user = normUser(body.user || body.email || '');
  const current = String(body.current || '');
  const generic = { error: 'wrong login or password' };

  if (!user || !current || current.length > 200 || user.length > 64) {
    await sleep(350);
    return send(res, 401, generic);
  }

  const key = 'authfail/' + sha256('u:' + user);
  let fail = null;
  try {
    fail = await db.get(key);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  const now = Date.now();
  if (fail && Number(fail.until) > now) {
    res.setHeader('Retry-After', String(Math.ceil((Number(fail.until) - now) / 1000)));
    return send(res, 429, { error: 'too many attempts, try again later' });
  }

  let acc = null;
  try {
    acc = await getAccountByLogin(user);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }

  let ok = false;
  if (acc && !acc.disabled) ok = verifyPassword(current, acc.pass);
  else verifyPassword(current, DUMMY_HASH);

  if (!ok) {
    const fails = (Number(fail && fail.fails) || 0) + 1;
    const wait = fails >= 5 ? Math.min(3600, 60 * Math.pow(2, fails - 5)) : 0;
    try {
      await db.put(key, { fails, until: now + wait * 1000, updated: now });
    } catch (e) {}
    await sleep(400 + Math.random() * 250);
    return send(res, 401, generic);
  }

  if (acc.role !== 'admin') return send(res, 403, { error: 'admin accounts only' });

  const patch = {};
  let email = acc.email ? dec(acc.email) : '';

  if (body.email != null) {
    const em = normUser(body.email);
    if (em !== email) {
      if (!em) return send(res, 400, { error: 'an admin account needs an email' });
      if (!validEmail(em)) return send(res, 400, { error: 'enter a valid email address' });
      const taken = await getAccountByEmail(em);
      if (taken && taken.id !== acc.id) return send(res, 409, { error: 'that email is already in use' });
      patch.email = enc(em);
      patch.eh = emailIndex(em);
      email = em;
    }
  }

  if (body.password) {
    const p = String(body.password);
    if (p.length < PASSWORD_MIN) return send(res, 400, { error: 'password must be at least ' + PASSWORD_MIN + ' characters' });
    if (p.length > 200) return send(res, 400, { error: 'password must be 200 characters or fewer' });
    if (p === current) return send(res, 400, { error: 'pick a different password' });
    if (email && p.toLowerCase() === email) return send(res, 400, { error: 'do not use your email as the password' });
    patch.pass = hashPassword(p);
    patch.ver = (Number(acc.ver) || 1) + 1;
    patch.passChanged = Date.now();
  }

  if (!Object.keys(patch).length) return send(res, 400, { error: 'nothing to change' });

  try {
    await db.patch('accounts/' + acc.id, patch);
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
  try {
    await db.del(key);
  } catch (e) {}

  await audit({ id: acc.id, user: dec(acc.user) }, 'account.credential', Object.keys(patch).join(','), req);
  return send(res, 200, { ok: true, user: dec(acc.user), email });
}
