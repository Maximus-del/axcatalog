import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";

interface ClientRow {
  id: string;
  name: string;
  kind: "athlete" | "brand";
}

const RANK_STYLES = [
  { bg: "#ffd700", color: "#000" }, // gold
  { bg: "#c0c0c0", color: "#000" }, // silver
  { bg: "#cd7f32", color: "#000" }, // bronze
];

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank - 1];
  if (style) {
    return (
      <div
        className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0"
        style={{ background: style.bg, color: style.color }}
      >
        {rank}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0 border border-border text-muted-foreground">
      {rank}
    </div>
  );
}

export function TopClients() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [athletesRes, teamsRes] = await Promise.all([
        supabase
          .from("athletes")
          .select("id, full_name, first_name, last_name")
          .eq("status", "active"),
        supabase
          .from("teams")
          .select("id, name, metadata"),
      ]);
      if (cancelled) return;

      const athletes: ClientRow[] = (athletesRes.data ?? []).map((a) => ({
        id: a.id,
        name: a.full_name || `${a.first_name} ${a.last_name}`.trim(),
        kind: "athlete",
      }));
      const brands: ClientRow[] = (teamsRes.data ?? [])
        .filter((t) => {
          const meta = t.metadata as Record<string, unknown> | null;
          return meta && meta.entity_type === "brand";
        })
        .map((t) => ({ id: t.id, name: t.name, kind: "brand" }));

      const combined = [...athletes, ...brands].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setClients(combined);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="ax-card p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <div className="ax-section-header mb-1">Top Earning Clients</div>
        <p className="text-xs text-muted-foreground">
          Revenue data will populate after Shopify sync is configured.
        </p>
      </div>

      <div className="divide-y divide-border">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}

        {!loading && clients && clients.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No active clients yet.
          </div>
        )}

        {!loading &&
          clients?.map((c, idx) => {
            const rank = idx + 1;
            return (
              <div
                key={`${c.kind}-${c.id}`}
                className={cn("flex items-center gap-3 px-5 py-3 ax-row-hover transition-colors")}
              >
                <RankBadge rank={rank} />
                <div
                  className="flex items-center justify-center h-9 w-9 rounded-full text-xs font-semibold text-white shrink-0"
                  style={{ background: avatarColorFor(c.name) }}
                >
                  {initialsFor(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate font-medium text-sm">
                      {c.name}
                      {c.kind === "brand" && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Brand
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">— orders</div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: "0%" }} />
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums w-8 text-right">—</div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
