// Portal lineup — AX arranging what a client sees in My Gear.
//
// Per client: every linked product as the client sees it (Live = published,
// Archive = archived, Not shown = draft/internal review), its collections,
// and which picture the portal uses for Front and Back. Those choices live on
// product_images.metadata.portal_view and are independent of the website's
// image order; the Shopify image sync keeps metadata and never touches images
// AX uploads here (bucket product-images), so they survive syncs.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { must, publicUrl, str, t, type Row } from "./db";
import { sortOptions } from "./product-collections";
import {
  isDriveImage,
  parseDriveFolderId,
  preferDrive,
  type DriveSource,
} from "../../../supabase/functions/_shared/drive-product-images";

export { parseDriveFolderId };

export type Side = "front" | "back";
export type Lifecycle = "live" | "archive" | "hidden";

export interface LineupImage {
  id: string;
  url: string | null;
  isPrimary: boolean;
  sortOrder: number;
  portalView: Side | null;
  /** Uploaded here (not from Shopify) — the only images this tool may remove. */
  axUpload: boolean;
  /** Mirrored from the Drive library; change it in Drive. */
  fromDrive: boolean;
  /** The Drive file name, for Drive pictures. */
  driveName: string | null;
  /** The Drive folder it came from, for Drive pictures. */
  driveFolderId: string | null;
  /** Colorway, when the picture sits in a color subfolder in Drive. */
  driveColor: string | null;
  bucket: string | null;
  path: string | null;
}

export interface LineupProduct {
  id: string;
  title: string;
  status: string;
  lifecycle: Lifecycle;
  shopifyHandle: string | null;
  images: LineupImage[];
  front: LineupImage | null;
  back: LineupImage | null;
  collectionIds: string[];
  /** Drive folders this product's pictures come from, and the last sync. */
  drive: DriveLink | null;
}

export interface DriveLink {
  sources: DriveSource[];
  syncedAt: string | null;
  shown: number | null;
  error: string | null;
}

/** Pure: products.metadata.drive → DriveLink (null when no folders). */
export function driveLinkOf(metadata: unknown): DriveLink | null {
  const d = ((metadata ?? {}) as Row).drive as Row | undefined;
  const sources = Array.isArray(d?.sources)
    ? (d!.sources as Row[]).filter((s) => typeof s?.id === "string").map((s) => ({ id: String(s.id), label: str(s.label) }))
    : [];
  if (!sources.length) return null;
  return {
    sources,
    syncedAt: str(d?.synced_at),
    shown: typeof d?.shown === "number" ? d.shown : null,
    error: typeof d?.error === "string" ? d.error : null,
  };
}

/** Pure: which images the portal shows, mirroring the portal's frontBack(). */
export function resolveSides(images: LineupImage[]): { front: LineupImage | null; back: LineupImage | null } {
  const usable = images.filter((i) => i.url);
  const front = usable.find((i) => i.portalView === "front") ?? usable[0] ?? null;
  const back = usable.find((i) => i.portalView === "back") ?? usable.find((i) => i !== front) ?? null;
  return { front, back };
}

export function lifecycleOf(status: string): Lifecycle {
  if (status === "published") return "live";
  if (status === "archived") return "archive";
  return "hidden";
}

