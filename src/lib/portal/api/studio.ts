// Creative Studio + messages + uploads + downloads + product approval.
//
//   GET  /projects                portal_list_projects
//   POST /projects                portal_create_project      (idempotent)
//   GET  /projects/:id            portal_get_project
//   POST /projects/:id/decision   portal_decide_concept      (exact version; 409 when stale)
//   GET  /messages?projectId=     portal_list_messages        (omit for the general AX Team thread)
//   POST /messages                portal_post_message        (idempotent)
//   POST /uploads + /complete     portal-files edge function  (begin_upload / complete_upload)
//   POST /assets/:id/download     portal-files edge function  (sign / sign_many) — 5-minute URLs
//   (product approval)            portal_decide_product      (replaces the broken direct update)
//
// Concept images and attachments are private: their URLs are signed per
// request and expire in five minutes. Re-fetch rather than cache them.

import { supabase } from "@/integrations/supabase/client";
import type { Message, Page, PortalScope, Project } from "./contract";
import { PortalApiError } from "./contract";
import { toApiError } from "./money";

type Json = Record<string, unknown>;

export type ProjectKind = "new_merch" | "game_day" | "football_camp" | "personal_brand" | "collection" | "other";

export interface ProjectDetail extends Project {
  kind: ProjectKind | null;
  brief: { idea?: string; vibes?: string[]; details?: string | null } | null;
  unread: boolean;
  concepts: (Project["concepts"][number] & { title: string | null; conceptKey: string; decision: "approve" | "request_changes" | null })[];
  decisions?: { conceptId: string; conceptVersion: number; decision: string; feedback: string | null; decidedAt: string }[];
}

function rpcError(err: { code?: string; message?: string; details?: string | null }): PortalApiError {
  return toApiError(err);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw rpcError(error);
  return data as T;
}

/** The portal-files edge function, with its ApiError surfaced as a PortalApiError. */
async function files<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-files", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let parsed: Json | null = null;
    if (ctx && typeof ctx.json === "function") parsed = (await ctx.json().catch(() => null)) as Json | null;
    const status = ctx?.status ?? 500;
    throw new PortalApiError(
      {
        code: String(parsed?.code ?? "unknown"),
        message: String(parsed?.message ?? error.message),
        requestId: String(parsed?.requestId ?? "edge"),
        ...(parsed?.fieldErrors ? { fieldErrors: parsed.fieldErrors as Record<string, string> } : {}),
      },
      status,
    );
  }
  return data as T;
}

/** Sign many private files at once. Missing or not-allowed ids come back null. */
export async function signFiles(items: { kind: "upload" | "concept"; id: string }[]): Promise<Record<string, string | null>> {
  if (items.length === 0) return {};
  const out: Record<string, string | null> = {};
  for (let i = 0; i < items.length; i += 50) {
    const r = await files<{ urls: Record<string, { url: string } | null> }>({ action: "sign_many", items: items.slice(i, i + 50) });
    for (const [id, v] of Object.entries(r.urls ?? {})) out[id] = v?.url ?? null;
  }
  return out;
}

/** POST /assets/:id/download — one fresh 5-minute URL. */
export async function downloadUrl(kind: "upload" | "concept", id: string): Promise<{ url: string; expiresAt: string }> {
  return files<{ url: string; expiresAt: string }>({ action: "sign", kind, id });
}

/** Pure: server project JSON (+ signed concept URLs) → contract shape. Exported for tests. */
export function toProject(raw: Json, conceptUrls: Record<string, string | null> = {}): ProjectDetail {
  const status = String(raw.status) as Project["status"];
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    destinationId: (raw.destinationId as string | null) ?? null,
    status,
    version: Number(raw.version ?? 1),
    updatedAt: String(raw.updatedAt ?? ""),
    kind: (raw.kind as ProjectKind | null) ?? null,
    brief: (raw.brief as ProjectDetail["brief"]) ?? null,
    unread: raw.unread === true,
    concepts: ((Array.isArray(raw.concepts) ? raw.concepts : []) as Json[]).map((c) => ({
      id: String(c.id),
      conceptKey: String(c.conceptKey),
      version: Number(c.version ?? 1),
      title: (c.title as string | null) ?? null,
      decision: (c.decision as "approve" | "request_changes" | null) ?? null,
      // Contract says string; an unsignable image is "" so the UI shows its placeholder.
      imageUrl: conceptUrls[String(c.id)] ?? "",
    })),
    ...(Array.isArray(raw.decisions) ? { decisions: raw.decisions as ProjectDetail["decisions"] } : {}),
  };
}

