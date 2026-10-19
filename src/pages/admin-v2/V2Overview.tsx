import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { useOverview } from "@/lib/v2/data";
import { mockupCover } from "@/lib/v2/mockup-image";
import { entityLibraryHref } from "@/lib/v2/entity-nav";
import { fmtMoney } from "@/lib/v2/pricing";
import { stageOf, STAGE_LABELS, STAGE_TONES } from "@/lib/v2/concepts";
import { useDeskDrops, useDeskThreads, useDeskWaitingCount } from "@/lib/v2/desk";
import { focusQueue, localDay, useWorkTasks, weekDays, type TaskRow } from "@/lib/v2/work";
import {
  AssetImage,
  Chip,
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  V1Link,
  toneText,
} from "@/components/admin-v2/primitives";
import { ProjectCard, TaskLine } from "@/components/admin-v2/WorkItems";
import TaskEditor from "@/components/admin-v2/TaskEditor";

// TODAY — the start of a workday, not an analytics page.
//
// AX Studio OS layout: a centred frame; your next moves, projects in motion
// and the newest studio work share one column, with the studio desk and the
// week alongside. Every count is a link into the work.
//
// Everything on this page is real: tasks are the `tasks` table, projects and
// requests come from client portals through the Desk RPCs, review counts are
// read off the mockup rows, and the action queue is the same derived list the
// Overview always had. Nothing here is sample data.

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const PULSE_TONES = {
  red: { pulse: "var(--ax-red)", ink: "var(--ax-red-ink)" },
  amber: { pulse: "var(--ax-amber)", ink: "var(--ax-amber-ink)" },
  blue: { pulse: "var(--ax-blue)", ink: "var(--ax-blue-ink)" },
  green: { pulse: "var(--ax-accent)", ink: "var(--ax-accent-ink)" },
} as const;

