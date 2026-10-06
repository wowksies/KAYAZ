# Launcher delivery setup

Buyer flow, end to end:

```
SellAuth purchase
   |
   |  post-purchase redirect  /launcher?order=[order_id]&email=[customer_email]
   v
/launcher  ---- POST /api/launcher ---->  key + a 1 hour download link
   |                                          |
   |                                          v
   |                              GET /api/launcher-download?t=...
   |                                          |
   |                                          v
   |                           302 to a private, short-lived storage URL
   v
buyer runs KAYAZ.exe, pastes the key
   |
   v
the launcher checks keys/<sha256(key)> in the R6 Firebase and binds the machine
```

## Why your key did not work

Two reasons, both expected:

1. Nothing is deployed. Every file listed under "What was added" below is still
   uncommitted on `main`. Vercel has no `/api/launcher` yet, so the live site
   cannot answer.
2. The local preview server fakes the delivery route. Without Firebase env vars
   it only accepts the demo order `4321` and the demo key
   `KAYAZ-4H7M-QW2N-XR9P`, and refuses everything else on purpose. That is why a
   real key came back as `that key is not valid`.

Also worth knowing: a key from the site's own invite tab is not a launcher key.
Invite keys live in the storefront Firebase under `codes/`. Launcher keys live in
the R6 Firebase under `keys/`. Only the second kind will ever work in the client.

## Testing a real key locally before deploying

Create `.env.local` in the repo root (already gitignored by the `.env.*` rule),
copy the values out of the Vercel dashboard, then:

```
npm run preview
```

With `R6_Firebase_URL`, `R6_Firebase_secret`, `FIREBASE_DB_URL`,
`FIREBASE_DB_SECRET` and `SESSION_SECRET` all present the server says
`api: live` and calls the real handlers, so a real key is checked against the
real R6 database. Without them it says `api: stubbed`.

Quick check of one key without the browser:

```
node -e "console.log(require('crypto').createHash('sha256').update('YOUR-KEY-HERE').digest('hex'))"
```

Then open
`https://<R6_Firebase_URL>/keys/<that hash>.json?auth=<R6_Firebase_secret>`.
A record means the launcher will accept the key. `null` means it will not.

## Env vars

Already in Vercel, leave them alone:

| Name | Used by |
| --- | --- |
| `R6_Firebase_URL`, `R6_Firebase_secret` | the R6 launcher key store. Server side only, never sent to a browser |
| `FIREBASE_DB_URL` / `FIREBASE_URL`, `FIREBASE_DB_SECRET` / `FIREBASE_SECRET` | the storefront database: games, invite keys, order records |
| `SESSION_SECRET` | signs admin sessions and the download links |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | dashboard login |
| `SHOP_ID`, `PRODUCT_ID`, `SHOP_URL`, `SELLAUTH_MODE` | checkout |
| `THREEDAYID`, `SEVENDAYID`, `ONEMONTHID`, `SEASONALID` | checkout, and now also which term a purchase grants |

Add these:

| Name | Value |
| --- | --- |
| `SELLAUTH_WEBHOOK_SECRET` | the signing secret you create in SellAuth (step 3) |
| `LAUNCHER_GH_REPO` | `wowksies/kayazlauncher` |
| `LAUNCHER_GH_TAG` | `launcher` |
| `LAUNCHER_GH_ASSET` | `KAYAZ.exe` |
| `LAUNCHER_GH_TOKEN` | a fine-grained GitHub token, Contents: Read, on that repo only (step 1) |

Optional:

| Name | Value |
| --- | --- |
| `SELLAUTH_API_KEY` | only used to fill in a customer email the webhook payload did not carry |
| `SEASONAL_DAYS` | how long the seasonal term lasts, default 90 |
| `LAUNCHER_S3_*`, `LAUNCHER_URL_TTL` | only if you move the build to a bucket, see the storage section |

## Step 1: stop the build being public

Right now this URL needs no key at all:

