// The V2 pricing sheet — every number behind a client's products, editable.
//
// The sheet is organised the way costs actually work: by BLANK and by PRINT
// (front only, or front and back). A product's cost is
//   blank cost + front print + (back print, if printed front and back) + other
// and the blank / front / back numbers are PRESETS set once per blank
// ("AXISM front", "AXISM back", "Hoodie front"…). Every product on that blank
// uses the preset until a row overrides it.
//
// Where each number lives (so editing here IS editing the system):
//   presets (blank / front / back per blank)  → blank_cost_presets (operators only)
//   per-product overrides, other cost, share,
//   print sides                               → product_pricing (operators only)
//   bulk price                                → products.athlete_price — what
//                                               portal_sheet_unit_price charges
//   retail                                    → products.price (internal products
//                                               only; Shopify owns synced prices)
//   share %, split basis, payment wording     → athletes.metadata.brand_terms
//
// Everything below the data section is pure and tested; the page lays it out.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, t, type Row } from "./db";
import { parseBrandTerms, type BrandTerms, type SplitBasis } from "./brand-terms";

export type Garment = "tee" | "hoodie" | "other";
export type PrintSides = "front" | "front_back";

export interface SheetProduct {
  id: string;
  title: string;
  status: string;
  garment: Garment;
  /** Synced to Shopify: the store owns its retail price. */
  onShopify: boolean;
  blankId: string | null;
  blankName: string | null;
  /** v2_blanks.cost — the catalogue cost, used when no blank preset is set. */
  blankCatalogCost: number | null;
  /** What the product's pictures say: a BACK mockup means a back print. */
  detectedSides: PrintSides | null;
  retail: number | null;
  /** products.athlete_price, null = rule. */
  athletePrice: number | null;
  /** What the rule charges when no bulk price is set (hoodie $35 / tee $18). */
  ruleAthletePrice: number;
  pricing: {
    blankCost: number | null;
    printCost: number | null;
    otherCost: number | null;
    sharePercent: number | null;
    printSides: PrintSides | null;
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
  printSides: PrintSides | null;
  notes: string;
}

/** The number cells a selection can fill. */
export const NUMBER_FIELDS = ["blankCost", "printCost", "otherCost", "retail", "sharePercent", "athletePrice"] as const;
export type NumberField = (typeof NUMBER_FIELDS)[number];

export const FIELD_LABEL: Record<NumberField, string> = {
  blankCost: "Blank",
  printCost: "Print",
  otherCost: "Other",
  retail: "Retail",
  sharePercent: "Share",
  athletePrice: "Bulk price",
};

/** Per blank: the three presets. null = not set (blank falls back to the catalogue cost). */
export interface BlankPreset {
  blank: number | null;
  front: number | null;
  back: number | null;
}
export type Presets = Record<string, BlankPreset>;
export const EMPTY_PRESET: BlankPreset = { blank: null, front: null, back: null };

export const draftOf = (p: SheetProduct): RowDraft => ({
  blankCost: p.pricing.blankCost,
  printCost: p.pricing.printCost,
  otherCost: p.pricing.otherCost,
  retail: p.retail,
  athletePrice: p.athletePrice,
  sharePercent: p.pricing.sharePercent,
  printSides: p.pricing.printSides,
  notes: p.pricing.notes,
});

const c2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** The print sides that apply: what AX chose, else what the pictures show. */
export const sidesOf = (p: SheetProduct, d: RowDraft): PrintSides | null => d.printSides ?? p.detectedSides;

/** Pure: what the presets alone say a product's blank and print cost are. */
export function presetCosts(p: SheetProduct, sides: PrintSides | null, presets: Presets): { blank: number | null; print: number | null } {
  const pre = (p.blankId && presets[p.blankId]) || EMPTY_PRESET;
  const blank = pre.blank ?? p.blankCatalogCost;
  let print: number | null = null;
  if (sides && pre.front != null) print = c2(pre.front + (sides === "front_back" ? (pre.back ?? 0) : 0));
  return { blank, print };
}

export interface RowMaths {
  blankCost: number | null;
  blankFromPreset: boolean;
  printCost: number | null;
  printFromPreset: boolean;
  sides: PrintSides | null;
  totalCost: number | null;
  /** Total cost as a % of retail. */
  costPercent: number | null;
  sharePercent: number | null;
  shareFromTerms: boolean;
  clientPerSale: number | null;
  axPerSale: number | null;
  axMarginPercent: number | null;
  bulkPrice: number;
  bulkIsRule: boolean;
  bulkProfit: number | null;
  bulkMarginPercent: number | null;
  missing: Array<"print" | "sides" | "retail" | "share">;
}

/** Pure: every derived number for one row. */
export function rowMaths(
  p: SheetProduct,
  d: RowDraft,
  terms: Pick<BrandTerms, "revenueSharePercent" | "splitBasis">,
  presets: Presets = {},
): RowMaths {
  const sides = sidesOf(p, d);
  const pre = presetCosts(p, sides, presets);
  const blankCost = d.blankCost ?? pre.blank;
  const printCost = d.printCost ?? pre.print;
  const parts = [blankCost, printCost, d.otherCost];
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
  if (!sides) missing.push("sides");
  if (printCost == null) missing.push("print");
  if (retail == null) missing.push("retail");
  if (sharePercent == null) missing.push("share");

  return {
    blankCost,
    blankFromPreset: d.blankCost == null && blankCost != null,
    printCost,
    printFromPreset: d.printCost == null && printCost != null,
    sides,
    totalCost,
    costPercent: totalCost != null && retail ? pct(totalCost, retail) : null,
    sharePercent,
    shareFromTerms: d.sharePercent == null && sharePercent != null,
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
  for (const k of NUMBER_FIELDS) {
    const v = d[k];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) return "Use a positive number.";
  }
  if (d.sharePercent != null && d.sharePercent > 100) return "Share can't be over 100%.";
  if (p.onShopify && (d.retail ?? null) !== (p.retail ?? null)) return "Retail is set in Shopify for this product.";
  return null;
}

export const presetError = (pre: BlankPreset): string | null =>
  [pre.blank, pre.front, pre.back].some((v) => v != null && (!Number.isFinite(v) || v < 0)) ? "Use a positive number." : null;

export const garmentOf = (title: string, garmentType: string | null | undefined): Garment => {
  const hay = `${garmentType ?? ""} ${title}`.toLowerCase();
  if (hay.includes("hood")) return "hoodie";
  if (hay.includes("tee") || hay.includes("shirt")) return "tee";
  return "other";
};

/** The rule portal_sheet_unit_price applies when no bulk price is set. */
export const ruleAthletePrice = (garment: Garment): number => (garment === "hoodie" ? 35 : 18);

export const SIDES_LABEL: Record<PrintSides, string> = { front: "Front", front_back: "Front + back" };

// ------------------------------------------------------- order & grouping

export type GroupBy = "blank" | "print" | "blank_print" | "none";
export type SortBy = "print" | "blank" | "product" | "cost" | "ax" | "bulk";

export interface SheetGroup {
  key: string;
  label: string;
  /** The blank this group belongs to, when grouped by blank. */
  blankId: string | null;
  rows: SheetProduct[];
}

const blankLabel = (p: SheetProduct) => p.blankName ?? "No blank linked";
const sidesRank = (s: PrintSides | null) => (s === "front" ? 0 : s === "front_back" ? 1 : 2);

/** Pure: rows sorted, then grouped. Groups keep the order of their first row. */
export function arrangeRows(
  products: SheetProduct[],
  drafts: Record<string, RowDraft>,
  opts: { groupBy: GroupBy; sortBy: SortBy; terms: Pick<BrandTerms, "revenueSharePercent" | "splitBasis">; presets: Presets },
): SheetGroup[] {
  const d = (p: SheetProduct) => drafts[p.id] ?? draftOf(p);
  const m = new Map(products.map((p) => [p.id, rowMaths(p, d(p), opts.terms, opts.presets)]));
  const byNum = (v: number | null | undefined) => (v == null ? Number.POSITIVE_INFINITY : v);
  const cmp: Record<SortBy, (a: SheetProduct, b: SheetProduct) => number> = {
    print: (a, b) => sidesRank(m.get(a.id)!.sides) - sidesRank(m.get(b.id)!.sides),
    blank: (a, b) => blankLabel(a).localeCompare(blankLabel(b)),
    product: (a, b) => a.title.localeCompare(b.title),
    cost: (a, b) => byNum(m.get(a.id)!.totalCost) - byNum(m.get(b.id)!.totalCost),
    ax: (a, b) => byNum(m.get(b.id)!.axPerSale) - byNum(m.get(a.id)!.axPerSale),
    bulk: (a, b) => byNum(m.get(b.id)!.bulkProfit) - byNum(m.get(a.id)!.bulkProfit),
  };
  // Primary sort, then blank, then print, then title — so ties read in a sensible order.
  const sorted = [...products].sort(
    (a, b) => cmp[opts.sortBy](a, b) || cmp.blank(a, b) || cmp.print(a, b) || cmp.product(a, b),
  );
  if (opts.groupBy === "none") return [{ key: "all", label: "All products", blankId: null, rows: sorted }];

  const keyOf = (p: SheetProduct): { key: string; label: string; blankId: string | null } => {
    const s = m.get(p.id)!.sides;
    const sl = s ? SIDES_LABEL[s] : "Print not set";
    if (opts.groupBy === "blank") return { key: p.blankId ?? "none", label: blankLabel(p), blankId: p.blankId };
    if (opts.groupBy === "print") return { key: s ?? "unset", label: sl, blankId: null };
    return { key: `${p.blankId ?? "none"}|${s ?? "unset"}`, label: `${blankLabel(p)} · ${sl}`, blankId: p.blankId };
  };
  const groups = new Map<string, SheetGroup>();
  // Group order: by blank name, then front before front + back.
  const ordered = [...sorted].sort((a, b) => {
    if (opts.groupBy !== "print") { const x = cmp.blank(a, b); if (x) return x; }
    if (opts.groupBy !== "blank") { const y = cmp.print(a, b); if (y) return y; }
    return 0;
  });
  for (const p of ordered) {
    const k = keyOf(p);
    if (!groups.has(k.key)) groups.set(k.key, { ...k, rows: [] });
    groups.get(k.key)!.rows.push(p);
  }
  return [...groups.values()];
}

// ------------------------------------------------------------- selection

/** A cell is `${productId}::${field}`. */
export const cellKey = (productId: string, field: NumberField) => `${productId}::${field}`;
export const parseCell = (key: string): { productId: string; field: NumberField } => {
  const [productId, field] = key.split("::");
  return { productId, field: field as NumberField };
};

/**
 * Pure: the rectangle of cells between two cells, over the rows in the order
 * they are on screen and the columns in sheet order — what a drag or a
 * shift-click selects.
 */
export function cellRange(anchor: string, to: string, rowOrder: string[], cols: readonly NumberField[] = NUMBER_FIELDS): string[] {
  const a = parseCell(anchor);
  const b = parseCell(to);
  const r1 = rowOrder.indexOf(a.productId);
  const r2 = rowOrder.indexOf(b.productId);
  const c1 = cols.indexOf(a.field);
  const c2i = cols.indexOf(b.field);
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2i < 0) return [to];
  const out: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2i); c <= Math.max(c1, c2i); c++) out.push(cellKey(rowOrder[r], cols[c]));
  }
  return out;
}

