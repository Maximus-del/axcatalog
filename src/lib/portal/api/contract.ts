// THE PORTAL ADAPTER CONTRACT — what Lovable's components consume.
//
// Started from the Mooney World handoff (frontend/contracts.ts) and adapted to
// what the backend actually is. Differences from the handoff are marked
// [CHANGED] with the reason; everything else is the handoff's shape verbatim.
//
// There is no /api/portal HTTP server. The app talks to Supabase directly and
// the database's row-level security decides what each login can see; a second
// API layer would duplicate that authority. Each handoff operation is a typed
// function in src/lib/portal/api/*, exposed to components as a usePortal*
// hook. Reads go through RLS; anything that needs server authority (scoping,
// revenue, orders, approvals, signed downloads) is a SECURITY DEFINER function
// that resolves the caller from their session — never from an id the browser
// sends alone. See docs/PORTAL_ADAPTER.md for the operation-by-operation map.

/**
 * [CHANGED] Was a fixed union of Mooney's four cities. Destinations are
 * per-athlete data — the key comes from the collection's
 * metadata.portal_destination.key (Mooney: 'atlanta' | 'chicago' |
 * 'new-york' | 'moons-house'), falling back to the collection slug — so the
 * same portal serves every athlete without a code change.
 */
export type DestinationId = string;

/** Integer minor units (cents) + ISO currency. Never summed across currencies. */
export type Money = { amountMinor: number; currency: string };

export type Loadable<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

export interface Destination {
  id: DestinationId;
  label: string;
  jerseyNumber: number | null;
  /** Hex. From the destination config, else the team's primary colour. */
  accent: string;
  /** Collectible artwork URL, or null when none is configured — render a fallback, never a broken image. */
  image: string | null;
  /**
   * [ADDED] Every piece of art for this destination, first = `image`. More than
   * one is shown as a fanned deck (Proactive's University crests I and II).
   */
  images: string[];
  /** [ADDED] Small line under the label, from the config ("Crest I · Crest II"). Empty when unset. */
  caption: string;
  href: string;
  /** [ADDED] The collection behind this destination. */
  collectionId: string;
  /** [ADDED] Products in the collection the viewer can see. */
  productCount: number;
  /** [ADDED] The team's name when the collection is tied to one. */
  teamName: string | null;
}

export interface Product {
  id: string;
  destinationIds: DestinationId[];
  title: string;
  unitPrice: Money | null;
  frontImage: string | null;
  backImage: string | null;
  publicUrl: string | null;
  hidden: boolean;
  /**
   * [ADDED] "live" = on the website (published or internal); "archive" = taken
   * off the website by AX but still orderable — AX reprints it from the design
   * file. Decided by the store status AX sets, never by the client.
   */
  lifecycle: "live" | "archive";
  orderable: boolean;
}

export interface Project {
  id: string;
  title: string;
  destinationId: DestinationId | null;
  status: "requested" | "in_progress" | "feedback" | "approved" | "archived";
  version: number;
  concepts: { id: string; imageUrl: string; version: number }[];
  updatedAt: string;
}

export interface Message {
  id: string;
  projectId: string | null;
  body: string;
  authorLabel: string;
  createdAt: string;
  attachments: { id: string; name: string; downloadUrl: string }[];
}

export interface MediaAsset {
  id: string;
  title: string;
  kind: "photo" | "video" | "graphic" | "product";
  thumbnailUrl: string | null;
  downloadUrl: string | null;
  productId: string | null;
  caption: string | null;
  approved: boolean;
}

export interface Drop {
  id: string;
  title: string;
  status: "draft" | "review" | "scheduled" | "live";
  scheduledAt: string | null;
  timeZone: string;
  destinationId: DestinationId | null;
}

export interface Order {
  id: string;
  number: string;
  createdAt: string;
  units: number;
  status: string;
  total: Money | null;
  destinationId: DestinationId | null;
  /** What is still owed after AX credit. */
  amountDue?: Money | null;
  /** unpaid · invoiced · paid · waived. */
  paymentStatus?: string | null;
  /** pay_now · net_30 (cart checkout) · invoice (AX invoices) · null (older orders). */
  paymentTerms?: string | null;
  /** Net 30 due date, YYYY-MM-DD. */
  dueDate?: string | null;
  /** Shopify checkout (pay now) or invoice page (net 30). */
  paymentUrl?: string | null;
}

export type RevenueBasis = "gross" | "net" | "athlete_share";

export interface Summary {
  creditBalance: Money | null;
  lifetimeRevenue: Money | null;
  ordersCount: number | null;
  liveProductsCount: number | null;
  /** Revenue inside `period`. Different scope from lifetime — never force them to agree. */
  attributedRevenue: Money | null;
  period: { from: string; to: string; timeZone: string };
  /** When the revenue data was last imported from Shopify. */
  asOf: string;
  /**
   * 'gross' today: Shopify line totals after line discounts, BEFORE refunds and
   * cancellations. Chosen 2026-10-15: label it honestly rather than change it.
   */
  revenueBasis: RevenueBasis;
  /** [ADDED] The part of lifetimeRevenue from orders Shopify flagged refunded or cancelled. */
  refundFlaggedRevenue: Money | null;
  /**
   * [ADDED] false when revenue cannot be attributed to this athlete alone (a
   * shared organisation). Revenue fields are then null — show "Revenue not
   * attributed", never a number.
   */
  revenueAttributable: boolean;
  followers: number | null;
  accessMembers: number | null;
  vipMembers: number | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string>;
}

/**
 * [ADDED] Whose portal a request is for. Resolved by useCurrentAthlete from a
 * row the database let this session read; for "View as" the database also
 * re-checks it (portal_scope_athlete) on every server call.
 */
export interface PortalScope {
  athleteId: string;
  organizationId: string;
  /** An AX operator viewing as this athlete. The UI must show the indicator; writes are blocked. */
  viewingAs: boolean;
}

/** [ADDED] Thrown by adapter calls; carries the contract's ApiError. */
export class PortalApiError extends Error {
  readonly error: ApiError;
  readonly status: number;
  constructor(error: ApiError, status: number) {
    super(error.message);
    this.error = error;
    this.status = status;
  }
}
