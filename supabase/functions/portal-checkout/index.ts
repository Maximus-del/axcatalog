// PORTAL CHECKOUT — turns a client's portal order into something they can pay.
//
//   pay_now → a Shopify draft order (5% pay-now discount + any AX credit off),
//             and its invoice checkout URL (cards, Apple Pay, Shop Pay).
//   net_30  → a Shopify draft order with Net 30 terms, completed straight
//             away: a real order, payment due in 30 days, payable any time
//             from the order page.
//
// Auth: the caller's own JWT. portal_checkout_payload only answers for an
// owner's own order that the server priced, so nothing in the request body
// can change what's charged. The Shopify token is read server-side only.
//
// POST { orderId, action?: 'start' | 'refresh' }
//   → { ok, terms, paymentUrl, paymentStatus, dueDate? }
//   → { ok:false, code:'not_connected' } when the store app lacks draft-order access
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildDraftInput, isAccessDenied, type CheckoutPayload } from '../_shared/shopify-draft.ts';

const API_VERSION = '2025-07';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Gql = { data?: any; errors?: unknown };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return json({ ok: false, error: 'Sign in again.' }, 401);
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const action = body.action === 'refresh' ? 'refresh' : 'start';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ ok: false, error: 'Missing order.' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: payload, error: pErr } = await caller.rpc('portal_checkout_payload', { _order_id: orderId });
  if (pErr || !payload) return json({ ok: false, error: pErr?.message ?? 'Order not found.' }, pErr?.code === '42501' ? 403 : 404);
  const p = payload as CheckoutPayload & {
    organizationId: string; draftOrderId: string | null; shopifyOrderId: string | null;
    paymentUrl: string | null; paymentStatus: string | null;
  };

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // The store that sells AX products. Prefer the order's org if it has one.
  const { data: stores } = await admin
    .from('organizations')
    .select('id, shopify_shop_domain, shopify_access_token')
    .not('shopify_access_token', 'is', null);
  const store = (stores ?? []).find((s: any) => s.id === p.organizationId) ?? (stores ?? [])[0];
  if (!store?.shopify_shop_domain || !store?.shopify_access_token) {
    return json({ ok: false, code: 'not_connected', error: 'The store isn’t connected for payments yet.' });
  }
  const shopify = async (query: string, variables: Record<string, unknown> = {}): Promise<Gql> => {
    const r = await fetch(`https://${store.shopify_shop_domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': store.shopify_access_token },
      body: JSON.stringify({ query, variables }),
    });
    return (await r.json().catch(() => ({ errors: [{ message: `Shopify ${r.status}` }] }))) as Gql;
  };
  const save = (patch: Record<string, unknown>) =>
    admin.from('bulk_order_requests').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', p.orderId);
  const notConnected = async (detail: unknown) => {
    await save({ payment_error: 'not_connected' });
    console.error('portal-checkout: Shopify refused', JSON.stringify(detail));
    return json({ ok: false, code: 'not_connected', error: 'Online payment isn’t switched on yet. AX will send your payment link.' });
  };

  // ── refresh: has it been paid? ──────────────────────────────────────────
  if (action === 'refresh' || p.draftOrderId) {
    if (!p.draftOrderId) return json({ ok: true, terms: p.terms, paymentUrl: null, paymentStatus: p.paymentStatus });
    const r = await shopify(
      `query($id: ID!) { draftOrder(id: $id) { status invoiceUrl order { id statusPageUrl displayFinancialStatus } } }`,
      { id: p.draftOrderId },
    );
    if (r.errors) {
      if (isAccessDenied(r.errors)) return notConnected(r.errors);
      return json({ ok: true, terms: p.terms, paymentUrl: p.paymentUrl, paymentStatus: p.paymentStatus });
    }
    const d = r.data?.draftOrder;
    const fin = d?.order?.displayFinancialStatus as string | undefined;
    const paid = fin === 'PAID';
    const patch: Record<string, unknown> = {};
    if (d?.order?.id && !p.shopifyOrderId) patch.shopify_order_id = d.order.id;
    if (d?.order?.statusPageUrl && p.terms === 'net_30') patch.payment_url = d.order.statusPageUrl;
    if (paid && p.paymentStatus !== 'paid') Object.assign(patch, { payment_status: 'paid', paid_at: new Date().toISOString() });
    if (Object.keys(patch).length) await save(patch);
    return json({
      ok: true,
      terms: p.terms,
      paymentUrl: (patch.payment_url as string) ?? p.paymentUrl,
      paymentStatus: paid ? 'paid' : p.paymentStatus,
    });
  }

  // ── start: make the draft order ─────────────────────────────────────────
  const input = buildDraftInput(p);
  if (!(input.lineItems as unknown[]).length) return json({ ok: false, error: 'This order has no lines to pay for.' }, 400);
  // Claim the order so a double tap can't make two drafts.
  const { data: claimed } = await admin
    .from('bulk_order_requests')
    .update({ payment_error: 'creating' })
    .eq('id', p.orderId)
    .is('shopify_draft_order_id', null)
    .or('payment_error.is.null,payment_error.neq.creating')
    .select('id');
  if (!claimed?.length) return json({ ok: false, code: 'in_progress', error: 'Payment is already being set up. Give it a moment.' }, 409);
  const created = await shopify(
    `mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id invoiceUrl } userErrors { field message } } }`,
    { input },
  );
  if (created.errors) {
    if (isAccessDenied(created.errors)) return notConnected(created.errors);
    await save({ payment_error: 'shopify_error' });
    console.error('portal-checkout: draftOrderCreate', JSON.stringify(created.errors));
    return json({ ok: false, error: 'Couldn’t set up payment. Try again in a minute.' }, 502);
  }
  const ue = created.data?.draftOrderCreate?.userErrors ?? [];
  const draft = created.data?.draftOrderCreate?.draftOrder;
  if (ue.length || !draft?.id) {
    await save({ payment_error: 'shopify_rejected' });
    console.error('portal-checkout: userErrors', JSON.stringify(ue));
    return json({ ok: false, error: ue[0]?.message ?? 'Shopify didn’t accept this order.' }, 422);
  }
  await save({ shopify_draft_order_id: draft.id, payment_url: draft.invoiceUrl, payment_error: null });

  if (p.terms === 'pay_now') {
    return json({ ok: true, terms: 'pay_now', paymentUrl: draft.invoiceUrl, paymentStatus: 'unpaid' });
  }

  // Net 30: complete now → an order with payment due in 30 days.
  const done = await shopify(
    `mutation($id: ID!) { draftOrderComplete(id: $id, sourceName: "ax-portal") { draftOrder { order { id statusPageUrl } } userErrors { field message } } }`,
    { id: draft.id },
  );
  const order = done.data?.draftOrderComplete?.draftOrder?.order;
  if (done.errors || done.data?.draftOrderComplete?.userErrors?.length || !order?.id) {
    console.error('portal-checkout: draftOrderComplete', JSON.stringify(done.errors ?? done.data?.draftOrderComplete?.userErrors));
    // The draft exists with Net 30 terms; AX can complete it from Shopify admin.
    await save({ payment_error: 'complete_failed' });
    return json({ ok: true, terms: 'net_30', paymentUrl: null, paymentStatus: 'invoiced' });
  }
  await save({ shopify_order_id: order.id, payment_url: order.statusPageUrl });
  return json({ ok: true, terms: 'net_30', paymentUrl: order.statusPageUrl, paymentStatus: 'invoiced' });
});