function toImage(r: Row): LineupImage | null {
  const meta = (r.metadata ?? {}) as Row;
  if (meta.shopify_orphaned === true) return null;
  const bucket = str(r.storage_bucket);
  const path = str(r.storage_path);
  const view = meta.portal_view;
  return {
    id: String(r.id),
    // Shopify-synced rows store the full URL as the path in the "external" bucket.
    url: bucket === "external" ? (path && /^https:\/\//.test(path) ? path : null) : publicUrl(bucket, path),
    isPrimary: r.is_primary === true,
    sortOrder: Number(r.sort_order ?? 0),
    portalView: view === "front" || view === "back" ? view : null,
    axUpload: bucket === "product-images" && meta.source === "ax_portal_upload",
    fromDrive: isDriveImage(meta),
    driveName: isDriveImage(meta) ? str(meta.drive_name) : null,
    driveFolderId: isDriveImage(meta) ? str(meta.drive_folder_id) : null,
    driveColor: isDriveImage(meta) ? str(meta.drive_color) : null,
    bucket,
    path,
  };
}

/** Pure: rows → lineup product. Exported for tests. */
export function toLineupProduct(p: Row, imageRows: Row[], collectionIds: string[]): LineupProduct {
  // Same rule as the portal: Drive pictures, when present, are the pictures.
  const images = preferDrive(imageRows)
    .map(toImage)
    .filter((x): x is LineupImage => !!x)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  const sides = resolveSides(images);
  const status = String(p.status ?? "draft");
  return {
    id: String(p.id),
    title: String(p.title ?? "Untitled product"),
    status,
    lifecycle: lifecycleOf(status),
    shopifyHandle: str(p.shopify_handle),
    images,
    ...sides,
    collectionIds,
    drive: driveLinkOf(p.metadata),
  };
}

const KEY = (athleteId: string) => ["v2", "lineup", athleteId] as const;

export function useClientLineup(athleteId: string | undefined) {
  return useQuery({
    queryKey: KEY(athleteId ?? ""),
    enabled: Boolean(athleteId),
    staleTime: 15_000,
    queryFn: async () => {
      const links = await t("product_athletes").select("product_id").eq("athlete_id", athleteId as string);
      if (links.error) throw new Error(links.error.message);
      const ids = ((links.data ?? []) as unknown as Row[]).map((r) => String(r.product_id));
      if (ids.length === 0) return [] as LineupProduct[];
      const [prods, imgs, colls] = await Promise.all([
        t("products").select("id, title, status, shopify_handle, metadata").in("id", ids),
        t("product_images").select("id, product_id, storage_bucket, storage_path, is_primary, sort_order, metadata").in("product_id", ids),
        t("collection_products").select("product_id, collection_id").in("product_id", ids),
      ]);
      if (prods.error) throw new Error(prods.error.message);
      const imgsBy = new Map<string, Row[]>();
      for (const r of (imgs.data ?? []) as unknown as Row[]) {
        const k = String(r.product_id);
        imgsBy.set(k, [...(imgsBy.get(k) ?? []), r]);
      }
      const collBy = new Map<string, string[]>();
      for (const r of (colls.data ?? []) as unknown as Row[]) {
        const k = String(r.product_id);
        collBy.set(k, [...(collBy.get(k) ?? []), String(r.collection_id)]);
      }
      return ((prods.data ?? []) as unknown as Row[])
        .map((p) => toLineupProduct(p, imgsBy.get(String(p.id)) ?? [], collBy.get(String(p.id)) ?? []))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
  });
}

function useInvalidate(athleteId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY(athleteId) });
    void qc.invalidateQueries({ queryKey: ["v2", "product"] });
    void qc.invalidateQueries({ queryKey: ["portal-api"] });
  };
}

/**
 * Make one image the portal's Front (or Back) for its product. Clears that
 * side from the product's other images first, so there is only ever one.
 * Choosing the image that is already the other side swaps them.
 */
export function useSetPortalSide(athleteId: string) {
  const done = useInvalidate(athleteId);
  return useMutation({
    mutationFn: async ({ product, imageId, side }: { product: LineupProduct; imageId: string; side: Side | null }) => {
      const rows = await t("product_images").select("id, metadata").eq("product_id", product.id);
      if (rows.error) throw new Error(rows.error.message);
      for (const r of (rows.data ?? []) as unknown as Row[]) {
        const meta = { ...((r.metadata ?? {}) as Row) };
        const isTarget = String(r.id) === imageId;
        const had = meta.portal_view;
        let next: unknown = had;
        if (isTarget) next = side;
        else if (side && had === side) next = null;
        if (next === had) continue;
        if (next) meta.portal_view = next;
        else delete meta.portal_view;
        await must(t("product_images").update({ metadata: meta } as never).eq("id", String(r.id)));
      }
    },
    onSuccess: done,
  });
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export function imageProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "Use PNG, JPG or WebP.";
  if (file.size > IMAGE_MAX_BYTES) return "That image is over 15 MB.";
  return null;
}

