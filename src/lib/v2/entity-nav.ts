// AX OS V2 — the two addresses an athlete has.
//
// `/admin-v2/people/:id`         the OVERVIEW: what is happening right now.
// `/admin-v2/people/:id/library` the WORK: the full Designs -> Mockups ->
//                                Products -> Collections -> Live pipeline.
//
// They are two routes rather than one long page because they answer different
// questions. The overview answers "what do I need to look at"; the library
// answers "show me everything". Putting both on one page meant the second
// buried the first.
//
// Every deep link in V2 goes through here, so the split can move again without
// hunting for template strings. The old links pointed at the workspace with
// `?mockup=` and similar, and those parameters still belong to the library.

export const ENTITY_SECTIONS = ["designs", "mockups", "products", "collections", "live"] as const;
export type EntitySection = (typeof ENTITY_SECTIONS)[number];

export function isEntitySection(value: string | null | undefined): value is EntitySection {
  return (ENTITY_SECTIONS as readonly string[]).includes(value ?? "");
}

export function entityHref(entityId: string): string {
  return `/admin-v2/people/${entityId}`;
}

export function entityCartHref(entityId: string): string {
  return `/admin-v2/people/${entityId}/cart`;
}

export interface LibraryTarget {
  /** Scroll to this section on arrival. */
  focus?: EntitySection;
  /** Open a saved mockup's detail sheet. */
  mockup?: string;
  /** Open the Create Mockup wizard. */
  build?: boolean;
  /** Reopen a saved mockup for editing, or as the seed for variations. */
  edit?: string;
  vary?: string;
}

/**
 * A link into the athlete's library.
 *
 * Parameters are only written when they are actually set — an href full of
 * `?focus=&mockup=` is a link that looks broken in a status bar and defeats
 * React Router's own equality checks.
 */
export function entityLibraryHref(entityId: string, target: LibraryTarget = {}): string {
  const params = new URLSearchParams();
  if (target.focus) params.set("focus", target.focus);
  if (target.mockup) params.set("mockup", target.mockup);
  if (target.build) params.set("build", "1");
  if (target.edit) params.set("edit", target.edit);
  if (target.vary) params.set("vary", target.vary);
  const query = params.toString();
  return `/admin-v2/people/${entityId}/library${query ? `?${query}` : ""}`;
}
