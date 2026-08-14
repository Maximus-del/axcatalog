// Saved — one place for everything a fan bookmarked, with type filters.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ShoppingBag, Image as ImageIcon, Calendar, Ticket, FileText, User, X, type LucideIcon } from "lucide-react";
import { useSavedItems, useSaveActions, type SavedRow, type SavedType } from "@/hooks/useSaved";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import type { PublicAthlete } from "@/lib/ecosystem/types";
import { EmptyState } from "@/components/fan/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<SavedType, LucideIcon> = {
  product: ShoppingBag, content: ImageIcon, camp: Calendar, event: Ticket, article: FileText, athlete: User,
};
const FILTERS: { key: "all" | SavedType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "product", label: "Products" },
  { key: "content", label: "Content" },
  { key: "camp", label: "Camps" },
  { key: "event", label: "Events" },
  { key: "article", label: "Articles" },
];

export default function FanSaved() {
  const { rows, isLoading } = useSavedItems();
  const { unsave } = useSaveActions();
  const { data: athletes = [] } = useDiscoverAthletes();
  const [filter, setFilter] = useState<"all" | SavedType>("all");

  const slugById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of athletes as PublicAthlete[]) m.set(a.id, a.slug);
    return m;
  }, [athletes]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.item_type === filter);

  function linkFor(r: SavedRow): string {
    if (r.item_type === "product") return `/p/${r.item_ref}`;
    const slug = r.athlete_id ? slugById.get(r.athlete_id) : null;
    if (!slug) return "/feed";
    if (r.item_type === "camp" || r.item_type === "event") return `/a/${slug}?tab=camps`;
    if (r.item_type === "content") return `/a/${slug}`;
    return `/a/${slug}`;
  }

  if (isLoading) {
    return <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Nothing saved yet"
        body="Tap the bookmark on products, camps, and content you want to come back to."
        ctaLabel="Explore Shop"
        ctaTo="/feed/shop"
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black tracking-tight">Saved</h1>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scroll-touch">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold border transition-colors",
              filter === f.key ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Nothing saved in this category.</p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((r) => {
            const Icon = TYPE_ICON[r.item_type];
            return (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-accent/12 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-accent" />
                </span>
                <Link to={linkFor(r)} className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{r.title ?? "Saved item"}</div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{r.item_type}</div>
                </Link>
                <button
                  onClick={() => unsave.mutate({ type: r.item_type, ref: r.item_ref })}
                  aria-label="Remove"
                  className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
