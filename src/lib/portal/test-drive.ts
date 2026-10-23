// TEST DRIVE — walk a client's whole experience as AX, without an account.
//
// Three people you can be:
//   owner    — invited with the Owner link: C-level portal, Brand HQ, money.
//   team     — invited with the Team link: their gear and orders, no money.
//   customer — a fan/buyer with the public locker link. No login at all.
//
// Each has stages you can jump straight to. The pre-portal stages (invite,
// questions, waiting, approved) render the real screens with a fake request
// and save nothing. The portal stages are the real portal through View-as
// (read-only — orders and edits are blocked). The locker stage is the real
// public page; AX can preview it before it's switched on.
//
// Pure: addresses and stage lists only. Exported for tests.
export type DriveRole = "owner" | "team" | "customer";
export type DriveStage = "invite" | "questions" | "waiting" | "approved" | "portal" | "gear" | "brand" | "locker";

export const DRIVE_ROLES: { value: DriveRole; label: string; sub: string }[] = [
  { value: "owner", label: "Owner", sub: "C-level — sales, earnings, everything" },
  { value: "team", label: "Team", sub: "Coach / staff — gear and orders" },
  { value: "customer", label: "Customer", sub: "Fan with the public link" },
];

export const DRIVE_STAGES: Record<DriveRole, { value: DriveStage; label: string }[]> = {
  owner: [
    { value: "invite", label: "Invite" },
    { value: "questions", label: "Questions" },
    { value: "waiting", label: "Waiting" },
    { value: "approved", label: "Approved" },
    { value: "portal", label: "Home" },
    { value: "brand", label: "Brand HQ" },
  ],
  team: [
    { value: "invite", label: "Invite" },
    { value: "questions", label: "Questions" },
    { value: "waiting", label: "Waiting" },
    { value: "approved", label: "Approved" },
    { value: "portal", label: "Home" },
    { value: "gear", label: "My Gear" },
  ],
  customer: [{ value: "locker", label: "Public locker" }],
};

const PRE_PORTAL: DriveStage[] = ["invite", "questions", "waiting", "approved"];
export const isPrePortal = (s: DriveStage) => PRE_PORTAL.includes(s);

const isRole = (v: unknown): v is DriveRole => v === "owner" || v === "team" || v === "customer";
const isStage = (v: unknown): v is DriveStage =>
  typeof v === "string" && (Object.values(DRIVE_STAGES).flat().some((s) => s.value === v));

/** The stage this role actually has; falls back to its first. */
export function stageFor(role: DriveRole, stage: unknown): DriveStage {
  const list = DRIVE_STAGES[role];
  return list.some((s) => s.value === stage) ? (stage as DriveStage) : list[0].value;
}

/** Where a stage lives. */
export function driveHref(entityId: string, role: DriveRole, stage: DriveStage, lockerSlug: string): string {
  const s = stageFor(role, stage);
  const id = encodeURIComponent(entityId);
  if (isPrePortal(s)) return `/test-drive/${id}?role=${role}&stage=${s}`;
  if (s === "locker") return `/l/${encodeURIComponent(lockerSlug)}?drive=1&entity=${id}`;
  const path = s === "gear" ? "/portal/products" : s === "brand" ? "/portal/analytics" : "/portal";
  return `${path}?as=${id}&drive=1${role === "team" ? "&view=team" : ""}`;
}

/** Read the drive state off a URL. `entity` comes from ?as= in the portal, ?entity= on the locker, or the route. */
export function readDrive(pathname: string, search: string, routeEntityId?: string): { entityId: string | null; role: DriveRole; stage: DriveStage } | null {
  const q = new URLSearchParams(search);
  if (pathname.startsWith("/test-drive/")) {
    const role = isRole(q.get("role")) ? (q.get("role") as DriveRole) : "owner";
    return { entityId: routeEntityId ?? null, role, stage: stageFor(role, q.get("stage")) };
  }
  if (q.get("drive") !== "1") return null;
  if (pathname.startsWith("/l/") || !pathname.startsWith("/portal")) {
    return { entityId: q.get("entity"), role: "customer", stage: "locker" };
  }
  const role: DriveRole = q.get("view") === "team" ? "team" : "owner";
  const stage: DriveStage = pathname.startsWith("/portal/products") || pathname.startsWith("/portal/gear")
    ? role === "team" ? "gear" : "portal"
    : pathname.startsWith("/portal/analytics") || pathname.startsWith("/portal/brand")
      ? "brand"
      : "portal";
  return { entityId: q.get("as"), role, stage: isStage(stage) ? stage : "portal" };
}

/** The locker address for an entity: its chosen slug, else its record slug. */
export function lockerSlugOf(meta: unknown, recordSlug: string | null | undefined): string {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const pl = m.public_locker && typeof m.public_locker === "object" ? (m.public_locker as Record<string, unknown>) : {};
  const slug = typeof pl.slug === "string" && pl.slug.trim() ? pl.slug.trim() : "";
  return slug || (recordSlug ?? "");
}

export function lockerIsOpen(meta: unknown): boolean {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const pl = m.public_locker && typeof m.public_locker === "object" ? (m.public_locker as Record<string, unknown>) : {};
  return pl.enabled === true;
}
