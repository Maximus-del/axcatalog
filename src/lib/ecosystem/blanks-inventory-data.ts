// Loading the Blanks Inventory view.
//
// One read of the catalogue, joined to variants, levels and approved images,
// then every derived figure computed in memory. Nothing here caches a status or
// a total: they are functions of the rows, so a stored copy could only ever
// disagree with them.
import { supabase } from "@/integrations/supabase/client";
import {
  availabilityStatusOf, barcodeReport, byColor, byLocation, countsTowardInventory,
  syncAge, totalAvailable,
  type AvailabilityStatus, type VariantLike,
} from "@/lib/ecosystem/blank-inventory";
import {
  coverageOf, normalizeColor, type ImageCoverage, type MatchStatus, type ViewType,
} from "@/lib/ecosystem/drive-index";

export interface InventoryImage {
  id: string;
  color: string | null;
  normalizedColor: string | null;
  viewType: ViewType;
  driveFileId: string;
  driveUrl: string | null;
  filename: string | null;
  missing: boolean;
}

export interface InventoryBlank {
  id: string;
  sku: string | null;
  name: string;
  manufacturer: string | null;
  styleNumber: string | null;
  garmentType: string | null;
  isHidden: boolean;
  isInventoryManaged: boolean;
  isMainRotation: boolean;
  shopifyProductId: string | null;
  shopifyStatus: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  matchStatus: MatchStatus | "unmatched";
  lastShopifySyncAt: string | null;
  lastDriveSyncAt: string | null;
  assortments: string[];
  colors: string[];
  variants: VariantLike[];
  images: InventoryImage[];

  // Derived — never read from a column.
  status: AvailabilityStatus;
  totalAvailable: number;
  coverage: ImageCoverage;
  barcodesMissing: number;
  barcodesDuplicated: number;
}

/** Whether the Drive indexer has credentials. Absent = the whole page still works. */
export async function driveConnected(): Promise<boolean> {
  // The browser must never see the key, so it asks the function whether one is
  // configured rather than reading a secret itself.
  try {
    const { data, error } = await supabase.functions.invoke("drive-index-blanks", {
      body: { probe: true },
    });
    if (error) return false;
    return (data as { configured?: boolean })?.configured !== false;
  } catch {
    return false;
  }
}

