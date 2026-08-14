// ─────────────────────────────────────────────────────────────────────────
// ACCESS RULES — one central place. Never scatter access checks in components;
// call canView() / earlyAccess() and the useAthleteAccess() hook.
// ─────────────────────────────────────────────────────────────────────────
import type { FollowState } from "./types";

export type Visibility = "public" | "followers" | "access" | "vip";

export interface AccessState {
  isFollowing: boolean;
  isMember: boolean; // Access (subscriber) or VIP
  isVip: boolean;
}

/** Map a follow-relationship state to access capabilities. */
export function accessStateFor(state: FollowState | undefined | null): AccessState {
  const isVip = state === "vip";
  const isMember = state === "subscriber" || isVip;
  const isFollowing = isMember || (!!state && state !== "former" && state !== "blocked");
  return { isFollowing, isMember, isVip };
}

/** Can this access state open content of the given visibility? */
export function canView(v: Visibility, s: AccessState): boolean {
  switch (v) {
    case "public": return true;
    case "followers": return s.isFollowing;
    case "access": return s.isMember;
    case "vip": return s.isVip;
    default: return false;
  }
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type EarlyPhase = "public_open" | "access_open" | "upcoming" | "none";

/** Early-access window for a product/event with access_date + public_date. */
export function earlyAccess(
  accessDate: string | null | undefined,
  publicDate: string | null | undefined,
  isMember: boolean,
): { phase: EarlyPhase; label: string } {
  const now = Date.now();
  const acc = accessDate ? new Date(accessDate).getTime() : null;
  const pub = publicDate ? new Date(publicDate).getTime() : null;

  if (pub && now >= pub) return { phase: "public_open", label: "Available now" };
  if (acc && now >= acc) {
    return isMember
      ? { phase: "access_open", label: "Your early access is open" }
      : { phase: "upcoming", label: pub ? `Members early · opens ${fmtDate(pub)}` : "Access members shop early" };
  }
  if (acc) return { phase: "upcoming", label: `Access ${fmtDate(acc)}` };
  if (pub) return { phase: "upcoming", label: `Drops ${fmtDate(pub)}` };
  return { phase: "none", label: "" };
}
