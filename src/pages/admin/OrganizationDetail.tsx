import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Users, Trophy, FolderKanban, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";

interface Org {
  id: string;
  name: string;
  slug: string;
  shopify_connected: boolean;
  shopify_shop_domain: string | null;
  shopify_last_sync_at: string | null;
  pricing_tier: { id: string; name: string } | null;
}

interface AthleteLite {
  id: string;
  full_name: string | null;
  first_name: string;
  last_name: string;
  position: string | null;
  status: string;
}
interface TeamLite {
  id: string;
  name: string;
  city: string | null;
  status: string;
}
interface CollectionLite {
  id: string;
  name: string;
  collection_type: string;
  status: string;
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [athletes, setAthletes] = useState<AthleteLite[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [productCount, setProductCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: o } = await supabase
        .from("organizations")
        .select(
          `id, name, slug, shopify_connected, shopify_shop_domain, shopify_last_sync_at,
           pricing_tier:pricing_tiers!organizations_pricing_tier_id_fkey(id, name)`,
        )
        .eq("id", id)
        .maybeSingle();

      if (!active) return;
      if (!o) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setOrg({
        ...o,
        pricing_tier: Array.isArray(o.pricing_tier)
          ? (o.pricing_tier[0] ?? null)
          : (o.pricing_tier as Org["pricing_tier"]),
      } as Org);

      const [ath, tm, col, prod] = await Promise.all([
        supabase
          .from("athletes")
          .select("id, full_name, first_name, last_name, position, status")
          .eq("organization_id", id)
          .order("last_name", { ascending: true }),
        supabase
          .from("teams")
          .select("id, name, city, status")
          .eq("organization_id", id)
          .order("name", { ascending: true }),
        supabase
          .from("collections")
          .select("id, name, collection_type, status")
          .eq("organization_id", id)
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", id),
      ]);
      if (!active) return;
      setAthletes((ath.data ?? []) as AthleteLite[]);
      setTeams((tm.data ?? []) as TeamLite[]);
      setCollections((col.data ?? []) as CollectionLite[]);
      setProductCount(prod.count ?? 0);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
        <Link to="/admin/organizations" className="text-accent text-sm">
          ← Back to Organizations
        </Link>
        <div className="ax-card p-12 text-center text-muted-foreground">
          Organization not found.
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Athletes", value: athletes.length, icon: Users },
    { label: "Teams", value: teams.length, icon: Trophy },
    { label: "Products", value: productCount, icon: Package },
    { label: "Collections", value: collections.length, icon: FolderKanban },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <Link to="/admin/organizations" className="text-muted-foreground hover:text-foreground text-sm">
        ← Back to Organizations
      </Link>

      <header className="flex items-start gap-4">
        <div
          className="flex items-center justify-center h-16 w-16 rounded-[14px] text-lg font-semibold text-white shrink-0"
          style={{ background: avatarColorFor(org.name) }}
        >
          {initialsFor(org.name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold truncate">{org.name}</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
            <span>{org.slug}</span>
            {org.pricing_tier?.name && (
              <>
                <span>·</span>
                <span>{org.pricing_tier.name} tier</span>
              </>
            )}
            {org.shopify_connected ? (
              <span className="ax-badge-success inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {org.shopify_shop_domain ?? "Shopify connected"}
              </span>
            ) : (
              <span className="ax-badge-pending">Shopify not connected</span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="ax-card">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <Icon className="h-4 w-4" />
                {s.label}
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">{s.value}</div>
            </div>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Athletes</h2>
        {athletes.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">No athletes.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {athletes.map((a) => {
              const name = a.full_name ?? `${a.first_name} ${a.last_name}`;
              return (
                <Link key={a.id} to={`/admin/athletes/${a.id}`} className="ax-card-hover flex items-center gap-3">
                  <div
                    className="flex items-center justify-center h-10 w-10 rounded-full text-xs font-semibold text-white shrink-0"
                    style={{ background: avatarColorFor(name) }}
                  >
                    {initialsFor(name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.position ?? "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Teams</h2>
        {teams.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">No teams.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((t) => (
              <Link key={t.id} to={`/admin/teams/${t.id}`} className="ax-card-hover">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground truncate">{t.city ?? "—"}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Collections</h2>
        {collections.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">No collections.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {collections.map((c) => (
              <Link key={c.id} to={`/admin/collections/${c.id}`} className="ax-card-hover">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground capitalize truncate">{c.collection_type}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
