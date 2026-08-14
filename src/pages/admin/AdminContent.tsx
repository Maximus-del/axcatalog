// Global content view — all athlete content across the network. Creation
// happens on each athlete's Content tab (shared content_assets object).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Newspaper, Lock } from "lucide-react";
import { listOrgContent } from "@/lib/ecosystem/content";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";

export default function AdminContent() {
  const { data: content = [], isLoading } = useQuery({ queryKey: ["op-all-content"], queryFn: () => listOrgContent(200) });
  const { data: athletes = [] } = useDiscoverAthletes();
  const nameById = useMemo(() => new Map((athletes as PublicAthlete[]).map((a) => [a.id, athleteName(a)] as const)), [athletes]);
  const slugById = useMemo(() => new Map((athletes as PublicAthlete[]).map((a) => [a.id, a.slug] as const)), [athletes]);

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content</h1>
        <p className="text-sm text-muted-foreground mt-1">All content across the network. Create and edit from each athlete's Content tab.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : content.length === 0 ? (
        <div className="ax-card p-10 text-center">
          <Newspaper className="h-8 w-8 text-[hsl(var(--ax-accent))] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No content yet. Open an athlete and use the Content tab to publish photos, videos, blogs, and Access posts.</p>
          <Link to="/admin/athletes" className="mt-4 inline-block text-[hsl(var(--ax-accent))] font-semibold text-sm">Go to athletes →</Link>
        </div>
      ) : (
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
          {content.map((c) => (
            <Link
              key={c.id}
              to={c.athlete_id ? `/admin/athletes/${c.athlete_id}` : "/admin/content"}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--ax-line))] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate flex items-center gap-2">
                  {c.visibility !== "public" && c.visibility !== "followers" && <Lock className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />}
                  {c.title}
                </div>
                <div className="text-[12px] text-[hsl(var(--ax-faint))]">
                  {c.athlete_id ? nameById.get(c.athlete_id) ?? "Athlete" : "Goat Farm editorial"} · <span className="capitalize">{c.type}</span> · {c.visibility}
                </div>
              </div>
              <span className={c.status === "published" ? "text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]" : "text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]"}>
                {c.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
