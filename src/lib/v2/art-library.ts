// CLIENT ART LIBRARY — the print PNGs a client's products are made from,
// sorted into Logos / Fronts / Backs, for Placement Studio.
//
// A "set" is a design: its front and back files live on the same design, so
// picking a front can bring its back along automatically. Roles live on
// design_files.metadata.role; files uploaded before roles existed get one
// inferred from their name (…PRINT-FRONT…, …_BACK…, …LOGO…).
//
// Files can be in Supabase storage (uploaded here) or linked from Drive
// (storage_bucket = 'external', storage_path = the Drive download URL,
// metadata.drive_file_id) — the Drive library was loaded that way.
//
// Mockup renders (design_files.file_type = 'mockup') are pictures OF a
// product, not art FOR one, so they never appear here.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";
import { must, t, type Row } from "./db";

export type ArtRole = "logo" | "front" | "back" | "other";
export type ArtTab = "all" | ArtRole;

export const ART_ROLES: Array<{ role: ArtRole; label: string }> = [
  { role: "logo", label: "Logo" },
  { role: "front", label: "Front" },
  { role: "back", label: "Back" },
  { role: "other", label: "Other" },
];

export interface ArtItem {
  fileId: string;
  designId: string;
  designTitle: string;
  role: ArtRole;
  /** True when the role came from the file name, not a tag someone chose. */
  inferred: boolean;
  bucket: string;
  path: string;
  fileName: string;
  createdAt: string | null;
  /** Full-resolution file (signed storage URL, or the Drive download URL). */
  url: string | null;
  /** Small preview for the grid when one exists (Drive thumbnails). */
  thumbUrl?: string | null;
}

/** Role from an explicit tag, else from the file name. */
export function inferRole(fileName: string, tagged?: unknown): { role: ArtRole; inferred: boolean } {
  if (tagged === "logo" || tagged === "front" || tagged === "back" || tagged === "other") return { role: tagged, inferred: false };
  const n = fileName.toUpperCase();
  if (/LOGO|MARK|ICON|MONOGRAM|BADGE/.test(n)) return { role: "logo", inferred: true };
  if (/(^|[^A-Z])BACK([^A-Z]|$)|PRINT-BACK/.test(n)) return { role: "back", inferred: true };
  if (/(^|[^A-Z])FRONT([^A-Z]|$)|PRINT-FRONT|CHEST/.test(n)) return { role: "front", inferred: true };
  return { role: "other", inferred: true };
}

/** The other half of a front/back set: same design, opposite side, newest first. */
export function pairFor(item: Pick<ArtItem, "designId" | "role" | "fileId">, items: ArtItem[]): ArtItem | null {
  const want = item.role === "front" ? "back" : item.role === "back" ? "front" : null;
  if (!want) return null;
  const matches = items
    .filter((i) => i.designId === item.designId && i.role === want && i.fileId !== item.fileId)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return matches[0] ?? null;
}

export function filterArt(items: ArtItem[], tab: ArtTab, query = ""): ArtItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((i) => (tab === "all" || i.role === tab) && (!q || `${i.designTitle} ${i.fileName}`.toLowerCase().includes(q)));
}

export function countByRole(items: ArtItem[]): Record<ArtTab, number> {
  const c: Record<ArtTab, number> = { all: items.length, logo: 0, front: 0, back: 0, other: 0 };
  for (const i of items) c[i.role]++;
  return c;
}

/** Review code for a studio-made product: CLIENT-PRODUCT, uppercase (client = its short slug). */
export function studioCode(client: string, product: string): string {
  const part = (s: string, max: number) => {
    const p = slugify(s).toUpperCase().replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (p.length <= max) return p;
    const cut = p.slice(0, max);
    return cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut;
  };
  return [part(client, 24), part(product, 40)].filter(Boolean).join("-") || "STUDIO";
}

const isImage = (f: Row) => /^image\//.test(String(f.mime_type ?? "")) || /\.(png|jpe?g|webp|svg)$/i.test(String(f.file_name ?? ""));

