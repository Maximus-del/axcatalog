// The Client Desk — AX's side of the portal.
//
// Clients send briefs, messages and drops for review from the portal. This is
// where AX reads and answers them: every call is an operator-only server
// function (portal_ops_*, stage 7) scoped to organisations the operator can
// reach, plus the stage-3 portal_share_concept for posting concepts. Private
// files (inspiration, concepts, attachments) are signed through portal-files,
// which lets operators sign within their reach.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signFiles } from "@/lib/portal/api/studio";
import { newIdempotencyKey } from "@/lib/portal/api/orders";

type Json = Record<string, unknown>;

export type ProjectStatus = "requested" | "in_progress" | "feedback" | "approved" | "archived";

export interface DeskThread {
  id: string;
  athleteId: string;
  clientName: string;
  organizationId: string;
  kind: "project" | "conversation";
  projectKind: string | null;
  title: string;
  projectStatus: ProjectStatus | null;
  closed: boolean;
  waitingOnAx: boolean;
  lastMessageAt: string | null;
  lastMessageRole: string | null;
  lastMessage: string | null;
  conceptCount: number;
}

export interface DeskFile {
  id: string;
  name: string;
  mime: string;
  url: string | null;
}

export interface DeskConcept {
  id: string;
  conceptKey: string;
  version: number;
  title: string | null;
  sharedAt: string;
  superseded: boolean;
  decision: "approve" | "request_changes" | null;
  feedback: string | null;
  url: string | null;
}

export interface DeskMessage {
  id: string;
  body: string;
  fromAx: boolean;
  createdAt: string;
  attachments: DeskFile[];
}

export interface DeskThreadDetail extends DeskThread {
  brief: { idea?: string; vibes?: string[]; details?: string | null } | null;
  destinationId: string | null;
  inspiration: DeskFile[];
  concepts: DeskConcept[];
  messages: DeskMessage[];
}

export interface DeskDrop {
  id: string;
  title: string;
  status: "draft" | "review" | "scheduled" | "live";
  scheduledAt: string | null;
  timeZone: string;
  destinationId: string | null;
  athleteId: string;
  clientName: string;
  reviewNote: string | null;
}

/** Turn a Postgres/PostgREST error into one readable message. */
export function deskError(e: { message?: string; details?: string | null; code?: string } | null): Error {
  if (!e) return new Error("Something went wrong.");
  if (e.code === "42501") return new Error("Your account can't do this.");
  if (e.code === "P0002") return new Error("Not found — it may be in an organisation you can't reach.");
  if (e.details) {
    try {
      const fields = JSON.parse(e.details) as Record<string, string>;
      const first = Object.values(fields)[0];
      if (first) return new Error(first);
    } catch {
      /* not field errors */
    }
  }
  return new Error(e.message ?? "Something went wrong.");
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw deskError(error);
  return data as T;
}

/* ------------------------------------------------------------------ parsing */

export function toThread(r: Json): DeskThread {
  return {
    id: String(r.id),
    athleteId: String(r.athleteId ?? ""),
    clientName: String(r.clientName ?? "Client"),
    organizationId: String(r.organizationId ?? ""),
    kind: r.kind === "project" ? "project" : "conversation",
    projectKind: (r.projectKind as string | null) ?? null,
    title: String(r.title ?? ""),
    projectStatus: (r.projectStatus as ProjectStatus | null) ?? null,
    closed: r.closed === true,
    waitingOnAx: r.waitingOnAx === true,
    lastMessageAt: (r.lastMessageAt as string | null) ?? null,
    lastMessageRole: (r.lastMessageRole as string | null) ?? null,
    lastMessage: (r.lastMessage as string | null) ?? null,
    conceptCount: Number(r.conceptCount ?? 0),
  };
}

const fileOf = (f: Json, urls: Record<string, string | null>): DeskFile => ({
  id: String(f.id),
  name: String(f.name ?? "file"),
  mime: String(f.mime ?? ""),
  url: urls[String(f.id)] ?? null,
});

export function toThreadDetail(r: Json, urls: Record<string, string | null> = {}): DeskThreadDetail {
  return {
    ...toThread(r),
    brief: (r.brief as DeskThreadDetail["brief"]) ?? null,
    destinationId: (r.destinationId as string | null) ?? null,
    inspiration: ((r.inspiration as Json[]) ?? []).map((f) => fileOf(f, urls)),
    concepts: ((r.concepts as Json[]) ?? []).map((c) => ({
      id: String(c.id),
      conceptKey: String(c.conceptKey ?? ""),
      version: Number(c.version ?? 1),
      title: (c.title as string | null) ?? null,
      sharedAt: String(c.sharedAt ?? ""),
      superseded: c.superseded === true,
      decision: (c.decision as DeskConcept["decision"]) ?? null,
      feedback: (c.feedback as string | null) ?? null,
      url: urls[String(c.id)] ?? null,
    })),
    messages: ((r.messages as Json[]) ?? []).map((m) => ({
      id: String(m.id),
      body: String(m.body ?? ""),
      fromAx: m.fromAx === true,
      createdAt: String(m.createdAt ?? ""),
      attachments: ((m.attachments as Json[]) ?? []).map((f) => fileOf(f, urls)),
    })),
  };
}

export function toDrop(r: Json): DeskDrop {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    status: (r.status as DeskDrop["status"]) ?? "draft",
    scheduledAt: (r.scheduledAt as string | null) ?? null,
    timeZone: String(r.timeZone ?? "UTC"),
    destinationId: (r.destinationId as string | null) ?? null,
    athleteId: String(r.athleteId ?? ""),
    clientName: String(r.clientName ?? "Client"),
    reviewNote: (r.reviewNote as string | null) ?? null,
  };
}

