// One list of portal destinations, consumed by every navigation surface.
//
// There were three before this and they disagreed. The bottom nav offered five
// sections and was `md:hidden`. The drawer offered ten and opened from a
// hamburger. PortalSubNav offered five more and was imported by nothing at all.
// The result: a desktop client had no persistent navigation of any kind — a
// header, a hamburger, and a page — and "Made For You" was two taps deep behind
// a menu most people never open.

export interface PortalDestination {
  to: string;
  /** Short label for the bottom bar. */
  label: string;
  /** Full label for the drawer and desktop bar, where there is room to be clear. */
  longLabel?: string;
  icon: string;
  /** Match this path exactly rather than by prefix (Home would match everything). */
  end?: boolean;
  /** Shown in the mobile bottom bar. Five is the most that fits at 375px. */
  primary?: boolean;
}

export const PORTAL_NAV: PortalDestination[] = [
  { to: "/portal", label: "Home", icon: "Home", end: true, primary: true },
  { to: "/portal/products", label: "Products", longLabel: "Product Lineup", icon: "Shirt", primary: true },
  { to: "/portal/mockups", label: "Made For You", icon: "Palette" },
  { to: "/portal/studio", label: "Studio", longLabel: "Design Studio", icon: "Wand2", primary: true },
  { to: "/portal/content", label: "Content", longLabel: "Social Content", icon: "Image", primary: true },
  { to: "/portal/messages", label: "Messages", icon: "MessageSquare" },
  { to: "/portal/analytics", label: "Analytics", icon: "BarChart3" },
  { to: "/portal/catalog", label: "Catalog", longLabel: "Blank Catalog", icon: "LayoutGrid" },
  { to: "/portal/drops", label: "Drops", longLabel: "Upcoming Drops", icon: "Sparkles" },
  { to: "/portal/era", label: "Era", longLabel: "Era Comparison", icon: "Layers" },
  { to: "/portal/profile", label: "Profile", longLabel: "Profile & Brand", icon: "User", primary: true },
];

/** The five slots in the mobile bottom bar, in order. */
export const PRIMARY_NAV = PORTAL_NAV.filter((d) => d.primary);

export function labelFor(d: PortalDestination, long: boolean): string {
  return long ? (d.longLabel ?? d.label) : d.label;
}

/**
 * Whether a destination is the one currently being viewed.
 *
 * Prefix matching, except for Home — `/portal` is a prefix of every other
 * portal route, so an unqualified prefix test lights Home up permanently.
 */
export function isActive(d: PortalDestination, pathname: string): boolean {
  return d.end ? pathname === d.to : pathname === d.to || pathname.startsWith(`${d.to}/`);
}

/**
 * Every nav link must carry the current query string.
 *
 * An admin views a client portal by impersonating: `/portal?as=<athlete-id>`.
 * The bottom bar preserved `search`; the drawer used a bare `to={l.to}`, so
 * navigating from the drawer silently dropped the impersonation and threw the
 * operator back to their own linked athlete, or to /pending-access if they had
 * none. It looked like the portal was broken rather than like the link was.
 */
export function toWithSearch(to: string, search: string): { pathname: string; search: string } {
  return { pathname: to, search };
}
