import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, ArrowLeft, ArrowRight, Check, ExternalLink, FolderSync, Loader2, PenLine, Repeat2, RotateCcw, ShoppingBag, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  MOCKUP_DROP_CHIPS, MOCKUP_FIX_CHIPS, hasChanges, mockupKey, planSummary, planSync,
  useMockupDecision, useMockupDecisionMany, useMockupIntake, useMockupReviews, useMockupSync,
  type MockupDecision, type MockupItem, type MockupState, type SyncPlan,
} from "@/lib/v2/mockup-review";
import { addChip, indexAfterRemoval } from "@/lib/v2/content-review";
import { EmptyState, ErrorState, PageHeader, Skeleton, TabBar } from "@/components/admin-v2/primitives";

// MOCKUP REVIEW — one colourway at a time, one click each.
//
// ✓ Approve: this colour sells. ✎ Fix: back to production with a note (kept
// off Shopify until it's fixed). ✕ Drop: the colourway doesn't work.
// Nothing reaches Shopify until "Sync to Shopify" is pressed for a design —
// then approved colours go on and dropped / to-fix colours come off.

const TABS: readonly MockupState[] = ["pending", "needs_fix", "approved", "archived"];
const TAB_LABEL: Record<MockupState, string> = { pending: "To review", needs_fix: "Needs fix", approved: "Approved", archived: "Dropped" };
const DONE: Record<MockupDecision, string> = { approve: "Approved", fix: "Sent back to fix", archive: "Dropped", pending: "Back in review" };
const STATE_OF_DECISION: Record<MockupDecision, MockupState> = { approve: "approved", fix: "needs_fix", archive: "archived", pending: "pending" };

