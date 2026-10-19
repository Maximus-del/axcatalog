// AX Studio OS — Projects & Tasks over the EXISTING `tasks` table.
//
// No new task system. This reads and writes the same rows V1's /admin/tasks
// does (same select, same status/complete semantics as src/hooks/useTasks.ts),
// through React Query so Today, the board and the shell's badge share one
// fetch and one cache.
//
// What the table cannot do yet is said here rather than faked:
//   - a task has no client or project link (org-scoped only)
//   - there is no "in review" status (todo / in_progress / blocked / done)
// The smallest additive fix for both is in
// supabase/proposed/20261019_tasks_client_project_links.sql — not applied.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskRow, TaskStatus } from "@/hooks/useTasks";
import type { StatusTone } from "@/components/admin-v2/primitives";
import { must } from "./db";
import type { DeskThread } from "./desk";

export type { TaskRow, TaskStatus };

const KEY = ["v2", "tasks"] as const;

async function fetchTasks(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`*, assignee:user_profiles!tasks_assigned_to_fkey(id, full_name, email)`)
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskRow[];
}

export function useWorkTasks() {
  return useQuery({ queryKey: KEY, queryFn: fetchTasks, staleTime: 30_000 });
}

/** Open tasks, for the shell badge. Zero while loading or on failure — a badge never guesses. */
export function useOpenTaskCount(): number {
  const { data } = useWorkTasks();
  return (data ?? []).filter((t) => t.status !== "done").length;
}

export function useRefreshTasks() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: KEY });
}

/** Same write as V1's updateStatus: completing stamps completed_at, reopening clears it. */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      await must(
        supabase
          .from("tasks")
          .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
          .eq("id", id),
      );
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<TaskRow[]>(KEY);
      qc.setQueryData<TaskRow[]>(KEY, (rows) =>
        rows?.map((t) =>
          t.id === id ? { ...t, status, completed_at: status === "done" ? new Date().toISOString() : null } : t,
        ),
      );
      return { previous };
    },
    // A rejected write puts the real value back instead of leaving a lie on screen.
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/* ------------------------------------------------------------ pure helpers */

/** Board columns, in workflow order. Blocked is shown, not hidden — it is red work. */
export const BOARD_COLUMNS: Array<{ status: TaskStatus; label: string; tone: StatusTone; stage: string }> = [
  { status: "todo", label: "Ready", tone: "slate", stage: "210 22% 52%" },
  { status: "in_progress", label: "In progress", tone: "blue", stage: "212 59% 49%" },
  { status: "blocked", label: "Blocked", tone: "red", stage: "1 70% 58%" },
  { status: "done", label: "Done", tone: "green", stage: "125 97% 34%" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const STATUS_TONE: Record<TaskStatus, StatusTone> = {
  todo: "slate",
  in_progress: "blue",
  blocked: "red",
  done: "green",
};

/**
 * V1's priority scale: 1 high, 2 medium, 3 low.
 * Only High carries a signal colour (red = urgent). Medium and Low stay
 * neutral, because yellow means "in review" everywhere else in the system.
 */
export function priorityOf(p: number): { label: string; tone: StatusTone } {
  if (p <= 1) return { label: "High", tone: "red" };
  if (p === 2) return { label: "Medium", tone: "slate" };
  return { label: "Low", tone: "slate" };
}

/** Next status when the operator presses "Move →" on a card. */
export function nextStatus(s: TaskStatus): TaskStatus {
  if (s === "todo") return "in_progress";
  if (s === "in_progress") return "done";
  if (s === "blocked") return "in_progress";
  return "todo"; // reopen
}

/** Local calendar day as YYYY-MM-DD — due dates are plain dates, compared in the operator's timezone. */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

export type DueState = "none" | "overdue" | "today" | "soon" | "later" | "done";

export function dueState(task: Pick<TaskRow, "due_date" | "status">, today = localDay()): DueState {
  if (task.status === "done") return "done";
  if (!task.due_date) return "none";
  const due = task.due_date.slice(0, 10);
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due <= addDays(today, 7)) return "soon";
  return "later";
}

export function dueLabel(task: Pick<TaskRow, "due_date" | "status">, today = localDay()): string {
  if (!task.due_date) return "No due date";
  const due = task.due_date.slice(0, 10);
  const state = dueState(task, today);
  const [y, m, d] = due.split("-").map(Number);
  const pretty = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (state === "overdue") return `Overdue · ${pretty}`;
  if (state === "today") return "Due today";
  if (due === addDays(today, 1)) return "Due tomorrow";
  return `Due ${pretty}`;
}

/**
 * Today's queue: open work, urgent first.
 * Overdue → due today → high priority → soonest due → newest.
 */
export function focusQueue(tasks: TaskRow[], today = localDay()): TaskRow[] {
  const rank = (t: TaskRow) => {
    const s = dueState(t, today);
    if (s === "overdue") return 0;
    if (s === "today") return 1;
    if (t.status === "blocked") return 2;
    if (t.priority <= 1) return 3;
    return 4;
  };
  return tasks
    .filter((t) => t.status !== "done")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.priority - b.priority ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        b.created_at.localeCompare(a.created_at),
    );
}