async function fetchClientArt(athleteId: string): Promise<ArtItem[]> {
  const links = await t("design_athletes").select("design_id").eq("athlete_id", athleteId);
  const ids = [...new Set(((links.data ?? []) as unknown as Row[]).map((r) => String(r.design_id)))];
  if (!ids.length) return [];
  const [designs, files] = await Promise.all([
    t("designs").select("id, title").in("id", ids),
    t("design_files")
      .select("id, design_id, file_type, storage_bucket, storage_path, file_name, mime_type, metadata, created_at")
      .in("design_id", ids),
  ]);
  const titles = new Map(((designs.data ?? []) as unknown as Row[]).map((d) => [String(d.id), String(d.title ?? "Untitled")]));
  // A 'mockup' file only counts once someone has tagged it (e.g. old logo PNGs filed as mockups).
  const tagged = (f: Row) => !!((f.metadata ?? {}) as Record<string, unknown>).role;
  const rows = ((files.data ?? []) as unknown as Row[]).filter((f) => f.storage_bucket && f.storage_path && isImage(f) && (f.file_type !== "mockup" || tagged(f)));

  // Signed URLs in one round trip per bucket (design-files is private).
  const byBucket = new Map<string, string[]>();
  for (const f of rows) if (f.storage_bucket !== "external") byBucket.set(String(f.storage_bucket), [...(byBucket.get(String(f.storage_bucket)) ?? []), String(f.storage_path)]);
  const signed = new Map<string, string>();
  for (const [bucket, paths] of byBucket) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60 * 6);
    for (const s of data ?? []) if (s.signedUrl && s.path) signed.set(`${bucket}/${s.path}`, s.signedUrl);
  }

  return rows
    .map((f) => {
      const meta = (f.metadata ?? {}) as Record<string, unknown>;
      const name = String(f.file_name ?? f.storage_path);
      const { role, inferred } = inferRole(name, meta.role);
      const bucket = String(f.storage_bucket);
      const path = String(f.storage_path);
      return {
        fileId: String(f.id), designId: String(f.design_id), designTitle: titles.get(String(f.design_id)) ?? "Untitled",
        role, inferred, bucket, path, fileName: name, createdAt: (f.created_at as string | null) ?? null,
        // "external" = linked straight from Drive (storage_path is the file's download URL).
        url: bucket === "external" ? path : signed.get(`${bucket}/${path}`) ?? null,
        thumbUrl: typeof meta.drive_file_id === "string" ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(meta.drive_file_id)}&sz=w400` : null,
      } satisfies ArtItem;
    })
    .sort((a, b) => a.designTitle.localeCompare(b.designTitle) || a.role.localeCompare(b.role));
}

export function useClientArt(athleteId: string | null) {
  return useQuery({
    queryKey: ["v2", "client-art", athleteId],
    queryFn: () => fetchClientArt(athleteId!),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
  });
}

/** Upload one PNG into a client's library, tagged, into an existing set or a new one. */
export function useUploadArt(athleteId: string | null, organizationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, role, designId, newTitle }: { file: File; role: ArtRole; designId: string | null; newTitle?: string }) => {
      if (!athleteId || !organizationId) throw new Error("Pick a client first");
      let id = designId;
      let created = false;
      if (!id) {
        const title = (newTitle ?? "").trim() || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") || "Untitled design";
        const { data, error } = await t("designs")
          .insert({ organization_id: organizationId, title, slug: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`, status: "production_ready", primary_athlete_id: athleteId } as never)
          .select("id")
          .single();
        if (error) throw error;
        id = String((data as unknown as Row).id);
        created = true;
      }
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${id}/${role}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("design-files").upload(path, file, { contentType: file.type || "image/png", upsert: false });
      if (up.error) {
        if (created) await t("designs").delete().eq("id", id);
        throw up.error;
      }
      await must(
        t("design_files").insert({
          design_id: id, file_type: "export", storage_bucket: "design-files", storage_path: path, file_name: file.name,
          file_extension: ext, file_size_bytes: file.size, mime_type: file.type || "image/png", is_primary: role === "front" || role === "logo", sort_order: 0,
          metadata: { uploaded_by: "placement-studio", role },
        } as never),
      );
      if (created) await must(t("design_athletes").insert({ design_id: id, athlete_id: athleteId, sort_order: 0 } as never));
      return { designId: id };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "client-art", athleteId] });
      void qc.invalidateQueries({ queryKey: ["v2", "designs"] });
      void qc.invalidateQueries({ queryKey: ["v2", "shelf", athleteId] });
    },
  });
}

/** Re-tag a file (Logo / Front / Back / Other). Keeps the rest of its metadata. */
export function useSetArtRole(athleteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileId, role }: { fileId: string; role: ArtRole }) => {
      const cur = await t("design_files").select("metadata").eq("id", fileId).single();
      if (cur.error) throw cur.error;
      const meta = ((cur.data as unknown as Row).metadata ?? {}) as Record<string, unknown>;
      await must(t("design_files").update({ metadata: { ...meta, role } } as never).eq("id", fileId));
    },
    onMutate: async ({ fileId, role }) => {
      const key = ["v2", "client-art", athleteId];
      const prev = qc.getQueryData<ArtItem[]>(key);
      qc.setQueryData<ArtItem[]>(key, (list) => list?.map((i) => (i.fileId === fileId ? { ...i, role, inferred: false } : i)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["v2", "client-art", athleteId], ctx.prev); },
  });
}

/**
 * Remove a file from a client's library. Uploaded files are deleted from
 * storage too; Drive-linked files only lose the link (the Drive file stays).
 */
export function useDeleteArt(athleteId: string | null) {
  const qc = useQueryClient();
  const key = ["v2", "client-art", athleteId];
  return useMutation({
    mutationFn: async (item: Pick<ArtItem, "fileId" | "bucket" | "path">) => {
      await must(t("design_files").delete().eq("id", item.fileId));
      if (item.bucket !== "external") {
        // Best effort: the library row is what matters; an orphaned object is harmless.
        await supabase.storage.from(item.bucket).remove([item.path]).catch(() => undefined);
      }
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ArtItem[]>(key);
      qc.setQueryData<ArtItem[]>(key, (list) => list?.filter((i) => i.fileId !== item.fileId));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["v2", "designs"] });
    },
  });
}
