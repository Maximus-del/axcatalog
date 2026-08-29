#!/usr/bin/env node
// AX Blank Photography sync — Google Drive is the source of truth for images.
//
//   node scripts/sync-blank-photography.mjs              # dry run, changes nothing
//   node scripts/sync-blank-photography.mjs --apply      # writes
//
// Credentials come from .env.local (gitignored), or the environment:
//   GOOGLE_API_KEY               read-only Drive key. The library is shared
//                                "anyone with the link", so a plain API key is
//                                enough — no OAuth, no service account.
//   SUPABASE_URL                 https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    needed because this writes catalog rows.
//   AX_PHOTOGRAPHY_FOLDER_ID     optional; defaults to the library root below.
//
// WHAT IT DOES NOT DO: it never creates a blank or a colourway. Shopify owns
// which blanks are real; this owns what they look like. A Drive style with no
// matching blank is reported so a human can bind it once, and a Drive colour
// with no matching colourway is recorded against the blank and flagged.
//
// Re-running is safe and is the point: rows are upserted on
// (blank_id, drive_file_id), so a re-shoot updates in place and new colours
// appear without touching anything else.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildPlan, classifyView, planColorCache } from "./lib/photography.mjs";

const ROOT_DEFAULT = "1wv-QAIJMY4_ONVdTbTMoHtZJwWoIEyx0";
const BINDINGS_PATH = new URL("./blank-folder-bindings.json", import.meta.url);

/* ------------------------------------------------------------------- setup */

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const APPLY = process.argv.includes("--apply");

/* ------------------------------------------------------------------- drive */

