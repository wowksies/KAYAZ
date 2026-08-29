export default function handler(req, res) {
  res.status(200).setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    ok: true,
    env: {
      FIREBASE_DB_URL: Boolean(process.env.FIREBASE_DB_URL),
      FIREBASE_DB_SECRET: Boolean(process.env.FIREBASE_DB_SECRET),
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
      ADMIN_EMAIL: Boolean(process.env.ADMIN_EMAIL),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD)
    },
    node: process.version
  }));
}