/** Which threads a filter shows. Pure, exported for tests. */
export function filterThreads(threads: DeskThread[], filter: "waiting" | "all", q: string): DeskThread[] {
  const needle = q.trim().toLowerCase();
  return threads.filter(
    (t) =>
      (filter === "all" || t.waitingOnAx) &&
      (!needle || `${t.clientName} ${t.title} ${t.lastMessage ?? ""}`.toLowerCase().includes(needle)),
  );
}

/* -------------------------------------------------------------------- hooks */

const KEY = ["v2", "desk"] as const;

export function useDeskThreads(includeClosed = false) {
  return useQuery({
    queryKey: [...KEY, "threads", includeClosed],
    queryFn: async () => {
      const r = await rpc<{ items: Json[] }>("portal_ops_threads", { _include_closed: includeClosed, _limit: 300 });
      return (r.items ?? []).map(toThread);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** How many threads are waiting on AX — the nav badge. */
export function useDeskWaitingCount() {
  const q = useDeskThreads(false);
  return (q.data ?? []).filter((t) => t.waitingOnAx).length;
}

export function useDeskThread(threadId: string | null) {
  return useQuery({
    queryKey: [...KEY, "thread", threadId],
    enabled: Boolean(threadId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const raw = await rpc<Json>("portal_ops_thread", { _thread_id: threadId });
      // Signed URLs expire in 5 minutes; the 30s refetch keeps them fresh.
      const uploads = [
        ...((raw.inspiration as Json[]) ?? []),
        ...((raw.messages as Json[]) ?? []).flatMap((m) => (m.attachments as Json[]) ?? []),
      ].map((f) => ({ kind: "upload" as const, id: String(f.id) }));
      const concepts = ((raw.concepts as Json[]) ?? []).map((c) => ({ kind: "concept" as const, id: String(c.id) }));
      const urls = await signFiles([...uploads, ...concepts]).catch(() => ({}) as Record<string, string | null>);
      return toThreadDetail(raw, urls);
    },
  });
}

function useInvalidateDesk() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: KEY });
}

export function useDeskMarkRead() {
  const done = useInvalidateDesk();
  return useMutation({
    mutationFn: (threadId: string) => rpc<void>("portal_ops_mark_read", { _thread_id: threadId }),
    onSuccess: done,
  });
}

/** Reply as AX. Pass the same key on a retry of the same message. */
export function useDeskReply() {
  const done = useInvalidateDesk();
  return useMutation({
    mutationFn: (input: { threadId: string; body: string; key: string }) =>
      rpc<Json>("portal_ops_reply", { _thread_id: input.threadId, _body: input.body, _idempotency_key: input.key }),
    onSuccess: done,
  });
}

export function useDeskSetClosed() {
  const done = useInvalidateDesk();
  return useMutation({
    mutationFn: (input: { threadId: string; closed: boolean }) =>
      rpc<Json>("portal_ops_set_closed", { _thread_id: input.threadId, _closed: input.closed }),
    onSuccess: done,
  });
}

export const CONCEPT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const CONCEPT_MAX_BYTES = 15 * 1024 * 1024;

/** Friendly pre-check for a concept image. null = fine. */
export function conceptProblem(file: { type: string; size: number }): string | null {
  if (!CONCEPT_TYPES.includes(file.type)) return "Concepts must be PNG, JPG or WebP images.";
  if (file.size > CONCEPT_MAX_BYTES) return "That image is over 15 MB.";
  return null;
}

/**
 * Upload a concept image (to design-previews — never design-files) and share
 * it into the project. Pass replacesConceptId to post a new version of one
 * the client already has.
 */
export function useShareConcept() {
  const done = useInvalidateDesk();
  return useMutation({
    mutationFn: async (input: { projectId: string; file: File; title: string; replacesConceptId?: string | null }) => {
      const problem = conceptProblem(input.file);
      if (problem) throw new Error(problem);
      const ext = input.file.type === "image/png" ? "png" : input.file.type === "image/webp" ? "webp" : "jpg";
      const path = `portal-concepts/${input.projectId}/${newIdempotencyKey()}.${ext}`;
      const up = await supabase.storage.from("design-previews").upload(path, input.file, {
        contentType: input.file.type,
        upsert: false,
      });
      if (up.error) throw new Error(up.error.message);
      return rpc<Json>("portal_share_concept", {
        _project_id: input.projectId,
        _storage_bucket: "design-previews",
        _storage_path: path,
        _title: input.title.trim() || null,
        _replaces_concept_id: input.replacesConceptId ?? null,
      });
    },
    onSuccess: done,
  });
}

export function useDeskDrops(pendingOnly = false) {
  return useQuery({
    queryKey: [...KEY, "drops", pendingOnly],
    queryFn: async () => ((await rpc<{ items: Json[] }>("portal_ops_drops", { _pending_only: pendingOnly })).items ?? []).map(toDrop),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useDeskUpdateDrop() {
  const done = useInvalidateDesk();
  return useMutation({
    mutationFn: (input: {
      dropId: string;
      action: "schedule" | "return" | "live" | "unschedule";
      scheduledLocal?: string | null;
      timeZone?: string | null;
      note?: string | null;
    }) =>
      rpc<Json>("portal_ops_update_drop", {
        _drop_id: input.dropId,
        _action: input.action,
        _scheduled_local: input.scheduledLocal ?? null,
        _time_zone: input.timeZone ?? null,
        _note: input.note ?? null,
      }),
    onSuccess: done,
  });
}

/** ISO instant → "YYYY-MM-DDTHH:mm" wall clock in a zone, for a datetime-local input. */
export function toLocalInput(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  requested: "New brief",
  in_progress: "In progress",
  feedback: "Waiting on client",
  approved: "Approved",
  archived: "Archived",
};
