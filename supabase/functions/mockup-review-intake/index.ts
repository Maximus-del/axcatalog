// Drive library -> mockup review queue.
//
// POST {}  (AX operator session)
// For every client with a FINALIZED PRODUCTS folder (athletes.metadata
// .drive_finalized_folder_id): each design folder's manifest.json gives the
// design code, name and Shopify product; each garment folder ("TEE V1 — AXISM
// 7010") holds one subfolder per colour with *_FRONT / *_BACK mockups. Every
// colour not already in mockup_reviews arrives as PENDING. Never changes a row
// that is already there, so a reviewed colour stays reviewed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { driveToken, listFolder, readServiceAccount, type DriveListFile } from "../_shared/google-drive.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (p: unknown, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const FOLDER = "application/vnd.google-apps.folder";
const GARMENT = /^(TEE|HOODIE|CREWNECK|LONG ?SLEEVE|SHORTS|SWEATPANTS|HAT)\b.*—\s*(.+)$/i;
const thumb = (id: string) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first" }, 401);
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: isOp } = await asUser.rpc("current_user_is_operator");
  if (isOp !== true) return json({ error: "AX team only" }, 403);

  const sa = readServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (!sa) return json({ scanned: 0, added: 0, hint: "Drive isn't connected yet — set up the Google service account (it's in your tracker). Mockups can still be reviewed." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const token = await driveToken(sa);
    const { data: clients } = await admin.from("athletes").select("id, display_name, metadata").not("metadata->>drive_finalized_folder_id", "is", null);
    const { data: existing } = await admin.from("mockup_reviews").select("design_code, garment, color");
    const seen = new Set((existing ?? []).map((r) => `${r.design_code}|${r.garment}|${r.color}`.toLowerCase()));
    const rows: Record<string, unknown>[] = [];
    let scanned = 0;
    const unreadable: string[] = [];

    for (const c of clients ?? []) {
      const root = String((c.metadata as Record<string, unknown>).drive_finalized_folder_id);
      let designs: DriveListFile[];
      try { designs = (await listFolder(token, root)).filter((f) => f.mimeType === FOLDER && !/^_/.test(f.name)); }
      catch { unreadable.push(String(c.display_name)); continue; }
      for (const d of designs) {
        const inside = await listFolder(token, d.id);
        const manifestFile = inside.find((f) => f.name === "manifest.json");
        let manifest: Record<string, unknown> = {};
        if (manifestFile) {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${manifestFile.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) manifest = await r.json().catch(() => ({}));
        }
        const code = String(manifest.design_code ?? d.name.replace(/\s*—\s*/, "-").replace(/\s+/g, "").toUpperCase());
        const name = String(manifest.design_name ?? d.name.split("—").pop()?.trim() ?? d.name)
          .toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
        const products = Array.isArray(manifest.products) ? manifest.products as Array<Record<string, unknown>> : [];
        const gid = products.find((p) => typeof p.shopify_product_gid === "string" && String(p.shopify_product_gid).startsWith("gid://"))?.shopify_product_gid as string | undefined;
        const title = products.find((p) => p.shopify_product_title)?.shopify_product_title as string | undefined;
        for (const g of inside.filter((f) => f.mimeType === FOLDER && GARMENT.test(f.name))) {
          const blank = g.name.match(GARMENT)?.[2]?.trim() ?? null;
          for (const col of (await listFolder(token, g.id)).filter((f) => f.mimeType === FOLDER && !/CONTACT/i.test(f.name))) {
            scanned++;
            const color = col.name.replace(/_/g, " ").trim();
            if (seen.has(`${code}|${g.name}|${color}`.toLowerCase())) continue;
            const files = await listFolder(token, col.id);
            const front = files.find((f) => /_FRONT\.(png|jpe?g)$/i.test(f.name));
            const back = files.find((f) => /_BACK\.(png|jpe?g)$/i.test(f.name));
            if (!front) continue;
            rows.push({
              athlete_id: c.id, design_code: code, design_name: name, product_title: title ?? null, garment: g.name, blank_style: blank,
              color, front_drive_id: front.id, back_drive_id: back?.id ?? null, front_url: thumb(front.id), back_url: back ? thumb(back.id) : null,
              drive_folder_id: col.id, shopify_product_gid: gid ?? null,
            });
          }
        }
      }
    }
    if (rows.length) {
      const { error } = await admin.from("mockup_reviews").upsert(rows, { onConflict: "design_code,garment,color", ignoreDuplicates: true });
      if (error) throw error;
    }
    return json({ scanned, added: rows.length, unreadable });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
