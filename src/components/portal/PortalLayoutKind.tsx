// Which shell this portal is wearing: "world" (the Locker Room / Mooney World
// shell) or "classic". Decided per client by their portal theme, so a
// redesign for one client never changes another client's portal.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { PortalLayoutKind, PortalTheme } from "@/lib/portal/portal-theme";
import { LAYOUT_OVERRIDE_KEY, resolveLayout } from "@/lib/portal/world";

const Ctx = createContext<PortalLayoutKind>("classic");

export function usePortalLayoutKind(): PortalLayoutKind {
  return useContext(Ctx);
}

export function PortalLayoutKindProvider({ value, children }: { value: PortalLayoutKind; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function readStored(): string | null {
  try {
    return sessionStorage.getItem(LAYOUT_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** The client's theme, unless `?layout=world|classic` asks to preview the other shell in this tab. */
export function useResolvedLayout(theme: Pick<PortalTheme, "layout"> | null): PortalLayoutKind {
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get("layout");
  useEffect(() => {
    if (asked !== "world" && asked !== "classic") return;
    try {
      sessionStorage.setItem(LAYOUT_OVERRIDE_KEY, asked);
    } catch {
      /* private mode: the param still works on this page */
    }
  }, [asked]);
  return useMemo(() => resolveLayout(theme ?? { layout: "classic" }, search, readStored()), [theme, search]);
}
