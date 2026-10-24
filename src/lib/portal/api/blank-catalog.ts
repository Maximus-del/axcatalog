// GET /blank-catalog and POST /blank-requests — AX's approved blanks, priced
// for this client, and "Add to my shop".
//
// Owners only (the database refuses team logins). The price is the client's
// tier price; `retail` is AX's standard price, shown struck through when the
// client's price is lower. Cost and manufacturer names never come back.
// Photos are Google Drive thumbnails (the same ones V2 shows).
import { supabase } from "@/integrations/supabase/client";
import type { PortalScope } from "./contract";
import { toApiError } from "./money";

export type BlankTier = "athlete" | "corporate" | "standard";

export interface CatalogColor {
  id: string;
  name: string;
  hex: string | null;
  available: boolean;
  front: string | null;
  back: string | null;
}

export interface CatalogBlank {
  id: string;
  name: string;
  type: string | null;
  price: number;
  retail: number | null;
  colors: CatalogColor[];
}

export interface CatalogRequest {
  id: string;
  blankId: string;
  status: "pending" | "in_progress" | "added" | "declined";
  createdAt: string;
}

export interface BlankCatalog {
  tier: BlankTier;
  blanks: CatalogBlank[];
  requests: CatalogRequest[];
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/** A Drive file id → a displayable thumbnail URL. */
export function driveThumb(id: string | null, width = 1000): string | null {
  return id && DRIVE_ID.test(id) ? `https://drive.google.com/thumbnail?id=${id}&sz=w${width}` : null;
}

/** Garment type → the filter tab it belongs to. */
export const GARMENT_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "tops", label: "Tees", types: ["tee", "long_sleeve", "tank"] },
  { key: "fleece", label: "Hoodies & Crews", types: ["hoodie", "zip_hoodie", "crewneck"] },
  { key: "bottoms", label: "Shorts & Pants", types: ["shorts", "sweatpants"] },
];

export function groupOf(type: string | null): string {
  return GARMENT_GROUPS.find((g) => type && g.types.includes(type))?.key ?? "other";
}

/** RPC JSON → typed catalog. Drops anything without a name or a price. Pure; exported for tests. */
export function parseCatalog(raw: unknown): BlankCatalog {
  const r = obj(raw);
  const tier: BlankTier = r.tier === "athlete" || r.tier === "standard" ? r.tier : "corporate";
  const blanks = arr(r.blanks)
    .map((bv) => {
      const b = obj(bv);
      const price = num(b.price);
      const name = str(b.name);
      if (price === null || !name) return null;
      return {
        id: String(b.id),
        name,
        type: str(b.type),
        price,
        retail: num(b.retail),
        colors: arr(b.colors).map((cv) => {
          const c = obj(cv);
          return {
            id: String(c.id),
            name: str(c.name) ?? "Color",
            hex: str(c.hex),
            available: c.available !== false,
            front: str(c.front),
            back: str(c.back),
          };
        }),
      } satisfies CatalogBlank;
    })
    .filter((b): b is CatalogBlank => b !== null);
  const requests = arr(r.requests).map((qv) => {
    const q = obj(qv);
    const s = q.status;
    return {
      id: String(q.id),
      blankId: String(q.blankId),
      status: s === "in_progress" || s === "added" || s === "declined" ? s : "pending",
      createdAt: String(q.createdAt ?? ""),
    } satisfies CatalogRequest;
  });
  return { tier, blanks, requests };
}

/** The latest request for a blank, if any. */
export function latestRequest(requests: CatalogRequest[], blankId: string): CatalogRequest | null {
  return requests.filter((r) => r.blankId === blankId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function fetchBlankCatalog(scope: PortalScope): Promise<BlankCatalog> {
  const { data, error } = await supabase.rpc("portal_blank_catalog" as never, { _athlete_id: scope.athleteId } as never);
  if (error) throw toApiError(error);
  return parseCatalog(data);
}

export interface BlankRequestInput {
  blankId: string;
  colorIds: string[];
  quantity: number | null;
  notes: string;
}

export async function requestBlank(scope: PortalScope, input: BlankRequestInput): Promise<void> {
  const { error } = await supabase.rpc("portal_request_blank" as never, {
    _athlete_id: scope.athleteId,
    _blank_id: input.blankId,
    _color_ids: input.colorIds,
    _quantity: input.quantity,
    _notes: input.notes,
  } as never);
  if (error) throw toApiError(error);
}
