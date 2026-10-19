import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useDeskThreads } from "@/lib/v2/desk";
import {
  BOARD_COLUMNS,
  dueLabel,
  dueState,
  groupByStatus,
  nextStatus,
  priorityOf,
  useSetTaskStatus,
  useWorkTasks,
  type TaskRow,
  type TaskStatus,
} from "@/lib/v2/work";
import { EmptyState, ErrorState, PageHeader, Section, Skeleton, StatusTag, TabBar } from "@/components/admin-v2/primitives";
import { ProjectCard } from "@/components/admin-v2/WorkItems";
import TaskEditor from "@/components/admin-v2/TaskEditor";

// PROJECTS & TASKS.
//
// Tasks are the existing `tasks` table (the same rows as V1's /admin/tasks).
// Projects are the client projects clients start in their portals — the
// `portal_threads` the database marks as projects — opened on the Desk, where
// replies and concept sharing already work. No second project system.

const TABS = ["board", "projects"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { board: "Task board", projects: "Client projects" };

export default function V2Work() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "projects" ? "projects" : "board";
  const query = params.get("q") ?? "";
  const tasksQ = useWorkTasks();
  const threadsQ = useDeskThreads(params.get("closed") === "1");
  const [editing, setEditing] = useState<{ task: TaskRow | null; status?: TaskStatus } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tasksQ.data ?? []).filter(
      (t) => !q || `${t.title} ${t.description ?? ""} ${t.tags.join(" ")}`.toLowerCase().includes(q),
    );
  }, [tasksQ.data, query]);
  const columns = groupByStatus(filtered);

  const projects = useMemo(() => (threadsQ.data ?? []).filter((t) => t.kind === "project"), [threadsQ.data]);

  const patch = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Projects & Tasks"
        title="Keep the work moving."
        subtitle="Your task board with clear owners and due dates, and the client projects coming in from portals."
        actions={
          <button
            type="button"
            onClick={() => setEditing({ task: null })}
            className="flex items-center gap-2 rounded-full bg-[hsl(var(--sec))] px-4 py-2 text-[12px] font-bold text-[#2a1f00]"
          >
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
        }
      />

      <TabBar tabs={TABS} active={tab} onSelect={(t) => patch("tab", t === "board" ? null : t)} label={(t) => TAB_LABEL[t]} />

      {tab === "board" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => patch("q", e.target.value || null)}
              placeholder="Find a task, note or tag…"
              aria-label="Search tasks"
              className="w-full max-w-sm rounded-full border border-[hsl(var(--ax-border))] bg-white px-4 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
            />
            <span className="text-[12px] text-[hsl(var(--ax-secondary))]">
              Tasks are not linked to a client yet — tag them with the client’s name to find them.
            </span>
          </div>

          {tasksQ.isError ? (
            <ErrorState error={tasksQ.error} what="your tasks" onRetry={() => void tasksQ.refetch()} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {BOARD_COLUMNS.map((col) => (
                <div
                  key={col.status}
                  className="ax-board-col rounded-xl border border-[hsl(var(--ax-border))] p-3"
                  style={{ ["--stage" as string]: col.stage }}
                >
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <StatusTag tone={col.tone}>{col.label}</StatusTag>
                    <span className="text-[12px] font-semibold tabular-nums text-[hsl(var(--ax-secondary))]">
                      {tasksQ.isLoading ? "…" : columns[col.status].length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {tasksQ.isLoading && <Skeleton className="h-20" />}
                    {columns[col.status].map((t) => (
                      <BoardCard key={t.id} task={t} onOpen={() => setEditing({ task: t })} />
                    ))}
                    {!tasksQ.isLoading && columns[col.status].length === 0 && (
                      <p className="px-1 py-3 text-[12px] text-[hsl(var(--ax-faint))]">Nothing here.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ task: null, status: col.status })}
                    className="mt-2 w-full rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:bg-white"
                  >
                    + Add task
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "projects" && (
        <Section
          title="Client projects"
          detail="Started by clients in their portals. Open one to reply, share a concept or close it."
          count={threadsQ.isLoading ? undefined : projects.length}
          action={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => patch("closed", params.get("closed") === "1" ? null : "1")}
                className="text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:underline"
              >
                {params.get("closed") === "1" ? "Hide closed" : "Include closed"}
              </button>
              <Link to="/admin-v2/desk" className="text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:underline">
                Client requests <ArrowUpRight className="inline h-3 w-3" />
              </Link>
            </div>
          }
        >
          {threadsQ.isError ? (
            <ErrorState error={threadsQ.error} what="client projects" onRetry={() => void threadsQ.refetch()} />
          ) : threadsQ.isLoading ? (
            <Skeleton className="h-32" />
          ) : projects.length === 0 ? (
            <EmptyState>No client projects yet. They appear here when a client starts one from their portal.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </Section>
      )}

      {editing && <TaskEditor task={editing.task} initialStatus={editing.status} onClose={() => setEditing(null)} />}
    </>
  );
}

function BoardCard({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const setStatus = useSetTaskStatus();
  const prio = priorityOf(task.priority);
  const due = dueState(task);
  const done = task.status === "done";
  const next = nextStatus(task.status);
  const move = () =>
    setStatus.mutate(
      { id: task.id, status: next },
      { onError: (e) => toast.error("Task not moved", { description: e instanceof Error ? e.message : undefined }) },
    );

  return (
    <article
      className="rounded-lg border border-[hsl(var(--ax-border))] bg-white p-3"
      style={!done && task.priority <= 1 ? { borderLeft: "3px solid hsl(var(--ax-red))" } : undefined}
    >
      <button type="button" onClick={onOpen} className={`block w-full text-left text-[13px] font-bold leading-snug hover:underline ${done ? "text-[hsl(var(--ax-faint))] line-through" : ""}`}>
        {task.title}
      </button>
      {task.description && <p className="mt-1 line-clamp-2 text-[11px] text-[hsl(var(--ax-secondary))]">{task.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StatusTag tone={prio.tone}>{prio.label}</StatusTag>
        {task.tags.slice(0, 2).map((t) => (
          <StatusTag key={t} tone="slate">
            {t}
          </StatusTag>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-[hsl(var(--ax-line))] pt-2 text-[11px]">
        <span
          className={`min-w-0 flex-1 truncate ${
            due === "overdue" ? "font-semibold text-[hsl(var(--ax-red-ink))]" : "text-[hsl(var(--ax-secondary))]"
          }`}
        >
          {done ? "Completed" : dueLabel(task)}
          {task.assignee ? ` · ${task.assignee.full_name || task.assignee.email}` : ""}
        </span>
        <button
          type="button"
          onClick={move}
          disabled={setStatus.isPending}
          className="flex shrink-0 items-center gap-1 rounded-md border border-[hsl(var(--ax-border))] px-2 py-1 font-semibold hover:bg-white/10"
          aria-label={done ? `Reopen ${task.title}` : `Move ${task.title} to ${BOARD_COLUMNS.find((c) => c.status === next)?.label}`}
        >
          {done ? (
            <>
              Reopen <RotateCcw className="h-3 w-3" />
            </>
          ) : (
            <>
              {BOARD_COLUMNS.find((c) => c.status === next)?.label} <ArrowRight className="h-3 w-3" />
            </>
          )}
        </button>
      </div>
    </article>
  );
}
