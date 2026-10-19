import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  BOARD_COLUMNS,
  draftOf,
  useAssignees,
  useDeleteTask,
  useSaveTask,
  type TaskDraft,
  type TaskRow,
  type TaskStatus,
} from "@/lib/v2/work";

// Create / edit one task, in V2's own panel.
//
// The fields and the write are V1's TaskFormDialog's, through useSaveTask —
// the same `tasks` table, the same RLS. It is rebuilt here only because V1's
// dialog is a shadcn portal that renders outside the V2 shell and therefore
// outside its theme.

const field =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-white px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";

export default function TaskEditor({
  task,
  initialStatus,
  onClose,
}: {
  /** null = a new task. */
  task: TaskRow | null;
  initialStatus?: TaskStatus;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    ...draftOf(task),
    ...(task ? {} : initialStatus ? { status: initialStatus } : {}),
  }));
  const [tagsText, setTagsText] = useState((task?.tags ?? []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveTask();
  const del = useDeleteTask();
  const assignees = useAssignees();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: task?.id,
        draft: { ...draft, tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean) },
      });
      toast.success(task ? "Task updated" : "Task created");
      onClose();
    } catch (e) {
      toast.error(task ? "Task not saved" : "Task not created", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const remove = async () => {
    if (!task) return;
    try {
      await del.mutateAsync(task.id);
      toast.success("Task deleted");
      onClose();
    } catch (e) {
      toast.error("Task not deleted", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#142b3c]/50" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-white sm:rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-5 py-4">
          <h2 id="task-editor-title" className="flex-1 text-[17px] font-bold">
            {task ? "Edit task" : "New task"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-[hsl(var(--ax-secondary))] hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
            Title
            <input autoFocus className={`${field} mt-1.5`} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?" required />
          </label>
          <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
            Notes
            <textarea rows={3} className={`${field} mt-1.5`} value={draft.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
              Status
              <select className={`${field} mt-1.5`} value={draft.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                {BOARD_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
              Priority
              <select className={`${field} mt-1.5`} value={draft.priority} onChange={(e) => set("priority", Number(e.target.value))}>
                <option value={1}>High</option>
                <option value={2}>Medium</option>
                <option value={3}>Low</option>
              </select>
            </label>
            <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
              Due
              <input type="date" className={`${field} mt-1.5`} value={draft.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </label>
            <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
              Owner
              <select
                className={`${field} mt-1.5`}
                value={draft.assignedTo ?? ""}
                onChange={(e) => set("assignedTo", e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {(assignees.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email || "Unnamed user"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
            Tags <span className="font-normal">— comma separated. Until tasks can link to a client, a client name here is how to find them.</span>
            <input className={`${field} mt-1.5`} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Mooney, launch" />
          </label>
        </div>

        <div className="flex items-center gap-2 border-t border-[hsl(var(--ax-line))] px-5 py-3.5">
          {task &&
            (confirmDelete ? (
              <button type="button" onClick={() => void remove()} disabled={del.isPending} className="rounded-full bg-[hsl(var(--ax-red))] px-3.5 py-2 text-[12px] font-semibold text-white">
                {del.isPending ? "Deleting…" : "Delete for good"}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] text-[hsl(var(--ax-red))]">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ))}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-full border border-[hsl(var(--ax-border))] px-4 py-2 text-[12px] font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="flex items-center gap-2 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-bold text-[hsl(var(--ax-on-accent))] disabled:opacity-60"
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {task ? "Save" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
