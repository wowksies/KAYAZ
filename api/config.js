import { rateLimit } from './_lib.js';
import health from './_health.js';

                                                                                
                                                                                
  
                            
                                    
                                                                                       
                                                                          
                                                                       
                                                                                             
  
                                                                            
                                                                              
                                                          
                                                              
                                                                     
                                                                       
                                                                            
  
                                                   
                                                                               
                                                                                           
                                                                    
                                                                    
                                                                                            

export default function handler(req, res) {
                                                                  
                                                                      
  if (req.query && (req.query.__health === '1' || req.query.__health === 1)) return health(req, res);
  if (!rateLimit(req, res, 'config', 120, 60000)) return;
  const env = process.env;
  const num = v => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const money = (name, fallback) => {
    const n = parseFloat(env[name]);
    return Number.isFinite(n) ? n : fallback;
  };

  const mode = (env.SELLAUTH_MODE || 'variants').toLowerCase() === 'products' ? 'products' : 'variants';
  const shopId = num(env.SHOP_ID);
  const productId = num(env.PRODUCT_ID);
  const shopUrl = env.SHOP_URL || 'https://kayaz.mysellauth.com';

                             
  const durationIds = {
    threeDays: num(env.THREEDAYID),
    sevenDays: num(env.SEVENDAYID),
    oneMonth: num(env.ONEMONTHID),
    seasonal: num(env.SEASONALID)
  };

  const catalog = [
    { key: 'threeDays', name: '3 Days', img: '/assets/products/3days.png', tag: 'quick access', blurb: 'Three days of KAYAZ R6: The External.', price: money('PRICE_3DAYS', 4.99), compareAt: money('COMPARE_3DAYS', 6.99) },
    { key: 'sevenDays', name: '7 Days', img: '/assets/products/7days.png', tag: 'most popular', blurb: 'A full week of KAYAZ R6: The External.', price: money('PRICE_7DAYS', 9.99), compareAt: money('COMPARE_7DAYS', 12.99) },
    { key: 'oneMonth', name: '1 Month', img: '/assets/products/1month.png', tag: 'monthly', blurb: 'One month of KAYAZ R6: The External.', price: money('PRICE_1MONTH', 29.99), compareAt: money('COMPARE_1MONTH', 39.99) },
    { key: 'seasonal', name: 'Seasonal', img: '/assets/products/seasonal.png', tag: 'longest access', blurb: 'Seasonal access to KAYAZ R6: The External.', price: money('PRICE_SEASONAL', 69.99), compareAt: money('COMPARE_SEASONAL', 89.99) }
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
    currency: env.CURRENCY || 'EUR',
    currencySymbol: env.CURRENCY_SYMBOL || '\u20ac',
    ready: Boolean(shopId && products.length)
  , products });
}
