// GET /sales — Brand HQ's sales detail: every product the client has sold
// (current and archived), recent fan orders with what was in them, and the
// client's own orders as invoices. Server: portal_sales_detail() (owner-only;
// no customer names or emails).
import { supabase } from "@/integrations/supabase/client";
import type { Money, PortalScope } from "./contract";
import { isMissingFunction, money, toApiError } from "./money";

export type SaleStatus = "current" | "archived" | "retired";

export interface ProductSale {
  productId: string | null;
  title: string;
  /** current = still in the lineup · archived = in AX, not for sale · retired = before the dashboard */
  status: SaleStatus;
  units: number;
  gross: Money | null;
  orders: number;
  firstSale: string | null;
  lastSale: string | null;
}

export interface SaleItem {
  productId: string | null;
  title: string;
  variant: string | null;
  quantity: number;
  total: Money | null;
}

export interface FanOrder {
  id: string;
  number: string;
  date: string | null;
  refunded: boolean;
  units: number;
  gross: Money | null;
  items: SaleItem[];
}

export interface Invoice {
  id: string;
  number: string;
  date: string | null;
  /** What AX charged in Shopify. Null when billed outside Shopify. */
  charged: Money | null;
  billedOutside: boolean;
  units: number;
  items: Omit<SaleItem, "total">[];
}

export interface SalesDetail {
  attributable: boolean;
  products: ProductSale[];
  fanOrders: FanOrder[];
  fanOrderCount: number;
  invoices: Invoice[];
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const usd = (v: unknown) => (v === null || v === undefined ? null : money(v, "USD"));
const status = (v: unknown): SaleStatus => (v === "current" || v === "archived" ? v : "retired");

const item = (i: Json): SaleItem => ({
  productId: s(i.productId),
  title: s(i.title) ?? "Product",
  variant: s(i.variant),
  quantity: n(i.quantity),
  total: usd(i.total),
});

/** Pure: the RPC's JSON → typed detail. Exported for tests. */
export function parseSalesDetail(raw: unknown): SalesDetail {
  const r = (raw ?? {}) as Json;
  if (r.attributable !== true) return { attributable: false, products: [], fanOrders: [], fanOrderCount: 0, invoices: [] };
  return {
    attributable: true,
    products: arr(r.products).map((p) => ({
      productId: s(p.productId),
      title: s(p.title) ?? "Product",
      status: status(p.status),
      units: n(p.units),
      gross: usd(p.gross),
      orders: n(p.orders),
      firstSale: s(p.firstSale),
      lastSale: s(p.lastSale),
    })),
    fanOrders: arr(r.fanOrders).map((o) => ({
      id: String(o.id ?? ""),
      number: s(o.number) ?? "—",
      date: s(o.date),
      refunded: o.refunded === true,
      units: n(o.units),
      gross: usd(o.gross),
      items: arr(o.items).map(item),
    })),
    fanOrderCount: n(r.fanOrderCount),
    invoices: arr(r.invoices).map((o) => {
      const billedOutside = o.billedOutside === true;
      return {
        id: String(o.id ?? ""),
        number: s(o.number) ?? "—",
        date: s(o.date),
        charged: billedOutside ? null : usd(o.charged),
        billedOutside,
        units: n(o.units),
        items: arr(o.items).map((i) => {
          const { total: _t, ...rest } = item(i);
          return rest;
        }),
      };
    }),
  };
}

/** "L ×50 · XL ×26" — one product's sizes on an invoice, grouped. Pure. */
export function groupInvoiceItems(items: Invoice["items"]): { productId: string | null; title: string; units: number; sizes: string }[] {
  const by = new Map<string, { productId: string | null; title: string; units: number; parts: string[] }>();
  for (const i of items) {
    const k = i.productId ?? i.title.toLowerCase();
    const g = by.get(k) ?? { productId: i.productId, title: i.title, units: 0, parts: [] };
    g.units += i.quantity;
    g.parts.push(`${i.variant ?? "One size"} ×${i.quantity}`);
    by.set(k, g);
  }
  return [...by.values()].map(({ parts, ...g }) => ({ ...g, sizes: parts.join(" · ") }));
}

export async function fetchSalesDetail(scope: PortalScope, ordersLimit = 50): Promise<SalesDetail | null> {
  const { data, error } = await supabase.rpc("portal_sales_detail" as never, { _athlete_id: scope.athleteId, _orders_limit: ordersLimit } as never);
  if (error) {
    if (isMissingFunction(error)) return null;
    throw toApiError(error);
  }
  return parseSalesDetail(data);
}
