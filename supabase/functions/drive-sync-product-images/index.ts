// Mirror product pictures from the Drive master library into product_images.
//
// POST { athlete_id: uuid, product_id?: uuid, force?: boolean }
//
// Called by the client portal when it loads (throttled to once every 3
// minutes per product) and by V2 ("Sync now", force). Authorisation is the
// caller's own session: portal_drive_targets decides which products this
// person may sync and claims them. Only then does the service role write.
//
// Never deletes or changes a Shopify image or an AX upload: it only touches
// rows it created (metadata.source = 'drive'). If any folder cannot be read,
// that product is left exactly as it was and the error is recorded.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { FOLDER_MIME, colorFromFileName, colorFromFolder, isViewFolder, planDriveSync, type DriveFile, type DriveSource, type ExistingDriveRow } from "../_shared/drive-product-images.ts";
import { driveToken, listFolder, readServiceAccount } from "../_shared/google-drive.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first" }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const athleteId = String(body.athlete_id ?? "");
  const productId = body.product_id ? String(body.product_id) : null;
  if (!UUID.test(athleteId) || (productId && !UUID.test(productId))) return json({ error: "athlete_id required" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });

  const sa = readServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (!sa) {
    // Nothing is claimed, so pictures already mirrored stay as they are.
    return json({ configured: false, synced: 0, hint: "Add GOOGLE_SERVICE_ACCOUNT_JSON as a Supabase secret and share the library with its client_email." });
  }

  const { data: targets, error: tErr } = await asUser.rpc("portal_drive_targets", {
    _athlete_id: athleteId,
    _product_id: productId,
    _force: body.force === true,
  });
  if (tErr) return json({ error: tErr.message }, tErr.code === "28000" ? 401 : 403);
  const items = ((targets as { items?: Array<{ productId: string; sources: DriveSource[] }> })?.items ?? []);
  if (!items.length) return json({ configured: true, synced: 0, changed: 0 });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let token: string;
  try {
    token = await driveToken(sa);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google sign-in failed";
    for (const it of items) await admin.rpc("portal_drive_record", { _product_id: it.productId, _result: { error: msg } });
    return json({ configured: true, error: msg }, 502);
  }

  // A linked folder may hold pictures directly, or one subfolder per
  // colorway (HOODIE / BLACK / ...). Files in a subfolder carry its color.
  const folderCache = new Map<string, Promise<DriveFile[]>>();
  const list = (id: string) => {
    if (!folderCache.has(id)) {
      folderCache.set(id, (async () => {
        const top = await listFolder(token, id);
        const out: DriveFile[] = top.filter((f) => f.mimeType !== FOLDER_MIME);
        for (const sub of top.filter((f) => f.mimeType === FOLDER_MIME)) {
          // FRONT / BACK folders hold every color; the color is in the name.
          const byView = isViewFolder(sub.name);
          const color = byView ? null : colorFromFolder(sub.name);
          for (const f of await listFolder(token, sub.id)) {
            if (f.mimeType !== FOLDER_MIME) out.push({ ...f, color: color ?? colorFromFileName(f.name) });
          }
        }
        // Loose files carry their color in the name too, when they follow the batch shape.
        for (const f of out) if (f.color === undefined) f.color = colorFromFileName(f.name);
        return out;
      })());
    }
    return folderCache.get(id)!;
  };

  const results: Array<{ productId: string; shown?: number; changed?: number; error?: string }> = [];
  let changedTotal = 0;
  for (const it of items) {
    try {
      const filesByFolder: Record<string, DriveFile[]> = {};
      for (const s of it.sources) filesByFolder[s.id] = await list(s.id);

      const { data: rows, error: rErr } = await admin
        .from("product_images")
        .select("id, storage_path, sort_order, is_primary, metadata")
        .eq("product_id", it.productId)
        .eq("metadata->>source", "drive");
      if (rErr) throw new Error(rErr.message);

      const plan = planDriveSync(it.sources, filesByFolder, (rows ?? []) as ExistingDriveRow[]);
      for (const ins of plan.insert) {
        const { error } = await admin.from("product_images").insert({ product_id: it.productId, storage_bucket: "external", ...ins });
        if (error) throw new Error(error.message);
      }
      for (const { id, ...up } of plan.update) {
        const { error } = await admin.from("product_images").update({ storage_bucket: "external", ...up }).eq("id", id);
        if (error) throw new Error(error.message);
      }
      if (plan.remove.length) {
        const { error } = await admin.from("product_images").delete().in("id", plan.remove).eq("metadata->>source", "drive");
        if (error) throw new Error(error.message);
      }
      const changed = plan.insert.length + plan.update.length + plan.remove.length;
      changedTotal += changed;
      await admin.rpc("portal_drive_record", { _product_id: it.productId, _result: { shown: plan.shown } });
      results.push({ productId: it.productId, shown: plan.shown, changed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      await admin.rpc("portal_drive_record", { _product_id: it.productId, _result: { error: msg } });
      results.push({ productId: it.productId, error: msg });
    }
  }
  return json({ configured: true, synced: results.length, changed: changedTotal, results });
});
