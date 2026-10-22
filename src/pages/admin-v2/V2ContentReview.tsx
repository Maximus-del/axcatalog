import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Check, ExternalLink, FolderSync, Loader2, PenLine, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useEntities } from "@/lib/v2/data";
import {
  ARCHIVE_CHIPS, FIX_CHIPS, addChip, binLabel, binOf, indexAfterRemoval, keyAction,
  useDriveIntake, useReassign, useReviewDecision, useReviewItems,
  type Decision, type ReviewItem, type ReviewState,
} from "@/lib/v2/content-review";
import { EmptyState, ErrorState, PageHeader, Skeleton, TabBar } from "@/components/admin-v2/primitives";

// CONTENT REVIEW — one picture at a time, one click each.
//
// ✓ Approve puts it on the assigned client's Content & Drops. ✎ Fix sends it
// back with a note (the note is required: it is how redos stay consistent).
// ✕ Archive retires it. Every decision moves straight to the next picture;
// Z undoes the last one. New pieces come from Drive 06 already assigned.

const TABS: readonly ReviewState[] = ["pending", "needs_fix", "approved", "archived"];
const TAB_LABEL: Record<ReviewState, string> = { pending: "To review", needs_fix: "Needs fix", approved: "Approved", archived: "Archived" };
const DONE: Record<Decision, string> = { approve: "Approved", fix: "Sent back to fix", archive: "Archived", pending: "Back in review" };

const pill =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${on ? "border-[hsl(var(--ax-ink))] bg-[hsl(var(--ax-ink))] text-white" : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"}`;

function Picture({ item, className = "" }: { item: ReviewItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.id]);
  if (!item.imageUrl || failed) return <div className={`grid place-items-center text-[12px] text-white/60 ${className}`}>Picture unavailable</div>;
  return <img src={item.imageUrl} alt={item.title} className={`object-contain ${className}`} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}

