// The V2 pricing sheet — every number behind a client's products, editable.
//
// Two layers, set once per blank and line by line:
//
//                 OUR TRUE COST        WHAT WE CHARGE THE CLIENT
//   blank         e.g. $12             $18
//   front print        $2              $5
//   back print         $2              $3     (front + back = $8)
//   services           —               —
//
// A product adds up the lines that apply to it (front only, or front + back):
//   true cost     = blank + front (+ back) + services            (AX's cost)
//   client price  = blank + front (+ back) + services, priced     (the client's cost;
//                   what their portal orders are charged)
//   AX per unit   = client price − true cost
// and a store sale splits the PROFIT after the client's cost:
//   profit        = retail − client price
//   client keeps  = share % of the profit   (AX keeps the rest)
// or, if the terms say gross, the client's share % of the retail price.
//
// Every preset can be overridden on a product row. Where each number lives:
//   presets (cost + price per line per blank)  → blank_cost_presets  (operators only)
//   row overrides, print sides                 → product_pricing      (operators only)
//   the client price the portal charges        → products.athlete_price, written on Save
//   retail                                     → products.price (internal products only)
//   share %, split basis, payment wording      → athletes.metadata.brand_terms
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, t, type Row } from "./db";
import { parseBrandTerms, type BrandTerms } from "./brand-terms";

export type Garment = "tee" | "hoodie" | "other";
export type PrintSides = "front" | "front_back";

export const COMPONENTS = ["blank", "front", "back", "services"] as const;
export type Component = (typeof COMPONENTS)[number];
export const COMPONENT_LABEL: Record<Component, string> = {
  blank: "Blank",
  front: "Front print",
  back: "Back print",
  services: "Services",
};

export interface SheetProduct {
  id: string;
  title: string;
  status: string;
  garment: Garment;
  /** Synced to Shopify: the store owns its retail price. */
  onShopify: boolean;
  blankId: string | null;
  blankName: string | null;
  /** v2_blanks.cost — the catalogue cost, used when no blank cost preset is set. */
  blankCatalogCost: number | null;
  /** What the product's pictures say: a BACK mockup means a back print. */
  detectedSides: PrintSides | null;
  retail: number | null;
  /** products.athlete_price as stored now — what the portal charges today (null = rule). */
  athletePrice: number | null;
  /** What the server rule charges when no client price is set (hoodie $35 / tee $18). */
  ruleAthletePrice: number;
  pricing: {
    blankCost: number | null;
    printCost: number | null;
    otherCost: number | null;
    clientPrice: number | null;
    sharePercent: number | null;
    printSides: PrintSides | null;
    notes: string;
  };
}

/** The editable fields of one row. */
export interface RowDraft {
  blankCost: number | null;
  printCost: number | null;
  /** Services cost for this product (overrides the services cost preset). */
  otherCost: number | null;
  /** What this product costs the client (overrides the price presets). */
  clientPrice: number | null;
  retail: number | null;
  sharePercent: number | null;
  printSides: PrintSides | null;
  notes: string;
}

/** The number cells a selection can fill, in column order. */
export const NUMBER_FIELDS = ["blankCost", "printCost", "otherCost", "clientPrice", "retail", "sharePercent"] as const;
export type NumberField = (typeof NUMBER_FIELDS)[number];

export const FIELD_LABEL: Record<NumberField, string> = {
  blankCost: "Blank cost",
  printCost: "Print cost",
  otherCost: "Services cost",
  clientPrice: "Client price",
  retail: "Retail",
  sharePercent: "Share",
};

export interface PresetLine {
  cost: number | null;
  price: number | null;
}
export type BlankPreset = Record<Component, PresetLine>;
export type Presets = Record<string, BlankPreset>;

const emptyLine = (): PresetLine => ({ cost: null, price: null });
export const emptyPreset = (): BlankPreset => ({ blank: emptyLine(), front: emptyLine(), back: emptyLine(), services: emptyLine() });

export const draftOf = (p: SheetProduct): RowDraft => ({
  blankCost: p.pricing.blankCost,
  printCost: p.pricing.printCost,
  otherCost: p.pricing.otherCost,
  clientPrice: p.pricing.clientPrice,
  retail: p.retail,
  sharePercent: p.pricing.sharePercent,
  printSides: p.pricing.printSides,
  notes: p.pricing.notes,
});

const c2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const sum = (xs: Array<number | null>) => (xs.every((x) => x == null) ? null : c2(xs.reduce<number>((s, x) => s + (x ?? 0), 0)));