async function drive(params) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("key", process.env.GOOGLE_API_KEY);
  url.searchParams.set("pageSize", "1000");
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime)");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const out = [];
  let pageToken;
  do {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    out.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

const children = (folderId) => drive({ q: `'${folderId}' in parents and trashed = false` });
const isFolder = (f) => f.mimeType === "application/vnd.google-apps.folder";
const isImage = (f) => (f.mimeType ?? "").startsWith("image/");

/**
 * Walk supplier → style → [COMPLETE_CLEAN] → colour → view → files.
 *
 * The intermediate "*_COMPLETE_CLEAN" level exists for AXISM and not for Cotton
 * Collective, so it is stepped over when present rather than assumed either
 * way. Some colour folders hold their images directly instead of in FRONT /
 * BACK subfolders; those are classified from the filename.
 */
async function walk(rootId) {
  const entries = [];
  const suppliers = (await children(rootId)).filter(isFolder);

  for (const supplier of suppliers) {
    for (const style of (await children(supplier.id)).filter(isFolder)) {
      let colorParent = style;
      const styleKids = (await children(style.id)).filter(isFolder);
      const complete = styleKids.find((f) => /complete[_ ]?clean/i.test(f.name));
      const colorFolders = complete ? (await children(complete.id)).filter(isFolder) : styleKids;
      if (complete) colorParent = complete;

      for (const color of colorFolders) {
        const kids = await children(color.id);
        const viewFolders = kids.filter(isFolder);

        if (viewFolders.length > 0) {
          for (const view of viewFolders) {
            for (const file of (await children(view.id)).filter(isImage)) {
              entries.push({
                supplier,
                styleFolder: style,
                colorFolder: color,
                viewFolder: { id: view.id, title: view.name },
                file: { id: file.id, title: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime },
              });
            }
          }
        } else {
          for (const file of kids.filter(isImage)) {
            // No view folder — infer the surface from the filename.
            const guess = /back/i.test(file.name) ? "BACK" : /front/i.test(file.name) ? "FRONT" : "";
            if (!classifyView(guess).viewType) continue;
            entries.push({
              supplier,
              styleFolder: style,
              colorFolder: color,
              viewFolder: { id: color.id, title: guess },
              file: { id: file.id, title: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime },
            });
          }
        }
      }
      void colorParent;
    }
  }
  return entries;
}

/* ---------------------------------------------------------------- supabase */

async function loadBlanks(sb) {
  const { data: blanks, error } = await sb
    .from("blanks")
    .select("id, name, style_number, drive_product_folder_id");
  if (error) throw error;
  const { data: colors, error: cErr } = await sb
    .from("blank_colors")
    .select("id, blank_id, color_name, image_url, image_url_back");
  if (cErr) throw cErr;

  const byBlank = new Map();
  for (const c of colors) {
    if (!byBlank.has(c.blank_id)) byBlank.set(c.blank_id, []);
    byBlank.get(c.blank_id).push(c);
  }
  return blanks.map((b) => ({ ...b, colors: byBlank.get(b.id) ?? [] }));
}

/* -------------------------------------------------------------------- main */

async function main() {
  loadEnv();
  for (const k of ["GOOGLE_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`Missing ${k}. Put it in .env.local (see the header of this file).`);
      process.exit(1);
    }
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const blanks = await loadBlanks(sb);

  // Bindings a human has confirmed, applied before matching so the folder name
  // never has to resemble the catalog name.
  let bindings = {};
  if (existsSync(BINDINGS_PATH)) {
    bindings = JSON.parse(readFileSync(BINDINGS_PATH, "utf8")).bindings ?? {};
  }
  for (const b of blanks) {
    const folderId = Object.entries(bindings).find(([, style]) => style === b.style_number)?.[0];
    if (folderId && !b.drive_product_folder_id) b.drive_product_folder_id = folderId;
  }

  console.log(`Walking the photography library…`);
  const entries = await walk(process.env.AX_PHOTOGRAPHY_FOLDER_ID || ROOT_DEFAULT);
  console.log(`  ${entries.length} images found`);

  const plan = buildPlan(entries, blanks);
  const cache = planColorCache(plan.images);

  console.log(`\n── PLAN ────────────────────────────────────────────`);
  console.log(`  ${plan.images.length} images matched to ${new Set(plan.images.map((i) => i.blank_id)).size} blanks`);
  console.log(`  ${cache.length} colourways will get front/back URLs`);

  if (plan.unmatchedStyles.length) {
    console.log(`\n  ${plan.unmatchedStyles.length} Drive styles matched no blank — bind them in`);
    console.log(`  scripts/blank-folder-bindings.json ("<driveFolderId>": "<style_number>"):`);
    for (const u of plan.unmatchedStyles) console.log(`    "${u.folderId}": "",   // ${u.style}  (${u.reason})`);
  }
  if (plan.unmatchedColors.length) {
    const shown = plan.unmatchedColors.slice(0, 12);
    console.log(`\n  ${plan.unmatchedColors.length} Drive colourways are not in the catalog (photo kept, not cached):`);
    for (const u of shown) console.log(`    ${u.blank} — ${u.color}`);
    if (plan.unmatchedColors.length > shown.length) console.log(`    …and ${plan.unmatchedColors.length - shown.length} more`);
  }
  if (plan.skippedViews.length) {
    console.log(`\n  ${plan.skippedViews.length} folders were not a recognisable view and were skipped.`);
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing was written. Re-run with --apply.`);
    return;
  }

  console.log(`\n── APPLYING ────────────────────────────────────────`);

  const rows = plan.images.map((i) => ({
    blank_id: i.blank_id,
    color: i.color,
    normalized_color: i.normalized_color,
    view_type: i.view_type,
    drive_file_id: i.drive_file_id,
    drive_folder_id: i.drive_folder_id,
    filename: i.filename,
    mime_type: i.mime_type,
    drive_url: i.drive_url,
    modified_at: i.modified_at,
    is_primary: i.is_primary,
    missing: false,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from("blank_images").upsert(chunk, { onConflict: "blank_id,drive_file_id" });
    if (error) throw error;
    console.log(`  blank_images: ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
  }

  // Derived cache on blank_colors. blank_images is the record; these two columns
  // are the copy the app reads, refreshed here so they cannot drift.
  const colorsById = new Map();
  for (const b of blanks) for (const c of b.colors) colorsById.set(`${b.id}::${c.color_name.toLowerCase()}`, c);

  let cached = 0;
  for (const slot of cache) {
    const blank = blanks.find((b) => b.id === slot.blank_id);
    const color = blank?.colors.find(
      (c) => c.color_name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase() === slot.normalized_color,
    );
    if (!color) continue;
    const patch = {};
    if (slot.front) patch.image_url = slot.front;
    if (slot.back) patch.image_url_back = slot.back;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await sb.from("blank_colors").update(patch).eq("id", color.id);
    if (error) throw error;
    cached++;
  }
  console.log(`  blank_colors refreshed: ${cached}`);

  // Record the binding and the sync time, so the next run never has to guess a
  // style folder that has already been identified.
  const styleFolderByBlank = new Map();
  for (const e of entries) {
    const parsed = plan.images.find((i) => i.drive_file_id === e.file.id);
    if (parsed) styleFolderByBlank.set(parsed.blank_id, e.styleFolder);
  }
  for (const [blankId, folder] of styleFolderByBlank) {
    const { error } = await sb
      .from("blanks")
      .update({
        drive_product_folder_id: folder.id,
        drive_product_folder_url: `https://drive.google.com/drive/folders/${folder.id}`,
        last_drive_sync_at: new Date().toISOString(),
      })
      .eq("id", blankId);
    if (error) throw error;
  }
  console.log(`  blanks bound to Drive folders: ${styleFolderByBlank.size}`);
  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
