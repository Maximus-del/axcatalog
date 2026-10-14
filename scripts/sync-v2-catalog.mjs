#!/usr/bin/env node
// AX V2 CATALOG SYNC — build the catalog from the Drive.
//
//   node scripts/sync-v2-catalog.mjs            # dry run, changes nothing
//   node scripts/sync-v2-catalog.mjs --apply    # writes
//
// The "AX Blank Photography" Drive is the source of truth for which blanks and
// colourways exist and what they are called. This creates them.
//
// It does not read, match against, or touch the V1 `blanks` tables. Those are
// the previous generation and stay where they are, serving V1. A V2 blank is
// not "the V1 blank, corrected" — it is a different record of a range that was
// physically re-done, and trying to reconcile the two is the work this avoids.
//
// Shopify owns cost, price and quantity. Those columns are left NULL here and
// are never inferred: a wrong price is worse than a missing one.
//
// .env.local (gitignored — .env is tracked and holds only publishable keys):
//   GOOGLE_API_KEY               read-only Drive key. The library is shared
//                                "anyone with the link", so no OAuth is needed.
//   SUPABASE_URL                 https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    writes catalog rows.
//   AX_ORGANIZATION_ID           optional; defaults to Athlete Xclusive.
//   AX_PHOTOGRAPHY_FOLDER_ID     optional; defaults to the library root.
//
// Re-running is the point. Identity is the Drive FOLDER ID, never the name, so
// renaming a folder updates a blank instead of creating a second one, and new
// colours simply appear.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildCatalog, classifyView, colorsWithoutImages } from "./lib/photography.mjs";

const ROOT_DEFAULT = "1wv-QAIJMY4_ONVdTbTMoHtZJwWoIEyx0";
const ORG_DEFAULT = "2d6f377e-4fe8-448b-84b3-42aed237f3da"; // Athlete Xclusive
const APPLY = process.argv.includes("--apply");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

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

const children = (id) => drive({ q: `'${id}' in parents and trashed = false` });
const isFolder = (f) => f.mimeType === "application/vnd.google-apps.folder";
const isImage = (f) => (f.mimeType ?? "").startsWith("image/");

/**
 * Walk supplier → style → [*_COMPLETE_CLEAN] → colour → view → files.
 *
 * The COMPLETE_CLEAN level exists for AXISM and not for Cotton Collective, so
 * it is stepped over when found rather than assumed either way. Colour folders
 * that hold images directly get their surface read off the filename.
 */
async function walk(rootId) {
  const entries = [];
  for (const supplier of (await children(rootId)).filter(isFolder)) {
    for (const style of (await children(supplier.id)).filter(isFolder)) {
      const styleKids = (await children(style.id)).filter(isFolder);
      const complete = styleKids.find((f) => /complete[_ ]?clean/i.test(f.name));
      const colorFolders = complete ? (await children(complete.id)).filter(isFolder) : styleKids;

      for (const color of colorFolders) {
        const kids = await children(color.id);
        const viewFolders = kids.filter(isFolder);
        const base = {
          supplier: { id: supplier.id, title: supplier.name },
          styleFolder: { id: style.id, title: style.name },
          colorFolder: { id: color.id, title: color.name },
        };

        if (viewFolders.length > 0) {
          for (const view of viewFolders) {
            for (const file of (await children(view.id)).filter(isImage)) {
              entries.push({
                ...base,
                viewFolder: { id: view.id, title: view.name },
                file: { id: file.id, title: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime },
              });
            }
          }
        } else {
          for (const file of kids.filter(isImage)) {
            const guess = /back/i.test(file.name) ? "BACK" : /front/i.test(file.name) ? "FRONT" : "";
            if (!classifyView(guess).viewType) continue;
            entries.push({
              ...base,
              viewFolder: { id: color.id, title: guess },
              file: { id: file.id, title: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime },
            });
          }
        }
      }
    }
  }
  return entries;
}

/* -------------------------------------------------------------------- main */