export default function V2ContentReview() {
  const items = useReviewItems();
  const entities = useEntities();
  const decide = useReviewDecision();
  const reassign = useReassign();
  const intake = useDriveIntake();
  const [tab, setTab] = useState<ReviewState>("pending");
  const [bin, setBin] = useState<string>("all");
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"fix" | "archive" | null>(null);
  const [note, setNote] = useState("");
  const [last, setLast] = useState<{ id: string; title: string; decision: Decision } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const names = useMemo(() => new Map((entities.data ?? []).map((e) => [e.id, e.name])), [entities.data]);
  const clients = useMemo(() => (entities.data ?? []).filter((e) => !e.isDemo && e.status === "active").sort((a, b) => a.name.localeCompare(b.name)), [entities.data]);

  const all = useMemo(() => items.data ?? [], [items.data]);
  const inTab = all.filter((i) => i.state === tab);
  const bins = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of all.filter((x) => x.state === tab)) counts.set(binOf(i), (counts.get(binOf(i)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all, tab]);
  const list = bin === "all" ? inTab : inTab.filter((i) => binOf(i) === bin);
  const current = list[Math.min(index, Math.max(list.length - 1, 0))] ?? null;
  const pendingCount = all.filter((i) => i.state === "pending").length;

  // Pull anything new from Drive when the page opens.
  const pulled = useRef(false);
  useEffect(() => {
    if (pulled.current) return;
    pulled.current = true;
    intake.mutate(undefined, {
      onSuccess: (r) => { if (r.added > 0) toast.success(`${r.added} new from Drive`); },
      onError: () => undefined, // shown on the button; never blocks reviewing
    });
  }, [intake]);

  useEffect(() => { setIndex(0); setMode(null); setNote(""); }, [tab, bin]);

  const act = useCallback((decision: Decision, text?: string) => {
    if (!current) return;
    const trimmed = (text ?? "").trim();
    if (decision === "fix" && !trimmed) { setMode("fix"); setTimeout(() => noteRef.current?.focus(), 0); return; }
    const leaving = current;
    decide.mutate({ id: leaving.id, decision, note: trimmed || null }, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save that."),
    });
    setLast({ id: leaving.id, title: leaving.title, decision });
    setMode(null);
    setNote("");
    if (tab !== STATE_OF_DECISION[decision]) setIndex((i) => indexAfterRemoval(i, list.length - 1));
  }, [current, decide, list.length, tab]);

  const undo = useCallback(() => {
    if (!last) return;
    decide.mutate({ id: last.id, decision: "pending" });
    toast(`“${last.title}” is back in review`);
    setLast(null);
  }, [decide, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT")) {
        if (e.key === "Escape") { setMode(null); (el as HTMLElement).blur(); }
        if (e.key === "Enter" && !e.shiftKey && el.tagName === "TEXTAREA" && mode) { e.preventDefault(); act(mode, note); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = keyAction(e.key);
      if (!a) return;
      e.preventDefault();
      if (a === "undo") return undo();
      if (a === "next") return setIndex((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      if (a === "prev") return setIndex((i) => Math.max(i - 1, 0));
      if (tab !== "pending" && tab !== "needs_fix") return;
      if (a === "approve") act("approve");
      if (a === "archive") { setMode("archive"); setTimeout(() => noteRef.current?.focus(), 0); }
      if (a === "fix") { setMode("fix"); setTimeout(() => noteRef.current?.focus(), 0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, undo, list.length, tab, mode, note]);

  const pullButton = (
    <button type="button" className={pill} disabled={intake.isPending} onClick={() => intake.mutate(undefined, {
      onSuccess: (r) => toast.success(r.added ? `${r.added} new from Drive` : "Nothing new in Drive"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not read Drive"),
    })}>
      {intake.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSync className="h-3.5 w-3.5" />}
      {intake.isPending ? "Checking Drive…" : "Check Drive"}
    </button>
  );

  return (
    <>
      <PageHeader
        eyebrow="Releases · Content review"
        title={pendingCount ? `${pendingCount} to review` : "All caught up."}
        subtitle="Approve puts it on that client’s Content & Drops. Fix sends it back with your note. Keys: A approve · F fix · X archive · Z undo · ← →"
        actions={pullButton}
      />
      {intake.isError && (
        <p className="mb-4 rounded-lg border border-[hsl(var(--ax-amber)/0.5)] bg-[hsl(var(--ax-amber)/0.12)] px-3 py-2 text-[12px] text-[hsl(var(--ax-amber-ink))]">
          Couldn’t check Drive: {intake.error instanceof Error ? intake.error.message : "unknown error"}.{" "}
          {intake.error instanceof Error && /not shared/i.test(intake.error.message) ? "Share the 06 CONTENT ASSETS folder with the AX library account (the same one that reads FINALIZED PRODUCTS). " : ""}What’s already here can still be reviewed.
        </p>
      )}
      <TabBar<ReviewState> tabs={TABS} active={tab} onSelect={setTab} label={(t) => `${TAB_LABEL[t]} ${all.filter((i) => i.state === t).length || ""}`.trim()} />

      {bins.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" className={chip(bin === "all")} onClick={() => setBin("all")}>All</button>
          {bins.map(([b, n]) => <button key={b} type="button" className={chip(bin === b)} onClick={() => setBin(b)}>{binLabel(b, names)} · {n}</button>)}
        </div>
      )}

      {items.isError ? <ErrorState error={items.error} what="content" onRetry={() => void items.refetch()} />
        : items.isLoading ? <Skeleton className="h-[60vh]" />
        : !current ? <EmptyState>{tab === "pending" ? "Nothing waiting. New pieces show up here when they land in Drive 06." : `Nothing ${TAB_LABEL[tab].toLowerCase()}.`}</EmptyState>
        : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-2xl bg-[#14181d]">
                <Picture item={current} className="h-[64vh] w-full" />
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[11px] text-white/80">
                  <span className="rounded-full bg-black/45 px-2.5 py-1 tabular-nums">{Math.min(index, list.length - 1) + 1} / {list.length}</span>
                  {current.driveFileId && (
                    <a className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 hover:text-white" href={`https://drive.google.com/file/d/${current.driveFileId}/view`} target="_blank" rel="noreferrer">Open in Drive<ExternalLink className="h-3 w-3" /></a>
                  )}
                </div>
                <button type="button" aria-label="Previous" disabled={index === 0} onClick={() => setIndex((i) => Math.max(i - 1, 0))} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white disabled:opacity-30"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next" disabled={index >= list.length - 1} onClick={() => setIndex((i) => Math.min(i + 1, list.length - 1))} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Up next">
                {list.slice(0, 40).map((i, n) => (
                  <button key={i.id} type="button" onClick={() => setIndex(n)} aria-current={i.id === current.id || undefined}
                    className={`h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[#14181d] ring-2 ${i.id === current.id ? "ring-[hsl(var(--ax-accent))]" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                    <Picture item={i} className="h-full w-full" />
                  </button>
                ))}
              </div>
            </div>

            <aside className="ax-card flex flex-col gap-4 self-start p-5">
              <div>
                <h2 className="text-[16px] font-bold leading-snug">{current.title}</h2>
                <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-faint))]">{[current.category, current.format].filter(Boolean).join(" · ")}</p>
                {current.folder && <p className="mt-1 break-words text-[11px] text-[hsl(var(--ax-faint))]">{current.folder}</p>}
              </div>

              <label className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]">
                For
                <select className="mt-1.5 block w-full rounded-lg border border-[hsl(var(--ax-border))] bg-white px-2.5 py-2 text-[13px] font-normal normal-case tracking-normal text-[hsl(var(--ax-ink))]"
                  value={current.athleteId ?? ""} onChange={(e) => reassign.mutate({ id: current.id, athleteId: e.target.value || null }, {
                    onSuccess: () => toast.success("Reassigned"), onError: (er) => toast.error(er instanceof Error ? er.message : "Could not reassign"),
                  })}>
                  <option value="">AX (website, World Tour, our own)</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              {current.note && tab !== "pending" && (
                <div className="rounded-lg bg-[hsl(var(--ax-amber)/0.12)] px-3 py-2 text-[12.5px]"><span className="font-semibold">Note: </span>{current.note}</div>
              )}

              {(tab === "pending" || tab === "needs_fix") && (
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => act("approve")} className="flex flex-col items-center gap-1 rounded-xl bg-[hsl(var(--ax-accent))] py-3 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] hover:brightness-110">
                    <Check className="h-5 w-5" />Approve<kbd className="text-[10px] opacity-70">A</kbd>
                  </button>
                  <button type="button" onClick={() => { setMode(mode === "fix" ? null : "fix"); setTimeout(() => noteRef.current?.focus(), 0); }} aria-pressed={mode === "fix"}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-[12px] font-semibold ${mode === "fix" ? "border-[hsl(var(--ax-amber))] bg-[hsl(var(--ax-amber)/0.18)]" : "border-[hsl(var(--ax-border))] hover:bg-[hsl(var(--ax-amber)/0.1)]"}`}>
                    <PenLine className="h-5 w-5" />Fix<kbd className="text-[10px] opacity-60">F</kbd>
                  </button>
                  <button type="button" onClick={() => { setMode(mode === "archive" ? null : "archive"); setTimeout(() => noteRef.current?.focus(), 0); }} aria-pressed={mode === "archive"}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-[12px] font-semibold ${mode === "archive" ? "border-[hsl(var(--ax-red))] bg-[hsl(var(--ax-red)/0.12)]" : "border-[hsl(var(--ax-border))] hover:bg-[hsl(var(--ax-red)/0.08)]"}`}>
                    <Archive className="h-5 w-5" />Archive<kbd className="text-[10px] opacity-60">X</kbd>
                  </button>
                </div>
              )}

              {mode && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(mode === "fix" ? FIX_CHIPS : ARCHIVE_CHIPS).map((c) => (
                      <button key={c} type="button" className={chip(note.toLowerCase().includes(c.toLowerCase()))} onClick={() => { setNote((n) => addChip(n, c)); noteRef.current?.focus(); }}>{c}</button>
                    ))}
                  </div>
                  <textarea ref={noteRef} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={mode === "fix" ? "What needs to change? (required)" : "Why? (optional)"}
                    className="w-full rounded-lg border border-[hsl(var(--ax-border))] px-3 py-2 text-[13px]" />
                  <button type="button" disabled={mode === "fix" && !note.trim()} onClick={() => act(mode, note)}
                    className="rounded-full bg-[hsl(var(--ax-ink))] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
                    {mode === "fix" ? "Send back to fix" : "Archive"} <span className="opacity-60">↵</span>
                  </button>
                </div>
              )}

              {(tab === "approved" || tab === "archived") && (
                <button type="button" className={pill} onClick={() => act("pending")}><RotateCcw className="h-3.5 w-3.5" />Back to review</button>
              )}

              {last && (
                <button type="button" className={`${pill} self-start`} onClick={undo}>
                  <Undo2 className="h-3.5 w-3.5" />Undo “{DONE[last.decision]}” <kbd className="text-[10px] opacity-60">Z</kbd>
                </button>
              )}
            </aside>
          </div>
        )}
    </>
  );
}

const STATE_OF_DECISION: Record<Decision, ReviewState> = { approve: "approved", fix: "needs_fix", archive: "archived", pending: "pending" };