/** Pure: set one value into every selected cell. Shopify retail cells are skipped. Returns the new drafts and how many cells took it. */
export function fillCells(
  products: SheetProduct[],
  drafts: Record<string, RowDraft>,
  cells: Iterable<string>,
  value: number | null,
): { drafts: Record<string, RowDraft>; filled: number; skipped: number } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const next = { ...drafts };
  let filled = 0;
  let skipped = 0;
  for (const key of cells) {
    const { productId, field } = parseCell(key);
    const p = byId.get(productId);
    if (!p) continue;
    if (field === "retail" && p.onShopify) { skipped++; continue; }
    next[productId] = { ...(next[productId] ?? draftOf(p)), [field]: value };
    filled++;
  }
  return { drafts: next, filled, skipped };
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Pure: a BACK mockup among the product's pictures means it is printed front and back. */
export function detectSides(images: Row[]): PrintSides | null {
  if (!images.length) return null;
  const tagged = images.some((i) => {
    const m = (i.metadata ?? {}) as Row;
    const name = `${String(m.drive_name ?? "")} ${String(i.file_name ?? "")}`.toUpperCase();
    return m.portal_view === "back" || /(^|[_\- ])BACK([_\-. ]|$)/.test(name);
  });
  if (tagged) return "front_back";
  // Library products always name their sides; anything else stays undecided.
  const fromLibrary = images.some((i) => ((i.metadata ?? {}) as Row).source === "drive");
  return fromLibrary ? "front" : null;
}