async function main() {
  loadEnv();
  for (const k of ["GOOGLE_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`Missing ${k}. Put it in .env.local — see the header of this file.`);
      process.exit(1);
    }
  }
  const orgId = process.env.AX_ORGANIZATION_ID || ORG_DEFAULT;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("Walking the photography library…");
  const entries = await walk(process.env.AX_PHOTOGRAPHY_FOLDER_ID || ROOT_DEFAULT);
  const cat = buildCatalog(entries);
  const unshot = colorsWithoutImages(cat);

  console.log(`\n── CATALOG ─────────────────────────────────────────`);
  console.log(`  ${cat.blanks.length} blanks`);
  console.log(`  ${cat.colors.length} colourways`);
  console.log(`  ${cat.images.length} images`);
  for (const b of cat.blanks) {
    const colors = cat.colors.filter((c) => c.blank_drive_folder_id === b.drive_folder_id).length;
    const imgs = cat.images.filter((i) => i.blank_drive_folder_id === b.drive_folder_id).length;
    const backs = cat.images.filter(
      (i) => i.blank_drive_folder_id === b.drive_folder_id && i.view_type === "back",
    ).length;
    console.log(
      `    ${(b.style_code ? b.style_code + " " : "").padEnd(10)}${b.name.padEnd(38).slice(0, 38)}` +
        `  ${String(colors).padStart(3)} colours  ${String(imgs).padStart(3)} images (${backs} back)` +
        `  ${b.garment_type ?? "TYPE?"}`,
    );
  }
  if (unshot.length) {
    console.log(`\n  ${unshot.length} colourways have no usable photograph yet:`);
    for (const c of unshot.slice(0, 15)) console.log(`    ${c.display_name}`);
    if (unshot.length > 15) console.log(`    …and ${unshot.length - 15} more`);
  }
  if (cat.skippedViews.length) {
    console.log(`\n  ${cat.skippedViews.length} folders were not a recognisable view and were skipped.`);
  }
  const untyped = cat.blanks.filter((b) => !b.garment_type);
  if (untyped.length) {
    console.log(`\n  ${untyped.length} blanks need a garment type set by hand (placements depend on it):`);
    for (const b of untyped) console.log(`    ${b.name}`);
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing was written. Re-run with --apply.`);
    return;
  }

  console.log(`\n── APPLYING ────────────────────────────────────────`);

  // Blanks. Upserted on drive_folder_id so a renamed folder updates its blank.
  // display_name and garment_type are NOT overwritten once set — those are the
  // hand-refined fields and the sync must never undo a human's naming pass.
  const blankRows = cat.blanks.map((b) => ({
    organization_id: orgId,
    supplier: b.supplier,
    name: b.name,
    style_code: b.style_code,
    drive_folder_id: b.drive_folder_id,
    drive_folder_url: b.drive_folder_url,
    last_drive_sync_at: new Date().toISOString(),
  }));
  const { data: savedBlanks, error: bErr } = await sb
    .from("v2_blanks")
    .upsert(blankRows, { onConflict: "drive_folder_id" })
    .select("id, drive_folder_id, garment_type");
  if (bErr) throw bErr;
  console.log(`  v2_blanks: ${savedBlanks.length}`);

  const blankIdByFolder = new Map(savedBlanks.map((b) => [b.drive_folder_id, b.id]));

  // Seed the inferred garment type only where nobody has set one.
  for (const b of savedBlanks) {
    if (b.garment_type) continue;
    const inferred = cat.blanks.find((x) => x.drive_folder_id === b.drive_folder_id)?.garment_type;
    if (!inferred) continue;
    const { error } = await sb.from("v2_blanks").update({ garment_type: inferred }).eq("id", b.id);
    if (error) throw error;
  }

  const colorRows = cat.colors.map((c) => ({
    blank_id: blankIdByFolder.get(c.blank_drive_folder_id),
    name: c.name,
    display_name: c.display_name,
    drive_folder_id: c.drive_folder_id,
    sort_order: c.sort_order,
  }));
  const { data: savedColors, error: cErr } = await sb
    .from("v2_blank_colors")
    .upsert(colorRows, { onConflict: "blank_id,name" })
    .select("id, blank_id, name");
  if (cErr) throw cErr;
  console.log(`  v2_blank_colors: ${savedColors.length}`);

  const colorIdByKey = new Map();
  for (const c of savedColors) colorIdByKey.set(`${c.blank_id}::${c.name}`, c.id);

  const imageRows = cat.images.map((i) => {
    const blankId = blankIdByFolder.get(i.blank_drive_folder_id);
    const colorName = cat.colors.find((c) => c.key === i.color_key)?.name;
    return {
      blank_id: blankId,
      color_id: colorIdByKey.get(`${blankId}::${colorName}`) ?? null,
      view_type: i.view_type,
      variant: i.variant,
      is_primary: i.is_primary,
      drive_file_id: i.drive_file_id,
      drive_folder_id: i.drive_folder_id,
      drive_url: i.drive_url,
      filename: i.filename,
      mime_type: i.mime_type,
      modified_at: i.modified_at,
    };
  });

  for (let i = 0; i < imageRows.length; i += 200) {
    const chunk = imageRows.slice(i, i + 200);
    const { error } = await sb.from("v2_blank_images").upsert(chunk, { onConflict: "blank_id,drive_file_id" });
    if (error) throw error;
    console.log(`  v2_blank_images: ${Math.min(i + chunk.length, imageRows.length)}/${imageRows.length}`);
  }

  console.log(`\nDone. Cost, price and quantity stay empty until Shopify is connected.`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
