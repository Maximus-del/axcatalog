// The command center.
//
// Six numbers for where the business stands, four cards for where you want to
// work, and a queue of things actually waiting on you. Everything else that
// used to be here — an activity feed, a grid of athlete portraits — was a
// second copy of navigation that already exists one click away.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Star, ShoppingBag, Newspaper, CalendarDays, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENTS, toolCount } from "@/lib/admin-ia";

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
      const [athletes, followers, access, products, content, events, drafts, eventsDraft, pendingApproval, changesRequested, eventsNoReg] = await Promise.all([
        num(head("public_athletes")),
        num(head("athlete_follows")),
        num(head("athlete_follows").in("state", ["subscriber", "vip"])),
        num(head("public_athlete_products")),
        num(head("content_assets").eq("status", "published")),
        num(head("events")),
        num(head("content_assets").eq("status", "draft")),
        num(head("events").eq("status", "draft")),
        num(head("products").eq("approval_state", "pending")),
        num(head("products").eq("approval_state", "rejected")),
        num(head("events").is("registration_url", null)),
      ]);
      return { athletes, followers, access, products, content, events, drafts, eventsDraft, pendingApproval, changesRequested, eventsNoReg };
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

  const actions = [
    { label: "products waiting for athlete approval", value: stats?.pendingApproval ?? 0, to: "/admin/athletes" },
    { label: "products with changes requested", value: stats?.changesRequested ?? 0, to: "/admin/athletes" },
    { label: "events missing a registration link", value: stats?.eventsNoReg ?? 0, to: "/admin/events" },
    { label: "content posts in draft", value: stats?.drafts ?? 0, to: "/admin/content" },
    { label: "events not yet published", value: stats?.eventsDraft ?? 0, to: "/admin/events" },
  ].filter((a) => a.value > 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Command center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where things stand, and where you want to work.
        </p>
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

      {/* The four departments. Entry points, not mini dashboards — a card says
          what is inside and how much of it, and nothing else. Listing the tools
          here would put the whole navigation back on the homepage, which is the
          thing this replaced. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DEPARTMENTS.map((d) => {
          const Icon = d.icon;
          return (
            <Link
              key={d.key}
              to={d.home}
              className="ax-card group p-5 flex flex-col min-h-[190px] hover:border-[hsl(var(--ax-accent)/0.5)] transition-colors"
            >
              <span className="h-11 w-11 rounded-[13px] bg-[hsl(var(--ax-accent)/0.12)] flex items-center justify-center">
                <Icon className="h-5 w-5 text-[hsl(var(--ax-accent))]" />
              </span>
              <h2 className="mt-4 text-lg font-bold">{d.label}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground leading-snug">{d.description}</p>
              <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-[12px] text-[hsl(var(--ax-faint))]">
                  {toolCount(d)} tools
                </span>
                <ArrowRight className="h-4 w-4 text-[hsl(var(--ax-faint))] group-hover:text-[hsl(var(--ax-accent))] group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Kept, deliberately: this is the one thing on the homepage that is work
          rather than navigation, and it is empty whenever there is nothing to
          do — so it costs nothing on a quiet day. */}
      {actions.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--ax-amber))]" /> Needs you
          </h2>
          <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
            {actions.map((a) => (
              <Link key={a.label} to={a.to} className="flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--ax-line))] transition-colors">
                <span className="h-7 min-w-7 px-2 rounded-lg bg-[hsl(var(--ax-amber)/0.15)] text-[hsl(var(--ax-amber))] font-black text-sm flex items-center justify-center">{a.value}</span>
                <span className="flex-1 text-sm font-medium">{a.label}</span>
                <ArrowRight className="h-4 w-4 text-[hsl(var(--ax-faint))]" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
