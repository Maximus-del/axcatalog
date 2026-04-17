import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Download, ImageIcon, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import {
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  type ProductStatus,
  type ProductType,
  formatStatus,
  formatType,
  statusBadgeClass,
} from "@/lib/product-status";
import { ProductFormDrawer } from "@/components/admin/products/ProductFormDrawer";
import { ImportFromUrlDialog } from "@/components/admin/products/ImportFromUrlDialog";
import { ProductDetailDrawer } from "@/components/admin/products/ProductDetailDrawer";
import { cn } from "@/lib/utils";

interface ProductRow {
  id: string;
  title: string;
  sku: string | null;
  status: ProductStatus;
  product_type: ProductType;
  price: number | null;
  needs_review: boolean;
  updated_at: string;
  primary_image_url: string | null;
  athletes: Array<{ id: string; name: string }>;
}

const PAGE_SIZE = 25;

export default function ProductsList() {
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [athleteFilter, setAthleteFilter] = useState<string>("all");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [allAthletes, setAllAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [productsRes, athletesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, title, sku, status, product_type, price, needs_review, updated_at")
          .order("updated_at", { ascending: false }),
        supabase
          .from("athletes")
          .select("id, first_name, last_name, full_name")
          .order("last_name"),
      ]);

      if (productsRes.error) console.error("products query error:", productsRes.error);
      if (athletesRes.error) console.error("athletes query error:", athletesRes.error);

      const products = productsRes.data ?? [];
      const athletes = athletesRes.data ?? [];

      setAllAthletes(
        athletes.map((a) => ({
          id: a.id,
          name: a.full_name ?? `${a.first_name} ${a.last_name}`,
        })),
      );

      const ids = products.map((p) => p.id);
      if (ids.length === 0) {
        setRows([]);
        return;
      }

      const [imagesRes, linksRes] = await Promise.all([
        supabase
          .from("product_images")
          .select("product_id, storage_bucket, storage_path, is_primary, sort_order")
          .in("product_id", ids),
        supabase
          .from("product_athletes")
          .select(
            "product_id, athlete:athletes!product_athletes_athlete_id_fkey(id, first_name, last_name, full_name)",
          )
          .in("product_id", ids),
      ]);

      if (imagesRes.error) console.error("product_images query error:", imagesRes.error);
      if (linksRes.error) console.error("product_athletes query error:", linksRes.error);

      const images = imagesRes.data ?? [];
      const links = linksRes.data ?? [];

      // Pick primary image (or first by sort_order) per product
      const imageMap = new Map<string, { url: string }>();
      images.forEach((img) => {
        const existing = imageMap.get(img.product_id);
        if (!existing || img.is_primary) {
          const { data: pub } = supabase.storage
            .from(img.storage_bucket)
            .getPublicUrl(img.storage_path);
          imageMap.set(img.product_id, { url: pub.publicUrl });
        }
      });

      // Map athletes per product
      const athletesByProduct = new Map<string, Array<{ id: string; name: string }>>();
      links.forEach((l) => {
        const a = Array.isArray(l.athlete) ? l.athlete[0] : l.athlete;
        if (!a) return;
        const name = a.full_name ?? `${a.first_name} ${a.last_name}`;
        const arr = athletesByProduct.get(l.product_id) ?? [];
        arr.push({ id: a.id, name });
        athletesByProduct.set(l.product_id, arr);
      });

      setRows(
        products.map((p) => ({
          id: p.id,
          title: p.title,
          sku: p.sku,
          status: p.status as ProductStatus,
          product_type: p.product_type as ProductType,
          price: p.price,
          needs_review: p.needs_review,
          updated_at: p.updated_at,
          primary_image_url: imageMap.get(p.id)?.url ?? null,
          athletes: athletesByProduct.get(p.id) ?? [],
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

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.product_type !== typeFilter) return false;
      if (needsReviewOnly && !r.needs_review) return false;
      if (athleteFilter !== "all" && !r.athletes.some((a) => a.id === athleteFilter))
        return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, typeFilter, athleteFilter, needsReviewOnly]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter, athleteFilter, needsReviewOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const isEmpty = !loading && rows && rows.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Manually
          </Button>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Download className="h-4 w-4" /> Import from URL
          </Button>
        </div>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PRODUCT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {formatStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {PRODUCT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {formatType(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={athleteFilter} onValueChange={setAthleteFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All athletes</SelectItem>
              {allAthletes.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-3 h-10 rounded-md border border-border bg-card">
            <Switch
              id="needs-review"
              checked={needsReviewOnly}
              onCheckedChange={setNeedsReviewOnly}
            />
            <Label htmlFor="needs-review" className="text-sm cursor-pointer">
              Needs review
            </Label>
          </div>
        </div>
      )}

      {loading && (
        <div className="ax-card p-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b border-border last:border-b-0"
            >
              <Skeleton className="h-12 w-12 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      )}

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

      {!loading && rows && rows.length > 0 && (
        <>
          <div className="ax-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground p-3 w-16">
                      Image
                    </th>
                    <th className="text-left font-medium text-muted-foreground p-3">Title</th>
                    <th className="text-left font-medium text-muted-foreground p-3">Type</th>
                    <th className="text-left font-medium text-muted-foreground p-3">
                      Status
                    </th>
                    <th className="text-right font-medium text-muted-foreground p-3">
                      Price
                    </th>
                    <th className="text-left font-medium text-muted-foreground p-3">
                      Athletes
                    </th>
                    <th className="text-right font-medium text-muted-foreground p-3">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-b-0 ax-row-hover transition-colors"
                    >
                      <td className="p-3">
                        <Link to={`/admin/products/${r.id}`} className="block">
                          {r.primary_image_url ? (
                            <img
                              src={r.primary_image_url}
                              alt={r.title}
                              className="h-12 w-12 rounded-md object-cover bg-muted"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Link
                          to={`/admin/products/${r.id}`}
                          className="font-medium hover:text-accent transition-colors"
                        >
                          {r.title}
                        </Link>
                        {r.sku && (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {r.sku}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs border border-border bg-muted text-muted-foreground capitalize">
                          {formatType(r.product_type)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                            statusBadgeClass(r.status),
                          )}
                        >
                          {formatStatus(r.status)}
                        </span>
                        {r.needs_review && r.status !== "needs_review" && (
                          <span
                            className={cn(
                              "ml-1 inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                              statusBadgeClass("needs_review"),
                            )}
                          >
                            review
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3">
                        <AthleteStack athletes={r.athletes} />
                      </td>
                      <td className="p-3 text-right text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="ax-card p-8 text-center text-sm text-muted-foreground">
              No products match your filters.
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-muted-foreground tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ProductFormDrawer open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />
      <ImportFromUrlDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function AthleteStack({ athletes }: { athletes: Array<{ id: string; name: string }> }) {
  if (athletes.length === 0)
    return <span className="text-xs text-muted-foreground">—</span>;
  const visible = athletes.slice(0, 3);
  const overflow = athletes.length - visible.length;
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((a) => (
        <div
          key={a.id}
          title={a.name}
          className="h-7 w-7 rounded-full text-[10px] font-semibold text-white flex items-center justify-center border-2 border-card"
          style={{ background: avatarColorFor(a.name) }}
        >
          {initialsFor(a.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="h-7 w-7 rounded-full text-[10px] font-semibold flex items-center justify-center bg-muted text-muted-foreground border-2 border-card">
          +{overflow}
        </div>
      )}
    </div>
  );
}
