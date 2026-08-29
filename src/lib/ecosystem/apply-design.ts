// Take one finished design and turn it into products across many blanks.
//
// This is the join between the design library and the product board. Before
// it, a design and a garment only met by someone making a mockup by hand, one
// at a time. Now a crest becomes a hoodie, a tee, a crewneck and a cap in one
// pass, each with its artwork positioned in a real print zone, each priced
// from that blank's cost, each landing as an ordinary product concept.
//
// Ordinary matters: these go through createAthleteProduct like everything
// else, so approval, collections and Shopify need no idea this path exists.
import { supabase } from "@/integrations/supabase/client";
import { createAthleteProduct } from "@/lib/ecosystem/merch";
import { renderMockupPng } from "@/lib/render-mockup";
import { sellingPrice, trueCostOf, type PricingRule } from "@/lib/ecosystem/pricing";
import { garmentCategoryFor, type PrintZone, type SurfaceKey } from "@/lib/print-zones";

export interface BlankOption {
  id: string;
  name: string;
  garment_type: string | null;
  image_url: string | null;
  blank_cost: number | string | null;
  decoration_cost: number | string | null;
  additional_cost: number | string | null;
  cost: number | string | null;
  price_standard: number | string | null;
  price_athlete: number | string | null;
  price_corporate: number | string | null;
  colors: { color_name: string; image_url: string | null; image_url_back: string | null }[];
  sizes: string[];
  /** Assortment keys this blank belongs to — who is allowed to put art on it. */
  assortments: string[];
}

export interface BlankSelection {
  blank: BlankOption;
  surface: SurfaceKey;
  zone: PrintZone;
  /** Which colorway's photo to composite onto; null uses the blank's main image. */
  colorName?: string | null;
}

export interface ApplyResult {
  blankId: string;
  blankName: string;
  productId: string | null;
  error: string | null;
  /** True when the concept was created but without a rendered mockup image. */
  imageMissing: boolean;
}

/**
 * The garment photo to composite onto for a selection.
 *
 * Caps keep their straight-on shot in image_url_back — the primary image is
 * an angled marketing photo that artwork can't be squared onto.
 */
export function baseImageFor(sel: BlankSelection): string | null {
  const color = sel.colorName
    ? sel.blank.colors.find((c) => c.color_name === sel.colorName)
    : null;
  const field = sel.surface === "back" ? "image_url_back" : "image_url";
  return color?.[field] ?? (sel.surface === "front" ? sel.blank.image_url : null) ?? sel.blank.image_url;
}

/** "Abbotsford Crest" + "Heavyweight Hoodie" → "Abbotsford Crest Hoodie". */
export function productTitleFor(designTitle: string, blank: BlankOption): string {
  const garment = (blank.garment_type ?? "").trim();
  const nice = garment ? garment.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : blank.name;
  const design = designTitle.trim() || "Design";
  // Don't produce "Crest Hoodie Hoodie" when the design is already named for it.
  if (design.toLowerCase().endsWith(nice.toLowerCase())) return design;
  return `${design} ${nice}`;
}

export interface ApplyDesignInput {
  organization_id: string;
  athlete_id: string;
  design: { id: string; title: string; url: string };
  selections: BlankSelection[];
  rule: PricingRule;
  collection_id?: string | null;
  team_id_at_release?: string | null;
  onProgress?: (done: number, total: number, label: string) => void;
}

/**
 * Each blank is independent: one failure doesn't abort the rest, and the
 * caller gets a per-blank breakdown. Creating six concepts and losing all of
 * them because the fifth blank has no photo would be the wrong trade.
 */
