// The V2 pricing sheet — every number behind a client's products, editable.
//
// One row per product: what it costs AX (blank + print + other), what a fan
// pays (retail), what the client pays on a bulk order (their bulk price), and
// how a store sale splits between the client and AX.
//
// Where each number lives (so editing here IS editing the system):
//   blank / print / other cost, share override → product_pricing (operators only)
//   bulk price                                 → products.athlete_price — the
//                                                price portal_sheet_unit_price
//                                                charges every portal order
//   retail                                     → products.price (internal
//                                                products only; Shopify owns
//                                                the price of a synced product)
//   share %, split basis                       → athletes.metadata.brand_terms
//
// The maths below is pure and tested; the page only lays it out.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, t, type Row } from "./db";
import { parseBrandTerms, type BrandTerms, type SplitBasis } from "./brand-terms";

export type Garment = "tee" | "hoodie" | "other";

export interface SheetProduct {
  id: string;
  title: string;
  status: string;
  garment: Garment;
  /** Synced to Shopify: the store owns its retail price. */
  onShopify: boolean;
  blankName: string | null;
  /** v2_blanks.cost — the default blank cost. */
  blankDefaultCost: number | null;
  retail: number | null;
  /** products.athlete_price, null = rule. */
  athletePrice: number | null;
  /** What the rule would charge when no bulk price is set (hoodie $35 / tee $18). */
  ruleAthletePrice: number;
  pricing: {
    blankCost: number | null;
    printCost: number | null;
    otherCost: number | null;
    sharePercent: number | null;
    notes: string;
  };
}

/** The editable fields of one row. */
export interface RowDraft {
  blankCost: number | null;
  printCost: number | null;
  otherCost: number | null;
  retail: number | null;
  athletePrice: number | null;
  sharePercent: number | null;
  notes: string;
}

export const draftOf = (p: SheetProduct): RowDraft => ({
  blankCost: p.pricing.blankCost,
  printCost: p.pricing.printCost,
  otherCost: p.pricing.otherCost,
  retail: p.retail,
  athletePrice: p.athletePrice,
  sharePercent: p.pricing.sharePercent,
  notes: p.pricing.notes,
});

const c2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export interface RowMaths {
  blankCost: number | null;
  totalCost: number | null;
  /** Total cost as a % of retail. */
  costPercent: number | null;
  sharePercent: number | null;
  /** Client's take on one store sale. */
  clientPerSale: number | null;
  /** AX's take on one store sale, after cost and the client's share. */
  axPerSale: number | null;
  axMarginPercent: number | null;
  /** The bulk price actually charged (set price, else the rule). */
  bulkPrice: number;
  bulkIsRule: boolean;
  /** AX profit on one unit of a bulk order (before volume discount). */
  bulkProfit: number | null;
  bulkMarginPercent: number | null;
  /** What still needs filling in for this row to be complete. */
  missing: Array<"print" | "retail" | "share">;
}

/** Pure: every derived number for one row. */
export function rowMaths(p: SheetProduct, d: RowDraft, terms: Pick<BrandTerms, "revenueSharePercent" | "splitBasis">): RowMaths {
  const blankCost = d.blankCost ?? p.blankDefaultCost;
  const parts = [blankCost, d.printCost, d.otherCost];
  const totalCost = parts.every((x) => x == null) ? null : c2(parts.reduce<number>((s, x) => s + (x ?? 0), 0));
  const retail = d.retail;
  const sharePercent = d.sharePercent ?? terms.revenueSharePercent;
  const basis: SplitBasis = terms.splitBasis;

  let clientPerSale: number | null = null;
  let axPerSale: number | null = null;
  if (retail != null && sharePercent != null) {
    const pool = basis === "gross" ? retail : retail - (totalCost ?? 0);
    clientPerSale = c2(Math.max(0, pool) * (sharePercent / 100));
    axPerSale = totalCost == null ? null : c2(retail - totalCost - clientPerSale);
  }

  const bulkPrice = d.athletePrice ?? p.ruleAthletePrice;
  const bulkProfit = totalCost == null ? null : c2(bulkPrice - totalCost);
  const missing: RowMaths["missing"] = [];
  if (d.printCost == null) missing.push("print");
  if (retail == null) missing.push("retail");
  if (sharePercent == null) missing.push("share");

  return {
    blankCost,
    totalCost,
    costPercent: totalCost != null && retail ? pct(totalCost, retail) : null,
    sharePercent,
    clientPerSale,
    axPerSale,
    axMarginPercent: axPerSale != null && retail ? pct(axPerSale, retail) : null,
    bulkPrice,
    bulkIsRule: d.athletePrice == null,
    bulkProfit,
    bulkMarginPercent: bulkProfit != null ? pct(bulkProfit, bulkPrice) : null,
    missing,
  };
}

/** Pure: which fields of a row changed. */
export function changedFields(p: SheetProduct, d: RowDraft): Array<keyof RowDraft> {
  const base = draftOf(p);
  return (Object.keys(d) as Array<keyof RowDraft>).filter((k) => (base[k] ?? null) !== (d[k] ?? null));
}