/** The print sides that apply: what AX chose, else what the pictures show. */
export const sidesOf = (p: SheetProduct, d: RowDraft): PrintSides | null => d.printSides ?? p.detectedSides;

export interface LineBreakdown {
  component: Component;
  cost: number | null;
  price: number | null;
  margin: number | null;
}

/**
 * Pure: the lines that apply to a blank printed on `sides`, each with our cost,
 * the client price and AX's margin — the C-level breakdown.
 */
export function presetBreakdown(
  preset: BlankPreset | undefined,
  sides: PrintSides | null,
  blankCatalogCost: number | null,
): { lines: LineBreakdown[]; cost: number | null; price: number | null; margin: number | null; marginPercent: number | null } {
  const pre = preset ?? emptyPreset();
  const comps: Component[] = ["blank", ...(sides ? (["front"] as Component[]) : []), ...(sides === "front_back" ? (["back"] as Component[]) : []), "services"];
  const lines = comps.map((c) => {
    const cost = c === "blank" ? (pre.blank.cost ?? blankCatalogCost) : pre[c].cost;
    const price = pre[c].price;
    return { component: c, cost, price, margin: cost != null && price != null ? c2(price - cost) : null };
  });
  const cost = sum(lines.map((l) => l.cost));
  // A client price exists once the blank is priced; unpriced print/services lines add nothing.
  const price = pre.blank.price == null ? null : sum(lines.map((l) => l.price));
  const margin = cost != null && price != null ? c2(price - cost) : null;
  return { lines, cost, price, margin, marginPercent: margin != null && price ? pct(margin, price) : null };
}

/** Pure: what the presets alone say a product's costs and client price are. */
export function presetCosts(p: SheetProduct, sides: PrintSides | null, presets: Presets) {
  const pre = (p.blankId && presets[p.blankId]) || emptyPreset();
  const b = presetBreakdown(pre, sides, p.blankCatalogCost);
  const line = (c: Component) => b.lines.find((l) => l.component === c);
  const print = sides && pre.front.cost != null ? sum([line("front")?.cost ?? null, line("back")?.cost ?? null]) : null;
  return {
    blank: line("blank")?.cost ?? null,
    print,
    services: line("services")?.cost ?? null,
    clientPrice: b.price,
  };
}

export interface RowMaths {
  sides: PrintSides | null;
  blankCost: number | null;
  printCost: number | null;
  servicesCost: number | null;
  /** AX's true cost for one unit. */
  trueCost: number | null;
  /** What one unit costs the client (and what the portal charges). */
  clientPrice: number;
  clientPriceSource: "row" | "preset" | "rule";
  /** AX's margin on one unit sold to the client. */
  unitMargin: number | null;
  unitMarginPercent: number | null;
  /** True cost as a % of retail. */
  costPercent: number | null;
  sharePercent: number | null;
  /** Store sale: the profit after the client's cost (retail − client price). */
  storeProfit: number | null;
  clientPerSale: number | null;
  /** AX's share of the store profit (profit basis) — the split itself. */
  axSplit: number | null;
  /** Everything AX makes on one store sale: unit margin + its split. */
  axPerSale: number | null;
  axMarginPercent: number | null;
  /** The value Save writes to products.athlete_price (null = let the rule apply). */
  storedPriceTarget: number | null;
  /** The portal will charge a different price after Save. */
  priceChanges: boolean;
  missing: Array<"sides" | "print" | "retail" | "share" | "price">;
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
  const servicesCost = d.otherCost ?? pre.services;
  const trueCost = sum([blankCost, printCost, servicesCost]);

  const storedPriceTarget = d.clientPrice ?? pre.clientPrice;
  const clientPrice = storedPriceTarget ?? p.ruleAthletePrice;
  const clientPriceSource: RowMaths["clientPriceSource"] = d.clientPrice != null ? "row" : pre.clientPrice != null ? "preset" : "rule";
  const unitMargin = trueCost == null ? null : c2(clientPrice - trueCost);

  const retail = d.retail;
  const sharePercent = d.sharePercent ?? terms.revenueSharePercent;
  let storeProfit: number | null = null;
  let clientPerSale: number | null = null;
  let axSplit: number | null = null;
  if (retail != null) {
    storeProfit = c2(retail - clientPrice);
    if (sharePercent != null) {
      if (terms.splitBasis === "gross") {
        clientPerSale = c2(retail * (sharePercent / 100));
        axSplit = null;
      } else {
        clientPerSale = c2(Math.max(0, storeProfit) * (sharePercent / 100));
        axSplit = c2(storeProfit - clientPerSale);
      }
    }
  }
  const axPerSale = retail != null && trueCost != null && clientPerSale != null ? c2(retail - trueCost - clientPerSale) : null;

