import type { Database } from "@/integrations/supabase/types";

export type PortalThread = Database["public"]["Tables"]["portal_threads"]["Row"];
export type PortalMessage = Database["public"]["Tables"]["portal_messages"]["Row"];

export type ThreadCategory = "general" | "question" | "order_request" | "design_feedback";
export type ThreadStatus = "open" | "pending" | "resolved" | "closed";

export const CATEGORY_META: Record<ThreadCategory, { label: string }> = {
  general: { label: "General" },
  question: { label: "Question" },
  order_request: { label: "Order request" },
  design_feedback: { label: "Design feedback" },
};

export const CATEGORY_OPTIONS: ThreadCategory[] = [
  "general",
  "question",
  "order_request",
  "design_feedback",
];

export const STATUS_META: Record<ThreadStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-amber-500/15 text-amber-600" },
  pending: { label: "Pending", className: "bg-blue-500/15 text-blue-600" },
  resolved: {
    label: "Resolved",
    className: "bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]",
  },
  closed: { label: "Closed", className: "bg-[hsl(var(--muted))] text-muted-foreground" },
};

export const STATUS_OPTIONS: ThreadStatus[] = ["open", "pending", "resolved", "closed"];

export function categoryLabel(c: string): string {
  return (CATEGORY_META as Record<string, { label: string }>)[c]?.label ?? c;
}

export function threadTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function messageTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