export async function applyDesignToBlanks(input: ApplyDesignInput): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  for (const [i, sel] of input.selections.entries()) {
    input.onProgress?.(i, input.selections.length, sel.blank.name);
    const title = productTitleFor(input.design.title, sel.blank);
    let productId: string | null = null;

    try {
      const cost = trueCostOf(sel.blank);
      // sellingPrice, not priceFrom: a hand-set price on the blank has to reach
      // the concept, or the catalogue and the product disagree about the money.
      const price = sellingPrice(sel.blank, input.rule);

      productId = await createAthleteProduct({
        organization_id: input.organization_id,
        athlete_id: input.athlete_id,
        title,
        price,
        blank_id: sel.blank.id,
        collection_id: input.collection_id ?? null,
        design_ids: [input.design.id],
        colors: sel.colorName ? [sel.colorName] : sel.blank.colors.slice(0, 1).map((c) => c.color_name),
        sizes: sel.blank.sizes,
        team_id_at_release: input.team_id_at_release ?? null,
      });

      // Where the art sits. Recorded even if the mockup render fails, because
      // this is the instruction the printer follows — the image is only a
      // picture of it.
      const placed = await supabase.from("product_print_placements" as never).insert({
        product_id: productId,
        design_id: input.design.id,
        blank_id: sel.blank.id,
        surface: sel.surface,
        zone_id: sel.zone.id,
        zone_label: sel.zone.label,
        color_name: sel.colorName ?? null,
        x_pct: 0, y_pct: 0, w_pct: 1, h_pct: 1, rotation_deg: 0,
      } as never);
      if (placed.error) throw placed.error;

      const base = baseImageFor(sel);
      let imageMissing = true;
      if (base) {
        try {
          const file = await renderMockupPng({
            baseImageSrc: base,
            design: input.design.url,
            zone: sel.zone,
            filename: `${title}.png`,
          });
          const path = `${productId}/${crypto.randomUUID()}.png`;
          const up = await supabase.storage.from("product-images").upload(path, file);
          if (up.error) throw up.error;
          const linked = await supabase.from("product_images" as never).insert({
            product_id: productId,
            storage_bucket: "product-images",
            storage_path: path,
            sort_order: 0,
          } as never);
          if (linked.error) throw linked.error;
          imageMissing = false;
        } catch {
          // A concept with no picture is still a real concept — the operator
          // can drop a mockup on it. Losing the product would be worse.
          imageMissing = true;
        }
      }

      results.push({ blankId: sel.blank.id, blankName: sel.blank.name, productId, error: null, imageMissing });
    } catch (e) {
      if (productId) await supabase.from("products" as never).delete().eq("id", productId);
      results.push({
        blankId: sel.blank.id,
        blankName: sel.blank.name,
        productId: null,
        imageMissing: true,
        error: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  input.onProgress?.(input.selections.length, input.selections.length, "");
  return results;
}

/** Sensible starting zone for a garment: the one an operator picks most. */
export function defaultZoneFor(
  garmentType: string | null | undefined,
  zones: Record<SurfaceKey, PrintZone[]>,
): { surface: SurfaceKey; zone: PrintZone } | null {
  const category = garmentCategoryFor(garmentType);
  const preferred = category === "cap" ? ["cap_front"] : ["center_chest", "left_chest"];
  for (const id of preferred) {
    const front = zones.front.find((z) => z.id === id);
    if (front) return { surface: "front", zone: front };
  }
  if (zones.front[0]) return { surface: "front", zone: zones.front[0] };
  if (zones.back[0]) return { surface: "back", zone: zones.back[0] };
  return null;
}

/**
 * Load the blanks that can actually be decorated, with colors, sizes, prices
 * and the assortments they belong to.
 *
 * Membership comes along rather than being filtered here on purpose: the caller
 * decides whether to show only an athlete's catalogue or everything with the
 * out-of-catalogue ones marked. Filtering in the query would make "why can't I
 * see that hoodie?" unanswerable from the UI.
 */
export async function listDecoratableBlanks(): Promise<BlankOption[]> {
  const [res, itemsRes] = await Promise.all([
    supabase
      .from("blanks")
      .select(
        "id, name, garment_type, image_url, blank_cost, decoration_cost, additional_cost, cost, price_standard, price_athlete, price_corporate, availability_status, internal_only, blank_colors(color_name, image_url, image_url_back, available, sort_order), blank_sizes(size, available, sort_order)",
      )
      .order("name"),
    supabase
      .from("blank_assortment_items" as never)
      .select("blank_id, assortment:blank_assortments(key)"),
  ]);
  const { data, error } = res;
  if (error) throw error;

  const byBlank = new Map<string, string[]>();
  for (const row of (itemsRes.data ?? []) as unknown as {
    blank_id: string; assortment: { key: string } | { key: string }[] | null;
  }[]) {
    const a = Array.isArray(row.assortment) ? row.assortment[0] : row.assortment;
    if (!a?.key) continue;
    byBlank.set(row.blank_id, [...(byBlank.get(row.blank_id) ?? []), a.key]);
  }

  return ((data ?? []) as unknown as (BlankOption & {
    internal_only: boolean | null;
    blank_colors: { color_name: string; image_url: string | null; image_url_back: string | null; available: boolean; sort_order: number }[];
    blank_sizes: { size: string; available: boolean; sort_order: number }[];
  })[])
    .filter((b) => !b.internal_only)
    .map((b) => ({
      id: b.id,
      name: b.name,
      garment_type: b.garment_type,
      image_url: b.image_url,
      blank_cost: b.blank_cost,
      decoration_cost: b.decoration_cost,
      additional_cost: b.additional_cost,
      cost: b.cost,
      price_standard: b.price_standard,
      price_athlete: b.price_athlete,
      price_corporate: b.price_corporate,
      assortments: byBlank.get(b.id) ?? [],
      colors: (b.blank_colors ?? [])
        .filter((c) => c.available)
        .sort((a, z) => a.sort_order - z.sort_order)
        .map((c) => ({ color_name: c.color_name, image_url: c.image_url, image_url_back: c.image_url_back })),
      sizes: (b.blank_sizes ?? [])
        .filter((s) => s.available)
        .sort((a, z) => a.sort_order - z.sort_order)
        .map((s) => s.size),
    }));
}
