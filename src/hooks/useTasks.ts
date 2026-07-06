import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"] & {
  assignee?: { id: string; full_name: string | null; email: string | null } | null;
};

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

export const PRIORITY_META: Record<number, { label: string; color: string }> = {
  1: { label: "High", color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  2: { label: "Medium", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  3: { label: "Low", color: "bg-slate-500/15 text-slate-700 dark:text-slate-400" },
};

export function useTasks() {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select(
        `*, assignee:user_profiles!tasks_assigned_to_fkey(id, full_name, email)`,
      )
      .order("priority", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setTasks((data ?? []) as TaskRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = useCallback(
    async (id: string, status: TaskStatus) => {
      // Optimistic
      setTasks((prev) =>
        prev
          ? prev.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    completed_at: status === "done" ? new Date().toISOString() : null,
                  }
                : t,
            )
          : prev,
      );
      await supabase
        .from("tasks")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", id);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    await supabase.from("tasks").delete().eq("id", id);
  }, []);

  return { tasks, loading, load, updateStatus, remove };
}

export async function getCurrentOrgId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  return data?.organization_id ?? null;
}