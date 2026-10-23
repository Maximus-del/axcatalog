// OWNER vs TEAM inside a client portal.
//
// Owner (C-level): everything — Brand HQ (sales, earnings, playbook), the
// studio (commissioning designs), the brand profile, credit.
// Team (coaches, staff): their locker, their gear and orders, content to post,
// messages. No money, no commissioning, no brand edits.
//
// This file only decides what the UI SHOWS. The money itself is closed at the
// database (owner-only policies and RPC gates, migration 20261022160000), so a
// team login poking the API gets nothing either way.
import type { PortalRole } from "./invites";
import type { QuickPlayKey } from "./portal-theme";

/** Path prefixes a Team login never sees. */
export const OWNER_ONLY_PATHS = ["/portal/analytics", "/portal/brand", "/portal/era", "/portal/profile", "/portal/studio"];

export function canSeePath(pathname: string, role: PortalRole): boolean {
  if (role === "owner") return true;
  return !OWNER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Filter any nav list whose items carry a path (`path` or `to`). */
export function navForRole<T extends { path?: string; to?: string }>(items: T[], role: PortalRole): T[] {
  return items.filter((i) => canSeePath(i.path ?? i.to ?? "", role));
}

/** Home-room shortcuts that commission work or touch money are owner-only. */
const OWNER_PLAYS: QuickPlayKey[] = ["design", "request", "projects"];
export function playsForRole(keys: QuickPlayKey[], role: PortalRole): QuickPlayKey[] {
  if (role === "owner") return keys;
  const kept = keys.filter((k) => !OWNER_PLAYS.includes(k));
  return kept.includes("order") ? kept : ["order", ...kept];
}

/**
 * The role the portal should render as.
 *  - An admin viewing a client (?as=) sees the owner view, or the team view
 *    with ?view=team, so AX can check exactly what a coach sees.
 *  - Everyone else: the role on their link. A missing role means a link made
 *    before roles existed — those were all owners.
 */
export function resolvePortalRole(opts: {
  isAdmin: boolean;
  viewParam: string | null;
  linkRole: string | undefined;
}): PortalRole {
  if (opts.isAdmin) return opts.viewParam === "team" ? "team" : "owner";
  return opts.linkRole === "team" ? "team" : "owner";
}
