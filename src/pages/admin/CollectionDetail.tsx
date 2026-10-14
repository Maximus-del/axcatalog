import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useBackTarget } from "@/hooks/useBackTarget";
import { Package, Palette, Image as ImageIcon, Rocket, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { storageUrl } from "@/lib/ecosystem/image";
import { fetchCollectionMockups, listCollectionDrops, type MockupRow, type DropRow } from "@/lib/ecosystem/commerce";

const mockupUrl = (m: MockupRow): string | null => {
  const p = m.thumbnail_path || m.storage_path;
  if (!p) return null;
  return p.startsWith("http") ? p : storageUrl(m.storage_bucket || "product-images", p);
};

interface Collection {
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
}

interface ProductLite {
  sort_order: number;
  product: { id: string; title: string | null; status: string | null } | null;
}
interface DesignLite {
  sort_order: number;
  design: { id: string; title: string | null; status: string | null } | null;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  // Opened from an athlete board? Go back to that board, on the tab you left.
  const back = useBackTarget({ to: "/admin/collections", label: "Collections" });
  const [collection, setCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [designs, setDesigns] = useState<DesignLite[]>([]);
  const [mockups, setMockups] = useState<MockupRow[]>([]);
  const [drops, setDrops] = useState<DropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: c } = await supabase
        .from("collections")
        .select(
          `id, name, description, collection_type, status, start_date, end_date,
           organization:organizations!collections_organization_id_fkey(id, name),
           athlete:athletes!collections_athlete_id_fkey(id, full_name, first_name, last_name),
           team:teams!collections_team_id_fkey(id, name)`,
        )
        .eq("id", id)
        .maybeSingle();

      if (!active) return;
      if (!c) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCollection({
        ...c,
        organization: first(c.organization) as Collection["organization"],
        athlete: first(c.athlete) as Collection["athlete"],
        team: first(c.team) as Collection["team"],
      } as Collection);

      const [prod, des] = await Promise.all([
        supabase
          .from("collection_products")
          .select(
            `sort_order, product:products!collection_products_product_id_fkey(id, title, status)`,
          )
          .eq("collection_id", id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("collection_designs")
          .select(
            `sort_order, design:designs!collection_designs_design_id_fkey(id, title, status)`,
          )
          .eq("collection_id", id)
          .order("sort_order", { ascending: true }),
      ]);
      if (!active) return;
      const prodRows = (prod.data ?? []).map((r) => ({
        sort_order: r.sort_order,
        product: first(r.product) as ProductLite["product"],
      }));
      const desRows = (des.data ?? []).map((r) => ({
        sort_order: r.sort_order,
        design: first(r.design) as DesignLite["design"],
      }));
      setProducts(prodRows);
      setDesigns(desRows);

      const productIds = prodRows.map((r) => r.product?.id).filter((v): v is string => !!v);
      const designIds = desRows.map((r) => r.design?.id).filter((v): v is string => !!v);
      const [mk, dr] = await Promise.all([
        fetchCollectionMockups(productIds, designIds).catch(() => [] as MockupRow[]),
        listCollectionDrops(id).catch(() => [] as DropRow[]),
      ]);
      if (!active) return;
      setMockups(mk);
      setDrops(dr);
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

  if (notFound || !collection) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
        <Link to={back.to} className="text-accent text-sm">
          ← Back to {back.label}
        </Link>
        <div className="ax-card p-12 text-center text-muted-foreground">Collection not found.</div>
      </div>
    );
  }

  const owner = collection.athlete
    ? {
        label:
          collection.athlete.full_name ??
          `${collection.athlete.first_name} ${collection.athlete.last_name}`,
        to: `/admin/athletes/${collection.athlete.id}`,
      }
    : collection.team
      ? { label: collection.team.name, to: `/admin/teams/${collection.team.id}` }
      : collection.organization
        ? { label: collection.organization.name, to: `/admin/organizations/${collection.organization.id}` }
        : null;

  const dates = [collection.start_date, collection.end_date].filter(Boolean).join(" → ");

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <Link to={back.to} className="text-muted-foreground hover:text-foreground text-sm">
        ← Back to {back.label}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-3xl font-bold">{collection.name}</h1>
          <span className="ax-badge-pending capitalize">{collection.collection_type}</span>
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          {owner && (
            <Link to={owner.to} className="text-accent hover:underline">
              {owner.label}
            </Link>
          )}
          {dates && (
            <>
              {owner && <span>·</span>}
              <span>{dates}</span>
            </>
          )}
          <span>·</span>
          <span className="capitalize">{collection.status}</span>
        </div>
        {collection.description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{collection.description}</p>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" /> Products ({products.length})
        </h2>
        {products.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">No products in this collection.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.map((p) =>
              p.product ? (
                <Link
                  key={p.product.id}
                  to={`/admin/products/${p.product.id}`}
                  className="ax-card-hover"
                >
                  <div className="font-medium truncate">{p.product.title ?? "Untitled product"}</div>
                  <div className="text-xs text-muted-foreground capitalize truncate">
                    {p.product.status ?? "—"}
                  </div>
                </Link>
              ) : null,
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4" /> Designs ({designs.length})
        </h2>
        {designs.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">No designs in this collection.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {designs.map((d) =>
              d.design ? (
                <Link key={d.design.id} to={`/admin/designs/${d.design.id}`} className="ax-card-hover">
                  <div className="font-medium truncate">{d.design.title ?? "Untitled design"}</div>
                  <div className="text-xs text-muted-foreground capitalize truncate">
                    {d.design.status ?? "—"}
                  </div>
                </Link>
              ) : null,
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Mockups ({mockups.length})
        </h2>
        {mockups.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">
            No mockups linked to this collection's products or designs yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {mockups.map((m) => {
              const url = mockupUrl(m);
              return (
                <div key={m.id} className="ax-card-hover overflow-hidden p-0">
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {url ? (
                      <img src={url} alt={m.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-sm font-medium truncate">{m.title}</div>
                    <div className="text-[11px] text-muted-foreground capitalize truncate">
                      {m.shot_type?.replace(/_/g, " ")} · {m.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Rocket className="h-4 w-4" /> Drops ({drops.length})
        </h2>
        {drops.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">
            No drops from this collection yet. Create one from the athlete's Drops tab.
          </div>
        ) : (
          <div className="space-y-2">
            {drops.map((d) => (
              <div key={d.id} className="ax-card flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <Rocket className="h-3.5 w-3.5 text-accent" /> {d.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {d.product_count ?? 0} products · <span className="capitalize">{d.status}</span>
                    {d.approval_state !== "none" && <> · approval <span className="capitalize">{d.approval_state}</span></>}
                  </div>
                </div>
                {(d.access_date || d.public_date) && (
                  <div className="text-[11px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {[d.access_date, d.public_date].filter(Boolean).map((s) => (s as string).slice(0, 10)).join(" → ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
