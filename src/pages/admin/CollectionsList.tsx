import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, FolderKanban } from "lucide-react";
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

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  collection_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  organization: { id: string; name: string } | null;
  athlete: { id: string; full_name: string | null; first_name: string; last_name: string } | null;
  team: { id: string; name: string } | null;
  product_count: number;
  design_count: number;
}

const TYPES = ["athlete", "team", "season", "campaign", "capsule", "other"];

function tallyBy(data: Array<{ collection_id: string }> | null) {
  const m = new Map<string, number>();
  (data ?? []).forEach((r) => m.set(r.collection_id, (m.get(r.collection_id) ?? 0) + 1));
  return m;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function CollectionsList() {
  const [collections, setCollections] = useState<CollectionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("collections")
      .select(
        `id, name, description, collection_type, status, start_date, end_date,
         organization:organizations!collections_organization_id_fkey(id, name),
         athlete:athletes!collections_athlete_id_fkey(id, full_name, first_name, last_name),
         team:teams!collections_team_id_fkey(id, name)`,
      )
      .order("name", { ascending: true });

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setCollections([]);
      setLoading(false);
      return;
    }

    const [prod, des] = await Promise.all([
      supabase.from("collection_products").select("collection_id").in("collection_id", ids),
      supabase.from("collection_designs").select("collection_id").in("collection_id", ids),
    ]);
    const productCounts = tallyBy(prod.data);
    const designCounts = tallyBy(des.data);

    setCollections(
      (rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        collection_type: r.collection_type,
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
        organization: first(r.organization) as CollectionRow["organization"],
        athlete: first(r.athlete) as CollectionRow["athlete"],
        team: first(r.team) as CollectionRow["team"],
        product_count: productCounts.get(r.id) ?? 0,
        design_count: designCounts.get(r.id) ?? 0,
      })) as CollectionRow[],
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!collections) return [];
    const q = search.trim().toLowerCase();
    return collections.filter((c) => {
      if (typeFilter !== "all" && c.collection_type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [collections, search, typeFilter]);

  const isEmpty = !loading && collections && collections.length === 0;

  function ownerLabel(c: CollectionRow) {
    if (c.athlete) return c.athlete.full_name ?? `${c.athlete.first_name} ${c.athlete.last_name}`;
    if (c.team) return c.team.name;
    return c.organization?.name ?? "—";
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Commerce</div>
          <h1 className="text-3xl font-bold">Collections</h1>
        </div>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search collections…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ax-card space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <FolderKanban className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">No collections yet.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Link
              to={`/admin/collections/${c.id}`}
              key={c.id}
              className="ax-card-hover block group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold truncate">{c.name}</div>
                <span className="ax-badge-pending capitalize shrink-0">{c.collection_type}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground truncate">{ownerLabel(c)}</div>
              {c.description && (
                <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{c.description}</div>
              )}
              <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground tabular-nums">
                {c.product_count} products · {c.design_count} designs
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && collections && collections.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No collections match your filters.
        </div>
      )}
    </div>
  );
}