export async function loadInventory(opts: { driveConnected: boolean }): Promise<InventoryBlank[]> {
  const [blanksRes, itemsRes] = await Promise.all([
    supabase
      .from("blanks")
      .select(`
        id, sku, name, brand, vendor, supplier, style_number, garment_type,
        internal_only, is_inventory_managed, is_main_rotation,
        shopify_product_id, shopify_status,
        drive_product_folder_id, drive_product_folder_url, image_match_status,
        last_shopify_sync_at, last_drive_sync_at,
        blank_colors(color_name, available),
        blank_variants(
          id, shopify_variant_id, shopify_inventory_item_id, color, size, sku, barcode,
          blank_inventory_levels(shopify_location_id, location_name, available_quantity)
        ),
        blank_images(id, color, normalized_color, view_type, drive_file_id, drive_url, filename, missing)
      `)
      .order("sku", { nullsFirst: false }),
    supabase
      .from("blank_assortment_items" as never)
      .select("blank_id, assortment:blank_assortments(key)"),
  ]);
  if (blanksRes.error) throw blanksRes.error;

  const assortmentsByBlank = new Map<string, string[]>();
  for (const row of (itemsRes.data ?? []) as unknown as {
    blank_id: string; assortment: { key: string } | { key: string }[] | null;
  }[]) {
    const a = Array.isArray(row.assortment) ? row.assortment[0] : row.assortment;
    if (!a?.key) continue;
    assortmentsByBlank.set(row.blank_id, [...(assortmentsByBlank.get(row.blank_id) ?? []), a.key]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((blanksRes.data ?? []) as any[]).map((b) => {
    const variants: VariantLike[] = (b.blank_variants ?? []).map((v: Record<string, unknown>) => ({
      shopify_variant_id: String(v.shopify_variant_id ?? v.id),
      color: (v.color as string) ?? null,
      size: (v.size as string) ?? null,
      sku: (v.sku as string) ?? null,
      barcode: (v.barcode as string) ?? null,
      levels: ((v.blank_inventory_levels ?? []) as Record<string, unknown>[]).map((l) => ({
        shopify_location_id: String(l.shopify_location_id),
        location_name: (l.location_name as string) ?? "",
        available_quantity: Number(l.available_quantity) || 0,
      })),
    }));

    const images: InventoryImage[] = (b.blank_images ?? []).map((i: Record<string, unknown>) => ({
      id: String(i.id),
      color: (i.color as string) ?? null,
      normalizedColor: (i.normalized_color as string) ?? null,
      viewType: i.view_type as ViewType,
      driveFileId: String(i.drive_file_id),
      driveUrl: (i.drive_url as string) ?? null,
      filename: (i.filename as string) ?? null,
      missing: !!i.missing,
    }));

    const colors: string[] = (b.blank_colors ?? [])
      .filter((c: Record<string, unknown>) => c.available !== false)
      .map((c: Record<string, unknown>) => String(c.color_name));

    const bc = barcodeReport(variants);
    const shopifyProductId = (b.shopify_product_id as string) ?? null;

    return {
      id: b.id,
      sku: b.sku ?? null,
      name: b.name,
      manufacturer: b.brand ?? b.vendor ?? b.supplier ?? null,
      styleNumber: b.style_number ?? null,
      garmentType: b.garment_type ?? null,
      isHidden: b.internal_only === true,
      isInventoryManaged: b.is_inventory_managed === true,
      isMainRotation: b.is_main_rotation === true,
      shopifyProductId,
      shopifyStatus: b.shopify_status ?? null,
      driveFolderId: b.drive_product_folder_id ?? null,
      driveFolderUrl: b.drive_product_folder_url ?? null,
      matchStatus: (b.image_match_status ?? "unmatched") as MatchStatus | "unmatched",
      lastShopifySyncAt: b.last_shopify_sync_at ?? null,
      lastDriveSyncAt: b.last_drive_sync_at ?? null,
      assortments: assortmentsByBlank.get(b.id) ?? [],
      colors,
      variants,
      images,

      status: availabilityStatusOf({
        isHidden: b.internal_only === true,
        isInventoryManaged: b.is_inventory_managed === true,
        shopifyProductId,
        totalAvailable: totalAvailable(variants),
      }),
      totalAvailable: totalAvailable(variants),
      coverage: coverageOf({
        driveConnected: opts.driveConnected,
        matchStatus: (b.image_match_status ?? "unmatched") as MatchStatus | "unmatched",
        colors,
        images: images.map((i) => ({ normalizedColor: i.normalizedColor, missing: i.missing })),
      }),
      barcodesMissing: bc.missing.length,
      barcodesDuplicated: bc.duplicates.length,
    } satisfies InventoryBlank;
  });
}

// ---- Filtering ------------------------------------------------------------

export interface InventoryFilters {
  search?: string;
  status?: AvailabilityStatus | null;
  issue?: "missing_barcode" | "duplicate_barcode" | "missing_image"
        | "partial_image" | "image_match_required" | null;
  manufacturer?: string | null;
  productType?: string | null;
  assortment?: string | null;
  /** "rotation" is the default page; "reference" is the hidden library. */
  scope?: "rotation" | "reference" | "all";
}

export function matchesInventoryFilters(b: InventoryBlank, f: InventoryFilters): boolean {
  // The default page is the rotation. Reference blanks are reachable, never
  // deleted, but they do not clutter the working view.
  if (f.scope === "rotation" && (!b.isMainRotation || b.isHidden)) return false;
  if (f.scope === "reference" && b.isMainRotation && !b.isHidden) return false;

  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = [b.name, b.sku, b.styleNumber, b.manufacturer].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.status && b.status !== f.status) return false;
  if (f.manufacturer && b.manufacturer !== f.manufacturer) return false;
  if (f.productType && b.garmentType !== f.productType) return false;
  if (f.assortment && !b.assortments.includes(f.assortment)) return false;

  switch (f.issue) {
    case "missing_barcode": return b.barcodesMissing > 0;
    case "duplicate_barcode": return b.barcodesDuplicated > 0;
    case "missing_image": return b.coverage === "missing_image";
    case "partial_image": return b.coverage === "partial";
    case "image_match_required": return b.coverage === "image_match_required";
    default: return true;
  }
}

/**
 * Counts for the summary row.
 *
 * Every status bucket is populated for every blank, because a blank is always
 * in exactly one state. But INVENTORY HEALTH — units, variants, barcode gaps,
 * location coverage — counts only blanks inside the boundary. The denominator
 * for "is my stock data any good" is the managed set, never the whole table.
 *
 * Image coverage is counted against the MAIN ROTATION, because photography
 * matters for what we market; a reference blank with no pictures is not a gap.
 */
export function summarize(blanks: InventoryBlank[]): {
  status: Record<AvailabilityStatus, number>;
  managed: number;
  mainRotation: number;
  totalUnits: number;
  variants: number;
  missingBarcode: number;
  duplicateBarcode: number;
  missingImage: number;
  partialImage: number;
  matchRequired: number;
} {
  const status: Record<AvailabilityStatus, number> = {
    available: 0, sold_out: 0, hidden: 0, not_linked: 0, not_managed: 0,
  };
  let managed = 0, mainRotation = 0, totalUnits = 0, variants = 0;
  let missingBarcode = 0, duplicateBarcode = 0, missingImage = 0, partialImage = 0, matchRequired = 0;

  for (const b of blanks) {
    status[b.status] += 1;

    if (b.isInventoryManaged) {
      managed += 1;
      variants += b.variants.length;
      if (countsTowardInventory(b.status)) totalUnits += b.totalAvailable;
      if (b.barcodesMissing > 0) missingBarcode += 1;
      if (b.barcodesDuplicated > 0) duplicateBarcode += 1;
    }

    if (b.isMainRotation) {
      mainRotation += 1;
      if (b.coverage === "missing_image") missingImage += 1;
      if (b.coverage === "partial") partialImage += 1;
      if (b.coverage === "image_match_required") matchRequired += 1;
    }
  }
  return {
    status, managed, mainRotation, totalUnits, variants,
    missingBarcode, duplicateBarcode, missingImage, partialImage, matchRequired,
  };
}

// ---- Detail helpers -------------------------------------------------------

/** Approved images for one colour, keyed by view. */
export function imagesForColor(b: InventoryBlank, color: string): InventoryImage[] {
  const want = normalizeColor(color);
  return b.images.filter((i) => !i.missing && (i.normalizedColor ?? "") === want);
}

export function colorBreakdown(b: InventoryBlank) {
  return byColor(b.variants);
}

export function locationBreakdown(b: InventoryBlank) {
  return byLocation(b.variants);
}

export function syncLabels(b: InventoryBlank, now = Date.now()) {
  return {
    shopify: syncAge(b.lastShopifySyncAt, now),
    drive: syncAge(b.lastDriveSyncAt, now),
  };
}

// ---- Writes ---------------------------------------------------------------

/** Link a blank to a Shopify product. Audited; never touches pricing or assortments. */
export async function linkShopifyProduct(blankId: string, shopifyProductId: string | null): Promise<void> {
  const { data: before } = await supabase
    .from("blanks").select("shopify_product_id").eq("id", blankId).maybeSingle();

  const { error } = await supabase
    .from("blanks")
    .update({ shopify_product_id: shopifyProductId })
    .eq("id", blankId);
  if (error) throw error;

  await supabase.from("blank_inventory_audit" as never).insert({
    blank_id: blankId,
    kind: "mapping",
    source: "manual:link_shopify",
    before: before ?? null,
    after: { shopify_product_id: shopifyProductId },
  } as never);
}

/** Confirm a Drive folder by hand. Marked confirmed so rescans leave it alone. */
export async function confirmDriveFolder(blankId: string, folderId: string | null): Promise<void> {
  const { error } = await supabase
    .from("blanks")
    .update({
      drive_product_folder_id: folderId,
      drive_product_folder_url: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
      image_match_status: folderId ? "confirmed" : "unmatched",
    })
    .eq("id", blankId);
  if (error) throw error;

  await supabase.from("blank_inventory_audit" as never).insert({
    blank_id: blankId,
    kind: "mapping",
    source: "manual:confirm_drive_folder",
    after: { drive_product_folder_id: folderId, image_match_status: "confirmed" },
  } as never);
}
