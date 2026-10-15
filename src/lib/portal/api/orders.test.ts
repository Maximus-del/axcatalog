import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- a scripted Supabase client --------------------------------------------
const rpc = vi.fn();
const inserts: { table: string; rows: unknown }[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    b.insert = (rows: unknown) => {
      inserts.push({ table, rows });
      return b;
    };
    b.select = () => b;
    b.single = () => Promise.resolve({ data: { id: "legacy-1", order_number: "BR-2026-123" }, error: null });
    b.update = () => b;
    b.eq = () => Promise.resolve({ error: null });
    b.then = (res: (v: unknown) => unknown) => res({ error: null });
    return b;
  };
  return { supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (t: string) => builder(t) } };
});

import { submitPortalOrder } from "@/lib/portal-commerce";
import { newIdempotencyKey, parseQuote, quoteFromConflict, submitOrderRequest } from "./orders";
import { PortalApiError } from "./contract";
import { filterProducts, frontBack, isOrderable, publicUrlOf, sheetUnitPrice } from "./products";

const scope = { athleteId: "a", organizationId: "o", viewingAs: false };
const QUOTE = {
  currency: "USD",
  units: 5,
  discountPct: 0,
  surcharge: 0,
  subtotal: 124.0,
  compareTotal: 171.0,
  savings: 47.0,
  creditAvailable: 2500.0,
  lines: [
    { productId: "h", title: "Hoodie", color: "Black", size: "M", quantity: 2, unitPrice: 35, effectiveUnitPrice: 35, compareUnitPrice: 48, lineTotal: 70, shopifyVariantId: null },
  ],
};

beforeEach(() => {
  rpc.mockReset();
  inserts.length = 0;
});

describe("sheet price — must match portal_sheet_unit_price() in SQL", () => {
  // The same cases as supabase/tests/portal/stage2.test.sql.
  const base = { athlete_unit_price: null, wholesale_price: null, price: null };
  it.each([
    [{ ...base, product_type: "hoodie", title: "Mooney hoodie" }, 35, 48],
    [{ ...base, product_type: "apparel", title: "Mooney World Tee" }, 18, 25],
    [{ ...base, product_type: "apparel", title: "Comic Book Hoodie" }, 35, 48],
    [{ ...base, product_type: "accessory", title: "Moon's House Mug", athlete_unit_price: 30, price: 22 }, 30, 22],
    [{ ...base, product_type: "hat", title: "Cap" }, 18, 25],
  ])("%o → %d / %d", (p, athlete, compare) => {
    expect(sheetUnitPrice(p as never)).toEqual({ athleteUnit: athlete, compareUnit: compare });
  });
});

describe("product shape", () => {
  const img = (url: string, view?: string) => ({ id: url, url, is_primary: false, sort_order: 0, shopifyImageId: null, metadata: view ? { view } : {} });
  it("front is primary, back is the next image", () => {
    expect(frontBack({ images: [img("f"), img("b")] as never, primary_image_url: null })).toEqual({ front: "f", back: "b" });
  });
  it("tagged views win over order", () => {
    expect(frontBack({ images: [img("x", "back"), img("y", "front")] as never, primary_image_url: null })).toEqual({ front: "y", back: "x" });
  });
  it("one image → no back, never the same picture twice", () => {
    expect(frontBack({ images: [img("only")] as never, primary_image_url: "only" })).toEqual({ front: "only", back: null });
  });
  it("orderable: made-to-order with no variants, not when every real variant is out", () => {
    expect(isOrderable({ status: "published", variants: [] })).toBe(true);
    expect(isOrderable({ status: "published", variants: [{ color: "Black", size: "M", available: false }] as never })).toBe(false);
    expect(isOrderable({ status: "archived", variants: [] } as never)).toBe(false);
  });
  it("public link only from a real Shopify handle", () => {
    expect(publicUrlOf({ shopify_handle: "the-1-hoodie" })).toBe("https://www.athletexclusive.com/products/the-1-hoodie");
    expect(publicUrlOf({ shopify_handle: null })).toBeNull();
  });
  it("filters by destination and hidden", () => {
    const ps = [
      { id: "1", destinationIds: ["atlanta"], hidden: false },
      { id: "2", destinationIds: ["chicago"], hidden: true },
      { id: "3", destinationIds: [], hidden: false },
    ] as never[];
    expect(filterProducts(ps, { collection: "atlanta" }).map((p: { id: string }) => p.id)).toEqual(["1"]);
    expect(filterProducts(ps).map((p: { id: string }) => p.id)).toEqual(["1", "3"]);
    expect(filterProducts(ps, { hidden: "only" }).map((p: { id: string }) => p.id)).toEqual(["2"]);
    expect(filterProducts(ps, { collection: "all", hidden: "include" })).toHaveLength(3);
  });
});

