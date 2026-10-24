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
import { fetchProductDestinations, filterProducts, frontBack, toContractProduct } from "@/lib/portal/api/products";
import {
  fetchOrders,
  quoteOrder,
  submitOrderRequest,
  type OrderLineInput,
  type OrderRequestInput,
  type Turnaround,
} from "@/lib/portal/api/orders";
import type { MediaAsset, Product, Project } from "@/lib/portal/api/contract";
import { fetchPlaybook } from "@/lib/portal/api/playbook";
import { fetchBlankCatalog, requestBlank, type BlankRequestInput } from "@/lib/portal/api/blank-catalog";
import {
  createDrop,
  fetchAnalytics,
  getProfile,
  listAssets,
  listDrops,
  matchTopProducts,
  updateDrop,
  updateProfile,
} from "@/lib/portal/api/brand";
import {
  createProject,
  decideConcept,
  getProject,
  listMessages,
  listProjects,
  postMessage,
  uploadFile,
  type NewProjectInput,
} from "@/lib/portal/api/studio";

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
 * destinations each belongs to. `lifecycle` picks the tab: "live" (default —
 * on the website), "archive" (off the website, still orderable) or "all". `collection` is a destination id from
 * usePortalDestinations (e.g. "atlanta"); "all" or empty means every product.
 */
export function usePortalCatalog(
  opts: { collection?: string | null; hidden?: "exclude" | "only" | "include"; lifecycle?: "live" | "archive" | "all" } = {},
) {
  const scope = usePortalScope();
  const { products: liveProducts, archivedProducts, productsLoading, hidden } = usePortalData();
  const products = useMemo(() => [...liveProducts, ...archivedProducts], [liveProducts, archivedProducts]);
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
  const items = useMemo(() => filterProducts(all, opts), [all, opts.collection, opts.hidden, opts.lifecycle]); // eslint-disable-line react-hooks/exhaustive-deps
  // Counts for the Live / Archive tabs, within the chosen collection.
  const inCollection = useMemo(
    () => filterProducts(all, { collection: opts.collection, hidden: opts.hidden, lifecycle: "all" }),
    [all, opts.collection, opts.hidden],
  );
  return {
    items,
    all,
    liveCount: inCollection.filter((p) => p.lifecycle === "live").length,
    archiveCount: inCollection.filter((p) => p.lifecycle === "archive").length,
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

/** Creative Studio project list. Concept image URLs inside expire in 5 minutes; refetch, don't cache. */
export function usePortalProjects(opts: { status?: Project["status"]; cursor?: string | null } = {}) {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "projects", opts.status ?? null, opts.cursor ?? null),
    queryFn: () => listProjects(scope, opts),
    staleTime: 60_000,
  });
}

export function usePortalProject(projectId: string | null) {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "project", projectId),
    queryFn: () => getProject(scope, projectId as string),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function usePortalCreateProject() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProjectInput) => createProject(scope, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keyFor(scope, "projects") }),
  });
}

/** Approve / request changes. A 409 means the project changed: refetch and show the latest. */
export function usePortalDecideConcept() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof decideConcept>[1]) => decideConcept(scope, input),
    onSettled: (_d, _e, input) => {
      void qc.invalidateQueries({ queryKey: keyFor(scope, "project", input.projectId) });
      void qc.invalidateQueries({ queryKey: keyFor(scope, "projects") });
      void qc.invalidateQueries({ queryKey: keyFor(scope, "messages", input.projectId) });
    },
  });
}

/** Project chat (projectId) or the general AX Team thread (null). */
export function usePortalMessages(projectId: string | null) {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "messages", projectId),
    queryFn: () => listMessages(scope, { projectId }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function usePortalPostMessage() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof postMessage>[1]) => postMessage(scope, input),
    onSuccess: (_d, input) => void qc.invalidateQueries({ queryKey: keyFor(scope, "messages", input.projectId) }),
  });
}

/** Private upload: returns the upload id to attach to a brief or message. */
export function usePortalUpload() {
  const scope = usePortalScope();
  return useMutation({
    mutationFn: (input: { file: File; purpose: "inspiration" | "attachment"; projectId?: string | null }) =>
      uploadFile(scope, input.file, input.purpose, input.projectId ?? null),
  });
}

/** Content library: product photos, AX social assets, published posts. */
export function usePortalAssets(opts: { kind?: MediaAsset["kind"] | null; collection?: string | null } = {}) {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "assets", opts.kind ?? null, opts.collection ?? null),
    queryFn: () => listAssets(scope, opts),
    staleTime: 5 * 60_000,
  });
}

export function usePortalDrops() {
  const scope = usePortalScope();
  return useQuery({ queryKey: keyFor(scope, "drops"), queryFn: () => listDrops(scope), staleTime: 60_000 });
}

export function usePortalCreateDrop() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDrop>[1]) => createDrop(scope, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keyFor(scope, "drops") }),
  });
}

/** Edit a draft or send it for review. A 409 means it changed: refetch, don't retry. */
export function usePortalUpdateDrop() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDrop>[1]) => updateDrop(scope, input),
    onSettled: () => void qc.invalidateQueries({ queryKey: keyFor(scope, "drops") }),
  });
}

/** Brand HQ reporting for a period (defaults to the last 12 months in the viewer's zone). */
export function usePortalAnalytics(months = 12) {
  const scope = usePortalScope();
  const { products, archivedProducts } = usePortalData();
  const p = useMemo(() => lastMonths(months, viewerTimeZone()), [months]);
  const q = useQuery({
    queryKey: keyFor(scope, "analytics", p.from, p.to, p.timeZone),
    queryFn: () => fetchAnalytics(scope, p),
    staleTime: 60_000,
  });
  // Top sellers get the client's own product photo and link, matched by title.
  const catalog = useMemo(
    () => [...products, ...archivedProducts].map((x) => ({ id: x.id, title: x.title, image: frontBack(x).front })),
    [products, archivedProducts],
  );
  const data = useMemo(
    () => (q.data ? { ...q.data, topProducts: matchTopProducts(q.data.topProducts, catalog) } : q.data),
    [q.data, catalog],
  );
  return { ...q, data };
}

export function usePortalProfile() {
  const scope = usePortalScope();
  const { sales } = usePortalData();
  const lifetime = sales.loading ? null : sales.lifetimeRevenue;
  return useQuery({
    queryKey: keyFor(scope, "profile", lifetime),
    queryFn: () => getProfile(scope, lifetime),
    staleTime: 5 * 60_000,
  });
}

export function usePortalUpdateProfile() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { patch: Parameters<typeof updateProfile>[1]; expectedVersion?: string | null }) =>
      updateProfile(scope, input.patch, input.expectedVersion ?? null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keyFor(scope, "profile") }),
  });
}


/** Brand HQ one-pagers: the live numbers (terms, volume breaks, bulk prices, credit, code). */
export function usePortalPlaybook() {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "playbook"),
    queryFn: () => fetchPlaybook(scope),
    staleTime: 5 * 60_000,
  });
}

/** AX's approved blanks, priced for this client (owners only). */
export function usePortalBlankCatalog() {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "blank-catalog"),
    queryFn: () => fetchBlankCatalog(scope),
    staleTime: 5 * 60_000,
  });
}

/** "Add to my shop" — files a blank request for AX to turn into a product. */
export function usePortalRequestBlank() {
  const scope = usePortalScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BlankRequestInput) => requestBlank(scope, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keyFor(scope, "blank-catalog") }),
  });
}
