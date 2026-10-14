// AX OS V2 — the cart's data layer.
//
// The cart is a `draft` bulk_order_request; see cart.ts for why there is no
// cart table. One draft per (entity, operator): a cart belongs to the person
// assembling it, and two operators building runs for the same athlete are
// building two different orders.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, num, str, t, type Row } from "./db";
import { groupCartLines, lineKey, planAdd, type AddToCartLine, type CartGroup, type CartLine } from "./cart";
import { quoteCart, type DiscountBreak } from "./bulk-pricing";

export interface Cart {
  /** Null when this operator has never added anything for this entity. */
  orderId: string | null;
  notes: string;
  lines: CartLine[];
  groups: CartGroup[];
  units: number;
}

const EMPTY: Cart = { orderId: null, notes: "", lines: [], groups: [], units: 0 };

export const cartKey = (entityId: string | undefined, userId: string | undefined) => [
  "v2",
  "cart",
  entityId ?? "no-entity",
  userId ?? "no-user",
];

async function findDraftId(entityId: string, userId: string): Promise<string | null> {
  const res = await t("bulk_order_requests")
    .select("id")
    .eq("athlete_id", entityId)
    .eq("requested_by", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const row = res.data as unknown as Row | null;
  return row ? String(row.id) : null;
}

async function fetchCart(entityId: string, userId: string): Promise<Cart> {
  const head = await t("bulk_order_requests")
    .select("id, notes")
    .eq("athlete_id", entityId)
    .eq("requested_by", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (head.error) throw new Error(head.error.message);
  const request = head.data as unknown as Row | null;
  if (!request) return EMPTY;

  const orderId = String(request.id);
  const itemsRes = await t("bulk_order_items")
    .select("id, mockup_id, v2_blank_id, product_name_snapshot, color, size, quantity, unit_retail_price")
    .eq("order_request_id", orderId)
    .order("created_at", { ascending: true });
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  const items = (itemsRes.data ?? []) as unknown as Row[];

  // The card's picture comes from the mockup, not from a snapshot on the line:
  // re-render a mockup's composite and the cart should show the new one.
  const mockupIds = [...new Set(items.map((i) => str(i.mockup_id)).filter((v): v is string => Boolean(v)))];
  const imageById = new Map<string, string | null>();
  if (mockupIds.length > 0) {
    const mockupRes = await t("mockups").select("id, image_url").in("id", mockupIds);
    for (const m of ((mockupRes.data ?? []) as unknown as Row[])) {
      imageById.set(String(m.id), str(m.image_url));
    }
  }

  const lines: CartLine[] = items.map((i) => ({
    id: String(i.id),
    mockupId: str(i.mockup_id),
    blankId: str(i.v2_blank_id),
    title: String(i.product_name_snapshot ?? "Untitled"),
    colorName: str(i.color),
    size: String(i.size ?? ""),
    quantity: Number(i.quantity ?? 0),
    unitRetail: num(i.unit_retail_price) ?? 0,
    imageUrl: imageById.get(String(i.mockup_id)) ?? null,
  }));

  return {
    orderId,
    notes: str(request.notes) ?? "",
    lines,
    groups: groupCartLines(lines),
    units: lines.reduce((n, l) => n + l.quantity, 0),
  };
}

export function useCart(entityId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: cartKey(entityId, userId),
    queryFn: () => fetchCart(entityId as string, userId as string),
    enabled: Boolean(entityId && userId),
    staleTime: 5_000,
  });
}

/**
 * The cart exists the first time something is put in it, and not before.
 *
 * Creating a draft on page load would litter the table with empty carts for
 * every entity anybody ever opened, and every one of them would have to be
 * filtered out of every count.
 */
async function ensureCart(entityId: string, organizationId: string, userId: string): Promise<string> {
  const existing = await findDraftId(entityId, userId);
  if (existing) return existing;

  const res = await must(
    t("bulk_order_requests")
      .insert({
        organization_id: organizationId,
        athlete_id: entityId,
        requested_by: userId,
        status: "draft",
        channel: "admin-v2",
        priority: "normal",
        payment_method: "invoice",
        // No order_number. A cart has not been ordered, and handing it a
        // number would put a real-looking order reference on a working draft.
      } as never)
      .select("id")
      .single(),
  );
  return String((res.data as unknown as Row).id);
}

export interface AddToCartInput {
  mockupId: string;
  title: string;
  blankId: string | null;
  colorName: string | null;
  /** Audience price per unit, before any volume discount. */
  unitRetail: number;
  lines: AddToCartLine[];
}

