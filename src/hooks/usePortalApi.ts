// The portal adapter as React hooks — what Lovable's components call.
//
// Every hook takes its scope from the portal shell (useCurrentAthlete →
// PortalDataContext), never from a prop or URL a component invents: the
// athlete row that scope comes from is one the database already let this
// session read, and server functions re-check it.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortalData } from "@/components/portal/PortalDataContext";
import type { PortalScope } from "@/lib/portal/api/contract";
import { defaultSummaryPeriod, fetchRevenue, fetchSummary } from "@/lib/portal/api/summary";
import { fetchDestinations } from "@/lib/portal/api/destinations";
import { lastMonths, viewerTimeZone, type Period } from "@/lib/portal/api/period";
import { fetchProductDestinations, filterProducts, toContractProduct } from "@/lib/portal/api/products";
import {
  fetchOrders,
  quoteOrder,
  submitOrderRequest,
  type OrderLineInput,
  type OrderRequestInput,
  type Turnaround,
} from "@/lib/portal/api/orders";
import type { Product } from "@/lib/portal/api/contract";

export function usePortalScope(): PortalScope {
  const { athlete, isImpersonating } = usePortalData();
  return useMemo(
    () => ({ athleteId: athlete.id, organizationId: athlete.organization_id, viewingAs: isImpersonating }),
    [athlete.id, athlete.organization_id, isImpersonating],
  );
}

const keyFor = (scope: PortalScope, ...rest: unknown[]) => ["portal-api", scope.athleteId, scope.viewingAs, ...rest];

/** Locker Room / Brand HQ headline numbers. Period defaults to the last 12 months in the viewer's zone. */
export function usePortalSummary(period?: Period) {
  const scope = usePortalScope();
  const p = useMemo(() => period ?? defaultSummaryPeriod(viewerTimeZone()), [period]);
  return useQuery({
    queryKey: keyFor(scope, "summary", p.from, p.to, p.timeZone),
    queryFn: () => fetchSummary(scope, p),
    staleTime: 60_000,
  });
}

/** Brand HQ chart + top products for a period. */
export function usePortalRevenue(months = 12) {
  const scope = usePortalScope();
  const p = useMemo(() => lastMonths(months, viewerTimeZone()), [months]);
  return useQuery({
    queryKey: keyFor(scope, "revenue", p.from, p.to, p.timeZone),
    queryFn: () => fetchRevenue(scope, p),
    staleTime: 60_000,
  });
}

/** The Locker Room wall: one destination per active collection. */
export function usePortalDestinations() {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "destinations"),
    queryFn: () => fetchDestinations(scope),
    staleTime: 5 * 60_000,
  });
}

/**
 * My Gear: the athlete's products in the contract shape, with the
 * destinations each belongs to. `collection` is a destination id from
 * usePortalDestinations (e.g. "atlanta"); "all" or empty means every product.
 */
export function usePortalCatalog(opts: { collection?: string | null; hidden?: "exclude" | "only" | "include" } = {}) {
  const scope = usePortalScope();
  const { products, productsLoading, hidden } = usePortalData();
  const destinations = usePortalDestinations();
  const links = useQuery({
    queryKey: keyFor(scope, "product-destinations", (destinations.data ?? []).map((d) => d.collectionId).join(",")),
    queryFn: () => fetchProductDestinations(scope, destinations.data ?? []),
    enabled: destinations.isSuccess,
    staleTime: 5 * 60_000,
  });
  const all: Product[] = useMemo(
    () =>
      products.map((p) => toContractProduct(p, links.data?.get(p.id) ?? [], hidden.hiddenIds.has(p.id))),
    [products, links.data, hidden.hiddenIds],
  );
  const items = useMemo(() => filterProducts(all, opts), [all, opts.collection, opts.hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    items,
    all,
    hiddenCount: all.filter((p) => p.hidden).length,
    loading: productsLoading || destinations.isLoading || links.isLoading,
    hide: hidden.hide,
    unhide: hidden.unhide,
  };
}

/**
 * The server's price for a cart, live. Show THIS, and pass
 * `quote.subtotalDollars` as expectedSubtotal when submitting.
 */
export function usePortalQuote(items: OrderLineInput[], opts: { turnaround?: Turnaround; unitsOverride?: number | null } = {}) {
  const scope = usePortalScope();
  const key = JSON.stringify(items.filter((i) => i.quantity > 0));
  return useQuery({
    queryKey: keyFor(scope, "quote", key, opts.turnaround ?? "standard", opts.unitsOverride ?? null),
    queryFn: () => quoteOrder(scope, items.filter((i) => i.quantity > 0), opts),
    enabled: items.some((i) => i.quantity > 0) || (opts.unitsOverride ?? 0) > 0,
    staleTime: 15_000,
    retry: false,
  });
}

/** POST /order-requests. Reuse the same idempotencyKey for every retry of one checkout. */
export function usePortalSubmitOrder() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderRequestInput) => submitOrderRequest(scope, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["portal-api", scope.athleteId] });
    },
  });
}

/** GET /orders, newest first. */
export function usePortalOrderHistory(cursor: string | null = null, limit = 24) {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "orders", cursor, limit),
    queryFn: () => fetchOrders(scope, cursor, limit),
    staleTime: 30_000,
  });
}