  const missing: RowMaths["missing"] = [];
  if (!sides) missing.push("sides");
  if (printCost == null) missing.push("print");
  if (clientPriceSource === "rule") missing.push("price");
  if (retail == null) missing.push("retail");
  if (sharePercent == null) missing.push("share");

  return {
    sides,
    blankCost,
    printCost,
    servicesCost,
    trueCost,
    clientPrice,
    clientPriceSource,
    unitMargin,
    unitMarginPercent: unitMargin != null ? pct(unitMargin, clientPrice) : null,
    costPercent: trueCost != null && retail ? pct(trueCost, retail) : null,
    sharePercent,
    storeProfit,
    clientPerSale,
    axSplit,
    axPerSale,
    axMarginPercent: axPerSale != null && retail ? pct(axPerSale, retail) : null,
    storedPriceTarget,
    priceChanges: (storedPriceTarget ?? null) !== (p.athletePrice ?? null),
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
  COMPONENTS.some((c) => [pre[c].cost, pre[c].price].some((v) => v != null && (!Number.isFinite(v) || v < 0)))
    ? "Use a positive number."
    : null;

export const garmentOf = (title: string, garmentType: string | null | undefined): Garment => {
  const hay = `${garmentType ?? ""} ${title}`.toLowerCase();
  if (hay.includes("hood")) return "hoodie";
  if (hay.includes("tee") || hay.includes("shirt")) return "tee";
  return "other";
};

/** The rule portal_sheet_unit_price applies when no client price is set. */
export const ruleAthletePrice = (garment: Garment): number => (garment === "hoodie" ? 35 : 18);

export const SIDES_LABEL: Record<PrintSides, string> = { front: "Front", front_back: "Front + back" };

// ------------------------------------------------------- order & grouping

export type GroupBy = "blank" | "print" | "blank_print" | "none";
export type SortBy = "print" | "blank" | "product" | "cost" | "ax" | "unit";

export interface SheetGroup {
  key: string;
  label: string;
  blankId: string | null;
  rows: SheetProduct[];
}

const blankLabel = (p: SheetProduct) => p.blankName ?? "No blank linked";
const sidesRank = (s: PrintSides | null) => (s === "front" ? 0 : s === "front_back" ? 1 : 2);

/** Pure: rows sorted, then grouped. */
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
    cost: (a, b) => byNum(m.get(a.id)!.trueCost) - byNum(m.get(b.id)!.trueCost),
    ax: (a, b) => byNum(m.get(b.id)!.axPerSale) - byNum(m.get(a.id)!.axPerSale),
    unit: (a, b) => byNum(m.get(b.id)!.unitMargin) - byNum(m.get(a.id)!.unitMargin),
  };
  const sorted = [...products].sort((a, b) => cmp[opts.sortBy](a, b) || cmp.blank(a, b) || cmp.print(a, b) || cmp.product(a, b));
  if (opts.groupBy === "none") return [{ key: "all", label: "All products", blankId: null, rows: sorted }];

  const keyOf = (p: SheetProduct) => {
    const s = m.get(p.id)!.sides;
    const sl = s ? SIDES_LABEL[s] : "Print not set";
    if (opts.groupBy === "blank") return { key: p.blankId ?? "none", label: blankLabel(p), blankId: p.blankId };
    if (opts.groupBy === "print") return { key: s ?? "unset", label: sl, blankId: null };
    return { key: `${p.blankId ?? "none"}|${s ?? "unset"}`, label: `${blankLabel(p)} · ${sl}`, blankId: p.blankId };
  };
  const ordered = [...sorted].sort((a, b) => {
    if (opts.groupBy !== "print") {
      const x = cmp.blank(a, b);
      if (x) return x;
    }
    if (opts.groupBy !== "blank") {
      const y = cmp.print(a, b);
      if (y) return y;
    }
    return 0;
  });
  const groups = new Map<string, SheetGroup>();
  for (const p of ordered) {
    const k = keyOf(p);
    if (!groups.has(k.key)) groups.set(k.key, { ...k, rows: [] });
    groups.get(k.key)!.rows.push(p);
  }
  return [...groups.values()];
}

// ------------------------------------------------------------- selection

export const cellKey = (productId: string, field: NumberField) => `${productId}::${field}`;
export const parseCell = (key: string): { productId: string; field: NumberField } => {
  const [productId, field] = key.split("::");
  return { productId, field: field as NumberField };
};