async function withConceptUrls(rows: Json[]): Promise<ProjectDetail[]> {
  const ids = rows.flatMap((r) => ((r.concepts as Json[] | undefined) ?? []).map((c) => ({ kind: "concept" as const, id: String(c.id) })));
  const urls = await signFiles(ids).catch(() => ({}) as Record<string, string | null>);
  return rows.map((r) => toProject(r, urls));
}

export async function listProjects(scope: PortalScope, opts: { cursor?: string | null; limit?: number; status?: Project["status"] } = {}): Promise<Page<ProjectDetail>> {
  const r = await rpc<{ items: Json[]; nextCursor: string | null }>("portal_list_projects", {
    _athlete_id: scope.athleteId,
    _cursor: opts.cursor ?? null,
    _limit: opts.limit ?? 24,
    _status: opts.status ?? null,
  });
  return { items: await withConceptUrls(r.items ?? []), nextCursor: r.nextCursor ?? null };
}

export async function getProject(scope: PortalScope, projectId: string): Promise<ProjectDetail> {
  const r = await rpc<Json>("portal_get_project", { _athlete_id: scope.athleteId, _project_id: projectId });
  return (await withConceptUrls([r]))[0];
}

export interface NewProjectInput {
  idempotencyKey: string;
  title: string;
  kind: ProjectKind;
  idea: string;
  vibes?: string[];
  details?: string | null;
  destinationId?: string | null;
  /** Upload ids from uploadFile(…, "inspiration"), already finished. */
  inspirationIds?: string[];
}

export async function createProject(scope: PortalScope, input: NewProjectInput): Promise<ProjectDetail> {
  const r = await rpc<Json>("portal_create_project", {
    _athlete_id: scope.athleteId,
    _idempotency_key: input.idempotencyKey,
    _title: input.title,
    _kind: input.kind,
    _idea: input.idea,
    _vibes: input.vibes ?? [],
    _details: input.details ?? null,
    _destination_id: input.destinationId ?? null,
    _inspiration_upload_ids: input.inspirationIds ?? [],
  });
  return toProject(r);
}

/**
 * Approve or request changes on the EXACT concept version the person looked
 * at. Pass the project's `version` as it was on screen; if anything changed
 * since (a newer concept, another decision) this throws 409 — reload and show
 * the latest rather than retrying blindly.
 */
export async function decideConcept(
  scope: PortalScope,
  input: { projectId: string; conceptId: string; conceptVersion: number; expectedProjectVersion: number; decision: "approve" | "request_changes"; feedback?: string | null },
): Promise<ProjectDetail> {
  const r = await rpc<Json>("portal_decide_concept", {
    _athlete_id: scope.athleteId,
    _project_id: input.projectId,
    _concept_id: input.conceptId,
    _concept_version: input.conceptVersion,
    _expected_project_version: input.expectedProjectVersion,
    _decision: input.decision,
    _feedback: input.feedback ?? null,
  });
  return (await withConceptUrls([r]))[0];
}