const pill =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${on ? "border-[hsl(var(--ax-ink))] bg-[hsl(var(--ax-ink))] text-white" : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"}`;

function Picture({ url, alt, className = "" }: { url: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <div className={`grid place-items-center text-[12px] text-white/60 ${className}`}>Picture unavailable</div>;
  return <img src={url} alt={alt} className={`object-contain ${className}`} onError={() => setFailed(true)} referrerPolicy="no-referrer" loading="lazy" />;
}

function SyncPanel({ plans, syncing, onSync }: { plans: SyncPlan[]; syncing: string | null; onSync: (p: SyncPlan) => void }) {
  if (!plans.length) return null;
  return (
    <section className="ax-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-[hsl(var(--ax-secondary))]" />
        <h2 className="text-[14px] font-bold">Sync to Shopify</h2>
        <span className="text-[11.5px] text-[hsl(var(--ax-faint))]">Approved colours go on, dropped and to-fix colours come off. Undecided colours are left alone.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const changes = hasChanges(p);
          return (
            <div key={p.designCode} className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--ax-border))] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{p.designName}</p>
                <p className="text-[11.5px] text-[hsl(var(--ax-faint))]">
                  {planSummary(p)}{p.untouched.length ? ` · ${p.untouched.length} to review` : ""}{!p.productGid && p.add.length ? " · creates a draft" : ""}
                </p>
                {p.remove.length > 0 && <p className="truncate text-[11px] text-[hsl(var(--ax-red))]" title={p.remove.join(", ")}>Off: {p.remove.join(", ")}</p>}
                {p.add.length > 0 && <p className="truncate text-[11px] text-[hsl(var(--ax-green,142_60%_35%))]" title={p.add.join(", ")}>On: {p.add.join(", ")}</p>}
              </div>
              <button type="button" disabled={!changes || syncing !== null} onClick={() => onSync(p)}
                className="shrink-0 rounded-full bg-[hsl(var(--ax-ink))] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-35">
                {syncing === p.designCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sync"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function V2MockupReview() {
  const items = useMockupReviews();
  const decide = useMockupDecision();
  const sync = useMockupSync();
  const intake = useMockupIntake();
  // Placement Studio links here with ?design=CODE&tab=approved to open one product.
  const [params] = useSearchParams();
  const [tab, setTab] = useState<MockupState>(() => (["pending", "needs_fix", "approved", "archived"].includes(params.get("tab") ?? "") ? (params.get("tab") as MockupState) : "pending"));
  const [design, setDesign] = useState<string>(() => params.get("design") ?? "all");
  const [index, setIndex] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [mode, setMode] = useState<"fix" | "archive" | null>(null);
  const [note, setNote] = useState("");
  const [last, setLast] = useState<{ id: string; label: string; decision: MockupDecision } | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const decideMany = useMockupDecisionMany();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const all = useMemo(() => items.data ?? [], [items.data]);
  const plans = useMemo(() => planSync(all), [all]);
  const inTab = all.filter((i) => i.state === tab);
  const designs = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const i of inTab) counts.set(i.designCode, { name: i.designName, n: (counts.get(i.designCode)?.n ?? 0) + 1 });
    return [...counts.entries()];
  }, [inTab]);
  const list = design === "all" ? inTab : inTab.filter((i) => i.designCode === design);
  const current: MockupItem | null = list[Math.min(index, Math.max(list.length - 1, 0))] ?? null;
  const pendingCount = all.filter((i) => i.state === "pending").length;
  const shown = current ? (side === "back" ? current.backUrl ?? current.frontUrl : current.frontUrl) : null;

  useEffect(() => { setIndex(0); setMode(null); setNote(""); }, [tab, design]);
  // Front/back stays where you put it while you arrow through — B or the toggle flips it.

  const act = useCallback((decision: MockupDecision, text?: string) => {
    if (!current) return;
    const trimmed = (text ?? "").trim();
    if (decision === "fix" && !trimmed) { setMode("fix"); setTimeout(() => noteRef.current?.focus(), 0); return; }
    const leaving = current;
    decide.mutate({ id: leaving.id, decision, note: trimmed || null }, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save that."),
    });
    setLast({ id: leaving.id, label: `${leaving.designName} · ${leaving.color}`, decision });
    setMode(null);
    setNote("");
    if (tab !== STATE_OF_DECISION[decision]) setIndex((i) => indexAfterRemoval(i, list.length - 1));
  }, [current, decide, list.length, tab]);

  const undo = useCallback(() => {
    if (!last) return;
    decide.mutate({ id: last.id, decision: "pending" });
    toast(`${last.label} is back in review`);
    setLast(null);
  }, [decide, last]);

  const runSync = (p: SyncPlan) => {
    setSyncing(p.designCode);
    sync.mutate(p.designCode, {
      onSuccess: (r) => toast.success(`${p.designName}: ${[r.added?.length ? `${r.added.length} on` : null, r.removed?.length ? `${r.removed.length} off` : null].filter(Boolean).join(", ") || "up to date"}`),
      onError: (e) => toast.error(`${p.designName}: ${e instanceof Error ? e.message : "sync failed"}`),
      onSettled: () => setSyncing(null),
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT")) {
        if (e.key === "Escape") { setMode(null); el.blur(); }
        if (e.key === "Enter" && !e.shiftKey && el.tagName === "TEXTAREA" && mode) { e.preventDefault(); act(mode, note); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = mockupKey(e.key);
      if (!a) return;
      e.preventDefault();
      if (a === "undo") return undo();
      if (a === "flip") return setSide((s) => (s === "front" ? "back" : "front"));
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
      onSuccess: (r) => (r.hint ? toast(r.hint) : toast.success(r.added ? `${r.added} new colourways from Drive` : "Nothing new in Drive")),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not read Drive"),
    })}>
      {intake.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSync className="h-3.5 w-3.5" />}
      {intake.isPending ? "Checking Drive…" : "Check Drive"}
    </button>
  );

  return (
    <>
      <PageHeader
        eyebrow="Releases · Mockup review"
        title={pendingCount ? `${pendingCount} colourways to review` : "All caught up."}
        subtitle="Approve sells the colour. Fix sends it back with your note. Drop removes it. Keys: A approve · F fix · X drop · B front/back · Z undo · ← →"
        actions={pullButton}
      />

      <SyncPanel plans={plans} syncing={syncing} onSync={runSync} />

      <TabBar<MockupState> tabs={TABS} active={tab} onSelect={setTab} label={(t) => `${TAB_LABEL[t]} ${all.filter((i) => i.state === t).length || ""}`.trim()} />

      {tab === "pending" && list.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {confirmAll ? (
            <>
              <span className="text-[12.5px]">Approve all {list.length}{design !== "all" ? ` ${list[0]?.designName}` : ""} colourways?</span>
              <button type="button" className="rounded-full bg-[hsl(var(--ax-accent))] px-3 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]" disabled={decideMany.isPending}
                onClick={() => {
                  const ids = list.map((i) => i.id);
                  decideMany.mutate({ ids, decision: "approve" }, {
                    onSuccess: (n) => toast.success(`${n} approved — press Sync to put them on Shopify`),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't approve them all"),
                  });
                  setConfirmAll(false);
                }}>Yes, approve all</button>
              <button type="button" className="rounded-full px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))]" onClick={() => setConfirmAll(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] font-semibold hover:border-[hsl(var(--ax-accent)/0.5)]" onClick={() => setConfirmAll(true)}>
              <Check className="h-3.5 w-3.5" />Approve all {list.length}{design !== "all" ? ` in ${list[0]?.designName}` : ""}
            </button>
          )}
        </div>
      )}

      {designs.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" className={chip(design === "all")} onClick={() => setDesign("all")}>All</button>
          {designs.map(([code, d]) => <button key={code} type="button" className={chip(design === code)} onClick={() => setDesign(code)}>{d.name} · {d.n}</button>)}
        </div>
      )}

      {items.isError ? <ErrorState error={items.error} what="mockups" onRetry={() => void items.refetch()} />
        : items.isLoading ? <Skeleton className="h-[60vh]" />
        : !current ? <EmptyState>{tab === "pending" ? "Nothing waiting. New colourways show up here when their mockups land in the Drive library." : `Nothing ${TAB_LABEL[tab].toLowerCase()}.`}</EmptyState>
        : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-2xl bg-[#f3f3f1]">
                <Picture url={shown} alt={`${current.designName} ${current.color} ${side}`} className="h-[64vh] w-full" />
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[11px]">
                  <span className="rounded-full bg-black/55 px-2.5 py-1 text-white tabular-nums">{Math.min(index, list.length - 1) + 1} / {list.length}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSide((s) => (s === "front" ? "back" : "front"))} className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-white hover:bg-black/70">
                      <Repeat2 className="h-3 w-3" />{side === "front" ? "Front" : "Back"} <kbd className="opacity-70">B</kbd>
                    </button>
                    {current.frontDriveId && (
                      <a className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-white hover:bg-black/70" href={`https://drive.google.com/file/d/${current.frontDriveId}/view`} target="_blank" rel="noreferrer">Drive<ExternalLink className="h-3 w-3" /></a>
                    )}
                  </div>
                </div>
                <button type="button" aria-label="Previous" disabled={index === 0} onClick={() => setIndex((i) => Math.max(i - 1, 0))} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next" disabled={index >= list.length - 1} onClick={() => setIndex((i) => Math.min(i + 1, list.length - 1))} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Up next">
                {list.slice(0, 60).map((i, n) => (
                  <button key={i.id} type="button" onClick={() => setIndex(n)} aria-current={i.id === current.id || undefined} title={`${i.designName} · ${i.color}`}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[#f3f3f1] ring-2 ${i.id === current.id ? "ring-[hsl(var(--ax-accent))]" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                    <Picture url={i.frontUrl} alt={i.color} className="h-full w-full" />
                  </button>
                ))}
              </div>
            </div>

            <aside className="ax-card flex flex-col gap-4 self-start p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-faint))]">{current.designName}</p>
                <h2 className="text-[20px] font-bold leading-snug">{current.color}</h2>
                <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-faint))]">{current.garment}</p>
                <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-secondary))]">
                  Shopify: {current.shopifyProductGid ? (current.shopifyState === "off" ? "off the product" : "on the product") : "no product yet — Sync creates a draft"}
                </p>
                {current.syncError && <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-red))]">Last sync: {current.syncError}</p>}
              </div>

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
                    <PenLine className="h-5 w-5" />Needs edit<kbd className="text-[10px] opacity-60">F</kbd>
                  </button>
                  <button type="button" onClick={() => { setMode(mode === "archive" ? null : "archive"); setTimeout(() => noteRef.current?.focus(), 0); }} aria-pressed={mode === "archive"}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-[12px] font-semibold ${mode === "archive" ? "border-[hsl(var(--ax-red))] bg-[hsl(var(--ax-red)/0.12)]" : "border-[hsl(var(--ax-border))] hover:bg-[hsl(var(--ax-red)/0.08)]"}`}>
                    <Archive className="h-5 w-5" />Drop<kbd className="text-[10px] opacity-60">X</kbd>
                  </button>
                </div>
              )}

              {mode && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(mode === "fix" ? MOCKUP_FIX_CHIPS : MOCKUP_DROP_CHIPS).map((c) => (
                      <button key={c} type="button" className={chip(note.toLowerCase().includes(c.toLowerCase()))} onClick={() => { setNote((n) => addChip(n, c)); noteRef.current?.focus(); }}>{c}</button>
                    ))}
                  </div>
                  <textarea ref={noteRef} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={mode === "fix" ? "What needs to change? (required)" : "Why? (optional)"}
                    className="w-full rounded-lg border border-[hsl(var(--ax-border))] px-3 py-2 text-[13px]" />
                  <button type="button" disabled={mode === "fix" && !note.trim()} onClick={() => act(mode, note)}
                    className="rounded-full bg-[hsl(var(--ax-ink))] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
                    {mode === "fix" ? "Send back to fix" : "Drop this colour"} <span className="opacity-60">↵</span>
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
