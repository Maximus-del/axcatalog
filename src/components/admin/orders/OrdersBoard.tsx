import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { GripVertical, Users, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { clientName, type AdminOrderRow } from "@/hooks/useAdminOrders";
import type { BulkOrderStatus } from "@/lib/order-status";

type ColumnKey =
  | "awaiting"
  | "printing"
  | "embroidery"
  | "packaging"
  | "shipping"
  | "delivered";

const COLUMNS: { key: ColumnKey; label: string; dot: string }[] = [
  { key: "awaiting", label: "Awaiting approval", dot: "bg-accent" },
  { key: "printing", label: "Printing", dot: "bg-orange-500" },
  { key: "embroidery", label: "Embroidery", dot: "bg-amber-500" },
  { key: "packaging", label: "Packaging", dot: "bg-purple-500" },
  { key: "shipping", label: "Shipping", dot: "bg-teal-500" },
  { key: "delivered", label: "Delivered", dot: "bg-emerald-500" },
];

interface BoardOrder extends AdminOrderRow {
  fulfillment_stage: string | null;
  thumb_design_path: string | null;
  thumb_product_url: string | null;
  item_count: number;
  first_item_label: string | null;
}

interface Props {
  baseOrders: AdminOrderRow[];
  onRefetch: () => void;
}

function columnOf(o: { status: BulkOrderStatus; fulfillment_stage: string | null }): ColumnKey | null {
  switch (o.status) {
    case "submitted":
    case "acknowledged":
      return "awaiting";
    case "in_production":
      return o.fulfillment_stage === "embroidery" ? "embroidery" : "printing";
    case "ready":
      return "packaging";
    case "shipped":
      return "shipping";
    case "completed":
      return "delivered";
    case "cancelled":
      return null;
  }
}

function patchFor(col: ColumnKey): {
  status: BulkOrderStatus;
  fulfillment_stage: string | null;
  acknowledged_at?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
} {
  const now = new Date().toISOString();
  switch (col) {
    case "awaiting":
      return { status: "submitted", fulfillment_stage: null };
    case "printing":
      return { status: "in_production", fulfillment_stage: "printing", acknowledged_at: now };
    case "embroidery":
      return { status: "in_production", fulfillment_stage: "embroidery", acknowledged_at: now };
    case "packaging":
      return { status: "ready", fulfillment_stage: null };
    case "shipping":
      return { status: "shipped", fulfillment_stage: null, shipped_at: now };
    case "delivered":
      return { status: "completed", fulfillment_stage: null, completed_at: now };
  }
}

function isOverdue(o: AdminOrderRow): boolean {
  return (
    (o.status === "submitted" || o.status === "acknowledged") &&
    Date.now() - +new Date(o.created_at) > 24 * 60 * 60 * 1000
  );
}

export function OrdersBoard({ baseOrders, onRefetch }: Props) {
  const navigate = useNavigate();
  const [extras, setExtras] = useState<
    Record<string, { fulfillment_stage: string | null; thumb_design_path: string | null; thumb_product_url: string | null; item_count: number; first_item_label: string | null }>
  >({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ColumnKey | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, { status: BulkOrderStatus; fulfillment_stage: string | null }>>({});

  const ids = useMemo(() => baseOrders.map((o) => o.id), [baseOrders]);

  // Fetch fulfillment_stage + thumbs for the orders in view
  useEffect(() => {
    if (ids.length === 0) {
      setExtras({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const [stagesRes, itemsRes] = await Promise.all([
        supabase
          .from("bulk_order_requests")
          .select("id, fulfillment_stage")
          .in("id", ids),
        supabase
          .from("bulk_order_items")
          .select(
            `id, order_request_id, product_name_snapshot, customization,
             product:products(product_images(storage_bucket, storage_path, is_primary, sort_order))`,
          )
          .in("order_request_id", ids)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const stageMap = new Map<string, string | null>();
      for (const r of stagesRes.data ?? []) stageMap.set(r.id, (r as any).fulfillment_stage ?? null);

      const grouped = new Map<string, any[]>();
      for (const it of itemsRes.data ?? []) {
        const arr = grouped.get((it as any).order_request_id) ?? [];
        arr.push(it);
        grouped.set((it as any).order_request_id, arr);
      }

      const next: typeof extras = {};
      for (const id of ids) {
        const its = grouped.get(id) ?? [];
        const designItem = its.find((i: any) => i.customization?.design_url);
        const firstWithProduct = its.find((i: any) => {
          const imgs = i.product?.product_images ?? [];
          return imgs.length > 0;
        });
        let thumb_product_url: string | null = null;
        if (firstWithProduct) {
          const imgs = firstWithProduct.product.product_images as Array<{
            storage_bucket: string;
            storage_path: string;
            is_primary: boolean;
            sort_order: number;
          }>;
          const primary =
            imgs.find((i) => i.is_primary) ??
            [...imgs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
          if (primary) {
            const { data } = supabase.storage
              .from(primary.storage_bucket)
              .getPublicUrl(primary.storage_path);
            thumb_product_url = data.publicUrl ?? null;
          }
        }
        next[id] = {
          fulfillment_stage: stageMap.get(id) ?? null,
          thumb_design_path: designItem?.customization?.design_url ?? null,
          thumb_product_url,
          item_count: its.length,
          first_item_label: its[0]?.product_name_snapshot ?? null,
        };
      }
      setExtras(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const orders: BoardOrder[] = useMemo(
    () =>
      baseOrders.map((o) => {
        const e = extras[o.id];
        const local = localStatus[o.id];
        return {
          ...o,
          status: local?.status ?? o.status,
          fulfillment_stage: local?.fulfillment_stage ?? e?.fulfillment_stage ?? null,
          thumb_design_path: e?.thumb_design_path ?? null,
          thumb_product_url: e?.thumb_product_url ?? null,
          item_count: e?.item_count ?? 0,
          first_item_label: e?.first_item_label ?? null,
        };
      }),
    [baseOrders, extras, localStatus],
  );

  const grouped = useMemo(() => {
    const map: Record<ColumnKey, BoardOrder[]> = {
      awaiting: [],
      printing: [],
      embroidery: [],
      packaging: [],
      shipping: [],
      delivered: [],
    };
    for (const o of orders) {
      const c = columnOf(o);
      if (c) map[c].push(o);
    }
    return map;
  }, [orders]);

  const handleDrop = async (col: ColumnKey) => {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!id) return;
    const current = orders.find((o) => o.id === id);
    if (!current) return;
    if (columnOf(current) === col) return;

    const patch = patchFor(col);
    setLocalStatus((s) => ({
      ...s,
      [id]: { status: patch.status, fulfillment_stage: patch.fulfillment_stage },
    }));

    const { error } = await supabase
      .from("bulk_order_requests")
      .update(patch as any)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      setLocalStatus((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      return;
    }
    toast.success(`Moved to ${COLUMNS.find((c) => c.key === col)?.label}`);
    onRefetch();
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {COLUMNS.map((col) => {
        const list = grouped[col.key];
        const isOver = overCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (overCol !== col.key) setOverCol(col.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={() => handleDrop(col.key)}
            className={cn(
              "w-[280px] shrink-0 rounded-2xl border bg-card flex flex-col",
              isOver ? "border-accent ring-2 ring-accent/40" : "border-border",
            )}
          >
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", col.dot)} />
              <span className="text-xs uppercase tracking-wider font-semibold">
                {col.label}
              </span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {list.length}
              </span>
            </div>
            <div className="p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-260px)] overflow-y-auto">
              {list.map((o) => (
                <BoardCard
                  key={o.id}
                  order={o}
                  dragging={dragId === o.id}
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => setDragId(null)}
                  onOpen={() => navigate(`/admin/orders/${o.id}`)}
                />
              ))}
              {list.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-6">
                  No orders
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({
  order,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  order: BoardOrder;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const overdue = isOverdue(order);
  const isAthlete = !!order.athlete_id;
  const priorityDot =
    order.priority === "urgent"
      ? "bg-red-500"
      : order.priority === "high"
        ? "bg-orange-500"
        : order.priority === "low"
          ? "bg-muted-foreground/40"
          : "bg-blue-500";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "group rounded-xl border border-border bg-background hover:border-accent/60 transition-all cursor-pointer overflow-hidden",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-stretch gap-2">
        <CardThumb order={order} />
        <div className="flex-1 min-w-0 py-2 pr-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full shrink-0", priorityDot)} title={order.priority} />
            <span className="font-mono text-[11px] text-accent truncate">
              {order.order_number ?? "—"}
            </span>
            <GripVertical className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            {isAthlete ? (
              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <Trophy className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="truncate">{clientName(order)}</span>
          </div>
          {order.first_item_label && (
            <div className="mt-1 text-[11px] text-muted-foreground truncate">
              {order.first_item_label}
              {order.item_count > 1 ? ` +${order.item_count - 1} more` : ""}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground tabular-nums">
              {order.total_units} units
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1",
                overdue
                  ? "bg-orange-500/15 text-orange-500"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
              {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeDesignPath(input: string): string {
  let path = input.trim();
  const marker = "/design-files/";
  const idx = path.indexOf(marker);
  if (idx !== -1) path = path.slice(idx + marker.length);
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  path = path.replace(/^\/+/, "");
  if (path.startsWith("design-files/")) path = path.slice("design-files/".length);
  return path;
}

function CardThumb({ order }: { order: BoardOrder }) {
  const [signed, setSigned] = useState<string | null>(null);
  const askedRef = useRef(false);

  useEffect(() => {
    if (askedRef.current) return;
    if (!order.thumb_design_path) return;
    askedRef.current = true;
    const path = normalizeDesignPath(order.thumb_design_path);
    if (!path) return;
    void supabase.functions
      .invoke<{ signedUrl: string }>("design-signed-url", { body: { path } })
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) return;
        setSigned(data.signedUrl);
      });
  }, [order.thumb_design_path]);

  const src = signed ?? order.thumb_product_url;

  return (
    <div className="w-14 h-14 my-2 ml-2 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
      {src ? (
        <img src={src} alt="" className="w-full h-full object-contain p-1" />
      ) : (
        <span className="text-[9px] text-muted-foreground">No image</span>
      )}
    </div>
  );
}