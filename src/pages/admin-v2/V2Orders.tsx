import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useEntities, useOrders } from "@/lib/v2/data";
import { fmtMoney } from "@/lib/v2/pricing";
import { Chip, EmptyState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// Orders stay deliberately thin. The existing order + fulfilment infrastructure
// is reused as-is; V2 only gives the operator a legible list — but a legible
// list you can filter, search and link to.

export default function V2Orders() {
  const { data, isLoading } = useOrders();
  const entitiesQ = useEntities();
  const [params, setParams] = useSearchParams();

  const openOnly = params.get("open") === "1";
  const query = params.get("q") ?? "";

  const patch = (changes: { open?: boolean; q?: string }) => {
    const next = new URLSearchParams(params);
    const open = changes.open ?? openOnly;
    const q = changes.q ?? query;
    if (open) next.set("open", "1");
    else next.delete("open");
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    setParams(next, { replace: true });
  };

  // Only entities that own an organisation can be resolved from an order today.
  const orgOwner = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const e of entitiesQ.data ?? []) if (e.hasOwnOrg) m.set(e.organizationId, { id: e.id, name: e.name });
    return m;
  }, [entitiesQ.data]);

  const rows = useMemo(() => {
    let out = data ?? [];
    if (openOnly) out = out.filter((o) => (o.fulfillmentStatus ?? "unfulfilled") !== "fulfilled");
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((o) => {
        const owner = o.attributedOrgId ? orgOwner.get(o.attributedOrgId)?.name : null;
        return [o.name, o.customerName, owner].filter(Boolean).join(" ").toLowerCase().includes(q);
      });
    }
    return out;
  }, [data, openOnly, query, orgOwner]);

  const openCount = (data ?? []).filter((o) => (o.fulfillmentStatus ?? "unfulfilled") !== "fulfilled").length;
  const value = rows.reduce((sum, o) => sum + (o.total ?? 0), 0);

  return (
    <>
      <PageHeader title="Orders" subtitle="The 60 most recent orders, straight from the existing order records." />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <input
            value={query}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search by order number, customer or entity…"
            className="w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-2.5 pl-10 pr-4 text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))] focus:border-[hsl(var(--ax-accent))]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={!openOnly} onClick={() => patch({ open: false })}>
            All {data?.length ?? 0}
          </Chip>
          <Chip active={openOnly} onClick={() => patch({ open: true })}>
            Not fulfilled {openCount}
          </Chip>
          <span className="ml-auto text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">
            {rows.length} shown · {fmtMoney(value)}
          </span>
        </div>
      </div>

      {isLoading && <Skeleton className="h-72" />}
      {!isLoading && rows.length === 0 && (
        <EmptyState>
          {query.trim() ? "No order matches that search." : "No orders match."}
        </EmptyState>
      )}

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
            {rows.map((o) => {
              const owner = o.attributedOrgId ? orgOwner.get(o.attributedOrgId) : undefined;
              return (
                <Link
                  key={o.id}
                  to={`/admin/orders/${o.id}`}
                  className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-white/[0.03]"
                >
                  <span className="w-24 shrink-0 truncate font-medium">{o.name ?? "—"}</span>
                  <span className="w-24 shrink-0 truncate text-[hsl(var(--ax-faint))]">
                    {o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[hsl(var(--ax-secondary))]">{o.customerName ?? "—"}</span>
                  <span
                    className="w-32 shrink-0 truncate text-[hsl(var(--ax-faint))]"
                    title={owner ? `Attributed to ${owner.name}` : "No entity owns this order's organisation"}
                  >
                    {owner?.name ?? "—"}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">{fmtMoney(o.total)}</span>
                  <span className="w-24 shrink-0 truncate text-right text-[hsl(var(--ax-faint))]">
                    {o.fulfillmentStatus ?? "unfulfilled"}
                  </span>
                </Link>
              );
            })}
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
