// SHOPIFY CONNECT for the AX dashboard (the "Athlete Xclusive Dashboard" app).
//   GET ?start=1          → Shopify's approve-permissions screen
//   GET ?code=&shop=&hmac= → Shopify's callback: verify, swap code for token,
//                            save it to organizations.shopify_access_token.
// The token is never shown on screen.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read access for sync + draft orders and payment terms for portal checkout
// (pay now / net 30, edge function portal-checkout).
const SCOPES = [
  'read_products', 'read_product_listings', 'read_orders', 'read_all_orders', 'read_customers',
  'read_inventory', 'read_fulfillments', 'read_locations',
  'read_draft_orders', 'write_draft_orders', 'read_payment_terms', 'write_payment_terms',
].join(',');

function getEnv() {
  const shopDomain = Deno.env.get('SHOPIFY_SHOP_DOMAIN');
  const clientId = Deno.env.get('SHOPIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const organizationId = Deno.env.get('ORGANIZATION_ID');
  if (!shopDomain) throw new Error('Missing SHOPIFY_SHOP_DOMAIN');
  if (!clientId) throw new Error('Missing SHOPIFY_CLIENT_ID');
  if (!clientSecret) throw new Error('Missing SHOPIFY_CLIENT_SECRET');
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL');
  if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  if (!organizationId) throw new Error('Missing ORGANIZATION_ID');
  return { shopDomain, clientId, clientSecret, supabaseUrl, supabaseServiceKey, organizationId };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Shopify signs its callback: HMAC-SHA256 (hex) of the sorted query, minus hmac, with the app secret.
async function validHmac(params: URLSearchParams, secret: string): Promise<boolean> {
  const given = params.get('hmac');
  if (!given) return false;
  const msg = [...params.entries()]
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  let env;
  try { env = getEnv(); } catch (e) {
    return json({ error: 'config', message: (e as Error).message }, 500);
  }

  const url = new URL(req.url);
  const me = env.supabaseUrl + '/functions/v1/shopify-oauth';

  if (url.searchParams.get('start')) {
    const a = new URL('https://' + env.shopDomain + '/admin/oauth/authorize');
    a.searchParams.set('client_id', env.clientId);
    a.searchParams.set('scope', SCOPES);
    a.searchParams.set('redirect_uri', me);
    a.searchParams.set('grant_options[]', 'offline');
    return Response.redirect(a.toString(), 302);
  }

  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');

  if (code && shop) {
    if (shop !== env.shopDomain) {
      return json({ error: 'shop_mismatch' }, 400);
    }
    if (!(await validHmac(url.searchParams, env.clientSecret))) {
      return json({ error: 'bad_signature', message: 'This link did not come from Shopify. Start again from ?start=1.' }, 401);
    }
    try {
      const r = await fetch('https://' + env.shopDomain + '/admin/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.clientId, client_secret: env.clientSecret, code }),
      });
      if (!r.ok) {
        return json({ error: 'shopify_token_exchange_failed', status: r.status }, 500);
      }
      const data = await r.json();
      const token = data.access_token;
      const scopes = data.scope || '';
      if (!token) return json({ error: 'no_access_token' }, 500);

      const sb = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
      const { error: dbError } = await sb.from('organizations').update({
        shopify_shop_domain: env.shopDomain,
        shopify_connected: true,
        shopify_connected_at: new Date().toISOString(),
        shopify_access_token: token,
      }).eq('id', env.organizationId);

      if (dbError) {
        console.error('shopify-oauth: save failed', dbError.message);
        return json({ status: 'save_failed', message: 'Shopify approved, but saving the connection failed. Tell AX support.' }, 500);
      }
      return json({ status: 'success', message: 'Shopify connected. You can close this tab.', granted_scopes: scopes });
    } catch (e) {
      return json({ error: 'exception', message: (e as Error).message }, 500);
    }
  }

  return json({ status: 'ready', instructions: 'Visit ' + me + '?start=1 in your browser to connect Shopify.' });
});
