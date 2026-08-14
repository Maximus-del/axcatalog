// Operator Overview — ecosystem health at a glance + Action Required.
// Counts come straight from shared objects (one source of truth).
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Star, ShoppingBag, Newspaper, CalendarDays, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
async function num(p: Promise<{ count: number | null }>): Promise<number> {
  const { count } = await p;
  return count ?? 0;
}
const head = (table: string): Q => supabase.from(table as never).select("*", { count: "exact", head: true });

function useEcosystemStats() {
  return useQuery({
    queryKey: ["operator-overview-stats"],
    queryFn: async () => {
      const [athletes, followers, access, products, content, events, drafts, eventsDraft, designsPending] = await Promise.all([
        num(head("public_athletes")),
        num(head("athlete_follows")),
        num(head("athlete_follows").in("state", ["subscriber", "vip"])),
        num(head("public_athlete_products")),
        num(head("content_assets").eq("status", "published")),
        num(head("events")),
        num(head("content_assets").eq("status", "draft")),
        num(head("events").eq("status", "draft")),
        num(head("designs").in("status", ["concept", "in_progress"])),
      ]);
      return { athletes, followers, access, products, content, events, drafts, eventsDraft, designsPending };
    },
  });
}

const KPI = [
  { key: "athletes", label: "Athletes", icon: Users },
  { key: "followers", label: "Total Followers", icon: TrendingUp },
  { key: "access", label: "Access Members", icon: Star },
  { key: "products", label: "Active Products", icon: ShoppingBag },
  { key: "content", label: "Content Published", icon: Newspaper },
  { key: "events", label: "Events", icon: CalendarDays },
] as const;

export default function AdminOverview() {
  const { data: stats } = useEcosystemStats();
  const { data: athletes = [] } = useDiscoverAthletes();

  const actions = [
    { label: "content posts in draft", value: stats?.drafts ?? 0, to: "/admin/content" },
    { label: "events not yet published", value: stats?.eventsDraft ?? 0, to: "/admin/events" },
    { label: "designs awaiting approval", value: stats?.designsPending ?? 0, to: "/admin/designs" },
  ].filter((a) => a.value > 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Ecosystem Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">One control center for athletes, content, commerce, access, and events.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI.map((k) => {
          const Icon = k.icon;
          const v = stats ? (stats as Record<string, number>)[k.key] : undefined;
          return (
            <div key={k.key} className="ax-card p-4">
              <Icon className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
              <div className="text-2xl font-black mt-2">{v == null ? "—" : v.toLocaleString()}</div>
              <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--ax-faint))] mt-0.5">{k.label}</div>
            </div>
          );
        })}
      </div>

      {actions.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--ax-amber))]" /> Action Required
          </h2>
          <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
            {actions.map((a) => (
              <Link key={a.label} to={a.to} className="flex items-center gap-3 px-4 h-14 hover:bg-[hsl(var(--ax-line))] transition-colors">
                <span className="h-7 min-w-7 px-2 rounded-lg bg-[hsl(var(--ax-amber)/0.15)] text-[hsl(var(--ax-amber))] font-black text-sm flex items-center justify-center">{a.value}</span>
                <span className="flex-1 text-sm font-medium capitalize">{a.value} {a.label}</span>
                <ArrowRight className="h-4 w-4 text-[hsl(var(--ax-faint))]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Athletes</h2>
          <Link to="/admin/athletes" className="text-[12px] font-semibold text-[hsl(var(--ax-accent))]">Manage all →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(athletes as PublicAthlete[]).slice(0, 12).map((a) => (
            <Link key={a.id} to={`/admin/athletes/${a.id}`} className="ax-card p-3 text-center hover:border-[hsl(var(--ax-accent)/0.5)] transition-colors">
              <AthletePhoto athlete={a} className="h-16 w-16 rounded-full mx-auto" textClass="text-lg" />
              <div className="font-semibold text-sm truncate mt-2">{athleteName(a)}</div>
              <div className="text-[11px] text-[hsl(var(--ax-faint))] truncate">{[a.position, a.league].filter(Boolean).join(" · ")}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
