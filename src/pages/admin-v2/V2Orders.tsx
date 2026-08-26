import { useMemo, useState } from "react";
import { useEntities, useOrders } from "@/lib/v2/data";
import { fmtMoney } from "@/lib/v2/pricing";
import { Chip, EmptyState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// Orders stay deliberately thin in this pass. The existing order + fulfilment
// infrastructure is reused as-is; V2 only gives the operator a legible list.

export default function V2Orders() {
  const { data, isLoading } = useOrders();
  const entitiesQ = useEntities();
  const [openOnly, setOpenOnly] = useState(false);

  // Only entities that own an organisation can be resolved from an order today.
  const orgOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entitiesQ.data ?? []) if (e.hasOwnOrg) m.set(e.organizationId, e.name);
    return m;
  }, [entitiesQ.data]);

  const rows = useMemo(() => {
    const all = data ?? [];
    return openOnly ? all.filter((o) => (o.fulfillmentStatus ?? "unfulfilled") !== "fulfilled") : all;
  }, [data, openOnly]);

  return (
    <>
      <PageHeader title="Orders" subtitle="The 60 most recent orders, straight from the existing order records." />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Chip active={!openOnly} onClick={() => setOpenOnly(false)}>
          All
        </Chip>
        <Chip active={openOnly} onClick={() => setOpenOnly(true)}>
          Not fulfilled
        </Chip>
      </div>

      {isLoading && <Skeleton className="h-72" />}
      {!isLoading && rows.length === 0 && <EmptyState>No orders match.</EmptyState>}

      {!isLoading && rows.length > 0 && (
        <div className="ax-card overflow-hidden">
          <div className="hidden gap-3 border-b border-[hsl(var(--ax-line))] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--ax-secondary))] sm:flex">
            <span className="w-24 shrink-0">Order</span>
            <span className="w-24 shrink-0">Date</span>
            <span className="min-w-0 flex-1">Customer</span>
            <span className="w-32 shrink-0">Entity</span>
            <span className="w-20 shrink-0 text-right">Total</span>
            <span className="w-24 shrink-0 text-right">Fulfilment</span>
          </div>
          <div className="divide-y divide-[hsl(var(--ax-line))]">
            {rows.map((o) => (
              <a
                key={o.id}
                href={`/admin/orders/${o.id}`}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-white/[0.03]"
              >
                <span className="w-24 shrink-0 truncate font-medium">{o.name ?? "—"}</span>
                <span className="w-24 shrink-0 truncate text-[hsl(var(--ax-faint))]">
                  {o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[hsl(var(--ax-secondary))]">{o.customerName ?? "—"}</span>
                <span className="w-32 shrink-0 truncate text-[hsl(var(--ax-faint))]">
                  {(o.attributedOrgId && orgOwner.get(o.attributedOrgId)) || "—"}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">{fmtMoney(o.total)}</span>
                <span className="w-24 shrink-0 truncate text-right text-[hsl(var(--ax-faint))]">
                  {o.fulfillmentStatus ?? "unfulfilled"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
        Entity attribution only resolves for entities that own their own organisation. Order line items carry no product
        link in the live data, so per-entity revenue cannot be derived yet — this is recorded as TO RECONCILE in
        AX_OS_V2_SOURCE_OF_TRUTH.md.
      </p>
    </>
  );
}