export function groupByStatus(tasks: TaskRow[]): Record<TaskStatus, TaskRow[]> {
  const out: Record<TaskStatus, TaskRow[]> = { todo: [], in_progress: [], blocked: [], done: [] };
  for (const t of tasks) (out[t.status] ?? out.todo).push(t);
  return out;
}

/** The next seven local days, for the Today week strip. */
export function weekDays(today = localDay()): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i));
}

/* ------------------------------------------------------------ editing */

export interface TaskDraft {
  title: string;
  description: string;
  priority: number;
  status: TaskStatus;
  dueDate: string; // YYYY-MM-DD or ""
  assignedTo: string | null;
  tags: string[];
}

export function draftOf(task?: TaskRow | null): TaskDraft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    priority: task?.priority ?? 2,
    status: task?.status ?? "todo",
    dueDate: task?.due_date ?? "",
    assignedTo: task?.assigned_to ?? null,
    tags: task?.tags ?? [],
  };
}

/** The columns a save writes — identical to V1's TaskFormDialog. */
export function taskColumns(d: TaskDraft) {
  return {
    title: d.title.trim(),
    description: d.description.trim() || null,
    priority: d.priority,
    status: d.status,
    due_date: d.dueDate || null,
    assigned_to: d.assignedTo,
    tags: d.tags.map((t) => t.trim()).filter(Boolean),
  };
}

export function useAssignees() {
  return useQuery({
    queryKey: ["v2", "assignees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
    staleTime: 5 * 60_000,
  });
}

/** Create or update, through the same org-scoped table and RLS policy V1 uses. */
export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: TaskDraft }) => {
      if (!draft.title.trim()) throw new Error("A task needs a title.");
      const cols = taskColumns(draft);
      if (id) {
        await must(
          supabase
            .from("tasks")
            .update({ ...cols, completed_at: cols.status === "done" ? new Date().toISOString() : null })
            .eq("id", id),
        );
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("You are signed out.");
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!profile?.organization_id) throw new Error("Your account has no organisation, so the task has nowhere to live.");
      await must(
        supabase.from("tasks").insert({
          ...cols,
          organization_id: profile.organization_id,
          created_by: userId,
          completed_at: cols.status === "done" ? new Date().toISOString() : null,
        }),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await must(supabase.from("tasks").delete().eq("id", id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/* ------------------------------------------------------- client projects */


/**
 * A client project's state, in the approved status language.
 * Projects come from the portal (portal_threads the DB marks as projects);
 * their status is the portal's own project status, not a new one.
 */
export function projectSignal(t: Pick<DeskThread, "projectStatus" | "waitingOnAx" | "closed">): {
  label: string;
  tone: StatusTone;
} {
  if (t.closed || t.projectStatus === "archived") return { label: "Closed", tone: "slate" };
  switch (t.projectStatus) {
    case "requested":
      return t.waitingOnAx ? { label: "New request", tone: "red" } : { label: "Requested", tone: "slate" };
    case "in_progress":
      return { label: "In progress", tone: "blue" };
    case "feedback":
      return { label: "Client feedback", tone: "amber" };
    case "approved":
      return { label: "Approved", tone: "green" };
    default:
      return t.waitingOnAx ? { label: "Waiting on AX", tone: "red" } : { label: "Open", tone: "slate" };
  }
}

export function deskThreadHref(id: string): string {
  return `/admin-v2/desk?thread=${encodeURIComponent(id)}`;
}
