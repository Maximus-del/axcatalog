import { useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TASK_STATUSES, useTasks, type TaskRow, type TaskStatus } from "@/hooks/useTasks";
import { TaskCard } from "@/components/admin/tasks/TaskCard";
import { TaskFormDialog } from "@/components/admin/tasks/TaskFormDialog";
import { toast } from "sonner";

type View = "kanban" | "list";

export default function TasksList() {
  const { tasks, loading, load, updateStatus, remove } = useTasks();
  const [view, setView] = useState<View>("kanban");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    (tasks ?? []).forEach((t) => {
      if (t.assignee) map.set(t.assignee.id, t.assignee.full_name || t.assignee.email || "—");
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (priority !== "all" && String(t.priority) !== priority) return false;
      if (status !== "all" && t.status !== status) return false;
      if (assignee !== "all") {
        if (assignee === "unassigned" ? t.assigned_to != null : t.assigned_to !== assignee) return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [tasks, search, priority, status, assignee]);

  function openNew() {
    setEditingTask(null);
    setDialogOpen(true);
  }

  function openEdit(t: TaskRow) {
    setEditingTask(t);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    await remove(id);
    toast.success("Task deleted");
  }

  async function handleDrop(newStatus: TaskStatus) {
    if (!draggingId) return;
    const id = draggingId;
    setDraggingId(null);
    await updateStatus(id, newStatus);
  }

  const grouped: Record<TaskStatus, TaskRow[]> = {
    todo: [],
    in_progress: [],
    blocked: [],
    done: [],
  };
  filtered.forEach((t) => grouped[t.status].push(t));

  const isEmpty = !loading && (tasks?.length ?? 0) === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Workspace</div>
          <h1 className="text-3xl font-bold">Tasks</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-[10px] border border-[hsl(var(--ax-border))] p-0.5 bg-[hsl(var(--ax-line))]">
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "h-8 px-3 rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors",
                view === "kanban"
                  ? "bg-white shadow-sm text-[hsl(var(--ax-ink))]"
                  : "text-[hsl(var(--ax-secondary))]",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "h-8 px-3 rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors",
                view === "list"
                  ? "bg-white shadow-sm text-[hsl(var(--ax-ink))]"
                  : "text-[hsl(var(--ax-secondary))]",
              )}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="1">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Low</SelectItem>
            </SelectContent>
          </Select>
          {view === "list" && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <p className="text-muted-foreground">
            No tasks yet. Create one to start tracking work across your org.
          </p>
          <Button onClick={openNew} className="gap-2 mx-auto">
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>
      )}

      {!loading && !isEmpty && view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TASK_STATUSES.map((col) => {
            const items = grouped[col.value];
            return (
              <div
                key={col.value}
                className="min-h-[400px] rounded-[12px] bg-[hsl(var(--ax-line))]/50 p-3"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={() => handleDrop(col.value)}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="text-xs uppercase tracking-[0.14em] font-bold text-[hsl(var(--ax-secondary))]">
                    {col.label}
                  </div>
                  <div className="text-xs font-semibold text-[hsl(var(--ax-faint))] tabular-nums">
                    {items.length}
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      draggable
                      onDragStart={() => setDraggingId(t.id)}
                      onClick={() => openEdit(t)}
                      onDelete={() => handleDelete(t.id)}
                    />
                  ))}
                  {items.length === 0 && (
                    <div className="text-xs text-[hsl(var(--ax-faint))] text-center py-6 italic">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !isEmpty && view === "list" && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="ax-card p-8 text-center text-sm text-muted-foreground">
              No tasks match your filters.
            </div>
          ) : (
            filtered.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onClick={() => openEdit(t)}
                onDelete={() => handleDelete(t.id)}
              />
            ))
          )}
        </div>
      )}

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        onSaved={load}
      />
    </div>
  );
}