export default function V2Overview() {
  const { data, isLoading, isError, error, refetch } = useOverview();
  const tasksQ = useWorkTasks();
  const threadsQ = useDeskThreads();
  const dropsQ = useDeskDrops();
  const waiting = useDeskWaitingCount();
  const [editing, setEditing] = useState<TaskRow | null | "new">(null);

  const loading = isLoading || !data;
  const today = localDay();

  const queue = useMemo(() => focusQueue(tasksQ.data ?? [], today), [tasksQ.data, today]);
  const openTasks = queue.length;

  const projects = useMemo(
    () => (threadsQ.data ?? []).filter((t) => t.kind === "project" && !t.closed),
    [threadsQ.data],
  );

  const review = data?.review;
  const inReview = (review?.awaitingApproval ?? 0) + projects.filter((p) => p.projectStatus === "feedback").length;

  const pulse: Array<{ n: number; label: string; detail: string; to: string; tone: keyof typeof PULSE_TONES }> = [
    { n: openTasks, label: "Your next moves", detail: "Open tasks", to: "/admin-v2/work", tone: "red" },
    {
      n: inReview,
      label: "In review",
      detail: "Mockups awaiting approval and client feedback",
      to: "/admin-v2/library?tab=mockups&stage=awaiting_approval",
      tone: "amber",
    },
    { n: waiting, label: "Client requests", detail: "Waiting on AX in client portals", to: "/admin-v2/desk", tone: "blue" },
    {
      n: review?.approvedNotShared ?? 0,
      label: "Approved, not shared",
      detail: "Approved mockups still hidden from the portal",
      to: "/admin-v2/library?tab=mockups&stage=approved&portal=hidden",
      tone: "green",
    },
  ];

  /* The week: task due dates and scheduled drops, in local days. */
  const week = useMemo(() => {
    const days = weekDays(today);
    const items = new Map<string, Array<{ key: string; label: string; meta: string; to?: string }>>(
      days.map((d) => [d, []]),
    );
    for (const t of tasksQ.data ?? []) {
      if (t.status === "done" || !t.due_date) continue;
      const d = t.due_date.slice(0, 10);
      items.get(d)?.push({ key: `t${t.id}`, label: t.title, meta: "Task due" });
    }
    for (const drop of dropsQ.data ?? []) {
      if (drop.status !== "scheduled" || !drop.scheduledAt) continue;
      const d = localDay(new Date(drop.scheduledAt));
      items.get(d)?.push({
        key: `d${drop.id}`,
        label: drop.title,
        meta: `${drop.clientName} · drop goes live`,
        to: "/admin-v2/releases",
      });
    }
    return days.map((d) => ({ day: d, items: items.get(d) ?? [] }));
  }, [tasksQ.data, dropsQ.data, today]);
  const weekCount = week.reduce((n, d) => n + d.items.length, 0);

  const dateLine = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <PageHeader
        eyebrow={dateLine}
        title={
          <>
            {greeting()}
            <span className="text-[hsl(var(--ax-accent))]">.</span>
          </>
        }
        subtitle="What needs you, what is moving, and what came out of the studio."
        actions={
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-bold text-[hsl(var(--ax-on-accent))]"
          >
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
        }
      />

      {/* Pulse — four counts that open the work. */}
      <div className="ax-pulse mb-7">
        {pulse.map((p) => (
          <Link
            key={p.label}
            to={p.to}
            style={{ ["--pulse" as string]: PULSE_TONES[p.tone].pulse, ["--pulse-ink" as string]: PULSE_TONES[p.tone].ink }}
          >
            <span className="ax-pulse-n block">{loading && p.label !== "Your next moves" ? "–" : String(p.n).padStart(2, "0")}</span>
            <span className="mt-1 block text-[13px] font-bold">{p.label}</span>
            <span className="mt-1 block text-[11px] text-[hsl(var(--ax-secondary))]">
              {p.detail} <ArrowUpRight className="inline h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>

      {isError && (
        <div className="mb-6">
          <ErrorState error={error} what="your overview" onRetry={() => void refetch()} />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ------------------------------------------ main column */}
        <div className="min-w-0">
          <section className="ax-card mb-7 p-0">
            <div className="flex items-end gap-3 border-b border-[hsl(var(--ax-line))] px-5 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <h2 className="ax-sec-rule text-[16px] font-bold">Your next moves</h2>
                <p className="mt-0.5 text-[12px] text-[hsl(var(--ax-secondary))]">
                  Overdue and due today first, then blocked and high-priority work.
                </p>
              </div>
              <Link to="/admin-v2/work" className="shrink-0 text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:underline">
                All tasks <ArrowUpRight className="inline h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-[hsl(var(--ax-line))] px-5">
              {tasksQ.isLoading && <Skeleton className="my-4 h-10" />}
              {tasksQ.isError && (
                <div className="py-4">
                  <ErrorState error={tasksQ.error} what="your tasks" onRetry={() => void tasksQ.refetch()} />
                </div>
              )}
              {!tasksQ.isLoading && !tasksQ.isError && queue.length === 0 && (
                <p className="py-5 text-[13px] text-[hsl(var(--ax-secondary))]">
                  No open tasks.{" "}
                  <button type="button" onClick={() => setEditing("new")} className="font-semibold underline">
                    Add one
                  </button>
                </p>
              )}
              {queue.slice(0, 6).map((t) => (
                <TaskLine key={t.id} task={t} onOpen={setEditing} />
              ))}
            </div>
            {queue.length > 6 && (
              <div className="border-t border-[hsl(var(--ax-line))] px-5 py-2.5 text-[12px] text-[hsl(var(--ax-secondary))]">
                {queue.length - 6} more on the board.
              </div>
            )}
          </section>

          <Section
            title="Action required"
            detail="Work that cannot move forward without a decision."
            count={data?.actions.length}
            empty="Nothing waiting. Every mockup, product and blank is in a settled state."
          >
            <div className="grid gap-2">
              {loading && <Skeleton className="h-16" />}
              {data?.actions.map((a) => (
                <Link key={a.id} to={a.to} className="ax-card ax-card-hover flex items-center gap-4 px-4 py-3.5 transition-all">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold tabular-nums"
                    style={{ background: `hsl(${a.tone} / 0.14)`, color: toneText(a.tone) }}
                  >
                    {a.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{a.label}</span>
                    <span className="block truncate text-[12px] text-[hsl(var(--ax-secondary))]">{a.detail}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--ax-faint))]" />
                </Link>
              ))}
            </div>
          </Section>

          <Section
            title="Projects in motion"
            detail="Client projects started from their portals."
            count={threadsQ.isLoading ? undefined : projects.length}
            empty="No open client projects. They appear here when a client starts one from their portal."
            action={
              <Link to="/admin-v2/work" className="text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:underline">
                All projects <ArrowUpRight className="inline h-3 w-3" />
              </Link>
            }
          >
            {threadsQ.isError ? (
              <ErrorState error={threadsQ.error} what="client projects" onRetry={() => void threadsQ.refetch()} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {threadsQ.isLoading && <Skeleton className="h-32" />}
                {projects.slice(0, 4).map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="From the studio"
            detail="The newest mockups across every client."
            count={data?.recentConcepts.length}
            empty="No mockups yet. Open a client space and build one from a design or a blank."
            action={
              <Link to="/admin-v2/library?tab=mockups" className="text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:underline">
                Open asset library <ArrowUpRight className="inline h-3 w-3" />
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data?.recentConcepts.map((c) => {
                const stage = stageOf(c);
                return (
                  <Link
                    key={c.id}
                    to={c.entityId ? entityLibraryHref(c.entityId, { mockup: c.id }) : "/admin-v2/people"}
                    title={c.entityId ? `Open ${c.title}` : "This mockup has no owner — pick one"}
                    className="ax-card ax-card-hover overflow-hidden p-0 transition-all"
                  >
                    <AssetImage {...mockupCover(c)} alt={c.title} className="aspect-square w-full bg-[hsl(204_23%_94%)]" fit="contain" fallbackSeed={c.id} />
                    <div className="p-3">
                      <div className="truncate text-[13px] font-semibold">{c.title}</div>
                      <div className="mt-1.5">
                        <Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Section>
        </div>

        {/* ------------------------------------------ right column */}
        <aside className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          {/* The studio desk. Honest about what happens: AX compiles a prompt
              from the master library and you take it to ChatGPT. Nothing is
              generated on this page. */}
          <div
            className="rounded-2xl border p-5 text-white"
            style={{ background: "linear-gradient(145deg,#3a3450,#202c3c)", borderColor: "#6e6391" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#dbc6fb]">Creative Studio</div>
            <h2 className="mt-2 text-[20px] font-extrabold leading-tight" style={{ color: "#faf7ff" }}>
              Brief the next piece.
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-[#d1c9de]">
              Production prompts are built from the master apparel library. You run them in ChatGPT and upload the
              result — nothing is shown as made until the file exists.
            </p>
            <div className="mt-4 grid gap-2">
              <Link
                to="/admin-v2/creative?tab=prompts"
                className="flex items-center justify-center gap-2 rounded-full bg-[#d3bbf5] px-4 py-2 text-[12px] font-bold text-[#2a193e] hover:bg-[#e5cffc]"
              >
                <Sparkles className="h-3.5 w-3.5" /> Build a production prompt
              </Link>
              <Link
                to="/admin-v2/creative?tab=assets"
                className="flex items-center justify-center rounded-full border border-[#80728f] px-4 py-2 text-[12px] font-semibold text-[#f7f2fc] hover:bg-white/10"
              >
                Asset briefs
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e5d9bb] bg-[#fffaf0] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#805b05]">This week</div>
            <h2 className="mt-1 text-[15px] font-bold">
              {weekCount === 0 ? "Nothing dated this week" : `${weekCount} dated ${weekCount === 1 ? "item" : "items"}`}
            </h2>
            <div className="mt-3 space-y-3">
              {week
                .filter((d) => d.items.length > 0 || d.day === today)
                .map((d) => {
                  const [y, m, day] = d.day.split("-").map(Number);
                  const label = new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
                  return (
                    <div key={d.day} className="flex gap-3">
                      <span className={`w-14 shrink-0 text-[11px] font-semibold ${d.day === today ? "text-[#805b05]" : "text-[#857859]"}`}>
                        {d.day === today ? "Today" : label}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {d.items.length === 0 && <span className="text-[11px] text-[#82775e]">Clear</span>}
                        {d.items.map((it) =>
                          it.to ? (
                            <Link key={it.key} to={it.to} className="block hover:underline">
                              <span className="block truncate text-[12px] font-bold">{it.label}</span>
                              <span className="block truncate text-[10px] text-[#82775e]">{it.meta}</span>
                            </Link>
                          ) : (
                            <div key={it.key}>
                              <span className="block truncate text-[12px] font-bold">{it.label}</span>
                              <span className="block truncate text-[10px] text-[#82775e]">{it.meta}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            <p className="mt-3 text-[10px] text-[#82775e]">Task due dates and scheduled drops, in your timezone.</p>
          </div>

          <div className="ax-card p-0">
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <h2 className="ax-sec-rule flex-1 text-[14px] font-bold">Recent orders</h2>
              <Link to="/admin-v2/orders" className="text-[11px] font-semibold text-[hsl(var(--ax-secondary))] hover:underline">
                All
              </Link>
            </div>
            <div className="divide-y divide-[hsl(var(--ax-line))]">
              {loading && <Skeleton className="m-4 h-10" />}
              {data?.recentOrders.length === 0 && <p className="px-4 pb-4 text-[12px] text-[hsl(var(--ax-secondary))]">No orders recorded yet.</p>}
              {data?.recentOrders.slice(0, 5).map((o) => (
                <V1Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-2 px-4 py-2.5 text-[12px] hover:bg-white/[0.03]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{o.name ?? "—"}</span>
                    <span className="block truncate text-[11px] text-[hsl(var(--ax-secondary))]">
                      {o.customerName ?? "—"} · {o.fulfillmentStatus ?? "unfulfilled"}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtMoney(o.total)}</span>
                </V1Link>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {editing && <TaskEditor task={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
