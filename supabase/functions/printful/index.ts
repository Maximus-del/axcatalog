// PRINTFUL BRIDGE — AX operators talk to Printful through
// here so the API token never reaches a browser.
//
// Auth: an AX operator's JWT (current_user_is_operator). The one exception is
// `status`, which answers only connected yes/no and reveals nothing else.
//
// POST { action, ... }
//   status                    → { connected: boolean } (no auth)
//   whoami                    → the Printful store(s) the token can see
//   request { method, path, body? }  → pass-through to api.printful.com for
//                               allow-listed paths only (store, products,
//                               files, catalog, mockup-generator, orders GET)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALLOWED = [
  /^\/stores$/,
  /^\/store(\/.*)?$/,
  /^\/store\/products(\/.*)?$/,
  /^\/sync\/products(\/.*)?$/,
  /^\/files(\/.*)?$/,
  /^\/products(\/.*)?$/,
  /^\/v2\/catalog-products(\/.*)?$/,
  /^\/v2\/catalog-variants(\/.*)?$/,
  /^\/mockup-generator(\/.*)?$/,
  /^\/orders(\/.*)?$/,
];

async function authorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await caller.rpc('current_user_is_operator');
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const token = Deno.env.get('PRINTFUL_API_TOKEN');
    const body = await req.json().catch(() => ({}));

    if (body.action === 'status') {
      if (!token) return json({ connected: false, reason: 'token_missing' });
      const r = await fetch('https://api.printful.com/stores', { headers: { Authorization: `Bearer ${token}` } });
      return json({ connected: r.ok, reason: r.ok ? null : `printful_${r.status}` });
    }

    // Printful's public product catalog (items, variants, prices, print areas).
    // Read-only and not about this store, so no login needed.
    if (body.action === 'catalog') {
      if (!token) return json({ error: 'PRINTFUL_API_TOKEN is not set' }, 500);
      const path = String(body.path ?? '');
      if (!/^\/(v2\/catalog-(products|variants|categories)|products|categories|mockup-generator\/templates|mockup-generator\/printfiles)(\/[\w\-./?=&,]*)?$/.test(path) || path.includes('..')) {
        return json({ error: 'Catalog path not allowed' }, 400);
      }
      const r = await fetch(`https://api.printful.com${path}`, { headers: { Authorization: `Bearer ${token}` } });
      return json({ status: r.status, data: await r.json().catch(() => null) });
    }

    if (!(await authorized(req))) return json({ error: 'Not authorized' }, 403);
    if (!token) return json({ error: 'PRINTFUL_API_TOKEN is not set' }, 500);

    const call = async (method: string, path: string, payload?: unknown, storeId?: string) => {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      if (storeId) headers['X-PF-Store-Id'] = storeId;
      const r = await fetch(`https://api.printful.com${path}`, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
      const text = await r.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* keep text */ }
      return { status: r.status, data };
    };

    if (body.action === 'whoami') {
      const stores = await call('GET', '/stores');
      return json(stores);
    }

    if (body.action === 'request') {
      const method = String(body.method ?? 'GET').toUpperCase();
      const path = String(body.path ?? '');
      const pathOnly = path.split('?')[0];
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method) || !ALLOWED.some((re) => re.test(pathOnly))) {
        return json({ error: 'Path not allowed' }, 400);
      }
      if (pathOnly.startsWith('/orders') && method !== 'GET') return json({ error: 'Orders are read-only here' }, 400);
      return json(await call(method, path, body.body, body.storeId ? String(body.storeId) : undefined));
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Printful bridge failed' }, 500);
  }
});
