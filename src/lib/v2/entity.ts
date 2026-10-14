// AX OS V2 — entity resolvers.
//
// One record, two axes: entity_type (what it IS) and roles[] (how AX works with
// it). A person who is both an athlete and a client is ONE row that appears
// under both filters — never two profiles.

import type { Entity, EntityRole, EntityType } from "./types";

const TYPE_LABELS: Record<EntityType, string> = {
  person: "Person",
  organization: "Organization",
  school: "School",
  team: "Team",
  brand: "Brand",
  facility: "Facility",
  agency: "Agency",
  other: "Other",
};

const ROLE_LABELS: Record<EntityRole, string> = {
  athlete: "Athlete",
  client: "Client",
  partner: "Partner",
  vendor: "Vendor",
  sponsor: "Sponsor",
};

export function typeLabel(t: string): string {
  return TYPE_LABELS[t as EntityType] ?? t;
}

export function roleLabel(r: string): string {
  return ROLE_LABELS[r as EntityRole] ?? r;
}

/**
 * The single name resolver. `athletes.full_name` is a GENERATED column
 * (first || ' ' || last) and cannot be written, so `display_name` is
 * authoritative when present. Call sites must never concatenate again.
 */
export function displayNameOf(row: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const dn = row.display_name?.trim();
  if (dn) return dn;
  const first = (row.first_name ?? "").trim();
  const last = (row.last_name ?? "").trim();
  // Legacy rows used last_name as a placeholder ("." for org-shaped records).
  const cleanLast = last === "." ? "" : last;
  const joined = [first, cleanLast].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return joined || "Untitled entity";
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable, pleasant background for an entity with no headshot/logo yet. */
export function tintOf(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 26%)`;
}

export interface EntityFilter {
  search: string;
  /** "all" | an EntityRole | an EntityType. One control, because operators think in one list. */
  facet: string;
  /** "all" | "active" | "inactive" */
  activity: string;
}

export const DEFAULT_ENTITY_FILTER: EntityFilter = { search: "", facet: "all", activity: "active" };

/** Facets offered by the directory, in operator-priority order. */
export const ENTITY_FACETS: { key: string; label: string; kind: "role" | "type" }[] = [
  { key: "athlete", label: "Athletes", kind: "role" },
  { key: "client", label: "Clients", kind: "role" },
  { key: "partner", label: "Partners", kind: "role" },
  { key: "organization", label: "Organizations", kind: "type" },
  { key: "school", label: "Schools", kind: "type" },
  { key: "team", label: "Teams", kind: "type" },
  { key: "brand", label: "Brands", kind: "type" },
];

export function matchesFilter(e: Entity, f: EntityFilter): boolean {
  if (f.activity === "active" && e.status !== "active") return false;
  if (f.activity === "inactive" && e.status === "active") return false;

  if (f.facet !== "all") {
    const facet = ENTITY_FACETS.find((x) => x.key === f.facet);
    const kind = facet?.kind ?? (f.facet in TYPE_LABELS ? "type" : "role");
    if (kind === "role" && !e.roles.includes(f.facet as EntityRole)) return false;
    if (kind === "type" && e.entityType !== f.facet) return false;
  }

  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [e.name, e.slug, e.position, e.league, e.category, e.orgName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

/**
 * Which workspace modules an entity gets. Type and role both contribute; the
 * union is deliberate so a school-that-is-a-client sees commerce AND roster
 * surfaces without anyone hand-configuring it.
 */
export function modulesFor(e: Entity): string[] {
  const mods = new Set<string>(["collections", "concepts", "designs", "products", "orders"]);
  if (e.roles.includes("athlete")) {
    mods.add("athlete_dashboard");
    mods.add("fan_profile");
  }
  if (e.entityType === "school" || e.entityType === "team" || e.entityType === "organization") {
    mods.add("roster");
  }
  return [...mods];
}

/** Sort: real work first. Entities with the most creative output lead. */
export function rankEntities<T extends { counts?: { products: number; collections: number; concepts: number } }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const av = (a.counts?.products ?? 0) + (a.counts?.collections ?? 0) * 3 + (a.counts?.concepts ?? 0) * 2;
    const bv = (b.counts?.products ?? 0) + (b.counts?.collections ?? 0) * 3 + (b.counts?.concepts ?? 0) * 2;
    return bv - av;
  });
}