// ------------------------------------------------------------------ data

export interface PricingSheet {
  products: SheetProduct[];
  terms: BrandTerms;
  presets: Presets;
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
  const empty = Promise.resolve({ data: [] as Row[], error: null });
  const [pricingRes, blanksRes, imagesRes, presetsRes] = await Promise.all([
    ids.length ? t("product_pricing").select("*").in("product_id", ids) : empty,
    blankIds.length ? t("v2_blanks").select("id, display_name, cost, garment_type").in("id", blankIds) : empty,
    ids.length ? t("product_images").select("product_id, file_name, metadata").in("product_id", ids) : empty,
    blankIds.length ? t("blank_cost_presets").select("v2_blank_id, component, cost").in("v2_blank_id", blankIds) : empty,
  ]);
  for (const r of [pricingRes, blanksRes, imagesRes, presetsRes]) if (r.error) throw new Error((r.error as { message: string }).message);
  const pricing = new Map(((pricingRes.data ?? []) as Row[]).map((r) => [String(r.product_id), r]));
  const blanks = new Map(((blanksRes.data ?? []) as Row[]).map((b) => [String(b.id), b]));
  const imagesBy = new Map<string, Row[]>();
  for (const i of (imagesRes.data ?? []) as Row[]) {
    const k = String(i.product_id);
    imagesBy.set(k, [...(imagesBy.get(k) ?? []), i]);
  }
  const presets: Presets = {};
  for (const id of blankIds) presets[id] = { ...EMPTY_PRESET };
  for (const r of (presetsRes.data ?? []) as Row[]) {
    const k = String(r.v2_blank_id);
    const c = r.component as keyof BlankPreset;
    if (presets[k] && (c === "blank" || c === "front" || c === "back")) presets[k][c] = num(r.cost);
  }

