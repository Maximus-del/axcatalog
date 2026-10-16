// Client Desk — what clients sent from their portal, waiting on AX first.
//
// Conversations: Studio projects (brief, inspiration, concepts, the client's
// decisions) and AX Team messages, answered here as "AX Team". Drops: what a
// client sent for review — schedule it, send it back with a note, mark live.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArrowLeft, ArrowUpRight, CheckCheck, ImagePlus, Loader2, RotateCcw, Search, Send } from "lucide-react";
import { Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton, TabBar } from "@/components/admin-v2/primitives";
import { newIdempotencyKey } from "@/lib/portal/api/orders";
import {
  PROJECT_STATUS_LABEL,
  conceptProblem,
  filterThreads,
  toLocalInput,
  useDeskDrops,
  useDeskMarkRead,
  useDeskReply,
  useDeskSetClosed,
  useDeskThread,
  useDeskThreads,
  useDeskUpdateDrop,
  useShareConcept,
  type DeskDrop,
  type DeskThread,
  type DeskThreadDetail,
} from "@/lib/v2/desk";

type Tab = "conversations" | "drops";

const fmt = (iso: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, timeZone?: string) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
  }
};

const inputCls =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";
const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50";

function statusChip(t: DeskThread) {
  if (t.kind === "conversation") return <Chip>Message</Chip>;
  const s = t.projectStatus ?? "requested";
  const tone = s === "requested" ? "var(--ax-amber)" : s === "feedback" ? "var(--ax-blue)" : s === "approved" ? "var(--ax-accent)" : undefined;
  return <Chip tone={tone}>{PROJECT_STATUS_LABEL[s]}</Chip>;
}

