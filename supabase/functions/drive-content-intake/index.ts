// Drive 06 (CONTENT ASSETS) -> the content review queue in AX OS.
//
// POST { root_folder_id?: string, dry_run?: boolean }
//
// Walks the 06 folder, reads the newest AX-SOCIAL-ASSET-INDEX_vNN.json for
// names and categories, and adds every picture or video it has not seen
// before as a PENDING draft for review. Who it is for comes from the top
// folder (see _shared/content-intake.ts). Never changes or removes a row that
// is already there: a reviewed picture stays reviewed.
//
// Who may run it: an AX operator (their session), or the hourly schedule,
// which sends x-intake-key = CONTENT_INTAKE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { driveToken, listFolder, readServiceAccount, type DriveListFile } from "../_shared/google-drive.ts";
import { ARCHIVE_FOLDER, INDEX_FILE, isMedia, newestIndex, planRow, type IndexAsset, type IntakeFile, type Owner } from "../_shared/content-intake.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intake-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROOT_06 = "1VvaNbKBAGxLAXcGAI9_g0OMN-iuzZU7Q";
const AX_ORG = "2d6f377e-4fe8-448b-84b3-42aed237f3da";
const FOLDER = "application/vnd.google-apps.folder";
const MAX_FILES = 3000;
const MAX_DEPTH = 7;

async function readIndex(token: string, fileId: string): Promise<Map<string, IndexAsset>> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Could not read the content index (${res.status})`);
  const body = await res.json() as { assets?: IndexAsset[] };
  return new Map((body.assets ?? []).filter((a) => a.drive_file_id).map((a) => [a.drive_file_id, a]));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const key = req.headers.get("x-intake-key");
  const expected = Deno.env.get("CONTENT_INTAKE_KEY");
  if (!(key && expected && key === expected)) {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first" }, 401);
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: ok, error } = await asUser.rpc("current_user_is_operator");
    if (error || ok !== true) return json({ error: "AX team only" }, 403);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const root = typeof body.root_folder_id === "string" ? body.root_folder_id : ROOT_06;
  const dryRun = body.dry_run === true;

  const sa = readServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (!sa) return json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON is not set" }, 500);

  try {
    const token = await driveToken(sa);

    // Clients and the Drive folder names that mean them.
    const { data: athletes, error: aErr } = await admin.from("athletes").select("id, display_name, organization_id, metadata");
    if (aErr) throw aErr;
    const owners: Owner[] = (athletes ?? []).map((a) => {
      const extra = (a.metadata as Record<string, unknown> | null)?.content_folders;
      return { athleteId: a.id as string, folders: [String(a.display_name ?? ""), ...(Array.isArray(extra) ? extra.map(String) : [])].filter(Boolean) };
    });
    const orgOf = new Map((athletes ?? []).map((a) => [a.id as string, a.organization_id as string]));

    // Walk the tree.
    const rootFiles = await listFolder(token, root);
    const indexFile = newestIndex(rootFiles.filter((f) => INDEX_FILE.test(f.name)));
    const index = indexFile ? await readIndex(token, indexFile.id) : new Map<string, IndexAsset>();

    const files: IntakeFile[] = [];
    const unreadable: string[] = [];
    const walk = async (items: DriveListFile[], path: string[]) => {
      for (const f of items) {
        if (files.length >= MAX_FILES) return;
        if (f.mimeType === FOLDER) {
          if (ARCHIVE_FOLDER.test(f.name) || path.length >= MAX_DEPTH) continue;
          try {
            await walk(await listFolder(token, f.id), [...path, f.name]);
          } catch {
            unreadable.push([...path, f.name].join(" / "));
          }
        } else if (path.length > 0 && isMedia(f.mimeType)) {
          files.push({ id: f.id, name: f.name, mimeType: f.mimeType, path });
        }
      }
    };
    await walk(rootFiles, []);

    const { data: existing, error: eErr } = await admin.from("content_assets").select("source_key").not("source_key", "is", null);
    if (eErr) throw eErr;
    const seen = new Set((existing ?? []).map((r) => r.source_key as string));

    const rows = files
      .map((f) => planRow(f, owners, index))
      .filter((r): r is NonNullable<typeof r> => r !== null && !seen.has(r.sourceKey));

    const byBin: Record<string, number> = {};
    for (const r of rows) {
      const name = r.athleteId ? (athletes ?? []).find((a) => a.id === r.athleteId)?.display_name ?? "client" : `AX · ${r.bucket}`;
      byBin[String(name)] = (byBin[String(name)] ?? 0) + 1;
    }

    if (!dryRun && rows.length) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin.from("content_assets").insert(rows.slice(i, i + 200).map((r) => ({
          organization_id: r.athleteId ? orgOf.get(r.athleteId) ?? AX_ORG : AX_ORG,
          athlete_id: r.athleteId,
          type: r.type,
          title: r.title.slice(0, 200),
          body: r.body,
          hero_url: r.heroUrl,
          media: [r.media],
          category: r.category,
          content_format: r.format,
          visibility: "access",
          status: "draft",
          content_purpose: r.athleteId ? "marketing" : "internal",
          review_state: "pending",
          source_key: r.sourceKey,
        })));
        if (error) throw error;
      }
    }

    return json({ scanned: files.length, added: dryRun ? 0 : rows.length, would_add: rows.length, by_bin: byBin, index: indexFile?.name ?? null, unreadable, dry_run: dryRun });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return json({ error: msg }, 502);
  }
});