  const products = raw.map((p): SheetProduct => {
    const b = p.v2_blank_id ? blanks.get(String(p.v2_blank_id)) : undefined;
    const r = pricing.get(String(p.id));
    const garment = garmentOf(String(p.title ?? ""), (b?.garment_type as string | undefined) ?? (p.product_type as string | undefined));
    const sides = r?.print_sides === "front" || r?.print_sides === "front_back" ? (r.print_sides as PrintSides) : null;
    return {
      id: String(p.id),
      title: String(p.title ?? ""),
      status: String(p.status ?? ""),
      garment,
      onShopify: !!p.shopify_product_id,
      blankId: p.v2_blank_id ? String(p.v2_blank_id) : null,
      blankName: (b?.display_name as string | undefined) ?? null,
      blankCatalogCost: num(b?.cost),
      detectedSides: detectSides(imagesBy.get(String(p.id)) ?? []),
      retail: num(p.price),
      athletePrice: num(p.athlete_price),
      ruleAthletePrice: ruleAthletePrice(garment),
      pricing: {
        blankCost: num(r?.blank_cost),
        printCost: num(r?.print_cost),
        otherCost: num(r?.other_cost),
        sharePercent: num(r?.athlete_share_percent),
        printSides: sides,
        notes: typeof r?.notes === "string" ? r.notes : "",
      },
    };
  });

  return {
    products,
    terms: parseBrandTerms(((athleteRes.data as Row | null)?.metadata as Record<string, unknown> | undefined)?.brand_terms),
    presets,
  };
}

export function usePricingSheet(entityId: string, includeArchived = false) {
  return useQuery({
    queryKey: [...sheetKey(entityId), includeArchived],
    queryFn: () => fetchSheet(entityId, includeArchived),
    enabled: !!entityId,
  });
}

const COST_FIELDS: Array<keyof RowDraft> = ["blankCost", "printCost", "otherCost", "sharePercent", "printSides", "notes"];

/** Save the changed rows (costs → product_pricing, prices → products) and the changed presets. */
export function useSavePricingSheet(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { changes: Array<{ product: SheetProduct; draft: RowDraft }>; presets: Array<{ blankId: string; preset: BlankPreset }> }) => {
      const { changes, presets } = input;
      for (const { product, draft } of changes) {
        const problem = rowError(product, draft);
        if (problem) throw new Error(`${product.title}: ${problem}`);
      }
      for (const { preset } of presets) {
        const problem = presetError(preset);
        if (problem) throw new Error(`Preset: ${problem}`);
      }

      // Presets: a set value is upserted, a cleared one is deleted (back to the catalogue / unset).
      const up = presets.flatMap(({ blankId, preset }) =>
        (["blank", "front", "back"] as const).filter((c) => preset[c] != null).map((c) => ({ v2_blank_id: blankId, component: c, cost: preset[c] })),
      );
      if (up.length) {
        const res = (await t("blank_cost_presets").upsert(up as never, { onConflict: "v2_blank_id,component" }).select("v2_blank_id")) as {
          data: Row[] | null;
          error: { message: string } | null;
        };
        if (res.error) throw new Error(res.error.message);
        if ((res.data ?? []).length !== up.length) throw new Error("Some presets were not saved — you may not have access.");
      }
      for (const { blankId, preset } of presets) {
        const cleared = (["blank", "front", "back"] as const).filter((c) => preset[c] == null);
        if (cleared.length) await must(t("blank_cost_presets").delete().eq("v2_blank_id", blankId).in("component", cleared));
      }

      const costRows = changes
        .filter(({ product, draft }) => changedFields(product, draft).some((k) => COST_FIELDS.includes(k)))
        .map(({ draft, product }) => ({
          product_id: product.id,
          blank_cost: draft.blankCost,
          print_cost: draft.printCost,
          other_cost: draft.otherCost,
          athlete_share_percent: draft.sharePercent,
          print_sides: draft.printSides,
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
      return changes.length + presets.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sheetKey(entityId) }),
  });
}