/** Upload portal pictures for a product. Optionally make the first one a side. */
export function useUploadProductImages(athleteId: string) {
  const done = useInvalidate(athleteId);
  return useMutation({
    mutationFn: async ({ product, files, side }: { product: LineupProduct; files: File[]; side?: Side | null }) => {
      const bad = files.map(imageProblem).find(Boolean);
      if (bad) throw new Error(bad);
      let order = Math.max(-1, ...product.images.map((i) => i.sortOrder)) + 1;
      const created: string[] = [];
      for (const file of files) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${product.id}/portal-${Date.now()}-${created.length}.${ext}`;
        const up = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        const ins = await t("product_images")
          .insert({
            product_id: product.id,
            storage_bucket: "product-images",
            storage_path: path,
            file_name: file.name,
            is_primary: false,
            sort_order: order++,
            metadata: { source: "ax_portal_upload" },
          } as never)
          .select("id")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        created.push(String((ins.data as unknown as Row).id));
      }
      return created;
    },
    onSuccess: done,
  });
}

/** Remove a picture uploaded here. Shopify images are never removed from AX. */
export function useRemoveProductImage(athleteId: string) {
  const done = useInvalidate(athleteId);
  return useMutation({
    mutationFn: async (img: LineupImage) => {
      if (!img.axUpload) throw new Error("Only pictures added here can be removed. Website photos come from Shopify.");
      const res = await must(t("product_images").delete().eq("id", img.id).select("id"));
      if (((res as { data: unknown[] | null }).data ?? []).length === 0) throw new Error("That picture could not be removed.");
      if (img.bucket && img.path) await supabase.storage.from(img.bucket).remove([img.path]);
    },
    onSuccess: done,
  });
}

/** Products in the client's organisation that are not on their lineup yet. */
export function useAddableProducts(organizationId: string | undefined, linkedIds: string[], q: string) {
  return useQuery({
    queryKey: ["v2", "lineup-addable", organizationId, q],
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    queryFn: async () => {
      let query = t("products")
        .select("id, title, status")
        .eq("organization_id", organizationId as string)
        .order("title")
        .limit(40);
      if (q.trim()) query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "")}%`);
      const res = await query;
      if (res.error) throw new Error(res.error.message);
      const linked = new Set(linkedIds);
      return ((res.data ?? []) as unknown as Row[])
        .filter((r) => !linked.has(String(r.id)))
        .map((r) => ({ id: String(r.id), title: String(r.title ?? ""), status: String(r.status ?? "") }));
    },
  });
}

/** Put an existing product on this client's lineup, optionally into a collection. */
export function useAddToLineup(athleteId: string) {
  const done = useInvalidate(athleteId);
  return useMutation({
    mutationFn: async ({ productId, collectionId }: { productId: string; collectionId?: string | null }) => {
      const { error } = await t("product_athletes").insert({ product_id: productId, athlete_id: athleteId } as never);
      if (error && (error as { code?: string }).code !== "23505") throw new Error(error.message);
      if (collectionId) {
        const c = await t("collection_products").insert({ collection_id: collectionId, product_id: productId } as never);
        if (c.error && (c.error as { code?: string }).code !== "23505") throw new Error(c.error.message);
      }
    },
    onSuccess: done,
  });
}

/** The client's collections (their portal lockers), in locker order. */
export function useClientCollections(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "client-collections", athleteId],
    enabled: Boolean(athleteId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await t("collections").select("id, name, status, athlete_id, metadata").eq("athlete_id", athleteId as string);
      if (res.error) throw new Error(res.error.message);
      return sortOptions(((res.data ?? []) as unknown as Row[]).filter((r) => r.status !== "archived"));
    },
  });
}

/** Set the Drive folders a product's pictures come from (operator only). */
export function useSetDriveSources(athleteId: string) {
  const done = useInvalidate(athleteId);
  return useMutation({
    mutationFn: async ({ productId, sources }: { productId: string; sources: DriveSource[] }) => {
      const { error } = await supabase.rpc("portal_ops_set_drive_sources" as never, { _product_id: productId, _sources: sources } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: done,
  });
}

export interface DriveSyncResult {
  configured: boolean;
  synced: number;
  changed: number;
  error?: string;
  hint?: string;
  results?: Array<{ productId: string; shown?: number; changed?: number; error?: string }>;
}

/** Bring pictures up to date with Drive. `force` (operators) skips the 3-minute wait. */
export function useDriveSync(athleteId: string) {
  const done = useInvalidate(athleteId);
  return useMutation({
    mutationFn: async ({ productId, force }: { productId?: string; force?: boolean } = {}): Promise<DriveSyncResult> => {
      const { data, error } = await supabase.functions.invoke("drive-sync-product-images", {
        body: { athlete_id: athleteId, product_id: productId ?? null, force: !!force },
      });
      if (error) throw new Error(error.message);
      return data as DriveSyncResult;
    },
    onSuccess: done,
  });
}
