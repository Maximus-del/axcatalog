// Where "back" should actually go.
//
// A product opened from an athlete's board belongs to that board, not to the
// products list — and the board has tabs, so the return address has to include
// the query string. Callers attach a BackTarget as router state when they
// navigate in; detail pages read it here and fall back to their own list when
// the page was reached directly (a bookmark, a refresh, global search).
import { useLocation } from "react-router-dom";

export interface BackTarget {
  /** Full path including search, so a tab selection survives the round trip. */
  to: string;
  /** What the back button should say — "Ana Ruiz", not "Products". */
  label: string;
}

/** Build the state to attach to a <Link> or navigate() heading into a detail page. */
export function backState(from: BackTarget): { from: BackTarget } {
  return { from };
}

/** Current location as a return address. */
export function backTargetOf(pathname: string, search: string, label: string): BackTarget {
  return { to: `${pathname}${search}`, label };
}

export function useBackTarget(fallback: BackTarget): BackTarget {
  const location = useLocation();
  const from = (location.state as { from?: BackTarget } | null)?.from;
  // Only trust an in-app relative path — state is user-controllable via history.
  if (from && typeof from.to === "string" && from.to.startsWith("/") && !from.to.startsWith("//")) {
    return { to: from.to, label: from.label || fallback.label };
  }
  return fallback;
}
