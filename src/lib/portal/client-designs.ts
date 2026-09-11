// The client's view of its own designs.
//
// AX holds two different assets for one design: the production PNG (transparent,
// print-ready, the thing of value) and a flattened preview (opaque, JPEG, capped
// at 1400px). The client is entitled to recognise and name their artwork. They
// are not entitled to the file that prints it.
//
// `public.client_design_shelf(athlete_id)` is the only sanctioned read path.
// Its return type has nowhere to put a production location, so no argument and
// no crafted filter can make it emit one. This module maps that result and
// nothing else — in particular it never carries a bucket name out of a row.
// See AX_CLIENT_VISIBILITY.md §4.

/**
 * The one bucket a client-facing surface may sign against. Hard-coded on
 * purpose: a bucket read out of a row is a bucket an attacker can choose.
 */
export const CLIENT_PREVIEW_BUCKET = "design-previews";

/** A row as `client_design_shelf` returns it. */
export interface ClientShelfRow {
  design_id: string;
  title: string | null;
  design_number: string | null;
  group_id: string | null;
  group_name: string | null;
  sort_order: number | null;
  preview_paths: string[] | null;
}

export interface PortalDesign {
  id: string;
  /** Always a display string — the RPC already coalesces, this re-guarantees it. */
  title: string;
  /** Short code the client quotes instead of a UUID. */
  designNumber: string | null;
  groupId: string | null;
  groupName: string | null;
  sortOrder: number;
  /**
   * Path inside CLIENT_PREVIEW_BUCKET, or null when no preview has been
   * rendered yet. Null means show a placeholder — never fall back to another
   * file, because the only other file is the production one.
   */
  previewPath: string | null;
  previewCount: number;
}

const UNTITLED = "Untitled design";

export function mapShelfRow(row: ClientShelfRow): PortalDesign {
  const paths = (row.preview_paths ?? []).filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  const title = (row.title ?? "").trim();
  return {
    id: row.design_id,
    title: title.length > 0 ? title : UNTITLED,
    designNumber: row.design_number?.trim() || null,
    groupId: row.group_id,
    groupName: row.group_name?.trim() || null,
    sortOrder: row.sort_order ?? 0,
    previewPath: paths[0] ?? null,
    previewCount: paths.length,
  };
}

export function mapShelf(rows: ClientShelfRow[] | null | undefined): PortalDesign[] {
  return (rows ?? []).map(mapShelfRow);
}

/**
 * What the Designs surface should render.
 *
 * `previews-pending` is deliberately distinct from `nothing-shared`: the first
 * means AX shared artwork and the render has not run, which is an AX problem the
 * client should not be asked to interpret as "you have no designs".
 */
export type ShelfState = "loading" | "nothing-shared" | "previews-pending" | "ready";

export function shelfState(designs: PortalDesign[] | null): ShelfState {
  if (designs === null) return "loading";
  if (designs.length === 0) return "nothing-shared";
  if (designs.every((d) => d.previewPath === null)) return "previews-pending";
  return "ready";
}

/** Designs grouped into their folders, ungrouped last, order preserved. */
export function groupShelf(
  designs: PortalDesign[],
): Array<{ id: string | null; name: string | null; designs: PortalDesign[] }> {
  const out: Array<{ id: string | null; name: string | null; designs: PortalDesign[] }> = [];
  const byId = new Map<string | null, { id: string | null; name: string | null; designs: PortalDesign[] }>();
  for (const d of designs) {
    let g = byId.get(d.groupId);
    if (!g) {
      g = { id: d.groupId, name: d.groupName, designs: [] };
      byId.set(d.groupId, g);
      out.push(g);
    }
    g.designs.push(d);
  }
  return out.sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0));
}
