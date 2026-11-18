// Shopify Admin API for the orders tracker. Uses the Dev Dashboard app ("Express Tracker") with the
// client credentials grant: SHOPIFY_SHOP (store subdomain), SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET.
// Tokens last 24 hours and are cached per function instance.
const VERSION = '2026-10';
let cached = { token: '', exp: 0 };

const shop = () => String(process.env.SHOPIFY_SHOP || '').replace(/\.myshopify\.com$/, '').trim();
export const shopifyConfigured = () => !!(shop() && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);

async function token() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const r = await fetch(`https://${shop()}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Shopify token ${r.status}: ${j.error || j.errors || 'failed'}`);
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) - 300) * 1000 };
  return cached.token;
}

export async function shopifyGraphQL(query, variables = {}) {
  const r = await fetch(`https://${shop()}.myshopify.com/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Shopify ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  return j.data;
}