/** Pure: the rectangle of cells between two cells, in on-screen row order and sheet column order. */
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

/** Pure: one value into every selected cell; Shopify retail cells are skipped. */
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
    if (field === "retail" && p.onShopify) {
      skipped++;
      continue;
    }
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
    blankIds.length ? t("blank_cost_presets").select("v2_blank_id, component, cost, price").in("v2_blank_id", blankIds) : empty,
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
  for (const id of blankIds) presets[id] = emptyPreset();
  for (const r of (presetsRes.data ?? []) as Row[]) {
    const k = String(r.v2_blank_id);
    const c = r.component as Component;
    if (presets[k] && COMPONENTS.includes(c)) presets[k][c] = { cost: num(r.cost), price: num(r.price) };
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
        clientPrice: num(r?.client_price),
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

const COST_FIELDS: Array<keyof RowDraft> = ["blankCost", "printCost", "otherCost", "clientPrice", "sharePercent", "printSides", "notes"];

export interface SaveInput {
  changes: Array<{ product: SheetProduct; draft: RowDraft }>;
  presets: Array<{ blankId: string; preset: BlankPreset }>;
  /** Portal prices to write: the client price each product will be charged (null = rule). */
  prices: Array<{ product: SheetProduct; athletePrice: number | null }>;
}

/** Save presets, row overrides and the portal prices they produce. */
export function useSavePricingSheet(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ changes, presets, prices }: SaveInput) => {
      for (const { product, draft } of changes) {
        const problem = rowError(product, draft);
        if (problem) throw new Error(`${product.title}: ${problem}`);
      }
      for (const { preset } of presets) {
        const problem = presetError(preset);
        if (problem) throw new Error(`Preset: ${problem}`);
      }

      // Presets: a line with a cost or a price is upserted; an empty line is deleted.
      const up = presets.flatMap(({ blankId, preset }) =>
        COMPONENTS.filter((c) => preset[c].cost != null || preset[c].price != null).map((c) => ({
          v2_blank_id: blankId,
          component: c,
          cost: preset[c].cost,
          price: preset[c].price,
        })),
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
        const cleared = COMPONENTS.filter((c) => preset[c].cost == null && preset[c].price == null);
        if (cleared.length) await must(t("blank_cost_presets").delete().eq("v2_blank_id", blankId).in("component", cleared));
      }

      const costRows = changes
        .filter(({ product, draft }) => changedFields(product, draft).some((k) => COST_FIELDS.includes(k)))
        .map(({ draft, product }) => ({
          product_id: product.id,
          blank_cost: draft.blankCost,
          print_cost: draft.printCost,
          other_cost: draft.otherCost,
          client_price: draft.clientPrice,
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

      // Products: retail edits, and the client price the portal charges.
      const patches = new Map<string, { product: SheetProduct; patch: Record<string, unknown> }>();
      for (const { product, draft } of changes) {
        if (changedFields(product, draft).includes("retail") && !product.onShopify) {
          patches.set(product.id, { product, patch: { price: draft.retail } });
        }
      }
      for (const { product, athletePrice } of prices) {
        const e = patches.get(product.id) ?? { product, patch: {} };
        e.patch.athlete_price = athletePrice;
        patches.set(product.id, e);
      }
      for (const { product, patch } of patches.values()) {
        const res = (await must(t("products").update(patch as never).eq("id", product.id).select("id"))) as { data: Row[] | null };
        if (!res.data?.length) throw new Error(`${product.title}: the price was not saved — you may not have access to edit it.`);
      }
      return changes.length + presets.length + prices.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sheetKey(entityId) }),
  });
}

// ------------------------------------------------- condensed print lines

export interface PrintLine {
  key: string;
  blankId: string;
  sides: PrintSides | null;
  rows: SheetProduct[];
  /** The breakdown every product on this line shares (from the first typical row). */
  shared: RowMaths;
  /** The most common retail on the line, and how many products differ from the shared numbers. */
  retail: number | null;
  custom: number;
}

const sameNumbers = (a: RowMaths, b: RowMaths) =>
  a.trueCost === b.trueCost && a.clientPrice === b.clientPrice && a.axPerSale === b.axPerSale && a.clientPerSale === b.clientPerSale;

/**
 * Pure: a blank's products collapsed to one line per print type. Products on
 * the same blank and print share one breakdown unless a row overrides it —
 * those are counted as `custom` (a drop special) and stay visible inside.
 */
