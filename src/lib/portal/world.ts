// Which portal shell a client sees, and what the world shell calls itself.
//
// The Locker Room shell (Mooney World) is per client: the client's portal
// theme says `layout: "world"` (set in V2 → Portal look → Portal style).
// Everyone else keeps the classic portal, so one client's redesign never
// rebrands another client's portal.

import type { PortalLayoutKind, PortalTheme } from "./portal-theme";

export const LAYOUT_OVERRIDE_KEY = "ax.portal.layout";

/**
 * The theme decides; `?layout=world|classic` overrides it for this browser tab
 * (so AX can preview a client in the world shell before switching them),
 * remembered in sessionStorage so it survives navigation.
 */
export function resolveLayout(theme: Pick<PortalTheme, "layout">, search: string, stored: string | null): PortalLayoutKind {
  const asked = new URLSearchParams(search).get("layout");
  if (asked === "world" || asked === "classic") return asked;
  if (stored === "world" || stored === "classic") return stored;
  return theme.layout;
}

/** "Mooney World" — the theme's brand, else the client's last name + " World". */
export function worldBrand(theme: Pick<PortalTheme, "brand">, lastName: string | null | undefined, displayName?: string | null): string {
  if (theme.brand.trim()) return theme.brand.trim();
  const last = (lastName ?? "").trim();
  const base = last && last !== "." ? last : ((displayName ?? "").trim().split(/\s+/).pop() ?? "");
  return base ? `${base} World` : "Your World";
}

/** Split the brand for a two-line wordmark: first word, then the rest. */
export function brandLines(brand: string): [string, string] {
  const words = brand.trim().split(/\s+/);
  if (words.length < 2) return [brand.trim(), ""];
  return [words[0], words.slice(1).join(" ")];
}
