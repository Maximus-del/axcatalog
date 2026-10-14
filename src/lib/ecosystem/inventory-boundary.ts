// The blank-inventory boundary.
//
// One idea, enforced in one place: the blank-inventory system operates on an
// ALLOWLIST of explicitly approved blanks and on nothing else.
//
// The store holds 217 product records, 168 of them decorated athlete merch with
// 1,006 variants between them. None of that is physical blank stock. Any code
// that starts from "all Shopify products" and narrows down will eventually
// classify one of them as a blank — through a title that reads right, a vendor
// that matches, a barcode that collides. So nothing here starts from Shopify.
// Everything starts from `is_inventory_managed = true` and fetches only what
// that set names.
//
// The practical test: with zero approved blanks — today's state — every
// function in this file returns empty, and reconciliation and webhooks are
// no-ops. Not "scan everything and find nothing". Actually nothing.
import {
  availabilityStatusOf, barcodeReport, countsTowardInventory, totalAvailable,
  type AvailabilityStatus, type InventorySyncState, type VariantLike,
} from "@/lib/ecosystem/blank-inventory";

export interface ManagedBlank {
  id: string;
  sku: string | null;
  name: string;
  /** The approval. Never inferred. */
  isInventoryManaged: boolean;
  isMainRotation: boolean;
  isHidden: boolean;
  shopifyProductId: string | null;
  /** Whether Shopify has ever confirmed this blank's stock. */
  syncState?: InventorySyncState;
  /** True once any sync has succeeded — lets a later failure show a stale figure. */
  hasConfirmedInventory?: boolean;
  variants: VariantLike[];
}

export interface ReconcileSelection {
  /** Approved AND linked: the only blanks a reconciliation run may touch. */
  reconcile: ManagedBlank[];
  /** Approved but with no Shopify product yet — reported, never guessed at. */
  approvedButUnlinked: ManagedBlank[];
  /** Everything outside the boundary. Named so the run can say what it left alone. */
  skipped: ManagedBlank[];
  /** Exactly which Shopify products may be fetched. */
  shopifyProductIds: Set<string>;
}

/**
 * Choose what a reconciliation run is allowed to look at.
 *
 * Note what this function cannot do: it has no access to Shopify, no titles to
 * compare, no fuzzy matching. It partitions a list the database already
 * approved. Discovery — searching Shopify for a product to adopt — is a
 * separate, deliberate action that ends in a person setting the flag, and it
 * never runs as part of reconciliation.
 */
export function selectManagedForReconcile(blanks: ManagedBlank[]): ReconcileSelection {
  const reconcile: ManagedBlank[] = [];
  const approvedButUnlinked: ManagedBlank[] = [];
  const skipped: ManagedBlank[] = [];

  for (const b of blanks) {
    if (!b.isInventoryManaged) { skipped.push(b); continue; }
    if (!b.shopifyProductId) { approvedButUnlinked.push(b); continue; }
    reconcile.push(b);
  }

  return {
    reconcile,
    approvedButUnlinked,
    skipped,
    shopifyProductIds: new Set(reconcile.map((b) => b.shopifyProductId!)),
  };
}

/**
 * Is this inventory item one we track?
 *
 * The filter every inventory webhook passes through. An inventory item id that
 * is not on the list means a decorated product moved — acknowledge it and do
 * nothing. It must not create a link, classify the product, or write a row.
 */
export function isManagedInventoryItem(
  inventoryItemId: string | null | undefined,
  managedInventoryItemIds: Set<string>,
): boolean {
  if (!inventoryItemId) return false;
  return managedInventoryItemIds.has(inventoryItemId);
}

export interface ManagedSummary {
  /** Every blank record, managed or not. Context, never a denominator. */
  total: number;
  /** The denominator for all inventory health. */
  managed: number;
  available: number;
  soldOut: number;
  notLinked: number;
  notManaged: number;
  hidden: number;
  syncPending: number;
  totalUnits: number;
  variants: number;
  missingBarcodes: number;
  duplicateBarcodes: number;
}

/**
 * Inventory health, counted against the managed set.
 *
 * The bug this replaces: counting barcode gaps across all 1,006 variants in the
 * store and reporting the result as blank-inventory health. Those variants
 * belong to decorated merchandise; their barcodes are not our scanning problem,
 * and a duplicate between a blank and a hoodie is not a duplicate at all.
 */
export function summarizeManaged(blanks: ManagedBlank[]): ManagedSummary {
  const s: ManagedSummary = {
    total: blanks.length, managed: 0,
    available: 0, soldOut: 0, notLinked: 0, notManaged: 0, hidden: 0, syncPending: 0,
    totalUnits: 0, variants: 0, missingBarcodes: 0, duplicateBarcodes: 0,
  };

  // Barcode integrity is computed across MANAGED variants only, so a collision
  // with a decorated product's barcode never surfaces as a warning.
  const managedVariants: VariantLike[] = [];

  for (const b of blanks) {
    const status = statusOf(b);
    switch (status) {
      case "available": s.available += 1; break;
      case "sold_out": s.soldOut += 1; break;
      case "not_linked": s.notLinked += 1; break;
      case "not_managed": s.notManaged += 1; break;
      case "hidden": s.hidden += 1; break;
      case "sync_pending": case "sync_error": s.syncPending += 1; break;
    }

    if (!b.isInventoryManaged) continue;
    s.managed += 1;
    s.variants += b.variants.length;
    managedVariants.push(...b.variants);
    if (countsTowardInventory(status)) s.totalUnits += totalAvailable(b.variants);
  }

  const bc = barcodeReport(managedVariants);
  s.missingBarcodes = bc.missing.length;
  s.duplicateBarcodes = bc.duplicates.length;
  return s;
}

export function statusOf(b: ManagedBlank): AvailabilityStatus {
  return availabilityStatusOf({
    isHidden: b.isHidden,
    isInventoryManaged: b.isInventoryManaged,
    shopifyProductId: b.shopifyProductId,
    syncState: b.syncState ?? "success",
    hasConfirmedInventory: b.hasConfirmedInventory ?? true,
    totalAvailable: totalAvailable(b.variants),
  });
}

/**
 * The blanks the primary page shows, in the order the spec asks for.
 *
 * Main rotation only, Available before Sold Out before Not Linked. A sold-out
 * rotation blank stays on the page: it is still a garment we market and
 * reorder, and hiding it would make the catalogue lie about what we offer.
 */
const ORDER: AvailabilityStatus[] = [
  "available", "sold_out", "sync_pending", "sync_error", "not_linked", "not_managed", "hidden",
];

export function primaryRotationView(blanks: ManagedBlank[]): ManagedBlank[] {
  return blanks
    .filter((b) => b.isMainRotation && !b.isHidden)
    .sort((a, z) => {
      const d = ORDER.indexOf(statusOf(a)) - ORDER.indexOf(statusOf(z));
      return d !== 0 ? d : a.name.localeCompare(z.name);
    });
}

/** Everything outside the rotation, still fully intact and reachable. */
export function referenceLibraryView(blanks: ManagedBlank[]): ManagedBlank[] {
  return blanks
    .filter((b) => !b.isMainRotation || b.isHidden)
    .sort((a, z) => a.name.localeCompare(z.name));
}