export async function listMessages(
  scope: PortalScope,
  opts: { projectId?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<Page<Message & { mine: boolean }>> {
  const r = await rpc<{ items: Json[]; nextCursor: string | null }>("portal_list_messages", {
    _athlete_id: scope.athleteId,
    _project_id: opts.projectId ?? null,
    _cursor: opts.cursor ?? null,
    _limit: opts.limit ?? 50,
  });
  const atts = (r.items ?? []).flatMap((m) => ((m.attachments as Json[]) ?? []).map((a) => ({ kind: "upload" as const, id: String(a.id) })));
  const urls = await signFiles(atts).catch(() => ({}) as Record<string, string | null>);
  return {
    items: (r.items ?? []).map((m) => ({
      id: String(m.id),
      projectId: (m.projectId as string | null) ?? null,
      body: String(m.body ?? ""),
      authorLabel: String(m.authorLabel ?? ""),
      createdAt: String(m.createdAt),
      mine: m.mine === true,
      attachments: ((m.attachments as Json[]) ?? []).map((a) => ({
        id: String(a.id),
        name: String(a.name ?? "file"),
        downloadUrl: urls[String(a.id)] ?? "",
      })),
    })),
    nextCursor: r.nextCursor ?? null,
  };
}

export async function postMessage(
  scope: PortalScope,
  input: { projectId: string | null; body: string; attachmentIds?: string[]; idempotencyKey?: string },
): Promise<{ id: string; createdAt: string; replayed: boolean }> {
  const r = await rpc<Json>("portal_post_message", {
    _athlete_id: scope.athleteId,
    _project_id: input.projectId,
    _body: input.body,
    _attachment_ids: input.attachmentIds ?? [],
    _idempotency_key: input.idempotencyKey ?? null,
  });
  return { id: String(r.id), createdAt: String(r.createdAt), replayed: r.replayed === true };
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "application/pdf"];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Client-side pre-check for a friendly message. The server checks again, on the real bytes. */
export function uploadProblem(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "Use a PNG, JPEG, WebP, GIF, HEIC or PDF.";
  if (file.size > MAX_UPLOAD_BYTES) return "Files can be up to 10 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload a file privately. Begin → PUT to a signed URL → complete (server
 * inspects the stored bytes). A failed PUT or a slow one is retried; an upload
 * the server rejects never becomes visible. Returns the upload id to attach to
 * a project or message.
 */
export async function uploadFile(
  scope: PortalScope,
  file: File,
  purpose: "inspiration" | "attachment",
  projectId: string | null = null,
): Promise<{ uploadId: string; name: string }> {
  const problem = uploadProblem(file);
  if (problem) throw new PortalApiError({ code: "P0422", message: problem, requestId: "local", fieldErrors: { file: problem } }, 422);

  const begun = await files<{ uploadId: string; path: string; token: string }>({
    action: "begin_upload",
    athleteId: scope.athleteId,
    purpose,
    name: file.name,
    mime: file.type,
    size: file.size,
    projectId,
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.storage.from("portal-uploads").uploadToSignedUrl(begun.path, begun.token, file, { contentType: file.type });
    if (!error) {
      lastError = null;
      break;
    }
    lastError = error;
    await sleep(500 * 2 ** attempt);
  }
  if (lastError) throw new PortalApiError({ code: "upload_failed", message: "The upload didn't go through. Try again.", requestId: "local" }, 503);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await files({ action: "complete_upload", uploadId: begun.uploadId });
      return { uploadId: begun.uploadId, name: file.name };
    } catch (e) {
      // 409 = the object is not visible yet; anything else is final.
      if (!(e instanceof PortalApiError) || e.status !== 409 || attempt === 3) throw e;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw new PortalApiError({ code: "upload_failed", message: "The upload didn't finish. Try again.", requestId: "local" }, 503);
}

/** Approve or reject a product AX sent for approval (replaces the direct update that RLS now refuses). */
export async function decideProduct(
  scope: PortalScope,
  input: { productId: string; decision: "approve" | "reject"; note?: string | null; expectedUpdatedAt?: string | null },
): Promise<{ productId: string; approvalState: "approved" | "rejected" }> {
  return rpc("portal_decide_product", {
    _athlete_id: scope.athleteId,
    _product_id: input.productId,
    _decision: input.decision,
    _note: input.note ?? null,
    _expected_updated_at: input.expectedUpdatedAt ?? null,
  });
}
