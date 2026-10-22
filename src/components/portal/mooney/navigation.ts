import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const current = new URLSearchParams(currentSearch);
  const scope = current.get("as");
  if (scope) target.searchParams.set("as", scope);
  // An admin previewing the Team view keeps it while clicking around.
  if (scope && current.get("view") === "team") target.searchParams.set("view", "team");
  return `${target.pathname}${target.search}${target.hash}`;
}

/** The same five rooms, with the home room named for this client ("Locker Room", "Gym HQ"). */
export function worldNavigation(roomName: string) {
  const home = roomName.trim() || mooneyNavigation[0].label;
  return [{ ...mooneyNavigation[0], label: home }, ...mooneyNavigation.slice(1)];
}

export function activePortalPage(pathname: string, nav = mooneyNavigation) {
  if (pathname.startsWith("/portal/build") || pathname.startsWith("/portal/mockups")) return nav[1];
  if (pathname.startsWith("/portal/drops")) return nav[3];
  if (pathname.startsWith("/portal/profile") || pathname.startsWith("/portal/era")) return nav[4];
  return nav.slice(1).find((item) => pathname.startsWith(item.path)) ?? nav[0];
}

/** navigate() that keeps View-as scope (?as=) on every portal address. */
export function usePortalNavigate() {
  const navigate = useNavigate();
  const { search } = useLocation();
  return useCallback((href: string) => navigate(portalLink(href, search)), [navigate, search]);
}
