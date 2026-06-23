import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const BodySchema = z.object({
  token: z.string().trim().min(1).max(200).nullable().optional(),
  customer_name: z.string().trim().min(1).max(200),
  customer_email: z.string().trim().email().max(255),
  items: z
    .array(
      z.object({
        blank_id: z.string().uuid(),
        color: z.string().trim().min(1).max(100),
        size: z.string().trim().min(1).max(50),
        quantity: z.number().int().positive().max(100000),
      }),
    )
    .min(1)
    .max(200),
});

function genOrderNumber() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 5).toUpperCase();
  return `WC-${yy}${mm}${dd}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: jsonHeaders,
      });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { token, customer_name, customer_email, items } = parsed.data;

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Re-resolve the token server-side — never trust the client.
    let tier: "athlete" | "corporate" | "standard" = "standard";
    let resolvedName: string | null = null;
    let resolvedEmail: string | null = null;
    if (token) {
      const { data: tk } = await admin.rpc("resolve_catalog_token" as any, {
        p_token: token,
      } as any);
      const resolved = Array.isArray(tk) && tk.length > 0 ? (tk[0] as any) : null;
      if (resolved) {
        if (
          resolved.tier === "athlete" ||
          resolved.tier === "corporate" ||
          resolved.tier === "standard"
        ) {
          tier = resolved.tier;
        }
        resolvedName = resolved.customer_name ?? null;
        resolvedEmail = resolved.customer_email ?? null;
      }
    }
    const priceField =
      tier === "athlete"
        ? "price_athlete"
        : tier === "corporate"
          ? "price_corporate"
          : "price_standard";

    const blankIds = Array.from(new Set(items.map((l) => l.blank_id)));
    const { data: blanks, error: blanksErr } = await admin
      .from("blanks")
      .select(
        "id, name, organization_id, sellable_as_blank, internal_only, price_athlete, price_corporate, price_standard",
      )
      .in("id", blankIds);

    if (blanksErr) {
      console.error("blanks fetch error", blanksErr);
      return new Response(JSON.stringify({ error: blanksErr.message }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const byId = new Map((blanks ?? []).map((b: any) => [b.id, b]));

    let orgId: string | null = null;
  const itemRows: Array<{
    blank_id: string;
    product_name_snapshot: string;
    color: string;
    size: string;
    quantity: number;
    unit_wholesale_price: number;
    unit_retail_price: number;
    line_subtotal: number;
  }> = [];
    let totalUnits = 0;
    let wholesaleSubtotal = 0;
    let retailEquivalent = 0;

    for (const line of items) {
    const b: any = byId.get(line.blank_id);
    if (!b) {
      return new Response(
        JSON.stringify({ error: `Unknown product: ${line.blank_id}` }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (!b.sellable_as_blank || b.internal_only) {
      return new Response(
        JSON.stringify({ error: `Product not available: ${b.name}` }),
        { status: 400, headers: jsonHeaders },
      );
    }
    const wholesalePrice = Number(b[priceField]);
    const retailPrice = Number(b.price_standard);
    if (!Number.isFinite(wholesalePrice) || wholesalePrice <= 0) {
      return new Response(
        JSON.stringify({ error: `No price configured for: ${b.name}` }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
      return new Response(
        JSON.stringify({ error: `No list price configured for: ${b.name}` }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (orgId && orgId !== b.organization_id) {
      return new Response(
        JSON.stringify({ error: "Cart contains products from multiple organizations" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    orgId = b.organization_id;

    const subtotal = Number((wholesalePrice * line.quantity).toFixed(2));
    const retailSubtotal = Number((retailPrice * line.quantity).toFixed(2));
    totalUnits += line.quantity;
    wholesaleSubtotal += subtotal;
    retailEquivalent += retailSubtotal;

    itemRows.push({
      blank_id: b.id,
      product_name_snapshot: b.name,
      color: line.color,
      size: line.size,
      quantity: line.quantity,
      unit_wholesale_price: wholesalePrice,
      unit_retail_price: retailPrice,
      line_subtotal: subtotal,
    });
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: "No valid lines" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const order_number = genOrderNumber();

    const { data: orderRow, error: orderErr } = await admin
    .from("bulk_order_requests")
    .insert({
      organization_id: orgId,
      channel: "wholesale_catalog",
      customer_name: resolvedName ?? customer_name,
      customer_email: resolvedEmail ?? customer_email,
      athlete_id: null,
      team_id: null,
      requested_by: null,
      order_number,
      total_units: totalUnits,
      wholesale_subtotal: Number(wholesaleSubtotal.toFixed(2)),
      retail_equivalent: Number(retailEquivalent.toFixed(2)),
      total_savings: Number((retailEquivalent - wholesaleSubtotal).toFixed(2)),
      admin_notes: token ? `catalog_token=${token} tier=${tier}` : null,
    })
    .select("id, order_number")
    .single();

    if (orderErr || !orderRow) {
      console.error("order insert error", orderErr);
      return new Response(
        JSON.stringify({ error: orderErr?.message ?? "Failed to create order" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const { error: itemsErr } = await admin.from("bulk_order_items").insert(
      itemRows.map((r) => ({ ...r, order_request_id: orderRow.id })),
    );

    if (itemsErr) {
      console.error("items insert error", itemsErr);
      await admin.from("bulk_order_requests").delete().eq("id", orderRow.id);
      return new Response(JSON.stringify({ error: itemsErr.message }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    return new Response(
      JSON.stringify({ id: orderRow.id, order_number: orderRow.order_number }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err: any) {
    console.error("submit-catalog-order error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: jsonHeaders },
    );
  }
});