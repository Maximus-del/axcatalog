import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Building2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  shopify_connected: boolean;
  shopify_shop_domain: string | null;
  pricing_tier: { id: string; name: string } | null;
  athlete_count: number;
  team_count: number;
  collection_count: number;
  product_count: number;
}

function tally(data: Array<{ organization_id: string }> | null) {
  const m = new Map<string, number>();
  (data ?? []).forEach((r) =>
    m.set(r.organization_id, (m.get(r.organization_id) ?? 0) + 1),
  );
  return m;
}

export default function OrganizationsList() {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [connectedFilter, setConnectedFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("organizations")
      .select(
        `id, name, slug, shopify_connected, shopify_shop_domain,
         pricing_tier:pricing_tiers!organizations_pricing_tier_id_fkey(id, name)`,
      )
      .order("name", { ascending: true });

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setOrgs([]);
      setLoading(false);
      return;
    }

    const [ath, tm, col, prod] = await Promise.all([
      supabase.from("athletes").select("organization_id").in("organization_id", ids),
      supabase.from("teams").select("organization_id").in("organization_id", ids),
      supabase.from("collections").select("organization_id").in("organization_id", ids),
      supabase.from("products").select("organization_id").in("organization_id", ids),
    ]);
    const athleteCounts = tally(ath.data);
    const teamCounts = tally(tm.data);
    const collectionCounts = tally(col.data);
    const productCounts = tally(prod.data);

    setOrgs(
      (rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        shopify_connected: r.shopify_connected,
        shopify_shop_domain: r.shopify_shop_domain,
        pricing_tier: Array.isArray(r.pricing_tier)
          ? (r.pricing_tier[0] ?? null)
          : (r.pricing_tier as OrgRow["pricing_tier"]),
        athlete_count: athleteCounts.get(r.id) ?? 0,
        team_count: teamCounts.get(r.id) ?? 0,
        collection_count: collectionCounts.get(r.id) ?? 0,
        product_count: productCounts.get(r.id) ?? 0,
      })) as OrgRow[],
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = search.trim().toLowerCase();
    return orgs.filter((o) => {
      if (connectedFilter === "connected" && !o.shopify_connected) return false;
      if (connectedFilter === "not_connected" && o.shopify_connected) return false;
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q) ||
        (o.shopify_shop_domain ?? "").toLowerCase().includes(q)
      );
    });
  }, [orgs, search, connectedFilter]);

  const isEmpty = !loading && orgs && orgs.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Clients</div>
          <h1 className="text-3xl font-bold">Organizations</h1>
        </div>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={connectedFilter} onValueChange={setConnectedFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shopify status</SelectItem>
              <SelectItem value="connected">Shopify connected</SelectItem>
              <SelectItem value="not_connected">Not connected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ax-card space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-[12px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">No organizations yet.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((o) => (
            <Link
              to={`/admin/organizations/${o.id}`}
              key={o.id}
              className="ax-card-hover block group"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center h-12 w-12 rounded-[12px] text-sm font-semibold text-white shrink-0"
                  style={{ background: avatarColorFor(o.name) }}
                >
                  {initialsFor(o.name)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{o.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {o.pricing_tier?.name ? `${o.pricing_tier.name} tier` : "No pricing tier"}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {o.shopify_connected ? (
                  <span className="ax-badge-success inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {o.shopify_shop_domain ?? "Shopify connected"}
                  </span>
                ) : (
                  <span className="ax-badge-pending">Not connected</span>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground tabular-nums">
                {o.athlete_count} athletes · {o.team_count} teams ·{" "}
                {o.product_count} products · {o.collection_count} collections
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && orgs && orgs.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No organizations match your filters.
        </div>
      )}
    </div>
  );
}
