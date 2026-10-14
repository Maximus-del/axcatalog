import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DRAFT_STATUS, type BulkOrderStatus } from "@/lib/order-status";
import { parseOrderItemNotes } from "@/lib/order-item-notes";

export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name_snapshot: string;
  size: string;
  color: string | null;
  quantity: number;
  notes: string | null;
  /** Parsed user-facing note text (legacy strings or `note` field from JSON). */
  notes_text: string | null;
  /** Shopify variant GID/id selected at order time, if available. */
  shopify_variant_id: string | null;
  /** Variant SKU snapshot at order time, if available. */
  variant_sku: string | null;
  product_image_url: string | null;
  customization: OrderItemCustomization | null;
}

export interface OrderItemCustomization {
  design_url: string;          // storage path inside design-files bucket
  surface: "front" | "back";
  surface_label?: string;
  placement_label: string;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  rotation_deg: number;
}

export interface OrderDetail {
  id: string;
  order_number: string | null;
  status: BulkOrderStatus;
  priority: string;
  total_units: number;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  athlete_id: string | null;
  team_id: string | null;
  organization_id: string;
  requested_by: string;
  athlete: {
    id: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
  team: { id: string; name: string } | null;
  items: OrderItem[];
}

export function useAdminOrderDetail(id: string | undefined) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data, error: orderErr } = await supabase
      .from("bulk_order_requests")
      .select(
        `id, order_number, status, priority, total_units, notes, admin_notes,
         created_at, acknowledged_at, shipped_at, completed_at,
         tracking_number, shipping_carrier,
         athlete_id, team_id, organization_id, requested_by,
         athlete:athletes!bulk_order_requests_athlete_id_fkey(id, full_name, first_name, last_name),
         team:teams!bulk_order_requests_team_id_fkey(id, name)`,
      )
      .eq("id", id)
      // A V2 draft cart must not open in V1's order detail, which moves
      // statuses and money.
      .neq("status", DRAFT_STATUS)
      .maybeSingle();

    if (orderErr || !data) {
      setError(orderErr?.message ?? "Order not found");
      setOrder(null);
      setLoading(false);
      return;
    }

    const { data: items, error: itemsErr } = await supabase
      .from("bulk_order_items")
      .select(
        `id, product_id, product_name_snapshot, size, color, quantity, notes, customization,
         product:products(
           product_images(storage_bucket, storage_path, is_primary, sort_order)
         )`,
      )
      .eq("order_request_id", id)
      .order("created_at", { ascending: true });

    if (itemsErr) {
      console.error("items fetch", itemsErr);
    }

    const withImages: OrderItem[] = (items ?? []).map((row) => {
      const product = row.product as {
        product_images?: Array<{
          storage_bucket: string;
          storage_path: string;
          is_primary: boolean;
          sort_order: number;
        }>;
      } | null;
      const imgs = product?.product_images ?? [];
      const primary =
        imgs.find((i) => i.is_primary) ??
        [...imgs].sort((a, b) => a.sort_order - b.sort_order)[0];
      let url: string | null = null;
      if (primary) {
        url = supabase.storage
          .from(primary.storage_bucket)
          .getPublicUrl(primary.storage_path).data.publicUrl;
      }
      const parsedNotes = parseOrderItemNotes(row.notes);
      const c = (row as { customization?: unknown }).customization;
      const customization =
        c && typeof c === "object" && (c as Record<string, unknown>).design_url
          ? (c as OrderItemCustomization)
          : null;
      return {
        id: row.id,
        product_id: row.product_id,
        product_name_snapshot: row.product_name_snapshot,
        size: row.size,
        color: row.color,
        quantity: row.quantity,
        notes: row.notes,
        notes_text: parsedNotes.text,
        shopify_variant_id: parsedNotes.shopifyVariantId,
        variant_sku: parsedNotes.sku,
        product_image_url: url,
        customization,
      };
    });

    setOrder({
      ...(data as Omit<OrderDetail, "items">),
      items: withImages,
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { order, loading, error, refetch: fetch, setOrder };
}
