import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Filter, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ProductFormDrawer } from "@/components/admin/products/ProductFormDrawer";
import { ImportFromUrlDialog } from "@/components/admin/products/ImportFromUrlDialog";
import { ProductDetailDrawer } from "@/components/admin/products/ProductDetailDrawer";
import { ProductCard } from "@/components/admin/products/ProductCard";
import {
  ProductFilterSidebar,
  type FilterState,
} from "@/components/admin/products/ProductFilterSidebar";
import {
  detectCategory,
  PRICE_BUCKETS,
  type ProductCategory,
  type PriceBucketId,
} from "@/lib/product-category";
import type { ProductStatus } from "@/lib/product-status";

interface ProductRow {
  id: string;
  title: string;
  status: ProductStatus;
  price: number | null;
  compare_at_price: number | null;
  created_at: string;
  updated_at: string;
  primary_image_url: string | null;
  category: ProductCategory;
  athletes: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
}

type SortKey = "newest" | "oldest" | "price_asc" | "price_desc" | "title_asc";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "title_asc", label: "Title A–Z" },
];

function emptyFilters(): FilterState {
  return {
    categories: new Set(),
    athletes: new Set(),
    teams: new Set(),
    statuses: new Set(),
    priceBuckets: new Set(),
  };
}

function bucketIdFor(price: number | null): PriceBucketId | null {
  if (price == null) return null;
  return PRICE_BUCKETS.find((b) => b.test(price))?.id ?? null;
}

