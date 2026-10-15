import { useLayoutEffect } from "react";
import { themeCssVars, type PortalTheme } from "@/lib/portal/portal-theme";

/**
 * Paints a portal theme onto <html> while the portal is mounted.
 *
 * On <html>, not on the layout's wrapper div, because dialogs, sheets, toasts
 * and dropdowns are portalled to <body> — a variable set on the wrapper would
 * leave every popup in AX green while the page around it is Bears navy.
 *
 * Whatever was there before is restored on unmount, so leaving /portal for
 * /admin-v2 (an operator using "View as") does not carry the client's colours
 * into the dashboard.
 */
export function useApplyPortalTheme(theme: PortalTheme | null): void {
  const key = theme ? JSON.stringify(theme) : "";
  useLayoutEffect(() => {
    if (!theme || typeof document === "undefined") return;
    const root = document.documentElement;
    const vars = themeCssVars(theme);
    const previous: Record<string, string> = {};
    for (const [name, value] of Object.entries(vars)) {
      previous[name] = root.style.getPropertyValue(name);
      root.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(vars)) {
        if (previous[name]) root.style.setProperty(name, previous[name]);
        else root.style.removeProperty(name);
      }
    };
    // `key` stands in for `theme` so a new object with the same values is not a re-paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
