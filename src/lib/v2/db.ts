// AX OS V2 — the one place the data layer touches Supabase.
//
// Extracted from data.ts so the cart layer can share it rather than mint a
// second copy of the `as never` cast and, worse, a second write path that does
// not check `.error`.

import { supabase } from "@/integrations/supabase/client";

export type Row = Record<string, unknown>;

/**
 * Where the generated Supabase types lag the live schema — a pre-existing
 * drift the audit recorded, not something V2 introduced — the cast the rest of
 * the codebase uses is applied once, here.
 */
export const t = (table: string) => supabase.from(table as never);

export const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * SUPABASE RETURNS ERRORS. IT DOES NOT THROW THEM.
 *
 * `await t("mockups").update(...)` resolves happily when the row was rejected
 * — wrong org, RLS, a constraint — and every write that does not read `.error`
 * reports success, fires its toast, refetches, and quietly puts the old value
 * back on screen. Which is worse than an error, because the operator believes
 * the change stuck.
 *
 * Every write goes through here.
 */
export async function must<T extends { error: unknown }>(op: PromiseLike<T>): Promise<T> {
  const res = await op;
  if (res.error) {
    const message = (res.error as { message?: string })?.message;
    throw new Error(message || "The database rejected that change");
  }
  return res;
}

/** Public URL for a bucket/path pair (product-images and blanks are public). */
export function publicUrl(bucket: string | null, path: string | null): string | null {
  if (!bucket || !path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
