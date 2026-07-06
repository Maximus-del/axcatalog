import { Calendar, MoreVertical, Trash2 } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { PRIORITY_META, type TaskRow } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  task: TaskRow;
  onClick: () => void;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export function TaskCard({ task, onClick, onDelete, draggable, onDragStart }: Props) {
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META[2];
  const due = task.due_date ? new Date(task.due_date + "T00:00:00") : null;
  const overdue = due && isPast(due) && !isToday(due) && task.status !== "done";
  const todayDue = due && isToday(due);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        "ax-card group cursor-pointer hover:border-[hsl(var(--ax-accent))] transition-colors relative",
        task.status === "done" && "opacity-60",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full", prio.color)}>
              {prio.label}
            </span>
            {task.tags?.slice(0, 2).map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--ax-line))] text-[hsl(var(--ax-secondary))]"
              >
                {t}
              </span>
            ))}
          </div>
          <div
            className={cn(
              "text-sm font-semibold text-[hsl(var(--ax-ink))] mb-1 leading-snug",
              task.status === "done" && "line-through",
            )}
          >
            {task.title}
          </div>
          {task.description && (
            <div className="text-xs text-[hsl(var(--ax-secondary))] line-clamp-2 mb-2">
              {task.description}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2 text-xs text-[hsl(var(--ax-secondary))]">
        {due ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "text-red-600 dark:text-red-400 font-medium",
              todayDue && "text-amber-600 dark:text-amber-400 font-medium",
            )}
          >
            <Calendar className="h-3 w-3" />
            {format(due, "MMM d")}
          </span>
        ) : (
          <span />
        )}
        {task.assignee ? (
          <span className="truncate">
            {task.assignee.full_name || task.assignee.email}
          </span>
        ) : (
          <span className="italic">Unassigned</span>
        )}
      </div>
    </div>
  );
}