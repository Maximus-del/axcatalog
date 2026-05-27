// One-click sweep that auto-links Darnell Mooney to any product or design
// whose title/description/notes mention "Mooney", "Mooney World", or "MWrld".
//
// - Products: inserts product_athletes(role='additional') when not already
//   linked, AND sets role='primary' if no primary athlete exists yet.
// - Designs: sets primary_athlete_id when null, and inserts a design_athletes
//   row (no role column on that table).
import { supabase } from "@/integrations/supabase/client";

export const MOONEY_REGEX = /(darnell\s*mooney|mooney\s*world|\bmwrld\b|\bmooney\b)/i;

function matches(...fields: Array<string | null | undefined>): boolean {
  return fields.some((f) => f && MOONEY_REGEX.test(f));
}

export interface SweepResult {
  productsScanned: number;
  productsLinked: number;
  designsScanned: number;
  designsLinked: number;
  errors: string[];
}

export async function runMooneySweep(): Promise<SweepResult> {
  const errors: string[] = [];

  // Resolve Darnell Mooney
  const { data: athletes, error: aErr } = await supabase
    .from("athletes")
    .select("id, organization_id, slug")
    .eq("slug", "darnell-mooney")
    .limit(1);
  if (aErr) throw aErr;
  const athlete = athletes?.[0];
  if (!athlete) throw new Error("Athlete 'darnell-mooney' not found");

  // PRODUCTS
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, title, description, notes")
    .eq("organization_id", athlete.organization_id);
  if (pErr) throw pErr;

  const matchingProductIds = (products ?? [])
    .filter((p) => matches(p.title, p.description, p.notes))
    .map((p) => p.id);

  let productsLinked = 0;
  if (matchingProductIds.length) {
    const { data: existing } = await supabase
      .from("product_athletes")
      .select("product_id")
      .eq("athlete_id", athlete.id)
      .in("product_id", matchingProductIds);
    const already = new Set((existing ?? []).map((r) => r.product_id));
    const toInsert = matchingProductIds.filter((id) => !already.has(id));

    if (toInsert.length) {
      // Find which of these products already have a primary athlete
      const { data: primaries } = await supabase
        .from("product_athletes")
        .select("product_id")
        .in("product_id", toInsert)
        .eq("role", "primary");
      const hasPrimary = new Set((primaries ?? []).map((r) => r.product_id));

      const rows = toInsert.map((pid) => ({
        product_id: pid,
        athlete_id: athlete.id,
        role: hasPrimary.has(pid) ? ("featured" as const) : ("primary" as const),
      }));
      const { error: insErr } = await supabase.from("product_athletes").insert(rows);
      if (insErr) errors.push(`product_athletes: ${insErr.message}`);
      else productsLinked = rows.length;
    }
  }

  // DESIGNS
  const { data: designs, error: dErr } = await supabase
    .from("designs")
    .select("id, title, description, notes, primary_athlete_id")
    .eq("organization_id", athlete.organization_id);
  if (dErr) throw dErr;

  const matchingDesigns = (designs ?? []).filter((d) =>
    matches(d.title, d.description, d.notes),
  );

  let designsLinked = 0;
  if (matchingDesigns.length) {
    const ids = matchingDesigns.map((d) => d.id);
    const { data: existingDA } = await supabase
      .from("design_athletes")
      .select("design_id")
      .eq("athlete_id", athlete.id)
      .in("design_id", ids);
    const already = new Set((existingDA ?? []).map((r) => r.design_id));
    const linkRows = ids
      .filter((id) => !already.has(id))
      .map((design_id) => ({ design_id, athlete_id: athlete.id }));
    if (linkRows.length) {
      const { error: insErr } = await supabase.from("design_athletes").insert(linkRows);
      if (insErr) errors.push(`design_athletes: ${insErr.message}`);
    }

    // Set primary_athlete_id where empty
    const needPrimary = matchingDesigns.filter((d) => !d.primary_athlete_id).map((d) => d.id);
    if (needPrimary.length) {
      const { error: upErr } = await supabase
        .from("designs")
        .update({ primary_athlete_id: athlete.id })
        .in("id", needPrimary);
      if (upErr) errors.push(`designs.primary_athlete_id: ${upErr.message}`);
    }
    designsLinked = matchingDesigns.length;
  }

  return {
    productsScanned: products?.length ?? 0,
    productsLinked,
    designsScanned: designs?.length ?? 0,
    designsLinked,
    errors,
  };
}