describe("quote parsing", () => {
  it("money in cents, and the raw subtotal to echo back", () => {
    const q = parseQuote(QUOTE);
    expect(q.subtotal).toEqual({ amountMinor: 12400, currency: "USD" });
    expect(q.subtotalDollars).toBe(124);
    expect(q.lines[0].unitPrice?.amountMinor).toBe(3500);
  });
  it("a 409 'price changed' carries the new quote", () => {
    const e = new PortalApiError({ code: "P0409", message: "The price changed", requestId: "x" }, 409) as PortalApiError & { details?: string };
    e.details = JSON.stringify({ quote: QUOTE });
    expect(quoteFromConflict(e)?.subtotalDollars).toBe(124);
    expect(quoteFromConflict(new Error("x"))).toBeNull();
  });
  it("idempotency keys are v4 UUIDs and unique", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe("submitting", () => {
  const input = {
    organizationId: "o",
    athleteId: "a",
    userId: "u",
    items: [{ product_id: "h", product_name: "Hoodie", size: "M", quantity: 2, color: "Black" }],
    summary: "Bulk order sheet",
    creditToApply: 10,
    amountDue: 60,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };

  it("sends WHAT, not what it costs, and returns the server's numbers", async () => {
    rpc.mockResolvedValueOnce({
      data: { orderId: "o1", orderNumber: "BR-2026-00001", status: "submitted", subtotal: 70, creditApplied: 10, amountDue: 60, currency: "USD", replayed: false },
      error: null,
    });
    const res = await submitPortalOrder(input);
    expect(res).toMatchObject({ ok: true, orderNumber: "BR-2026-00001", subtotal: 70, creditApplied: 10, amountDue: 60 });
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("portal_submit_order_request");
    expect(args._idempotency_key).toBe(input.idempotencyKey);
    expect(JSON.stringify(args._items)).not.toMatch(/price/i);
    expect(inserts).toHaveLength(0);
  });

  it("price differs from the screen → nothing submitted, new price returned", async () => {
    rpc.mockResolvedValueOnce({ data: { ...QUOTE, subtotal: 124 }, error: null });
    const res = await submitPortalOrder({ ...input, screenSubtotal: 100 });
    expect(res.ok).toBe(false);
    expect(res.newQuote?.subtotalDollars).toBe(124);
    expect(res.error).toContain("$124.00");
    expect(rpc).toHaveBeenCalledTimes(1); // the quote only
  });

  it("price matches the screen → submitted pinned to the server quote", async () => {
    rpc
      .mockResolvedValueOnce({ data: { ...QUOTE, subtotal: 124 }, error: null })
      .mockResolvedValueOnce({ data: { orderId: "o2", orderNumber: "BR-2026-00002", subtotal: 124, creditApplied: 0, amountDue: 124 }, error: null });
    const res = await submitPortalOrder({ ...input, screenSubtotal: 124.02 });
    expect(res.ok).toBe(true);
    expect((rpc.mock.calls[1] as [string, Record<string, unknown>])[1]._expected_subtotal).toBe(124);
  });

  it("field errors from the server become a readable message", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0422", message: "order has problems", details: '{"items[0].variant":"Out of stock"}' } });
    const res = await submitPortalOrder(input);
    expect(res).toMatchObject({ ok: false, error: "Out of stock" });
  });

  it("server function not deployed yet → the previous direct-insert path still works", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" } }).mockResolvedValue({ data: 0, error: null });
    const res = await submitPortalOrder(input);
    expect(res.ok).toBe(true);
    expect(res.orderNumber).toBe("BR-2026-123");
    expect(inserts.map((i) => i.table)).toEqual(["bulk_order_requests", "bulk_order_items"]);
  });

  it("View as never reaches the server", async () => {
    await expect(submitOrderRequest({ ...scope, viewingAs: true }, { idempotencyKey: "k", items: [] })).rejects.toMatchObject({ status: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