/**
 * Put a mockup in the cart.
 *
 * Adding a size that is already there raises its quantity instead of adding a
 * second row — see planAdd. Sizes at zero never reach the database at all:
 * bulk_order_items has a `quantity > 0` check, so a zero row would take the
 * whole add down with it.
 */
export function useAddToCart(entityId: string, organizationId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: AddToCartInput[]) => {
      if (!userId) throw new Error("Not signed in");
      const wanted = inputs.filter((i) => i.lines.some((l) => l.quantity > 0));
      if (wanted.length === 0) throw new Error("Add at least one size");

      const orderId = await ensureCart(entityId, organizationId, userId);
      const before = await fetchCart(entityId, userId);

      // Planned against one snapshot, so two mockups added in the same call
      // that share a size do not both think they are the insert.
      const seen = new Map(before.lines.map((l) => [lineKey(l.mockupId, l.colorName, l.size), l]));
      const inserts: Row[] = [];
      const increments: Array<{ id: string; quantity: number }> = [];

      for (const input of wanted) {
        const plan = planAdd([...seen.values()], {
          mockupId: input.mockupId,
          colorName: input.colorName,
          lines: input.lines,
        });
        for (const inc of plan.increments) increments.push(inc);
        for (const ins of plan.inserts) {
          inserts.push({
            order_request_id: orderId,
            mockup_id: input.mockupId,
            // V2 garments live in v2_blanks. bulk_order_items.blank_id is FK'd
            // to the legacy `blanks` table and would reject every one of these.
            v2_blank_id: input.blankId,
            blank_id: null,
            product_name_snapshot: input.title,
            size: ins.size,
            color: input.colorName,
            quantity: ins.quantity,
            unit_retail_price: input.unitRetail,
          });
          // So a second input for the same colour and size increments rather
          // than inserting a duplicate.
          seen.set(lineKey(input.mockupId, input.colorName, ins.size), {
            id: "pending",
            mockupId: input.mockupId,
            blankId: input.blankId,
            title: input.title,
            colorName: input.colorName,
            size: ins.size,
            quantity: ins.quantity,
            unitRetail: input.unitRetail,
            imageUrl: null,
          });
        }
      }

      if (inserts.length > 0) await must(t("bulk_order_items").insert(inserts as never));
      for (const inc of increments) {
        if (inc.id === "pending") continue;
        await must(t("bulk_order_items").update({ quantity: inc.quantity } as never).eq("id", inc.id));
      }

      return { orderId, added: inserts.length + increments.length };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cartKey(entityId, userId) });
    },
  });
}

export type CartJob =
  | { type: "set-quantity"; lineId: string; quantity: number }
  | { type: "remove-lines"; lineIds: string[] }
  | { type: "set-notes"; notes: string }
  | { type: "clear" };

export function useCartActions(entityId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: CartJob) => {
      if (!userId) throw new Error("Not signed in");
      const orderId = await findDraftId(entityId, userId);
      if (!orderId) throw new Error("There is no cart to change");

      switch (job.type) {
        case "set-quantity": {
          const qty = Math.max(0, Math.trunc(job.quantity));
          // Zero is not a line. The table's `quantity > 0` check would reject
          // it, and a cart row reading 0 is a row an operator has to wonder
          // about — removing it says the same thing without the ambiguity.
          if (qty === 0) {
            await must(t("bulk_order_items").delete().eq("id", job.lineId));
            return;
          }
          await must(t("bulk_order_items").update({ quantity: qty } as never).eq("id", job.lineId));
          return;
        }
        case "remove-lines": {
          if (job.lineIds.length === 0) return;
          await must(t("bulk_order_items").delete().in("id", job.lineIds));
          return;
        }
        case "set-notes": {
          await must(t("bulk_order_requests").update({ notes: job.notes || null } as never).eq("id", orderId));
          return;
        }
        case "clear": {
          // The draft row itself goes too. An empty cart and no cart are the
          // same thing to the operator, and leaving the husk behind means the
          // next add reuses a draft whose notes belong to a different run.
          await must(t("bulk_order_items").delete().eq("order_request_id", orderId));
          await must(t("bulk_order_requests").delete().eq("id", orderId).eq("status", "draft"));
          return;
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cartKey(entityId, userId) });
    },
  });
}

