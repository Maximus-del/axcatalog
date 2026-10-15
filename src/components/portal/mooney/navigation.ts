import { Shirt, ShoppingBag, Pencil, Images, ChartNoAxesCombined } from "lucide-react";

// Current registered routes remain authoritative until the router is updated separately.
export const mooneyNavigation = [
  { label: "Locker Room", path: "/portal", icon: Shirt },
  { label: "My Gear", path: "/portal/products", icon: ShoppingBag },
  { label: "Creative Studio", path: "/portal/studio", icon: Pencil },
  { label: "Content & Drops", path: "/portal/content", icon: Images },
  { label: "Brand HQ", path: "/portal/analytics", icon: ChartNoAxesCombined },
];

export function portalLink(href: string, currentSearch: string) {
  const target = new URL(href, "https://portal.local");
  if (target.pathname === "/portal/gear") target.pathname = "/portal/products";
  if (target.pathname === "/portal/brand") target.pathname = "/portal/analytics";
  const scope = new URLSearchParams(currentSearch).get("as");
  if (scope) target.searchParams.set("as", scope);
  return `${target.pathname}${target.search}${target.hash}`;
}

export function activePortalPage(pathname: string) {
  if (pathname.startsWith("/portal/build") || pathname.startsWith("/portal/mockups")) return mooneyNavigation[1];
  if (pathname.startsWith("/portal/drops")) return mooneyNavigation[3];
  if (pathname.startsWith("/portal/profile") || pathname.startsWith("/portal/era")) return mooneyNavigation[4];
  return mooneyNavigation.slice(1).find((item) => pathname.startsWith(item.path)) ?? mooneyNavigation[0];
}