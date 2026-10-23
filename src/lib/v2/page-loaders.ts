// Every /admin-v2 page module, in one place.
//
// App.tsx builds its lazy() routes from these, and V2Layout calls all of them
// once the shell is on screen (preloadV2Pages). Same import() specifiers means
// the same chunks: by the time the operator clicks a section, its code is
// already in the browser, so switching pages has no load at all.

export const v2Pages = {
  overview: () => import("@/pages/admin-v2/V2Overview"),
  people: () => import("@/pages/admin-v2/V2People"),
  entityOverview: () => import("@/pages/admin-v2/V2EntityOverview"),
  entityWorkspace: () => import("@/pages/admin-v2/V2EntityWorkspace"),
  creative: () => import("@/pages/admin-v2/V2Creative"),
  commerce: () => import("@/pages/admin-v2/V2Commerce"),
  blankDetail: () => import("@/pages/admin-v2/V2BlankDetail"),
  notFound: () => import("@/pages/admin-v2/V2NotFound"),
  orders: () => import("@/pages/admin-v2/V2Orders"),
  cart: () => import("@/pages/admin-v2/V2Cart"),
  productDetail: () => import("@/pages/admin-v2/V2ProductDetail"),
  desk: () => import("@/pages/admin-v2/V2Desk"),
  lineup: () => import("@/pages/admin-v2/V2Lineup"),
  pricingSheet: () => import("@/pages/admin-v2/V2PricingSheet"),
  invoiceBuilder: () => import("@/pages/admin-v2/V2InvoiceBuilder"),
  invoiceDocument: () => import("@/pages/admin-v2/V2InvoiceDocument"),
  work: () => import("@/pages/admin-v2/V2Work"),
  releases: () => import("@/pages/admin-v2/V2Releases"),
  contentReview: () => import("@/pages/admin-v2/V2ContentReview"),
} as const;

let started = false;

/**
 * Fetch every V2 page chunk in the background, once per session.
 * Waits for the browser to be idle so it never competes with the page the
 * operator actually opened. Failures are ignored — a chunk that did not
 * preload simply loads on click, as before.
 */
export function preloadV2Pages(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const run = () => {
    for (const load of Object.values(v2Pages)) void load().catch(() => undefined);
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else window.setTimeout(run, 600);
}
