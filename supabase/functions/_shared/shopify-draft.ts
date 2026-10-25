// Portal order → Shopify draft order input. Pure (no Deno, no fetch) so the
// portal's tests cover it too: src/lib/portal/cart.test.ts.
//
// Every figure comes from the server's own record of the order
// (portal_checkout_payload), never from the browser.

export interface CheckoutLine {
  title?: string | null;
  color?: string | null;
  size?: string | null;
  quantity: number;
  effectiveUnitPrice: number | string;
  shopifyVariantId?: string | null;
  sku?: string | null;
}

export interface CheckoutPayload {
  orderId: string;
  orderNumber: string;
  terms: 'pay_now' | 'net_30';
  email: string | null;
  shipTo: Record<string, string> | null;
  lines: CheckoutLine[];
  surcharge: number | string;
  creditApplied: number | string;
  payNowDiscount: number | string;
}

/** Shopify's built-in "Net 30" payment terms template. */
export const NET_30_TEMPLATE = 'gid://shopify/PaymentTermsTemplate/4';
/** Tag that keeps these wholesale orders out of retail sales imports and athlete earnings. */
export const WHOLESALE_TAG = 'ax-portal-wholesale';

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const money = (amount: number) => ({ amount: amount.toFixed(2), currencyCode: 'USD' });

export function variantGid(id: string | null | undefined): string | null {
  if (!id) return null;
  if (/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id)) return id;
  if (/^\d+$/.test(id)) return `gid://shopify/ProductVariant/${id}`;
  return null;
}

export function buildDraftInput(p: CheckoutPayload, now = new Date()) {
  const lineItems: Record<string, unknown>[] = [];
  for (const l of p.lines) {
    const qty = Math.trunc(n(l.quantity));
    if (qty < 1) continue;
    const unit = Math.round(n(l.effectiveUnitPrice) * 100) / 100;
    const gid = variantGid(l.shopifyVariantId);
    if (gid) {
      lineItems.push({ variantId: gid, quantity: qty, priceOverride: money(unit) });
    } else {
      const opts = [l.color, l.size].filter((x) => x && String(x).trim()).join(' / ');
      lineItems.push({
        title: `${l.title || 'AX product'}${opts ? ` — ${opts}` : ''}`,
        quantity: qty,
        originalUnitPriceWithCurrency: money(unit),
        requiresShipping: true,
        taxable: true,
        ...(l.sku ? { sku: l.sku } : {}),
      });
    }
  }
  const surcharge = n(p.surcharge);
  if (surcharge > 0) {
    lineItems.push({ title: 'Rush turnaround', quantity: 1, originalUnitPriceWithCurrency: money(surcharge), requiresShipping: false, taxable: false });
  }

  const credit = n(p.creditApplied);
  const payNow = p.terms === 'pay_now' ? n(p.payNowDiscount) : 0;
  const off = Math.round((credit + payNow) * 100) / 100;
  const offTitle = [credit > 0 ? 'AX credit' : null, payNow > 0 ? 'Pay-now 5% off' : null].filter(Boolean).join(' + ');

  const input: Record<string, unknown> = {
    lineItems,
    note: `AX portal order ${p.orderNumber}`,
    tags: [WHOLESALE_TAG, p.orderNumber],
    poNumber: p.orderNumber,
    shippingLine: { title: 'AX delivery', priceWithCurrency: money(0) },
    customAttributes: [{ key: 'ax_order_id', value: p.orderId }],
  };
  if (p.email) input.email = p.email;
  if (off > 0) input.appliedDiscount = { title: offTitle, value: off, valueType: 'FIXED_AMOUNT' };
  if (p.shipTo && p.shipTo.address1) {
    const [firstName, ...rest] = String(p.shipTo.name ?? '').trim().split(/\s+/);
    input.shippingAddress = {
      firstName: rest.length ? firstName : undefined,
      lastName: rest.length ? rest.join(' ') : firstName || undefined,
      company: p.shipTo.company,
      address1: p.shipTo.address1,
      address2: p.shipTo.address2,
      city: p.shipTo.city,
      provinceCode: p.shipTo.province,
      zip: p.shipTo.zip,
      countryCode: p.shipTo.country || 'US',
      phone: p.shipTo.phone,
    };
  }
  if (p.terms === 'net_30') {
    input.paymentTerms = { paymentTermsTemplateId: NET_30_TEMPLATE, paymentSchedules: [{ issuedAt: now.toISOString() }] };
  }
  return input;
}

/** Shopify said the app's token can't do this (missing scope). */
export function isAccessDenied(errors: unknown): boolean {
  const s = JSON.stringify(errors ?? '');
  return /ACCESS_DENIED|access denied|required access|write_draft_orders/i.test(s);
}
