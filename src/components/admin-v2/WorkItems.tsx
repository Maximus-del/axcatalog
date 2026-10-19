import { Link } from "react-router-dom";
import { Check, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { StatusTag } from "./primitives";
import {
  STATUS_LABEL,
  STATUS_TONE,
  deskThreadHref,
  dueLabel,
  dueState,
  priorityOf,
  projectSignal,
  useSetTaskStatus,
  type TaskRow,
} from "@/lib/v2/work";
import type { DeskThread } from "@/lib/v2/desk";
import { entityHref } from "@/lib/v2/entity-nav";
import { tintOf } from "@/lib/v2/entity";

/** One task, as a row: complete / reopen, open to edit, status in words. */
export function TaskLine({ task, onOpen, showStatus = false }: { task: TaskRow; onOpen: (t: TaskRow) => void; showStatus?: boolean }) {
  const setStatus = useSetTaskStatus();
  const done = task.status === "done";
  const due = dueState(task);
  const prio = priorityOf(task.priority);

  const toggle = () =>
    setStatus.mutate(
      { id: task.id, status: done ? "todo" : "done" },
      {
        onError: (e) =>
          toast.error(done ? "Task not reopened" : "Task not completed", {
            description: e instanceof Error ? e.message : undefined,
          }),
      },
    );

  return (
    <div className="flex items-start gap-3 py-3.5">
      <button
        type="button"
        onClick={toggle}
        disabled={setStatus.isPending}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={done}
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          done
            ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]"
            : task.priority <= 1
              ? "border-[hsl(var(--ax-red))] hover:bg-[hsl(var(--ax-accent)/0.12)]"
              : "border-[hsl(212_14%_72%)] hover:border-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.12)]"
        }`}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(task)}
          className={`block w-full truncate text-left text-[13px] font-semibold leading-snug hover:underline ${
            done ? "text-[hsl(var(--ax-faint))] line-through" : ""
          }`}
        >
          {task.title}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[hsl(var(--ax-secondary))]">
          <span
            className={
              due === "overdue"
                ? "font-semibold text-[hsl(var(--ax-red-ink))]"
                : due === "today"
                  ? "font-semibold text-[hsl(var(--ax-amber-ink))]"
                  : done
                    ? "text-[hsl(var(--ax-accent-ink))]"
                    : ""
            }
          >
            {done ? "Completed" : dueLabel(task)}
          </span>
          {task.assignee && <span>· {task.assignee.full_name || task.assignee.email}</span>}
          {task.tags.length > 0 && <span className="truncate">· {task.tags.join(", ")}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {showStatus && <StatusTag tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</StatusTag>}
        {!done && task.priority <= 1 && <StatusTag tone={prio.tone}>{prio.label}</StatusTag>}
      </div>
    </div>
  );
}

/** A client project from the portal, as a card that opens it on the Desk. */
export function ProjectCard({ project }: { project: DeskThread }) {
  const signal = projectSignal(project);
  return (
    <div className="ax-card flex flex-col overflow-hidden p-0" style={{ borderTop: `3px solid ${project.athleteId ? tintOf(project.athleteId) : "hsl(var(--ax-blue))"}` }}>
      <Link to={deskThreadHref(project.id)} className="block flex-1 p-4 transition-colors hover:bg-white/[0.03]">
        <div className="mb-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--ax-secondary))]">
            {project.clientName}
          </span>
          <StatusTag tone={signal.tone}>{signal.label}</StatusTag>
        </div>
        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug">{project.title || "Untitled project"}</h3>
        {project.lastMessage && (
          <p className="mt-1.5 line-clamp-2 text-[12px] text-[hsl(var(--ax-secondary))]">{project.lastMessage}</p>
        )}
      </Link>
      <div className="flex items-center gap-3 border-t border-[hsl(var(--ax-line))] px-4 py-2.5 text-[11px] text-[hsl(var(--ax-secondary))]">
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" />
          {project.conceptCount} {project.conceptCount === 1 ? "concept" : "concepts"} shared
        </span>
        <span className="flex-1" />
        {project.athleteId && (
          <Link to={entityHref(project.athleteId)} className="font-semibold hover:underline">
            Client space
          </Link>
        )}
      </div>
    </div>
  );
}