/* ------------------------------------------------------------ thread list */
function ThreadList({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const threads = useDeskThreads(showArchived);
  const all = threads.data ?? [];
  const items = useMemo(() => filterThreads(all, filter, q), [all, filter, q]);
  const waiting = all.filter((t) => t.waitingOnAx).length;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip active={filter === "waiting"} onClick={() => setFilter("waiting")}>
          Waiting on AX · {waiting}
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[hsl(var(--ax-faint))]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archived
        </label>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
        <input className={`${inputCls} pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients and messages" aria-label="Search" />
      </div>
      {threads.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : threads.isError ? (
        <ErrorState error={threads.error} what="the desk" onRetry={() => threads.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>{filter === "waiting" ? "Nothing waiting on AX. Every client has an answer." : "No conversations yet."}</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  selected === t.id
                    ? "border-[hsl(var(--ax-accent)/0.6)] bg-[hsl(var(--ax-accent)/0.06)]"
                    : "border-[hsl(var(--ax-line))] hover:border-[hsl(var(--ax-border))]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {t.waitingOnAx && <span className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--ax-amber))]" aria-label="Waiting on AX" />}
                  <span className="truncate text-[13px] font-semibold">{t.clientName}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[hsl(var(--ax-faint))]">{fmt(t.lastMessageAt, { month: "short", day: "numeric" })}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="truncate text-[12px] text-[hsl(var(--ax-secondary))]">{t.title}</span>
                  <span className="ml-auto shrink-0">{statusChip(t)}</span>
                </div>
                {t.lastMessage && <p className="mt-1 truncate text-[11.5px] text-[hsl(var(--ax-faint))]">{t.lastMessage}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- concept share */
function ShareConcept({ thread }: { thread: DeskThreadDetail }) {
  const share = useShareConcept();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [replaces, setReplaces] = useState("");
  const current = thread.concepts.filter((c) => !c.superseded);
  const problem = file ? conceptProblem(file) : null;

  return (
    <div className="mt-4 rounded-xl border border-dashed border-[hsl(var(--ax-border))] p-3">
      <div className="text-[12px] font-semibold">Share a concept</div>
      <p className="mt-0.5 text-[11.5px] text-[hsl(var(--ax-faint))]">
        The client gets it in Creative Studio to approve or request changes. Preview images only — never production artwork.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className={`${inputCls} flex cursor-pointer items-center gap-2 text-[hsl(var(--ax-secondary))]`}>
          <ImagePlus className="h-4 w-4 shrink-0" />
          <span className="truncate">{file ? file.name : "Choose PNG, JPG or WebP"}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Back — #17" maxLength={120} />
        {current.length > 0 && (
          <select className={`${inputCls} sm:col-span-2`} value={replaces} onChange={(e) => setReplaces(e.target.value)} aria-label="New or a new version">
            <option value="">A new concept</option>
            {current.map((c) => (
              <option key={c.id} value={c.id}>
                New version of “{c.title ?? "concept"}” (v{c.version} → v{c.version + 1})
              </option>
            ))}
          </select>
        )}
      </div>
      {problem && <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-red))]">{problem}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className={btnPrimary}
          disabled={!file || !!problem || share.isPending}
          onClick={() =>
            file &&
            share.mutate(
              { projectId: thread.id, file, title, replacesConceptId: replaces || null },
              {
                onSuccess: () => {
                  toast.success(`Shared with ${thread.clientName}`);
                  setFile(null);
                  setTitle("");
                  setReplaces("");
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          {share.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Share with client
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- thread detail */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">{title}</div>
      {children}
    </div>
  );
}

function ThreadDetail({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const thread = useDeskThread(threadId);
  const reply = useDeskReply();
  const markRead = useDeskMarkRead();
  const setClosed = useDeskSetClosed();
  const [body, setBody] = useState("");
  const [key, setKey] = useState(newIdempotencyKey);
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    setBody("");
    setKey(newIdempotencyKey());
    setShowOld(false);
  }, [threadId]);

  if (thread.isLoading) return <Skeleton className="h-96" />;
  if (thread.isError || !thread.data) return <ErrorState error={thread.error} what="this conversation" onRetry={() => thread.refetch()} />;
  const t = thread.data;
  const current = t.concepts.filter((c) => !c.superseded);
  const old = t.concepts.filter((c) => c.superseded);

  function send() {
    if (!body.trim()) return;
    reply.mutate(
      { threadId: t.id, body: body.trim(), key },
      {
        onSuccess: () => {
          setBody("");
          setKey(newIdempotencyKey());
          toast.success(`Sent to ${t.clientName}`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Card>
      <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-[12px] text-[hsl(var(--ax-secondary))] lg:hidden">
        <ArrowLeft className="h-3.5 w-3.5" /> All conversations
      </button>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[hsl(var(--ax-faint))]">
            <Link to={`/admin-v2/people/${t.athleteId}`} className="hover:text-[hsl(var(--ax-ink))]">
              {t.clientName}
            </Link>
            {t.projectKind && <> · {t.projectKind.replace(/_/g, " ")}</>}
          </div>
          <h2 className="mt-0.5 text-[18px] font-semibold">{t.title}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {statusChip(t)}
            {t.waitingOnAx && <Chip tone="var(--ax-amber)">Waiting on AX</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {t.waitingOnAx && (
            <button type="button" className={btn} disabled={markRead.isPending} onClick={() => markRead.mutate(t.id)} title="Nothing to answer — clear the dot">
              <CheckCheck className="h-3.5 w-3.5" /> Mark handled
            </button>
          )}
          <a className={btn} href={`/portal?as=${t.athleteId}`} target="_blank" rel="noreferrer">
            Their portal <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            className={btn}
            disabled={setClosed.isPending}
            onClick={() =>
              setClosed.mutate(
                { threadId: t.id, closed: !t.closed },
                { onSuccess: () => toast.success(t.closed ? "Reopened" : "Archived"), onError: (e) => toast.error(e.message) },
              )
            }
          >
            {t.closed ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            {t.closed ? "Reopen" : "Archive"}
          </button>
        </div>
      </div>

      {t.kind === "project" && (
        <>
          <Section title="Brief">
            <p className="whitespace-pre-wrap text-[13px]">{t.brief?.idea || "No brief written."}</p>
            {(t.brief?.vibes?.length || t.brief?.details || t.destinationId) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.destinationId && <Chip tone="var(--ax-violet)">{t.destinationId}</Chip>}
                {t.brief?.vibes?.map((v) => (
                  <Chip key={v}>{v}</Chip>
                ))}
              </div>
            )}
            {t.brief?.details && <p className="mt-2 text-[12px] text-[hsl(var(--ax-secondary))]">Include: {t.brief.details}</p>}
          </Section>

          {t.inspiration.length > 0 && (
            <Section title={`Inspiration (${t.inspiration.length})`}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {t.inspiration.map((f) =>
                  f.url && f.mime.startsWith("image/") ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-white/5">
                      <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className="flex aspect-square items-center justify-center rounded-lg bg-white/5 p-2 text-center text-[11px] text-[hsl(var(--ax-secondary))]">
                      {f.name}
                    </a>
                  ),
                )}
              </div>
            </Section>
          )}

          <Section title={`Concepts (${current.length})`}>
            {current.length === 0 ? (
              <p className="text-[12px] text-[hsl(var(--ax-faint))]">No concepts shared yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {current.map((c) => (
                  <div key={c.id} className="overflow-hidden rounded-xl border border-[hsl(var(--ax-line))]">
                    <div className="aspect-square bg-white/5">{c.url && <img src={c.url} alt={c.title ?? "Concept"} className="h-full w-full object-contain" />}</div>
                    <div className="p-2">
                      <div className="truncate text-[12px] font-semibold">
                        {c.title ?? "Concept"} <span className="font-normal text-[hsl(var(--ax-faint))]">v{c.version}</span>
                      </div>
                      <div className="mt-1">
                        {c.decision === "approve" ? (
                          <Chip tone="var(--ax-accent)">Approved</Chip>
                        ) : c.decision === "request_changes" ? (
                          <Chip tone="var(--ax-amber)">Changes requested</Chip>
                        ) : (
                          <Chip>Waiting on client</Chip>
                        )}
                      </div>
                      {c.feedback && <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-secondary))]">“{c.feedback}”</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {old.length > 0 && (
              <button type="button" className="mt-2 text-[11.5px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]" onClick={() => setShowOld((v) => !v)}>
                {showOld ? "Hide" : "Show"} earlier versions ({old.length})
              </button>
            )}
            {showOld && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {old.map((c) => (
                  <div key={c.id} className="aspect-square overflow-hidden rounded-lg bg-white/5 opacity-70" title={`${c.title ?? "Concept"} v${c.version}`}>
                    {c.url && <img src={c.url} alt="" className="h-full w-full object-contain" />}
                  </div>
                ))}
              </div>
            )}
            {!t.closed && <ShareConcept thread={t} />}
          </Section>
        </>
      )}

      <Section title="Conversation">
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {t.messages.length === 0 && <p className="text-[12px] text-[hsl(var(--ax-faint))]">No messages yet.</p>}
          {t.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] ${
                m.fromAx ? "ml-auto bg-[hsl(var(--ax-accent)/0.12)]" : "bg-white/[0.05]"
              }`}
            >
              <div className="mb-0.5 text-[10.5px] text-[hsl(var(--ax-faint))]">
                {m.fromAx ? "AX Team" : t.clientName} · {fmt(m.createdAt)}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              {m.attachments.map((a) => (
                <a key={a.id} href={a.url ?? undefined} target="_blank" rel="noreferrer" className="mt-1 block text-[12px] underline">
                  {a.name}
                </a>
              ))}
            </div>
          ))}
        </div>
        {t.closed ? (
          <p className="mt-3 text-[12px] text-[hsl(var(--ax-faint))]">Archived. Reopen to reply.</p>
        ) : (
          <div className="mt-3 flex items-end gap-2">
            <textarea
              className={`${inputCls} min-h-[72px] resize-y`}
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              placeholder={`Reply to ${t.clientName} as AX Team`}
              aria-label="Reply"
            />
            <button type="button" className={btnPrimary} disabled={!body.trim() || reply.isPending} onClick={send} title="Send (Ctrl/⌘ + Enter)">
              {reply.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </button>
          </div>
        )}
      </Section>
    </Card>
  );
}

