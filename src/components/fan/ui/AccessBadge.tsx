// Small pills: content-type label + access-level indicator.
import { Lock, Star } from "lucide-react";
import type { AccessLevel, FeedType } from "@/lib/ecosystem/content-types";
import { FEED_TYPE_LABEL } from "@/lib/ecosystem/content-types";
import { cn } from "@/lib/utils";

export function TypeBadge({ type, className }: { type: FeedType; className?: string }) {
  return (
    <span className={cn("inline-flex items-center h-5 px-2 rounded-full text-[10px] font-black uppercase tracking-[0.12em] bg-white/8 text-foreground/90", className)}>
      {FEED_TYPE_LABEL[type]}
    </span>
  );
}

export function AccessBadge({ level, className }: { level: AccessLevel; className?: string }) {
  if (level === "public" || level === "followers") return null;
  const label = level === "vip" ? "VIP" : "Access";
  return (
    <span className={cn("inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-black uppercase tracking-[0.1em] bg-accent/15 text-accent", className)}>
      {level === "vip" ? <Star className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function NewBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center h-5 px-2 rounded-full text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-accent-foreground", className)}>
      New
    </span>
  );
}
