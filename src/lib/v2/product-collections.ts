// Tagging a product into collections from V2 — "this hoodie belongs to the
// Atlanta locker".
//
// A collection IS a client's destination (Atlanta, Chicago, New York, Moon's
// House…), so tagging here is what fills that locker in the client's portal.
// Writes go through the operator RLS on collection_products ("org write
// collection products"); clients can never write here.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, str, t, type Row } from "./db";

export interface CollectionOption {
  id: string;
  name: string;
  /** The client-facing name from the portal destination config, e.g. "Atlanta". */
  label: string | null;
  /** Hex accent from the destination config, for the chip. */
  accent: string | null;
  athleteId: string | null;
  status: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Pure: a collection row → an option. Exported for tests. */
export function toCollectionOption(r: Row): CollectionOption {
  const dest = ((r.metadata as Row | null)?.portal_destination ?? {}) as Row;
  const accent = typeof dest.accent === "string" && HEX.test(dest.accent) ? dest.accent : null;
  return {
    id: String(r.id),
    name: String(r.name ?? "Untitled collection"),
    label: str(dest.label),
    accent,
    athleteId: str(r.athlete_id),
    status: str(r.status),
  };
}

/** Sort: the client's destinations in their configured order, then by name. */
export function sortOptions(rows: Row[]): CollectionOption[] {
  const sortOf = (r: Row) => {
    const s = ((r.metadata as Row | null)?.portal_destination as Row | undefined)?.sort;
    return typeof s === "number" ? s : 1e9;
  };
  return [...rows].sort((a, b) => sortOf(a) - sortOf(b) || String(a.name).localeCompare(String(b.name))).map(toCollectionOption);
}

/**
 * The collections this product could belong to: every non-archived collection
 * of the entities it is linked to. Collections it is already in are always
 * included, so an old tag can still be removed.
 */
export function useProductCollectionOptions(productId: string | undefined, entityIds: string[], currentIds: string[]) {
  const key = [...entityIds].sort().join(",");
  return useQuery({
    queryKey: ["v2", "product-collection-options", productId, key, [...currentIds].sort().join(",")],
    enabled: Boolean(productId) && (entityIds.length > 0 || currentIds.length > 0),
    staleTime: 30_000,
    queryFn: async () => {
      const [byEntity, current] = await Promise.all([
        entityIds.length
          ? t("collections").select("id, name, status, athlete_id, metadata").in("athlete_id", entityIds)
          : Promise.resolve({ data: [], error: null }),
        currentIds.length
          ? t("collections").select("id, name, status, athlete_id, metadata").in("id", currentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (byEntity.error) throw new Error((byEntity.error as { message: string }).message);
      const rows = new Map<string, Row>();
      for (const r of ((byEntity.data ?? []) as unknown as Row[]).filter((r) => r.status !== "archived")) rows.set(String(r.id), r);
      for (const r of (current.data ?? []) as unknown as Row[]) rows.set(String(r.id), r);
      return sortOptions([...rows.values()]);
    },
  });
}

/** Add or remove one product ↔ collection tag. */
export function useSetProductCollection(productId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, on }: { collectionId: string; on: boolean }) => {
      if (!productId) throw new Error("No product");
      if (on) {
        const { error } = await t("collection_products").insert({ collection_id: collectionId, product_id: productId } as never);
        // Already tagged (unique violation) is the state we wanted.
        if (error && (error as { code?: string }).code !== "23505") throw new Error((error as { message: string }).message);
        return;
      }
      // A delete RLS refuses removes nothing and reports no error, so check
      // the row actually went.
      const res = await must(
        t("collection_products").delete().eq("product_id", productId).eq("collection_id", collectionId).select("product_id"),
      );
      if (((res as { data: unknown[] | null }).data ?? []).length === 0) {
        throw new Error("That tag could not be removed. You may not have access to this collection.");
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "product", productId] });
      void qc.invalidateQueries({ queryKey: ["v2", "product-collection-options", productId] });
      void qc.invalidateQueries({ queryKey: ["portal-api"] });
    },
  });
}
