// ─────────────────────────────────────────────────────────────────────────
// ENTITY domain: AX manages entities, not only athletes.
//
// Two separate axes, deliberately not one dropdown:
//   entity_type — what it IS (a person, an organization, a school…)
//   roles       — how AX works with it (athlete, client, partner…), many at once
//
// Goat Farm Media is an organization that is both a client and a partner.
// Darnell Mooney is a person who is an athlete and might also be a client.
// Neither is expressible if type and relationship are collapsed together.
//
// Both live on the existing athletes row, because every product, design,
// collection and order already points there. A parallel entities table would
// fork that lineage and produce exactly the duplicate profiles this avoids.
// ─────────────────────────────────────────────────────────────────────────

export type EntityType =
  | "person" | "organization" | "school" | "team" | "brand" | "facility" | "agency" | "other";

export type AxRole = "athlete" | "client" | "partner" | "vendor" | "sponsor";

export const ENTITY_TYPES: { value: EntityType; label: string; blurb: string }[] = [
  { value: "person", label: "Person", blurb: "An individual — athlete, contact, creator." },
  { value: "organization", label: "Organization", blurb: "A company, media group, or program." },
  { value: "school", label: "School", blurb: "A school or athletic department." },
  { value: "team", label: "Team", blurb: "A club or roster." },
  { value: "brand", label: "Brand", blurb: "A brand AX produces for." },
  { value: "facility", label: "Facility", blurb: "A gym, training centre, or venue." },
  { value: "agency", label: "Agency", blurb: "Representation or marketing agency." },
  { value: "other", label: "Other", blurb: "Anything not covered above." },
];

export const AX_ROLES: { value: AxRole; label: string; blurb: string }[] = [
  { value: "athlete", label: "Athlete", blurb: "Has a fan profile, drops, and an athlete dashboard." },
  { value: "client", label: "Client", blurb: "AX produces merch for them — orders, projects, fulfillment." },
  { value: "partner", label: "Partner", blurb: "Collaborates with AX rather than buying from it." },
  { value: "vendor", label: "Vendor", blurb: "Supplies AX." },
  { value: "sponsor", label: "Sponsor", blurb: "Backs athletes or events." },
];

/** Types where a surname is even a coherent idea. */
export const PERSON_TYPES: EntityType[] = ["person"];

export function isPerson(entityType: string | null | undefined): boolean {
  return PERSON_TYPES.includes((entityType ?? "person") as EntityType);
}

export interface EntityLike {
  display_name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  entity_type?: string | null;
  roles?: string[] | null;
  capabilities?: Record<string, boolean> | null;
}

/**
 * The one place a name is resolved. Assembling first + last at call sites is
 * what produced "Abbotsford Senior undefined" — an organization has one name,
 * and a person may have only a first name.
 */
export function displayNameOf(e: EntityLike | null | undefined): string {
  if (!e) return "Unnamed";
  const explicit = e.display_name?.trim() || e.full_name?.trim();
  if (explicit) return explicit;
  const joined = [e.first_name?.trim(), e.last_name?.trim()].filter(Boolean).join(" ").trim();
  return joined || "Unnamed";
}

/** Initials for the avatar fallback — works for one-word names and orgs alike. */
export function initialsOf(e: EntityLike | null | undefined): string {
  const name = displayNameOf(e);
  if (name === "Unnamed") return "AX";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function rolesOf(e: EntityLike | null | undefined): AxRole[] {
  const raw = e?.roles;
  if (!raw || raw.length === 0) return ["athlete"];
  return raw.filter((r): r is AxRole => AX_ROLES.some((x) => x.value === r));
}

export function hasRole(e: EntityLike | null | undefined, role: AxRole): boolean {
  return rolesOf(e).includes(role);
}

export function entityTypeOf(e: EntityLike | null | undefined): EntityType {
  const t = e?.entity_type ?? "person";
  return (ENTITY_TYPES.some((x) => x.value === t) ? t : "other") as EntityType;
}

// ---- Modules --------------------------------------------------------------

export type ModuleKey =
  | "products" | "collections" | "drops" | "designs" | "content" | "access"
  | "events" | "orders" | "projects" | "fan_profile" | "athlete_dashboard" | "contacts";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  products: "Products",
  collections: "Collections",
  drops: "Drops",
  designs: "Designs",
  content: "Content",
  access: "Access",
  events: "Events",
  orders: "Orders",
  projects: "Projects",
  fan_profile: "Fan profile",
  athlete_dashboard: "Athlete dashboard",
  contacts: "Contacts",
};