export function printLines(
  rows: SheetProduct[],
  drafts: Record<string, RowDraft>,
  terms: Pick<BrandTerms, "revenueSharePercent" | "splitBasis">,
  presets: Presets,
): PrintLine[] {
  const by = new Map<string, SheetProduct[]>();
  const maths = new Map(rows.map((p) => [p.id, rowMaths(p, drafts[p.id] ?? draftOf(p), terms, presets)]));
  for (const p of rows) {
    const k = `${p.blankId ?? "none"}|${maths.get(p.id)!.sides ?? "unset"}`;
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const lines = [...by.entries()].map(([key, rs]): PrintLine => {
    // Typical = a row with no overrides, at the most common retail.
    const retailCounts = new Map<number, number>();
    for (const r of rs) {
      const v = (drafts[r.id] ?? draftOf(r)).retail;
      if (v != null) retailCounts.set(v, (retailCounts.get(v) ?? 0) + 1);
    }
    const retail = [...retailCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const isPlain = (r: SheetProduct) => {
      const d = drafts[r.id] ?? draftOf(r);
      return d.blankCost == null && d.printCost == null && d.otherCost == null && d.clientPrice == null && d.sharePercent == null && d.retail === retail;
    };
    const typical = rs.find(isPlain) ?? rs[0];
    const shared = maths.get(typical.id)!;
    return {
      key,
      blankId: rs[0].blankId ?? "none",
      sides: shared.sides,
      rows: rs,
      shared,
      retail,
      custom: rs.filter((r) => !sameNumbers(maths.get(r.id)!, shared)).length,
    };
  });
  return lines.sort((a, b) => sidesRank(a.sides) - sidesRank(b.sides));
}

// ------------------------------------------------- blank assignment & print tags

export interface BlankOption {
  id: string;
  name: string;
  garmentType: string | null;
  cost: number | null;
}

/** Every V2 blank, for assigning products that have none. */
export function useBlankOptions() {
  return useQuery({
    queryKey: ["v2", "blank-options"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BlankOption[]> => {
      const res = await t("v2_blanks").select("id, display_name, name, garment_type, cost").order("display_name");
      if (res.error) throw new Error(res.error.message);
      return ((res.data ?? []) as Row[]).map((b) => ({
        id: String(b.id),
        name: String(b.display_name || b.name || "Blank"),
        garmentType: (b.garment_type as string | null) ?? null,
        cost: num(b.cost),
      }));
    },
  });
}

/**
 * Put products on a blank (products.v2_blank_id) so they take that blank's
 * presets — cost, client price and the split. A print type is tagged only when
 * the pictures cannot tell (older Shopify products).
 */
export function useAssignBlank(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productIds, blankId, sides }: { productIds: string[]; blankId: string; sides: PrintSides | null }) => {
      if (!productIds.length) return 0;
      const res = (await must(t("products").update({ v2_blank_id: blankId } as never).in("id", productIds).select("id"))) as { data: Row[] | null };
      if ((res.data ?? []).length !== productIds.length) throw new Error("Some products were not updated — you may not have access to them.");
      if (sides) {
        await must(
          t("product_pricing").upsert(productIds.map((id) => ({ product_id: id, print_sides: sides })) as never, { onConflict: "product_id" }),
        );
      }
      return productIds.length;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sheetKey(entityId) }),
  });
}

/** One product's print type: what AX tagged, and what its pictures say. */
export function useProductPrint(productId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "product-print", productId],
    enabled: !!productId,
    queryFn: async () => {
      const [tag, imgs] = await Promise.all([
        t("product_pricing").select("print_sides").eq("product_id", productId as string).maybeSingle(),
        t("product_images").select("file_name, metadata").eq("product_id", productId as string),
      ]);
      if (tag.error) throw new Error(tag.error.message);
      if (imgs.error) throw new Error(imgs.error.message);
      const v = (tag.data as Row | null)?.print_sides;
      return {
        tagged: v === "front" || v === "front_back" ? (v as PrintSides) : null,
        detected: detectSides((imgs.data ?? []) as Row[]),
      };
    },
  });
}

/** Tag a product Front / Front + back, or clear the tag to read it from the pictures again. */
export function useSetProductPrint(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sides: PrintSides | null) => {
      await must(t("product_pricing").upsert({ product_id: productId, print_sides: sides } as never, { onConflict: "product_id" }));
      return sides;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "product-print", productId] });
      void qc.invalidateQueries({ queryKey: ["v2", "pricing-sheet"] });
    },
  });
}