export default function ProductsList() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const detailId = params.id ?? null;
  const detailOpen = !!detailId;

  function openDetail(id: string) {
    navigate(`/admin/products/${id}`);
  }
  function closeDetail(open: boolean) {
    if (!open) navigate("/admin/products");
  }

  async function load() {
    setLoading(true);
    try {
      const productsRes = await supabase
        .from("products")
        .select(
          "id, title, status, price, compare_at_price, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });

      if (productsRes.error) console.error("products query error:", productsRes.error);
      const products = productsRes.data ?? [];

      const ids = products.map((p) => p.id);
      if (ids.length === 0) {
        setRows([]);
        return;
      }

      const [imagesRes, athletesLinkRes, teamsLinkRes, tagsLinkRes] = await Promise.all([
        supabase
          .from("product_images")
          .select("product_id, storage_path, is_primary, sort_order")
          .in("product_id", ids),
        supabase
          .from("product_athletes")
          .select(
            "product_id, athlete:athletes!product_athletes_athlete_id_fkey(id, first_name, last_name, full_name)",
          )
          .in("product_id", ids),
        supabase
          .from("product_teams")
          .select("product_id, team:teams!product_teams_team_id_fkey(id, name)")
          .in("product_id", ids),
        supabase
          .from("product_tags")
          .select("product_id, tag:tags!product_tags_tag_id_fkey(name)")
          .in("product_id", ids),
      ]);

      const images = imagesRes.data ?? [];
      const athleteLinks = athletesLinkRes.data ?? [];
      const teamLinks = teamsLinkRes.data ?? [];
      const tagLinks = tagsLinkRes.data ?? [];

      // Image: prefer primary, fall back to lowest sort_order. storage_path is full Shopify CDN URL.
      const imagesByProduct = new Map<string, typeof images>();
      images.forEach((img) => {
        const arr = imagesByProduct.get(img.product_id) ?? [];
        arr.push(img);
        imagesByProduct.set(img.product_id, arr);
      });
      const imageMap = new Map<string, string>();
      imagesByProduct.forEach((imgs, productId) => {
        const primary = imgs.find((i) => i.is_primary);
        const fallback = [...imgs].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        )[0];
        const chosen = primary ?? fallback;
        if (chosen?.storage_path) imageMap.set(productId, chosen.storage_path);
      });

      const athletesByProduct = new Map<string, Array<{ id: string; name: string }>>();
      athleteLinks.forEach((l) => {
        const a = Array.isArray(l.athlete) ? l.athlete[0] : l.athlete;
        if (!a) return;
        const name = a.full_name ?? `${a.first_name} ${a.last_name}`;
        const arr = athletesByProduct.get(l.product_id) ?? [];
        arr.push({ id: a.id, name });
        athletesByProduct.set(l.product_id, arr);
      });

      const teamsByProduct = new Map<string, Array<{ id: string; name: string }>>();
      teamLinks.forEach((l) => {
        const t = Array.isArray(l.team) ? l.team[0] : l.team;
        if (!t) return;
        const arr = teamsByProduct.get(l.product_id) ?? [];
        arr.push({ id: t.id, name: t.name });
        teamsByProduct.set(l.product_id, arr);
      });

      const tagsByProduct = new Map<string, string[]>();
      tagLinks.forEach((l) => {
        const t = Array.isArray(l.tag) ? l.tag[0] : l.tag;
        if (!t?.name) return;
        const arr = tagsByProduct.get(l.product_id) ?? [];
        arr.push(t.name);
        tagsByProduct.set(l.product_id, arr);
      });

      setRows(
        products.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status as ProductStatus,
          price: p.price,
          compare_at_price: p.compare_at_price,
          created_at: p.created_at,
          updated_at: p.updated_at,
          primary_image_url: imageMap.get(p.id) ?? null,
          category: detectCategory(p.title, tagsByProduct.get(p.id) ?? []),
          athletes: athletesByProduct.get(p.id) ?? [],
          teams: teamsByProduct.get(p.id) ?? [],
        })),
      );
    } catch (err) {
      console.error("ProductsList load failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Counts derived from full row set so users can see what's available.
  const { categoryCounts, athleteOptions, teamOptions, statusCounts, priceBucketCounts } =
    useMemo(() => {
      const cat = new Map<string, number>();
      const ath = new Map<string, { name: string; count: number }>();
      const team = new Map<string, { name: string; count: number }>();
      const stat = new Map<ProductStatus, number>();
      const price = new Map<PriceBucketId, number>();
      (rows ?? []).forEach((r) => {
        cat.set(r.category, (cat.get(r.category) ?? 0) + 1);
        stat.set(r.status, (stat.get(r.status) ?? 0) + 1);
        const b = bucketIdFor(r.price);
        if (b) price.set(b, (price.get(b) ?? 0) + 1);
        r.athletes.forEach((a) => {
          const cur = ath.get(a.id) ?? { name: a.name, count: 0 };
          ath.set(a.id, { name: a.name, count: cur.count + 1 });
        });
        r.teams.forEach((t) => {
          const cur = team.get(t.id) ?? { name: t.name, count: 0 };
          team.set(t.id, { name: t.name, count: cur.count + 1 });
        });
      });
      return {
        categoryCounts: cat,
        statusCounts: stat,
        priceBucketCounts: price,
        athleteOptions: Array.from(ath.entries())
          .map(([id, v]) => ({ id, name: v.name, count: v.count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        teamOptions: Array.from(team.entries())
          .map(([id, v]) => ({ id, name: v.name, count: v.count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (filters.categories.size > 0 && !filters.categories.has(r.category)) return false;
      if (filters.statuses.size > 0 && !filters.statuses.has(r.status)) return false;
      if (filters.athletes.size > 0 && !r.athletes.some((a) => filters.athletes.has(a.id)))
        return false;
      if (filters.teams.size > 0 && !r.teams.some((t) => filters.teams.has(t.id)))
        return false;
      if (filters.priceBuckets.size > 0) {
        const b = bucketIdFor(r.price);
        if (!b || !filters.priceBuckets.has(b)) return false;
      }
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return +new Date(a.created_at) - +new Date(b.created_at);
        case "price_asc":
          return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "price_desc":
          return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "newest":
        default:
          return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return sorted;
  }, [rows, search, filters, sort]);

  const isEmpty = !loading && rows && rows.length === 0;
  const activeFilterCount =
    filters.categories.size +
    filters.athletes.size +
    filters.teams.size +
    filters.statuses.size +
    filters.priceBuckets.size;

  function clearAll() {
    setFilters(emptyFilters());
    setSearch("");
  }

  function removeFilter(kind: keyof FilterState, value: string) {
    setFilters((f) => {
      const next = { ...f };
      const set = new Set(next[kind] as Set<string>);
      set.delete(value);
      (next as Record<string, Set<string>>)[kind] = set;
      return next;
    });
  }

  const sidebar = (
    <ProductFilterSidebar
      filters={filters}
      onChange={setFilters}
      categoryCounts={categoryCounts}
      athleteOptions={athleteOptions}
      teamOptions={teamOptions}
      statusCounts={statusCounts}
      priceBucketCounts={priceBucketCounts}
    />
  );

  return (
    <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
      <header className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create
          </Button>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Download className="h-4 w-4" /> Import URL
          </Button>
        </div>
      </header>

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <p className="text-muted-foreground">
            No products yet. Create one manually or import from a URL.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create Manually
            </Button>
            <Button onClick={() => setImportOpen(true)} className="gap-2">
              <Download className="h-4 w-4" /> Import from URL
            </Button>
          </div>
        </div>
      )}

      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block bg-card border border-border rounded-xl sticky top-4 h-[calc(100vh-2rem)]">
            {sidebar}
          </aside>

          <section className="space-y-4 min-w-0">
            {/* Search + sort + mobile filter trigger */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden gap-2">
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="bg-accent text-accent-foreground rounded-full text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-[300px] sm:w-[340px]">
                  <SheetHeader className="p-4 border-b border-border">
                    <SheetTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" /> Filters
                    </SheetTitle>
                  </SheetHeader>
                  <div className="h-[calc(100vh-65px)]">{sidebar}</div>
                </SheetContent>
              </Sheet>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {Array.from(filters.categories).map((c) => (
                  <FilterChip key={`c-${c}`} label={c} onRemove={() => removeFilter("categories", c)} />
                ))}
                {Array.from(filters.statuses).map((s) => (
                  <FilterChip
                    key={`s-${s}`}
                    label={s.charAt(0).toUpperCase() + s.slice(1)}
                    onRemove={() => removeFilter("statuses", s)}
                  />
                ))}
                {Array.from(filters.priceBuckets).map((p) => {
                  const lbl = PRICE_BUCKETS.find((b) => b.id === p)?.label ?? p;
                  return (
                    <FilterChip
                      key={`p-${p}`}
                      label={lbl}
                      onRemove={() => removeFilter("priceBuckets", p)}
                    />
                  );
                })}
                {Array.from(filters.athletes).map((id) => {
                  const a = athleteOptions.find((x) => x.id === id);
                  return (
                    <FilterChip
                      key={`a-${id}`}
                      label={a?.name ?? id}
                      onRemove={() => removeFilter("athletes", id)}
                    />
                  );
                })}
                {Array.from(filters.teams).map((id) => {
                  const t = teamOptions.find((x) => x.id === id);
                  return (
                    <FilterChip
                      key={`t-${id}`}
                      label={t?.name ?? id}
                      onRemove={() => removeFilter("teams", id)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-accent underline-offset-2 hover:underline ml-1"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Result count */}
            {!loading && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} {filtered.length === 1 ? "product" : "products"}
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                    <Skeleton className="aspect-square w-full rounded-none" />
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="ax-card p-12 text-center space-y-4">
                <p className="text-muted-foreground">No products match these filters</p>
                <Button variant="outline" onClick={clearAll}>
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((r) => (
                  <ProductCard
                    key={r.id}
                    id={r.id}
                    title={r.title}
                    price={r.price}
                    compareAtPrice={r.compare_at_price}
                    status={r.status}
                    imageUrl={r.primary_image_url}
                    onClick={() => openDetail(r.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ProductFormDrawer open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />
      <ImportFromUrlDialog open={importOpen} onOpenChange={setImportOpen} />
      <ProductDetailDrawer
        productId={detailId}
        open={detailOpen}
        onOpenChange={closeDetail}
        onChanged={load}
      />
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-accent/15 text-accent border border-accent/30">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-accent/20 rounded-full p-0.5 -mr-1"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
