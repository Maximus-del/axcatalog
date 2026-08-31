import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Factory,
  PackageCheck,
  Truck,
  X,
  ExternalLink,
  Loader2,
  Shirt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { useAdminOrderDetail } from "@/hooks/useAdminOrderDetail";
import {
  CARRIERS,
  DRAFT_STATUS,
  nextStatuses,
  STATUS_LABEL,
  trackingUrl,
  type BulkOrderStatus,
} from "@/lib/order-status";
import { StatusBadge, PriorityBadge } from "@/components/admin/orders/StatusBadge";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { OrderItemCustomizationCell } from "@/components/admin/orders/OrderItemCustomization";

type Transition = Exclude<BulkOrderStatus, "submitted">;

const TRANSITION_LABELS: Record<Transition, string> = {
  acknowledged: "Acknowledge",
  in_production: "Start Production",
  ready: "Mark Ready",
  shipped: "Mark Shipped",
  completed: "Mark Completed",
  cancelled: "Cancel Order",
};

const TRANSITION_ICONS: Record<Transition, typeof CheckCircle2> = {
  acknowledged: CheckCircle2,
  in_production: Factory,
  ready: PackageCheck,
  shipped: Truck,
  completed: CheckCircle2,
  cancelled: X,
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { order, loading, error, refetch, setOrder } = useAdminOrderDetail(id);

  const [adminNotes, setAdminNotes] = useState("");
  const [adminNotesDirty, setAdminNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Ship form
  const [shipOpen, setShipOpen] = useState(false);
  const [trackingNum, setTrackingNum] = useState("");
  const [carrier, setCarrier] = useState<string>("USPS");
  const [shipping, setShipping] = useState(false);

  // Tracking edit (sidebar)
  const [editTracking, setEditTracking] = useState(false);
  const [editNum, setEditNum] = useState("");
  const [editCarrier, setEditCarrier] = useState<string>("USPS");
  const [savingTracking, setSavingTracking] = useState(false);

  // Client stats
  const [clientStats, setClientStats] = useState<{
    orders: number;
    units: number;
  } | null>(null);

  useEffect(() => {
    if (order) {
      setAdminNotes(order.admin_notes ?? "");
      setAdminNotesDirty(false);
      setEditNum(order.tracking_number ?? "");
      setEditCarrier(order.shipping_carrier ?? "USPS");
    }
  }, [order]);

  // Fetch client lifetime stats
  useEffect(() => {
    if (!order?.athlete_id && !order?.team_id) return;
    let cancelled = false;
    (async () => {
      const filterCol = order.athlete_id ? "athlete_id" : "team_id";
      const filterVal = (order.athlete_id ?? order.team_id) as string;
      const { data } = await supabase
        .from("bulk_order_requests")
        .select("id, total_units")
        .neq("status", DRAFT_STATUS)
        .eq(filterCol, filterVal);
      if (cancelled) return;
      setClientStats({
        orders: data?.length ?? 0,
        units: (data ?? []).reduce((s, r) => s + (r.total_units ?? 0), 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.athlete_id, order?.team_id]);

  const transitions = useMemo<Transition[]>(
    () => (order ? (nextStatuses(order.status) as Transition[]) : []),
    [order],
  );

  const totalItems = order?.items.length ?? 0;
  const totalUnits = order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  const clientLabel = order?.athlete
    ? order.athlete.full_name ||
      `${order.athlete.first_name} ${order.athlete.last_name}`.trim()
    : (order?.team?.name ?? "Unknown");

  // Status transition logic
  const performTransition = async (next: Transition) => {
    if (!order) return;
    if (next === "shipped") {
      setShipOpen(true);
      return;
    }

    const patch: TablesUpdate<"bulk_order_requests"> = { status: next };
    if (next === "acknowledged") patch.acknowledged_at = new Date().toISOString();
    if (next === "completed") patch.completed_at = new Date().toISOString();

    // Optimistic
    const prev = order.status;
    setOrder({ ...order, status: next });

    const { error: err } = await supabase
      .from("bulk_order_requests")
      .update(patch)
      .eq("id", order.id);

    if (err) {
      setOrder({ ...order, status: prev });
      toast.error(err.message);
      return;
    }
    toast.success(`Order moved to ${STATUS_LABEL[next]}`);
    void refetch();
  };

  const submitShip = async () => {
    if (!order) return;
    if (!trackingNum.trim()) {
      toast.error("Tracking number is required");
      return;
    }
    setShipping(true);
    const { error: err } = await supabase
      .from("bulk_order_requests")
      .update({
        status: "shipped",
        shipped_at: new Date().toISOString(),
        tracking_number: trackingNum.trim(),
        shipping_carrier: carrier,
      })
      .eq("id", order.id);
    setShipping(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Order marked as shipped");
    setShipOpen(false);
    setTrackingNum("");
    void refetch();
  };

  const saveAdminNotes = async () => {
    if (!order || !adminNotesDirty) return;
    setSavingNotes(true);
    const { error: err } = await supabase
      .from("bulk_order_requests")
      .update({ admin_notes: adminNotes })
      .eq("id", order.id);
    setSavingNotes(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    setAdminNotesDirty(false);
    toast.success("Notes saved");
  };

  const saveTracking = async () => {
    if (!order) return;
    setSavingTracking(true);
    const { error: err } = await supabase
      .from("bulk_order_requests")
      .update({
        tracking_number: editNum.trim() || null,
        shipping_carrier: editCarrier,
      })
      .eq("id", order.id);
    setSavingTracking(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    setEditTracking(false);
    toast.success("Tracking updated");
    void refetch();
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to orders
        </Button>
        <div className="ax-card p-12 text-center mt-6">
          <p className="text-destructive">{error ?? "Order not found"}</p>
        </div>
      </div>
    );
  }

  const trackUrl = trackingUrl(order.shipping_carrier, order.tracking_number);

  // Timeline steps
  const steps = [
    { key: "submitted", label: "Submitted", at: order.created_at },
    { key: "acknowledged", label: "Acknowledged", at: order.acknowledged_at },
    { key: "shipped", label: "Shipped", at: order.shipped_at },
    { key: "completed", label: "Completed", at: order.completed_at },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/admin/orders" className="hover:text-accent">
          Orders
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-mono">{order.order_number ?? order.id.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ background: avatarColorFor(clientLabel) }}
          >
            {initialsFor(clientLabel)}
          </div>
          <div>
            <h1 className="text-3xl font-bold font-mono text-accent leading-tight">
              {order.order_number ?? "—"}
            </h1>
            <Link
              to={
                order.athlete_id
                  ? `/admin/athletes/${order.athlete_id}`
                  : `/admin/teams/${order.team_id}`
              }
              className="text-base text-muted-foreground hover:text-accent transition-colors"
            >
              {clientLabel}
            </Link>
            <div className="text-xs text-muted-foreground mt-1">
              Submitted {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PriorityBadge priority={order.priority} />
          <StatusBadge status={order.status} size="lg" />
          {transitions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold uppercase tracking-wider text-xs">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {transitions.map((t) => {
                  const Icon = TRANSITION_ICONS[t];
                  const danger = t === "cancelled";
                  return (
                    <DropdownMenuItem
                      key={t}
                      onClick={() => performTransition(t)}
                      className={danger ? "text-destructive focus:text-destructive" : ""}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {TRANSITION_LABELS[t]}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Inline ship form */}
      {shipOpen && (
        <div className="ax-card p-4 border-accent/40">
          <div className="ax-section-header mb-3">Ship Order</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={carrier} onValueChange={setCarrier}>
              <SelectTrigger>
                <SelectValue placeholder="Carrier" />
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={trackingNum}
              onChange={(e) => setTrackingNum(e.target.value)}
              placeholder="Tracking number"
              className="sm:col-span-2"
            />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setShipOpen(false)} disabled={shipping}>
              Cancel
            </Button>
            <Button
              onClick={submitShip}
              disabled={shipping}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {shipping && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm shipped
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: items + details + timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <section className="ax-card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="ax-section-header">Items</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--dark))] border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 ax-label">Product</th>
                    <th className="text-left px-4 py-3 ax-label">Size</th>
                    <th className="text-left px-4 py-3 ax-label">Color</th>
                    <th className="text-right px-4 py-3 ax-label">Qty</th>
                    <th className="text-left px-4 py-3 ax-label">Customization</th>
                    <th className="text-left px-4 py-3 ax-label">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No items.
                      </td>
                    </tr>
                  )}
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden shrink-0">
                            {it.product_image_url ? (
                              <img
                                src={it.product_image_url}
                                alt=""
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Shirt
                                className="h-5 w-5 text-muted-foreground/40"
                                strokeWidth={1.5}
                              />
                            )}
                          </div>
                          <span className="truncate max-w-[260px]">
                            {it.product_name_snapshot}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs uppercase">{it.size}</td>
                      <td className="px-4 py-3 text-muted-foreground">{it.color ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-4 py-3">
                        {it.customization ? (
                          <OrderItemCustomizationCell customization={it.customization} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {it.shopify_variant_id || it.variant_sku || it.notes_text ? (
                          <div className="space-y-1">
                            {it.variant_sku && (
                              <div className="font-mono uppercase text-[10px] tracking-wide text-foreground/80">
                                {it.variant_sku}
                              </div>
                            )}
                            {it.shopify_variant_id && (
                              <div
                                className="font-mono text-[10px] opacity-60 truncate max-w-[180px]"
                                title={it.shopify_variant_id}
                              >
                                {it.shopify_variant_id.replace(
                                  /^gid:\/\/shopify\/ProductVariant\//,
                                  "var ",
                                )}
                              </div>
                            )}
                            {it.notes_text && <div>{it.notes_text}</div>}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {order.items.length > 0 && (
                  <tfoot className="bg-[hsl(var(--dark))]">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 ax-label">
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-accent font-bold tabular-nums">
                        {totalUnits}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {totalItems} line{totalItems === 1 ? "" : "s"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* Request details */}
          <section className="ax-card">
            <div className="ax-section-header mb-4">Request Details</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5 text-sm">
              <div>
                <div className="ax-label mb-1">Order #</div>
                <div className="font-mono">{order.order_number ?? "—"}</div>
              </div>
              <div>
                <div className="ax-label mb-1">Created</div>
                <div>{format(new Date(order.created_at), "MMM d, yyyy h:mm a")}</div>
              </div>
              <div>
                <div className="ax-label mb-1">Priority</div>
                <PriorityBadge priority={order.priority} />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="ax-label mb-2">Client Notes</div>
                <div className="text-sm text-muted-foreground bg-[hsl(var(--dark))] rounded-md p-3 min-h-[60px] whitespace-pre-wrap">
                  {order.notes || <span className="italic opacity-60">No notes from client.</span>}
                </div>
              </div>
              <div>
                <div className="ax-label mb-2 flex items-center justify-between">
                  <span>Admin Notes</span>
                  {savingNotes && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => {
                    setAdminNotes(e.target.value);
                    setAdminNotesDirty(true);
                  }}
                  onBlur={saveAdminNotes}
                  placeholder="Internal notes — auto-saves on blur"
                  rows={3}
                />
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="ax-card">
            <div className="ax-section-header mb-4">Fulfillment Timeline</div>
            <ol className="relative ml-2">
              {steps.map((s, idx) => {
                const done = !!s.at;
                const isLast = idx === steps.length - 1;
                const isCurrent = done && (idx === steps.length - 1 || !steps[idx + 1].at);
                return (
                  <li key={s.key} className="flex gap-4 pb-6 last:pb-0 relative">
                    {!isLast && (
                      <span
                        className={cn(
                          "absolute left-[7px] top-4 bottom-0 w-px",
                          done ? "bg-accent/40" : "bg-border",
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        "h-4 w-4 rounded-full border-2 mt-1 shrink-0 z-10",
                        done
                          ? isCurrent
                            ? "bg-accent border-accent ring-4 ring-accent/20"
                            : "bg-accent border-accent"
                          : "bg-background border-border",
                      )}
                    />
                    <div className={cn("flex-1", !done && "opacity-40")}>
                      <div
                        className={cn(
                          "text-sm font-medium",
                          done ? "text-foreground" : "text-muted-foreground",
                          isCurrent && "text-accent",
                        )}
                      >
                        {s.label}
                      </div>
                      {done ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(s.at as string), "MMM d, yyyy h:mm a")}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground/50 italic mt-0.5">
                          Pending
                        </div>
                      )}
                      {s.key === "shipped" && done && order.tracking_number && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {order.shipping_carrier ?? "Carrier"}: {" "}
                          <span className="font-mono">{order.tracking_number}</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* RIGHT: sidebar */}
        <div className="space-y-6">
          {/* Client card */}
          <section className="ax-card">
            <div className="ax-section-header mb-3">Client</div>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ background: avatarColorFor(clientLabel) }}
              >
                {initialsFor(clientLabel)}
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">{clientLabel}</div>
                <Link
                  to={
                    order.athlete_id
                      ? `/admin/athletes/${order.athlete_id}`
                      : `/admin/teams/${order.team_id}`
                  }
                  className="text-xs text-accent hover:underline"
                >
                  View {order.athlete_id ? "athlete" : "team"} profile →
                </Link>
              </div>
            </div>
            {clientStats && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                <div>
                  <div className="ax-label mb-1">Total Orders</div>
                  <div className="text-xl font-bold">{clientStats.orders}</div>
                </div>
                <div>
                  <div className="ax-label mb-1">Total Units</div>
                  <div className="text-xl font-bold">{clientStats.units}</div>
                </div>
              </div>
            )}
          </section>

          {/* Shipping card */}
          {(["ready", "shipped", "completed"] as BulkOrderStatus[]).includes(order.status) && (
            <section className="ax-card">
              <div className="ax-section-header mb-3 flex items-center justify-between">
                <span>Shipping</span>
                {!editTracking && order.status === "shipped" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setEditTracking(true)}
                  >
                    Edit
                  </Button>
                )}
              </div>
              {editTracking ? (
                <div className="space-y-2">
                  <Select value={editCarrier} onValueChange={setEditCarrier}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIERS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={editNum}
                    onChange={(e) => setEditNum(e.target.value)}
                    placeholder="Tracking number"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditTracking(false)}
                      disabled={savingTracking}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveTracking}
                      disabled={savingTracking}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      {savingTracking && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="ax-label mb-1">Carrier</div>
                    <div>{order.shipping_carrier ?? "—"}</div>
                  </div>
                  <div>
                    <div className="ax-label mb-1">Tracking #</div>
                    <div className="font-mono text-xs break-all">
                      {order.tracking_number ?? "—"}
                    </div>
                  </div>
                  {trackUrl && (
                    <a
                      href={trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Track package <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