/** Pure: validation for one row, or null. */
export function rowError(p: SheetProduct, d: RowDraft): string | null {
  for (const [k, v] of Object.entries(d)) {
    if (k === "notes" || v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return "Use a positive number.";
  }
  if (d.sharePercent != null && d.sharePercent > 100) return "Share can't be over 100%.";
  if (p.onShopify && (d.retail ?? null) !== (p.retail ?? null)) return "Retail is set in Shopify for this product.";
  return null;
}

export const garmentOf = (title: string, garmentType: string | null | undefined): Garment => {
  const hay = `${garmentType ?? ""} ${title}`.toLowerCase();
  if (hay.includes("hood")) return "hoodie";
  if (hay.includes("tee") || hay.includes("shirt")) return "tee";
  return "other";
};

/** The rule portal_sheet_unit_price applies when no bulk price is set. */
export const ruleAthletePrice = (garment: Garment): number => (garment === "hoodie" ? 35 : 18);

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// ------------------------------------------------------------------ data

export interface PricingSheet {
  products: SheetProduct[];
  terms: BrandTerms;
}

const sheetKey = (entityId: string) => ["v2", "pricing-sheet", entityId] as const;

async function fetchSheet(entityId: string, includeArchived: boolean): Promise<PricingSheet> {
  const statuses = includeArchived ? ["published", "internal", "archived"] : ["published", "internal"];
  const [linksRes, athleteRes] = await Promise.all([
    t("product_athletes")
      .select("product:products!inner(id, title, status, price, athlete_price, shopify_product_id, v2_blank_id, product_type)")
      .eq("athlete_id", entityId)
      .in("product.status", statuses),
    t("athletes").select("metadata").eq("id", entityId).maybeSingle(),
  ]);
  if (linksRes.error) throw new Error(linksRes.error.message);
  if (athleteRes.error) throw new Error(athleteRes.error.message);
  const raw = ((linksRes.data ?? []) as Row[])
    .map((r) => (Array.isArray(r.product) ? r.product[0] : r.product) as Row | null)
    .filter((p): p is Row => !!p);

  const ids = raw.map((p) => String(p.id));
  const blankIds = [...new Set(raw.map((p) => p.v2_blank_id).filter(Boolean) as string[])];
  const [pricingRes, blanksRes] = await Promise.all([
    ids.length ? t("product_pricing").select("*").in("product_id", ids) : Promise.resolve({ data: [], error: null }),
    blankIds.length ? t("v2_blanks").select("id, display_name, cost, garment_type").in("id", blankIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (pricingRes.error) throw new Error(pricingRes.error.message);
  if (blanksRes.error) throw new Error(blanksRes.error.message);
  const pricing = new Map(((pricingRes.data ?? []) as Row[]).map((r) => [String(r.product_id), r]));
  const blanks = new Map(((blanksRes.data ?? []) as Row[]).map((b) => [String(b.id), b]));

  const products = raw
    .map((p): SheetProduct => {
      const b = p.v2_blank_id ? blanks.get(String(p.v2_blank_id)) : undefined;
      const r = pricing.get(String(p.id));
      const garment = garmentOf(String(p.title ?? ""), (b?.garment_type as string | undefined) ?? (p.product_type as string | undefined));
      return {
        id: String(p.id),
        title: String(p.title ?? ""),
        status: String(p.status ?? ""),
        garment,
        onShopify: !!p.shopify_product_id,
        blankName: (b?.display_name as string | undefined) ?? null,
        blankDefaultCost: num(b?.cost),
        retail: num(p.price),
        athletePrice: num(p.athlete_price),
        ruleAthletePrice: ruleAthletePrice(garment),
        pricing: {
          blankCost: num(r?.blank_cost),
          printCost: num(r?.print_cost),
          otherCost: num(r?.other_cost),
          sharePercent: num(r?.athlete_share_percent),
          notes: typeof r?.notes === "string" ? r.notes : "",
        },
      };
    })
    .sort((a, b) => Number(a.onShopify) - Number(b.onShopify) || a.title.localeCompare(b.title));

  return { products, terms: parseBrandTerms(((athleteRes.data as Row | null)?.metadata as Record<string, unknown> | undefined)?.brand_terms) };
}

export function usePricingSheet(entityId: string, includeArchived = false) {
  return useQuery({
    queryKey: [...sheetKey(entityId), includeArchived],
    queryFn: () => fetchSheet(entityId, includeArchived),
    enabled: !!entityId,
  });
}

/** Save the changed rows: costs to product_pricing, prices to products. */
export function useSavePricingSheet(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Array<{ product: SheetProduct; draft: RowDraft }>) => {
      for (const { product, draft } of changes) {
        const problem = rowError(product, draft);
        if (problem) throw new Error(`${product.title}: ${problem}`);
      }
      const costRows = changes
        .filter(({ product, draft }) => changedFields(product, draft).some((k) => ["blankCost", "printCost", "otherCost", "sharePercent", "notes"].includes(k)))
        .map(({ product, draft }) => ({
          product_id: product.id,
          blank_cost: draft.blankCost,
          print_cost: draft.printCost,
          other_cost: draft.otherCost,
          athlete_share_percent: draft.sharePercent,
          notes: draft.notes.trim() || null,
        }));
      if (costRows.length) {
        const res = (await t("product_pricing").upsert(costRows as never, { onConflict: "product_id" }).select("product_id")) as {
          data: Row[] | null;
          error: { message: string } | null;
        };
        if (res.error) throw new Error(res.error.message);
        if ((res.data ?? []).length !== costRows.length) throw new Error("Some costs were not saved — you may not have access to this client.");
      }
      for (const { product, draft } of changes) {
        const fields = changedFields(product, draft);
        const patch: Record<string, unknown> = {};
        if (fields.includes("athletePrice")) patch.athlete_price = draft.athletePrice;
        if (fields.includes("retail") && !product.onShopify) patch.price = draft.retail;
        if (!Object.keys(patch).length) continue;
        const res = (await must(t("products").update(patch as never).eq("id", product.id).select("id"))) as { data: Row[] | null };
        if (!res.data?.length) throw new Error(`${product.title}: the price was not saved — you may not have access to edit it.`);
      }
      return changes.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sheetKey(entityId) }),
  });
}
