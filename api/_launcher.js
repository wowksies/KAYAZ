import crypto from 'node:crypto';

// Where the launcher binary actually lives, and how to hand a buyer a URL that
// stops working shortly after.
//
// Two backends, picked by whichever env vars are present:
//
//   1. github  (default) -- the release sits in a PRIVATE GitHub repo and the
//      API is asked for the asset with a fine-grained token. GitHub answers
//      with a 302 to a pre-signed objects.githubusercontent.com URL that only
//      lives about an hour and needs no auth to read. Nothing is proxied, so
//      the 7 MB never touches a Vercel function's body limit.
//
//        LAUNCHER_GH_REPO    wowksies/kayazlauncher
//        LAUNCHER_GH_TAG     launcher
//        LAUNCHER_GH_ASSET   KAYAZ.exe
//        LAUNCHER_GH_TOKEN   github_pat_... (Contents: read on that repo)
//
//   2. s3 -- any S3-compatible bucket (Cloudflare R2 is the cheap pick: 10 GB
//      free, no egress fees, and the recommended home if you would rather not
//      keep the build on GitHub). Presigned with SigV4 using node's own crypto
//      so there is no SDK dependency.
//
//        LAUNCHER_S3_ENDPOINT        https://<account-id>.r2.cloudflarestorage.com
//        LAUNCHER_S3_BUCKET          kayaz
//        LAUNCHER_S3_KEY             KAYAZ.exe
//        LAUNCHER_S3_ACCESS_KEY_ID   ...
//        LAUNCHER_S3_SECRET_ACCESS_KEY ...
//        LAUNCHER_S3_REGION          auto
//
// LAUNCHER_URL_TTL (seconds, default 900) sets the lifetime of a presigned URL.
// LAUNCHER_DOWNLOAD_URL is a last-resort plain URL for local testing.

const TTL = Math.max(60, parseInt(process.env.LAUNCHER_URL_TTL, 10) || 900);

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// SigV4 query presign for a single GET on an object. AWS and R2 both accept it.
function presignS3({ endpoint, region, bucket, key, accessKeyId, secretAccessKey, expires }) {
  const host = new URL(endpoint).host;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credential = `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;

  const canonicalUri = `/${bucket}/${String(key).split('/').map(encodeURIComponent).join('/')}`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host'
  };
  const canonicalQuery = Object.keys(params).sort()
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credential,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  let signingKey = hmac(Buffer.from('AWS4' + secretAccessKey), dateStamp);
  signingKey = hmac(signingKey, region);
  signingKey = hmac(signingKey, 's3');
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function s3Config() {
  const endpoint = process.env.LAUNCHER_S3_ENDPOINT || '';
  const bucket = process.env.LAUNCHER_S3_BUCKET || '';
  const accessKeyId = process.env.LAUNCHER_S3_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.LAUNCHER_S3_SECRET_ACCESS_KEY || '';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.LAUNCHER_S3_REGION || 'auto',
    key: process.env.LAUNCHER_S3_KEY || process.env.LAUNCHER_GH_ASSET || 'KAYAZ.exe'
  };
}

async function githubRedirect() {
  const repo = process.env.LAUNCHER_GH_REPO || 'wowksies/kayazlauncher';
  const tag = process.env.LAUNCHER_GH_TAG || 'launcher';
  const wanted = process.env.LAUNCHER_GH_ASSET || 'KAYAZ.exe';
  const token = process.env.LAUNCHER_GH_TOKEN || process.env.GITHUB_TOKEN || '';

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'kayaz-site',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const relRes = await fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers }
  );
  if (!relRes.ok) throw new Error('release ' + relRes.status);
  const release = await relRes.json();
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find(a => String(a.name).toLowerCase() === wanted.toLowerCase()) || assets[0];
  if (!asset) throw new Error('asset not found');

  // Ask for the bytes and take the Location GitHub hands back. With a token on
  // a private repo that Location is the signed, time-limited object URL.
  const assetRes = await fetch(
    `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`,
    { headers: { ...headers, Accept: 'application/octet-stream' }, redirect: 'manual' }
  );
  const location = assetRes.headers.get('location');
  if (location) return { url: location, ttl: 3600, via: 'github' };
  if (assetRes.status === 200 && asset.browser_download_url) {
    return { url: asset.browser_download_url, ttl: TTL, via: 'github-public' };
  }
  throw new Error('asset ' + assetRes.status);
}

// Resolve where a verified buyer should be sent. Throws when nothing usable is
// configured so the route can answer with a real error instead of a dead link.
export async function resolveDownloadUrl() {
  const s3 = s3Config();
  if (s3) {
    return {
      url: presignS3({ ...s3, expires: TTL }),
      ttl: TTL,
      via: 's3'
    };
  }

  if (process.env.LAUNCHER_GH_REPO || process.env.LAUNCHER_GH_TOKEN || !process.env.LAUNCHER_DOWNLOAD_URL) {
    return githubRedirect();
  }

  return { url: process.env.LAUNCHER_DOWNLOAD_URL, ttl: TTL, via: 'static' };
}

export function launcherConfigured() {
  return Boolean(
    s3Config() ||
    process.env.LAUNCHER_GH_REPO ||
    process.env.LAUNCHER_GH_TOKEN ||
    process.env.LAUNCHER_DOWNLOAD_URL
  );
}