function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BR-${year}-${rand}`;
}

/**
 * Submit the cart.
 *
 * THIS is the moment a draft becomes an order, and the only moment prices are
 * written down. Until now every total on screen was derived from the live
 * discount ladder, because the ladder depends on the cart's unit count and the
 * count changes with every add. At submit the quote is frozen onto the rows:
 * per-line discounted unit price and line subtotal, and the request's
 * wholesale/retail/savings — so the order says what was agreed even if the
 * ladder is edited next week.
 *
 * Status moves draft -> submitted, which is what puts it in front of V1's
 * order surfaces for the first time.
 */
export function useSubmitCart(entityId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { breaks: DiscountBreak[]; notes?: string | null }) => {
      if (!userId) throw new Error("Not signed in");
      const cart = await fetchCart(entityId, userId);
      if (!cart.orderId) throw new Error("There is no cart to submit");
      if (cart.lines.length === 0) throw new Error("The cart is empty");

      const quote = quoteCart(
        cart.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitRetail })),
        input.breaks,
      );

      for (const [i, line] of cart.lines.entries()) {
        const q = quote.lines[i];
        if (!q) continue;
        await must(
          t("bulk_order_items")
            .update({
              unit_wholesale_price: q.discountedUnitPrice,
              unit_retail_price: line.unitRetail,
              line_subtotal: q.lineSubtotal,
            } as never)
            .eq("id", line.id),
        );
      }

      const orderNumber = generateOrderNumber();
      await must(
        t("bulk_order_requests")
          .update({
            status: "submitted",
            order_number: orderNumber,
            wholesale_subtotal: quote.subtotal,
            retail_equivalent: quote.retailEquivalent,
            total_savings: quote.savings,
            amount_due: quote.subtotal,
            notes: input.notes ?? cart.notes ?? null,
          } as never)
          .eq("id", cart.orderId)
          // Only ever from draft. If something else already moved this row on,
          // that is an order now and this submit must not touch it.
          .eq("status", "draft"),
      );

      return { orderId: cart.orderId, orderNumber, units: quote.units, subtotal: quote.subtotal };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cartKey(entityId, userId) });
      void qc.invalidateQueries({ queryKey: ["v2", "orders"] });
      void qc.invalidateQueries({ queryKey: ["v2", "overview"] });
    },
  });
}

/* ------------------------------------------------ an entity's order history */

export interface EntityOrder {
  id: string;
  orderNumber: string | null;
  status: string;
  units: number;
  /** Null when the order was raised before the cart started freezing prices. */
  total: number | null;
  createdAt: string;
}

export interface EntityOrderHistory {
  orders: EntityOrder[];
  /** Value of this calendar year's orders, and how many carried no price. */
  ytdTotal: number;
  ytdCount: number;
  ytdUnpriced: number;
}

/**
 * The orders on an athlete's overview.
 *
 * These are bulk_order_requests, NOT the Shopify `orders` table. Shopify orders
 * cannot be attributed to most entities — line items are not linked to product
 * records, and every entity without its own organisation shares Athlete
 * Xclusive's (see EntityWorkspace.ordersNote). A bulk order carries
 * `athlete_id`, so it is the only order stream this page can honestly claim
 * belongs to this person.
 *
 * Drafts are excluded here for the same reason they are excluded everywhere
 * else: a draft is an operator's cart, not an order. See
 * order-draft-isolation.test.ts.
 */
export function useEntityOrders(entityId: string | undefined, limit = 6) {
  return useQuery({
    queryKey: ["v2", "entity-orders", entityId, limit],
    enabled: Boolean(entityId),
    staleTime: 30_000,
    queryFn: async (): Promise<EntityOrderHistory> => {
      const res = await t("bulk_order_requests")
        .select("id, order_number, status, total_units, wholesale_subtotal, created_at")
        .eq("athlete_id", entityId as string)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(60);
      if (res.error) throw new Error(res.error.message);

      const rows = ((res.data ?? []) as unknown as Row[]).map((r) => ({
        id: String(r.id),
        orderNumber: str(r.order_number),
        status: String(r.status ?? ""),
        units: Number(r.total_units ?? 0),
        // 0 and "not priced" are different facts. Every order raised before the
        // cart existed has a zero subtotal because nothing ever wrote one, and
        // showing that as $0.00 would be a confident wrong number.
        total: Number(r.wholesale_subtotal ?? 0) > 0 ? Number(r.wholesale_subtotal) : null,
        createdAt: String(r.created_at ?? ""),
      }));

      const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
      const ytd = rows.filter((r) => new Date(r.createdAt).getTime() >= startOfYear);

      return {
        orders: rows.slice(0, limit),
        ytdTotal: Math.round(ytd.reduce((n, r) => n + (r.total ?? 0), 0) * 100) / 100,
        ytdCount: ytd.length,
        ytdUnpriced: ytd.filter((r) => r.total == null).length,
      };
    },
  });
}