/** What each role switches on by default. Capabilities can override per profile. */
const ROLE_MODULES: Record<AxRole, ModuleKey[]> = {
  athlete: ["products", "collections", "drops", "designs", "content", "access", "events", "fan_profile", "athlete_dashboard"],
  client: ["products", "collections", "designs", "content", "events", "orders", "projects"],
  partner: ["content", "events", "projects", "contacts"],
  vendor: ["orders", "contacts"],
  sponsor: ["content", "events"],
};

/** Types that bring their own modules regardless of role. */
const TYPE_MODULES: Partial<Record<EntityType, ModuleKey[]>> = {
  organization: ["contacts"],
  school: ["contacts", "events"],
  team: ["contacts"],
  agency: ["contacts"],
  facility: ["contacts", "events"],
};

/**
 * Modules for a profile: the union of its roles' defaults plus type extras,
 * with explicit per-profile capabilities winning. A profile with several roles
 * gets the union — dropping a role hides its modules but never deletes data.
 */
export function modulesFor(e: EntityLike | null | undefined): ModuleKey[] {
  const set = new Set<ModuleKey>();
  for (const role of rolesOf(e)) for (const m of ROLE_MODULES[role] ?? []) set.add(m);
  for (const m of TYPE_MODULES[entityTypeOf(e)] ?? []) set.add(m);

  const caps = e?.capabilities ?? {};
  for (const [key, on] of Object.entries(caps)) {
    if (on) set.add(key as ModuleKey);
    else set.delete(key as ModuleKey);
  }
  return Array.from(set);
}

export function hasModule(e: EntityLike | null | undefined, key: ModuleKey): boolean {
  return modulesFor(e).includes(key);
}

// ---- Fields ---------------------------------------------------------------

/**
 * Which form fields make sense. An organization shouldn't be asked for a jersey
 * number, and shouldn't need a fake surname to satisfy a column.
 */
export function fieldsFor(entityType: string | null | undefined): {
  showLastName: boolean;
  showAthleticFields: boolean;
  showOrgFields: boolean;
  nameLabel: string;
} {
  const person = isPerson(entityType);
  return {
    showLastName: person,
    showAthleticFields: person,
    showOrgFields: !person,
    nameLabel: person ? "First name" : "Name",
  };
}

/** Roles a directory tab filters on. */
export const DIRECTORY_FILTERS: { key: string; label: string; role?: AxRole; entityTypes?: EntityType[] }[] = [
  { key: "all", label: "All" },
  { key: "athletes", label: "Athletes", role: "athlete" },
  { key: "clients", label: "Clients", role: "client" },
  { key: "organizations", label: "Organizations", entityTypes: ["organization", "agency", "brand"] },
  { key: "schools", label: "Schools", entityTypes: ["school"] },
  { key: "teams", label: "Teams", entityTypes: ["team"] },
  { key: "facilities", label: "Facilities", entityTypes: ["facility"] },
];

export function matchesFilter(e: EntityLike, key: string): boolean {
  const f = DIRECTORY_FILTERS.find((x) => x.key === key);
  if (!f || f.key === "all") return true;
  if (f.role) return hasRole(e, f.role);
  if (f.entityTypes) return f.entityTypes.includes(entityTypeOf(e));
  return true;
}
