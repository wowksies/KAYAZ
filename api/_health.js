import { panelAccount, send } from './_lib.js';

                                                                              
                                                                                
                                             
export default async function handler(req, res) {
  let admin = false;
  try {
    const acc = await panelAccount(req);
    admin = Boolean(acc && acc.role === 'admin');
  } catch (e) {}

  res.setHeader('cache-control', 'no-store');
  if (!admin) {
    return send(res, 200, { ok: true });
  }

  return send(res, 200, {
    ok: true,
    env: {
      FIREBASE_DB_URL: Boolean(process.env.FIREBASE_DB_URL || process.env.FIREBASE_URL),
      FIREBASE_DB_SECRET: Boolean(process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SECRET),
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
      DATA_KEY: Boolean(process.env.DATA_KEY),
      ADMIN_EMAIL: Boolean(process.env.ADMIN_EMAIL),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD)
    },
    node: process.version
  });
}
