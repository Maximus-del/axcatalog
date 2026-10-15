// portal-files — private uploads and short-lived downloads for the client portal.
//
// The browser never gets a storage credential and never names a bucket path.
// Every action first asks the database AS THE CALLER whether this is allowed
// (portal_begin_upload / portal_authorize_file apply the same scope rules as
// the rest of the portal), and only then uses the service key to mint a URL.
//
//   begin_upload    {athleteId, purpose, name, mime, size, projectId?}
//                   → {uploadId, path, signedUrl, token, expiresAt}
//                   The client PUTs the file to signedUrl (or uses
//                   storage.uploadToSignedUrl(path, token, file)).
//   complete_upload {uploadId}
//                   Reads the stored object, checks its REAL size and leading
//                   bytes (not the browser's MIME claim), then finalizes or
//                   rejects it. Not uploaded yet → 409, safe to retry.
//   sign            {kind: 'upload'|'concept', id} → {url, expiresAt}
//   sign_many       {items: [{kind, id}]} (≤ 50) → {urls: {id: {url, expiresAt} | null}}
//
// Signed download URLs live 5 minutes. Re-request rather than store them.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sniffMime } from "./sniff.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DOWNLOAD_TTL_SECONDS = 300;
const UPLOAD_TTL_SECONDS = 7200; // Supabase signed upload URLs last 2 hours

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function fail(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
  return json({ code, message, requestId: crypto.randomUUID(), ...(fieldErrors ? { fieldErrors } : {}) }, status);
}

/** Postgres/PostgREST error → contract ApiError + status. */
function fromDb(err: { code?: string; message?: string; details?: string | null }) {
  const map: Record<string, number> = { "28000": 401, "42501": 403, P0002: 404, P0409: 409, P0422: 422, "22023": 422, P0429: 429 };
  const status = map[err.code ?? ""] ?? 500;
  let fieldErrors: Record<string, string> | undefined;
  if (status === 422 && err.details) {
    try {
      fieldErrors = JSON.parse(err.details);
    } catch { /* plain text */ }
  }
  return fail(status, err.code ?? "unknown", status === 404 ? "Not found." : err.message ?? "Request failed", fieldErrors);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "method", "POST only");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return fail(401, "28000", "Please sign in again.");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: who, error: whoErr } = await asCaller.auth.getUser();
  if (whoErr || !who?.user) return fail(401, "28000", "Please sign in again.");
  const userId = who.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(422, "P0422", "Invalid JSON");
  }

  try {
    switch (body.action) {
      case "begin_upload": {
        const { data, error } = await asCaller.rpc("portal_begin_upload", {
          _athlete_id: body.athleteId,
          _purpose: body.purpose,
          _name: body.name,
          _mime: body.mime,
          _size: body.size,
          _project_id: body.projectId ?? null,
        });
        if (error) return fromDb(error);
        const r = data as { uploadId: string; bucket: string; path: string };
        const { data: signed, error: sErr } = await admin.storage.from(r.bucket).createSignedUploadUrl(r.path);
        if (sErr || !signed) return fail(500, "storage", "Could not prepare the upload.");
        return json({
          uploadId: r.uploadId,
          path: r.path,
          signedUrl: signed.signedUrl,
          token: signed.token,
          expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
        });
      }

      case "complete_upload": {
        const uploadId = String(body.uploadId ?? "");
        // Service read, then ownership check against the verified session user.
        const { data: row, error } = await admin
          .from("portal_uploads")
          .select("id, bucket, path, uploaded_by, status, declared_mime, declared_size")
          .eq("id", uploadId)
          .maybeSingle();
        if (error) return fail(500, "db", "Could not read the upload.");
        if (!row || row.uploaded_by !== userId) return fail(404, "P0002", "Not found.");
        if (row.status === "finalized") return json({ uploadId, status: "finalized", replayed: true });
        if (row.status === "rejected") return fail(422, "P0422", "This upload was rejected. Upload the file again.");

        const { data: blob, error: dErr } = await admin.storage.from(row.bucket).download(row.path);
        if (dErr || !blob) {
          // Not there yet (still uploading, or the PUT failed). Nothing is
          // marked, so the client can finish the PUT and call this again.
          return fail(409, "not_uploaded", "The file hasn't finished uploading. Try again in a moment.");
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const mime = sniffMime(bytes.slice(0, 16));
        const { data: fin, error: fErr } = await admin.rpc("portal_finalize_upload", {
          _upload_id: uploadId,
          _user_id: userId,
          _verified_mime: mime ?? "application/octet-stream",
          _verified_size: bytes.byteLength,
        });
        if (fErr) return fromDb(fErr);
        const out = fin as { status: string; reason?: string };
        if (out.status === "rejected") {
          // Don't keep bytes we refused.
          await admin.storage.from(row.bucket).remove([row.path]);
          return fail(422, "P0422", "That file isn't what it says it is. Upload a PNG, JPEG, WebP, GIF, HEIC or PDF.", { file: out.reason ?? "rejected" });
        }
        return json(fin);
      }

      case "sign":
      case "sign_many": {
        const items = (body.action === "sign" ? [{ kind: body.kind, id: body.id }] : (body.items as unknown[]) ?? []) as {
          kind: string;
          id: string;
        }[];
        if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
          return fail(422, "P0422", "1–50 items", { items: "1–50 items" });
        }
        const urls: Record<string, { url: string; expiresAt: string } | null> = {};
        for (const it of items) {
          const { data, error } = await asCaller.rpc("portal_authorize_file", { _kind: it.kind, _id: it.id });
          const f = !error && Array.isArray(data) ? (data[0] as { bucket: string; path: string } | undefined) : undefined;
          if (!f || f.bucket === "design-files") {
            urls[it.id] = null; // not found and not allowed look the same
            continue;
          }
          const { data: s } = await admin.storage.from(f.bucket).createSignedUrl(f.path, DOWNLOAD_TTL_SECONDS);
          urls[it.id] = s?.signedUrl
            ? { url: s.signedUrl, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString() }
            : null;
        }
        if (body.action === "sign") {
          const one = urls[String(body.id)];
          return one ? json(one) : fail(404, "P0002", "Not found.");
        }
        return json({ urls });
      }

      default:
        return fail(422, "P0422", "Unknown action", { action: "begin_upload, complete_upload, sign or sign_many" });
    }
  } catch (e) {
    return fail(500, "unexpected", String((e as Error)?.message ?? e));
  }
});
