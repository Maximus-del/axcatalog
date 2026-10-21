// The collection wall: what stands on a client's home page — Mooney's lockers,
// Proactive's plaques. Each one is a collection; its picture(s), label, order
// and whether it shows live in collections.metadata.portal_destination, which
// the portal reads (lib/portal/api/destinations.ts). Until now that config was
// written by hand in SQL; this makes it a screen.
//
// Writes go through "org write collections" (operators only). Saving merges
// into metadata so other keys on the row are never dropped.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeHex } from "@/lib/portal/portal-theme";
import { must, str, t, type Row } from "./db";

export interface WallItem {
  id: string;
  name: string;
  status: string;
  productCount: number;
  label: string;
  caption: string;
  images: string[];
  accent: string;
  sort: number;
  hidden: boolean;
  /** Keys this screen does not edit (jersey_number, key…) — carried through untouched. */
  rest: Row;
}

const usable = (v: unknown): v is string => typeof v === "string" && (v.startsWith("/") || v.startsWith("https://"));

/** Pure: collection row → wall item. Exported for tests. */
export function toWallItem(r: Row, productCount: number): WallItem {
  const meta = (r.metadata ?? {}) as Row;
  const d = (meta.portal_destination ?? {}) as Row;
  const images = Array.from(new Set([...(Array.isArray(d.images) ? d.images.filter(usable) : []), ...(usable(d.image) ? [d.image] : [])]));
  const { label, caption, images: _i, image: _im, accent, sort, hidden, ...rest } = d;
  void _i;
  void _im;
  return {
    id: String(r.id),
    name: String(r.name ?? "Untitled collection"),
    status: String(r.status ?? "draft"),
    productCount,
    label: typeof label === "string" ? label : "",
    caption: typeof caption === "string" ? caption : "",
    images,
    accent: normalizeHex(accent) ?? "",
    sort: typeof sort === "number" ? sort : 1000,
    hidden: hidden === true,
    rest,
  };
}

/**
 * Pure: the item back into metadata, keeping every other metadata key. `image`
 * is still written (first picture) so anything that only knows the old single
 * field keeps working.
 */
export function wallMetadata(metadata: unknown, item: WallItem): Row {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Row) } : {};
  const dest: Row = { ...item.rest, sort: item.sort, hidden: item.hidden };
  if (item.label.trim()) dest.label = item.label.trim();
  if (item.caption.trim()) dest.caption = item.caption.trim();
  if (item.images.length) {
    dest.images = item.images;
    dest.image = item.images[0];
  }
  if (normalizeHex(item.accent)) dest.accent = normalizeHex(item.accent);
  base.portal_destination = dest;
  return base;
}

// Under ["v2","collections"] so creating a collection anywhere refreshes the wall too.
export const wallKey = (entityId: string) => ["v2", "collections", "wall", entityId];

export function useCollectionWall(entityId: string) {
  return useQuery({
    queryKey: wallKey(entityId),
    staleTime: 30_000,
    queryFn: async (): Promise<WallItem[]> => {
      const { data, error } = await t("collections")
        .select("id, name, status, metadata")
        .eq("athlete_id", entityId)
        .neq("status", "archived");
      if (error) throw new Error((error as { message: string }).message);
      const rows = (data ?? []) as unknown as Row[];
      const counts = new Map<string, number>();
      if (rows.length) {
        const { data: links } = await t("collection_products")
          .select("collection_id")
          .in(
            "collection_id",
            rows.map((r) => String(r.id)),
          );
        for (const l of (links ?? []) as unknown as Row[]) {
          const id = str(l.collection_id) ?? "";
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      return rows
        .map((r) => toWallItem(r, counts.get(String(r.id)) ?? 0))
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    },
  });
}

/** Save one wall item: its portal config, and whether the collection is live (active) or not (draft). */
export function useSaveWallItem(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: WallItem & { live: boolean }) => {
      const { data, error } = await t("collections").select("metadata, status").eq("id", item.id).single();
      if (error) throw new Error((error as { message: string }).message);
      const row = data as unknown as Row;
      const status = item.live ? "active" : row.status === "active" ? "draft" : String(row.status ?? "draft");
      await must(t("collections").update({ metadata: wallMetadata(row.metadata, item), status } as never).eq("id", item.id));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: wallKey(entityId) });
      void qc.invalidateQueries({ queryKey: ["v2", "collections"] });
    },
  });
}
