// Index Folder 03 — the approved clean mockups — into public.blank_images.
//
// POST { organization_id?: string, root_folder_id?: string, dry_run?: boolean }
//
// Reads Google Drive with a service account, walks
//
//     MANUFACTURER / PRODUCT / COLOR / VIEW / file
//
// and reconciles what it finds against what is stored. Three rules govern the
// whole thing, and each exists because the alternative is silently wrong:
//
//   Identity is the Drive file id, never the filename. Renaming a file in
//   Drive must be an UPDATE, not a delete-and-insert, or every mapping that
//   referenced it dies for a cosmetic change.
//
//   A file that has gone is marked missing, not deleted. A product then shows
//   "image missing" rather than quietly falling back to another colour's photo.
//
//   Nothing here ever writes to Shopify, or to a quantity, or to a barcode.
//   This function's only job is pictures.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
// Shared with the browser bundle so the indexer and the UI cannot disagree
// about what a folder name means. Covered by src/lib/ecosystem/drive-naming.test.ts.
import {
  normalizeColor, viewFromFilename, viewTypeOf,
} from "../_shared/drive-naming.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DEFAULT_ROOT = "1wv-QAIJMY4_ONVdTbTMoHtZJwWoIEyx0"; // 03_APPROVED — CLEAN MOCKUPS
const FOLDER_MIME = "application/vnd.google-apps.folder";

// ---- Google auth: service account JWT -> access token ----------------------

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    // Read-only on purpose. The indexer must not be able to modify Drive even
    // if something later asks it to.
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`),
  ));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${body.error_description ?? body.error ?? res.status}`);
  return body.access_token as string;
}

// ---- Drive listing --------------------------------------------------------

type DriveFile = {
  id: string; name: string; mimeType: string; modifiedTime?: string;
};

async function listChildren(token: string, parentId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Drive list failed: ${body.error?.message ?? res.status}`);
    out.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

const isFolder = (f: DriveFile) => f.mimeType === FOLDER_MIME;
const isImage = (f: DriveFile) => f.mimeType?.startsWith("image/");

type IndexedImage = {
  manufacturer: string;
  productFolder: string;
  productFolderId: string;
  color: string;
  normalizedColor: string;
  viewType: string;
  fileId: string;
  filename: string;
  mimeType: string;
  driveUrl: string;
  modifiedAt: string | null;
};

/**
 * Walk the four levels below the root.
 *
 * Images sitting directly in a colour folder are accepted too — the view is
 * then read from the filename. Several real product folders are shaped that
 * way, and refusing them would silently drop working photography.
 */
async function scan(token: string, rootId: string): Promise<{ images: IndexedImage[]; skipped: string[] }> {
  const images: IndexedImage[] = [];
  const skipped: string[] = [];

  for (const maker of (await listChildren(token, rootId)).filter(isFolder)) {
    for (const product of (await listChildren(token, maker.id)).filter(isFolder)) {
      for (const color of (await listChildren(token, product.id)).filter(isFolder)) {
        const inColor = await listChildren(token, color.id);

        const push = (f: DriveFile, view: string) => images.push({
          manufacturer: maker.name,
          productFolder: product.name,
          productFolderId: product.id,
          color: color.name,
          normalizedColor: normalizeColor(color.name),
          viewType: view,
          fileId: f.id,
          filename: f.name,
          mimeType: f.mimeType,
          driveUrl: `https://drive.google.com/file/d/${f.id}/view`,
          modifiedAt: f.modifiedTime ?? null,
        });

        for (const viewFolder of inColor.filter(isFolder)) {
          const view = viewTypeOf(viewFolder.name);
          if (!view) {
            skipped.push(`${maker.name}/${product.name}/${color.name}/${viewFolder.name} — unrecognised view`);
            continue;
          }
          for (const file of (await listChildren(token, viewFolder.id)).filter(isImage)) push(file, view);
        }

        for (const loose of inColor.filter(isImage)) {
          const view = viewTypeOf(loose.name) ?? viewFromFilename(loose.name);
          if (!view) { skipped.push(`${color.name}/${loose.name} — no view in name`); continue; }
          push(loose, view);
        }
      }
    }
  }
  return { images, skipped };
}