/* ------------------------------------------------------------------ drops */
const ZONES = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "UTC"];

function DropRow({ d }: { d: DeskDrop }) {
  const update = useDeskUpdateDrop();
  const [mode, setMode] = useState<null | "schedule" | "return">(null);
  const [when, setWhen] = useState(toLocalInput(d.scheduledAt, d.timeZone));
  const [tz, setTz] = useState(ZONES.includes(d.timeZone) ? d.timeZone : "America/New_York");
  const [note, setNote] = useState("");
  const tone = d.status === "review" ? "var(--ax-amber)" : d.status === "scheduled" ? "var(--ax-blue)" : d.status === "live" ? "var(--ax-accent)" : undefined;

  function run(action: "schedule" | "return" | "live" | "unschedule", done: string) {
    update.mutate(
      { dropId: d.id, action, scheduledLocal: action === "schedule" ? when : null, timeZone: action === "schedule" ? tz : null, note: action === "return" ? note : null },
      {
        onSuccess: () => {
          toast.success(done);
          setMode(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[hsl(var(--ax-faint))]">
            <Link to={`/admin-v2/people/${d.athleteId}`} className="hover:text-[hsl(var(--ax-ink))]">
              {d.clientName}
            </Link>
            {d.destinationId && <> · {d.destinationId}</>}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold">{d.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[hsl(var(--ax-secondary))]">
            <Chip tone={tone}>{d.status === "review" ? "Waiting for review" : d.status}</Chip>
            {d.scheduledAt ? `${fmt(d.scheduledAt, { dateStyle: "medium", timeStyle: "short" }, d.timeZone)} (${d.timeZone.replace(/_/g, " ")})` : "No date yet"}
          </div>
          {d.reviewNote && d.status === "draft" && <p className="mt-1 text-[12px] text-[hsl(var(--ax-amber))]">Sent back: “{d.reviewNote}”</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(d.status === "review" || d.status === "draft" || d.status === "scheduled") && (
            <button type="button" className={d.status === "review" ? btnPrimary : btn} onClick={() => setMode(mode === "schedule" ? null : "schedule")}>
              {d.status === "scheduled" ? "Reschedule" : "Approve & schedule"}
            </button>
          )}
          {d.status === "review" && (
            <button type="button" className={btn} onClick={() => setMode(mode === "return" ? null : "return")}>
              Send back
            </button>
          )}
          {d.status === "scheduled" && (
            <>
              <button type="button" className={btn} disabled={update.isPending} onClick={() => run("live", "Marked live")}>
                Mark live
              </button>
              <button type="button" className={btn} disabled={update.isPending} onClick={() => run("unschedule", "Unscheduled")}>
                Unschedule
              </button>
            </>
          )}
        </div>
      </div>
      {mode === "schedule" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
          <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Go-live date and time" />
          <select className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Time zone">
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button type="button" className={btnPrimary} disabled={!when || update.isPending} onClick={() => run("schedule", `Scheduled — ${d.clientName} will see it`)}>
            {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Schedule
          </button>
        </div>
      )}
      {mode === "return" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change? The client sees this." maxLength={500} />
          <button type="button" className={btnPrimary} disabled={!note.trim() || update.isPending} onClick={() => run("return", "Sent back to the client")}>
            Send back
          </button>
        </div>
      )}
    </Card>
  );
}

function DropsTab() {
  const [pendingOnly, setPendingOnly] = useState(true);
  const drops = useDeskDrops(pendingOnly);
  const items = drops.data ?? [];
  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        <Chip active={pendingOnly} onClick={() => setPendingOnly(true)}>
          Waiting for review
        </Chip>
        <Chip active={!pendingOnly} onClick={() => setPendingOnly(false)}>
          All drops
        </Chip>
      </div>
      {drops.isLoading ? (
        <Skeleton className="h-40" />
      ) : drops.isError ? (
        <ErrorState error={drops.error} what="drops" onRetry={() => drops.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>{pendingOnly ? "No drops waiting for review." : "No drops yet."}</EmptyState>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <DropRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- page */
export default function V2Desk() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "drops" ? "drops" : "conversations";
  const selected = params.get("thread");
  const threads = useDeskThreads(false);
  const reviewDrops = useDeskDrops(true);
  const waiting = (threads.data ?? []).filter((t) => t.waitingOnAx).length;
  const review = (reviewDrops.data ?? []).length;

  function set(next: Record<string, string | null>) {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    setParams(n, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Client Desk" subtitle="Briefs, messages and drops from client portals. Anything waiting on AX comes first." />
      <TabBar
        tabs={["conversations", "drops"] as const}
        active={tab}
        onSelect={(t) => set({ tab: t === "drops" ? "drops" : null, thread: null })}
        label={(t) => (t === "conversations" ? `Conversations${waiting ? ` · ${waiting}` : ""}` : `Drops${review ? ` · ${review}` : ""}`)}
      />
      {tab === "drops" ? (
        <DropsTab />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className={selected ? "hidden lg:block" : ""}>
            <ThreadList selected={selected} onSelect={(id) => set({ thread: id })} />
          </div>
          <div className={selected ? "" : "hidden lg:block"}>
            {selected ? (
              <ThreadDetail threadId={selected} onBack={() => set({ thread: null })} />
            ) : (
              <EmptyState>Pick a conversation to read the brief, share concepts and reply.</EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