```
https://github.com/wowksies/kayazlauncher/releases/download/launcher/KAYAZ.exe
```

Anyone who has it, or guesses it, just downloads the client.

1. GitHub, `wowksies/kayazlauncher`, Settings, General, scroll to the bottom,
   Change visibility, make it **Private**. The release and its asset go private
   with it, the existing download URL stops working.
2. Settings, Developer settings, Personal access tokens, Fine-grained tokens,
   Generate new token.
   - Repository access: Only select repositories, `wowksies/kayazlauncher`
   - Permissions: Repository permissions, **Contents: Read-only**
   - Give it an expiry you are happy to rotate.
3. Copy the token into `LAUNCHER_GH_TOKEN` in Vercel.

Nothing else changes. The release stays exactly where it is, the same tag, the
same `KAYAZ.exe`. Only the server can now reach it.

## Step 2: deploy

Commit and push these files, then let Vercel build:

```
api/_lib.js                api/_launcher.js           api/sellauth.js
api/launcher.js            api/launcher-download.js   api/launcher-keys.js
launcher/index.html        dashboard/index.html       package.json
scripts/preview-server.mjs scripts/verify-launcher.mjs
```

`/launcher` is served from `launcher/index.html` by the `cleanUrls` setting
already in `vercel.json`. No build step, no new dependency.

## Step 3: the SellAuth webhook

Storefront, Developers, Webhooks, and configure:

- URL: `https://kayaz.xyz/api/sellauth`
- Events: `order.completed`, and `order.paid` if you want the key to exist the
  moment payment lands. The second one is free because the code reuses the key
  it already minted for that order.
- Save, then click New Secret and copy the signing secret into
  `SELLAUTH_WEBHOOK_SECRET`.

The receiver verifies the signature over the raw body before parsing anything,
records the delivery id so retries and manual redeliveries cannot mint a second
key, and answers 2xx immediately.

The term a purchase grants is matched from the line item by product or variant
id first, using the same `THREEDAYID` / `SEVENDAYID` / `ONEMONTHID` /
`SEASONALID` values the storefront already uses, and by the product title
second. If neither matches, the buyer still gets a key on the shortest term and
the order is stored with `guess: true`, so nothing is stranded but nothing is
over granted either. Check that flag in the database if a purchase looks wrong.

## Step 4: the post-purchase redirect

In each product: Customization, Redirect URL:

```
https://kayaz.xyz/launcher?order=[order_id]&email=[customer_email]
```

SellAuth fills both in. The page looks the order up, checks the email matches
the order on file, and shows the key plus the download button. If the buyer
loses the link they can paste the key on the same page instead.

## Testing it after deploy

1. Buy the cheapest term yourself, or use the webhook's test control in the
   SellAuth dashboard.
2. You should land on `/launcher` and see a key.
3. Run the launcher and paste that key. It should bind and launch.
4. Open `/dashboard`, the `launcher keys` tab. You should see the key with the
   order id and email next to it, and you can disable it, unbind its machine, or
   ban a machine fingerprint from there.

To watch a purchase without buying anything, use the webhook test button and
then look at `/dashboard`, `launcher keys`.

## Where to host KAYAZ.exe

The code supports two backends and picks whichever is configured.

**Today, recommended: leave it on the private GitHub release.** It is free, you
already have the release, there is nothing to migrate, and it works now. The API
never proxies the file: it asks GitHub for the asset with the token, GitHub
replies with a 302 to a signed URL that expires in about an hour, and the buyer's
browser downloads straight from GitHub. Nothing touches the 4.5 MB function
response limit.

**Longer term, recommended: Cloudflare R2.** 10 GB stored free and no egress
fees, which matters because this is a 6.7 MB file you redownload on every
update. It speaks the S3 API, and `api/_launcher.js` already signs requests for
it, so switching is env vars only:

1. Cloudflare dashboard, R2, create a bucket, for example `kayaz`.
2. Upload `KAYAZ.exe`. **Do not** turn on public access or attach a public
   domain. A public bucket is the same leak as the public GitHub URL.
3. R2, Manage API tokens, create a token with Object Read, and note the access
   key id and secret.
4. In Vercel set `LAUNCHER_S3_ENDPOINT`
   (`https://<account-id>.r2.cloudflarestorage.com`), `LAUNCHER_S3_BUCKET`,
   `LAUNCHER_S3_KEY` (`KAYAZ.exe`), `LAUNCHER_S3_ACCESS_KEY_ID`,
   `LAUNCHER_S3_SECRET_ACCESS_KEY`, and `LAUNCHER_S3_REGION` (`auto`).
5. Remove `LAUNCHER_GH_REPO`, so the R2 path is the one that runs.

Backblaze B2 works the same way through the same variables. Vercel's own blob
storage is capped low enough to be awkward for a file this size, and Supabase
storage is a reasonable alternative if you would rather not open a Cloudflare
account.

I could not get a vetted storage recommendation out of the tools available to
me, they had no object-storage providers in the catalogue, so the two options
above come from general knowledge. The GitHub path is verified working end to
end. The R2 path is verified structurally, correct host, path, sorted query,
credential scope and signature length, but I had no R2 credentials to sign a
real request, so test one download after switching.

## What was added

| File | Job |
| --- | --- |
| `api/_lib.js` | a second Firebase client for `R6_Firebase_*`, raw body reader, launcher key generator |
| `api/_launcher.js` | resolves a short-lived private download URL from GitHub or S3/R2 |
| `api/sellauth.js` | the webhook: verify signature, dedupe, mint the key, store the order |
| `api/launcher.js` | order plus email, or a pasted key, in return for the key and a download link |
| `api/launcher-download.js` | the only way to reach the build, re-checks the key, then 302s |
| `api/launcher-keys.js` | admin list, disable, unbind, delete and hardware bans |
| `launcher/index.html` | the buyer facing delivery page |
| `dashboard/index.html` | a `launcher keys` tab |
| `scripts/verify-launcher.mjs` | `npm run verify-launcher`, 35 checks against stub databases |

The key shape written into the R6 database is exactly what the launcher reads:

```
keys/<sha256(the key, exactly as typed)>
  disabled:      false
  expires_at:    <unix seconds, from the term that was bought>
  hwid:          ""          <- stays empty so the first machine binds itself
  tier, order, email, created, duration_days, active
```

Because the launcher hashes the literal string, the key is case sensitive. The
delivery page therefore shows it with a copy button. `KAYAZ-XXXX-XXXX-XXXX` is
the generated format.

## Honest limits

- You cannot really encrypt a Windows executable you hand to customers. Anything
  that runs on their machine can be unpacked, so a key check compiled into the
  exe is a speed bump, not a wall. What actually helps is that the file is no
  longer published, the key gate exists, and you can revoke a key that leaks.
  You have VMProtect sitting in `D:\Important\VMProtect3.9.4`, and packing the
  launcher plus the client is the next real step up if you want it.
- The bigger weakness is not the download. `firebase_auth.h` and
  `kayaz_check.h` embed the R6 database secret in the binary and talk to
  Firebase with `?auth=<secret>` directly, which their own comments call out. A
  determined person can extract that secret and mint their own keys, and no
  amount of site side work changes that. The clean fix is to move those checks
  behind this API, the same way the download now is, so the secret only ever
  lives in the function environment. That is a launcher change, so I did not
  touch it.
- Separately, and not part of this work: the Omnis launcher family under
  `D:\Important\venniisbesthesmydadyy - Copy\Launchers\LauncherBase.hpp` has a
  GitHub personal access token hardcoded in one of the source files. If any of
  those builds ship, that token ships with them and anyone can read the private
  repo it belongs to. Rotate it. You told me not to change anything in those
  folders, so I have not, and the value deliberately does not appear here.