// ---- Handler --------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!raw) {
      return jsonRes({
        error: "GOOGLE_SERVICE_ACCOUNT_JSON is not set",
        hint: "Add the service account JSON as a Supabase secret, and share Folder 03 with its client_email as Viewer.",
      }, 400);
    }
    const sa = JSON.parse(raw) as { client_email: string; private_key: string };

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rootId = (body.root_folder_id as string) ?? DEFAULT_ROOT;
    const dryRun = body.dry_run === true;

    const token = await accessToken(sa);
    const { images, skipped } = await scan(token, rootId);

    if (dryRun) {
      return jsonRes({
        dry_run: true,
        images: images.length,
        manufacturers: [...new Set(images.map((i) => i.manufacturer))],
        products: [...new Set(images.map((i) => i.productFolder))].length,
        skipped,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Only blanks already mapped to a Drive folder are written. Matching a
    // folder to a blank is a separate, human-confirmable step — this function
    // indexes, it does not decide what belongs to what.
    const { data: blanks, error: blankErr } = await supabase
      .from("blanks")
      .select("id, drive_product_folder_id")
      .not("drive_product_folder_id", "is", null);
    if (blankErr) throw blankErr;

    const blankByFolder = new Map<string, string>();
    for (const b of blanks ?? []) blankByFolder.set(b.drive_product_folder_id as string, b.id as string);

    const rows = images
      .filter((i) => blankByFolder.has(i.productFolderId))
      .map((i) => ({
        blank_id: blankByFolder.get(i.productFolderId)!,
        color: i.color,
        normalized_color: i.normalizedColor,
        view_type: i.viewType,
        drive_file_id: i.fileId,
        drive_folder_id: i.productFolderId,
        filename: i.filename,
        mime_type: i.mimeType,
        drive_url: i.driveUrl,
        modified_at: i.modifiedAt,
        missing: false,
        updated_at: new Date().toISOString(),
      }));

    // Upsert on (blank_id, drive_file_id): a renamed file updates in place and
    // keeps its row, which is the whole point of keying on the Drive id.
    let written = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase
        .from("blank_images")
        .upsert(chunk, { onConflict: "blank_id,drive_file_id" });
      if (error) throw error;
      written += chunk.length;
    }

    // Anything stored for a mapped blank that this scan did not see is marked
    // missing — never deleted.
    const seenIds = new Set(rows.map((r) => r.drive_file_id));
    const mappedBlankIds = [...new Set(rows.map((r) => r.blank_id))];
    let markedMissing = 0;
    if (mappedBlankIds.length > 0) {
      const { data: stored } = await supabase
        .from("blank_images")
        .select("id, drive_file_id")
        .in("blank_id", mappedBlankIds)
        .eq("missing", false);
      const gone = (stored ?? []).filter((s) => !seenIds.has(s.drive_file_id as string));
      if (gone.length > 0) {
        const { error } = await supabase
          .from("blank_images")
          .update({ missing: true, updated_at: new Date().toISOString() })
          .in("id", gone.map((g) => g.id));
        if (error) throw error;
        markedMissing = gone.length;
      }
    }

    if (mappedBlankIds.length > 0) {
      await supabase
        .from("blanks")
        .update({ last_drive_sync_at: new Date().toISOString() })
        .in("id", mappedBlankIds);
    }

    return jsonRes({
      indexed: images.length,
      written,
      marked_missing: markedMissing,
      unmapped_folders: [...new Set(
        images.filter((i) => !blankByFolder.has(i.productFolderId)).map((i) => i.productFolder),
      )],
      skipped,
    });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : "Index failed" }, 500);
  }
});
