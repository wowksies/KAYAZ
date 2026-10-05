import { rateLimit } from './_lib.js';

// Public storefront config. Exposes only non-secret SellAuth identifiers so the
// browser can build a checkout cart. No Firebase secrets ever leave the server.
//
// Env vars (set in Vercel):
//   SHOP_ID     -> SellAuth shop id
//   PRODUCT_ID  -> the single SellAuth product id (used as productId in variants mode)
//   THREEDAYID / SEVENDAYID / ONEMONTHID / SEASONALID -> per-duration ids
//   SHOP_URL    -> the SellAuth storefront url checkout is served from
//                  (for example https://yourshop.mysellauth.com or your custom store domain)
//
// MODE controls how the per-duration ids are used:
//   'variants' (default) -> each duration id is a VARIANT id under PRODUCT_ID.
//                           cart item: { productId: PRODUCT_ID, variantId: <duration id> }
//   'products'           -> each duration id is its own PRODUCT id.
//                           cart item: { productId: <duration id> }
// Flip MODE here (or set SELLAUTH_MODE env) if the ids map the other way in your dashboard.

export default function handler(req, res) {
  if (!rateLimit(req, res, 'config', 120, 60000)) return;
  const env = process.env;
  const num = v => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const mode = (env.SELLAUTH_MODE || 'variants').toLowerCase() === 'products' ? 'products' : 'variants';
  const shopId = num(env.SHOP_ID);
  const productId = num(env.PRODUCT_ID);
  const shopUrl = env.SHOP_URL || 'https://kayaz.mysellauth.com';

  // duration label -> its id
  const durationIds = {
    threeDays: num(env.THREEDAYID),
    sevenDays: num(env.SEVENDAYID),
    oneMonth: num(env.ONEMONTHID),
    seasonal: num(env.SEASONALID)
  };

  const catalog = [
    { key: 'threeDays', name: '3 Days', img: '/assets/products/3days.png', tag: 'quick access', blurb: 'Three days of KAYAZ R6: The Internal.' },
    { key: 'sevenDays', name: '7 Days', img: '/assets/products/7days.png', tag: 'most popular', blurb: 'A full week of KAYAZ R6: The Internal.' },
    { key: 'oneMonth', name: '1 Month', img: '/assets/products/1month.png', tag: 'monthly', blurb: 'One month of KAYAZ R6: The Internal.' },
    { key: 'seasonal', name: 'Seasonal', img: '/assets/products/seasonal.png', tag: 'longest access', blurb: 'Seasonal access to KAYAZ R6: The Internal.' }
  ];

  const products = catalog
    .map(p => {
      const id = durationIds[p.key];
      if (id == null) return null;
      const item = mode === 'products'
        ? { productId: id, quantity: 1 }
        : { productId, variantId: id, quantity: 1 };
      if (!item.productId) return null;
      return { ...p, id, cart: [item] };
    })
    .filter(Boolean);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    mode,
    shopId,
    shopUrl,
    ready: Boolean(shopId && products.length)
  , products });
}
