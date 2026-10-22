// Content review — Chase checks every piece once before a client sees it.
//
//   ✓ approve  -> live on the assigned client's Content & Drops
//   ✎ fix      -> back to production with a note (required) on what to change
//   ✕ archive  -> never shown; reason optional
//
// One picture at a time; every decision moves to the next. Pieces arrive from
// Drive 06 already assigned (drive-content-intake) and can be reassigned here.
// Server side: ax_content_review / ax_content_assign
// (supabase/proposed/20261021_content_review_queue.sql, applied).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReviewState = "pending" | "approved" | "needs_fix" | "archived";
export type Decision = "approve" | "fix" | "archive" | "pending";

export interface ReviewItem {
  id: string;
  title: string;
  imageUrl: string | null;
  type: "photo" | "video";
  category: string | null;
  format: string | null;
  athleteId: string | null;
  state: ReviewState;
  note: string | null;
  reviewedAt: string | null;
  folder: string | null;
  fileName: string | null;
  driveFileId: string | null;
  createdAt: string;
}

/** Quick notes for "needs fix" — the placement problems Chase looks for. */
export const FIX_CHIPS = [
  "Logo placement",
  "Print too big",
  "Print too small",
  "Wrong colour",
  "Text / typo",
  "Crop / framing",
  "Lighting",
  "Garment looks off",
] as const;

export const ARCHIVE_CHIPS = ["Duplicate", "Off brand", "Low quality", "Old version"] as const;

/** Keyboard: A approve, F fix, X archive, Z undo, S / → skip, ← back. */
export function keyAction(key: string): "approve" | "fix" | "archive" | "undo" | "next" | "prev" | null {
  switch (key.toLowerCase()) {
    case "a": return "approve";
    case "f": return "fix";
    case "x": return "archive";
    case "z": return "undo";
    case "s":
    case "arrowright": return "next";
    case "arrowleft": return "prev";
    default: return null;
  }
}

/** Add a chip to a note once, comma-separated: "Logo placement" + "Crop / framing" -> "Logo placement, Crop / framing". */
export function addChip(note: string, chip: string): string {
  const parts = note.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === chip.toLowerCase())) return note;
  return [...parts, chip].join(", ");
}

/** The bin a piece sits in, for the filter: a client id, or an AX-side bin. */
export function binOf(item: Pick<ReviewItem, "athleteId" | "category">): string {
  if (item.athleteId) return item.athleteId;
  if (item.category === "website") return "ax:website";
  if (item.category === "world-tour") return "ax:world-tour";
  return "ax";
}

export function binLabel(bin: string, names: Map<string, string>): string {
  if (bin === "ax:website") return "AX · Website";
  if (bin === "ax:world-tour") return "AX · World Tour";
  if (bin === "ax") return "AX";
  return names.get(bin) ?? "Client";
}

/** Where to stand after the current piece leaves the list: same slot, or the last one. */
export function indexAfterRemoval(index: number, lengthAfter: number): number {
  if (lengthAfter <= 0) return 0;
  return Math.min(index, lengthAfter - 1);
}

type Row = Record<string, unknown>;

export function toReviewItem(r: Row): ReviewItem {
  const media = Array.isArray(r.media) ? (r.media[0] as Row | undefined) : undefined;
  return {
    id: String(r.id),
    title: String(r.title ?? "Untitled"),
    imageUrl: (r.hero_url as string | null) ?? null,
    type: r.type === "video" ? "video" : "photo",
    category: (r.category as string | null) ?? null,
    format: (r.content_format as string | null) ?? null,
    athleteId: (r.athlete_id as string | null) ?? null,
    state: ((r.review_state as ReviewState | null) ?? "approved"),
    note: (r.review_note as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    folder: (media?.folder as string | undefined) ?? (media?.campaign as string | undefined) ?? null,
    fileName: (media?.file_name as string | undefined) ?? null,
    driveFileId: (media?.drive_file_id as string | undefined) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

const KEY = ["v2", "content-review"] as const;

export function useReviewItems() {
  return useQuery({
    queryKey: KEY,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_assets")
        .select("id, title, hero_url, type, category, content_format, athlete_id, review_state, review_note, reviewed_at, media, created_at, publish_at" as "*")
        .not("review_state" as never, "is", null)
        .order("publish_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Row[]).map(toReviewItem);
    },
  });
}

/** For the rail badge. Zero while loading or on failure. */
export function usePendingReviewCount(): number {
  const { data } = useReviewItems();
  return (data ?? []).filter((i) => i.state === "pending").length;
}

const STATE_OF: Record<Decision, ReviewState> = { approve: "approved", fix: "needs_fix", archive: "archived", pending: "pending" };

export function useReviewDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: Decision; note?: string | null }) => {
      const { error } = await supabase.rpc("ax_content_review" as never, { _id: input.id, _decision: input.decision, _note: input.note ?? null } as never);
      if (error) throw new Error(error.message);
    },
    // Instant: the piece leaves the queue before the server answers, so the next one is already on screen.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const before = qc.getQueryData<ReviewItem[]>(KEY);
      qc.setQueryData<ReviewItem[]>(KEY, (list) =>
        (list ?? []).map((i) => (i.id === input.id
          ? { ...i, state: STATE_OF[input.decision], note: input.decision === "pending" ? i.note : input.note?.trim() || null, reviewedAt: new Date().toISOString() }
          : i)),
      );
      return { before };
    },
    onError: (_e, _input, ctx) => { if (ctx?.before) qc.setQueryData(KEY, ctx.before); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useReassign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; athleteId: string | null }) => {
      const { error } = await supabase.rpc("ax_content_assign" as never, { _id: input.id, _athlete_id: input.athleteId } as never);
      if (error) throw new Error(error.message);
    },
    onMutate: (input) => {
      qc.setQueryData<ReviewItem[]>(KEY, (list) => (list ?? []).map((i) => (i.id === input.id ? { ...i, athleteId: input.athleteId } : i)));
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export interface IntakeResult { scanned: number; added: number; by_bin: Record<string, number>; unreadable: string[]; error?: string }

/** Pull anything new from Drive 06 into the queue. */
export function useDriveIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<IntakeResult> => {
      const { data, error } = await supabase.functions.invoke("drive-content-intake", { body: {} });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error((body as { error?: string } | null)?.error ?? error.message);
      }
      return data as IntakeResult;
    },
    onSuccess: (r) => { if (r.added > 0) void qc.invalidateQueries({ queryKey: KEY }); },
  });
}
