import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface ImageRow {
  id: string;
  product_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  alt_text: string | null;
  is_primary: boolean;
  product: { id: string; title: string | null } | null;
}

const MAX = 300;

function resolveUrl(bucket: string, path: string): string {
  if (bucket === "external" || /^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function AdminMockups() {
  const [images, setImages] = useState<ImageRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [rows, count] = await Promise.all([
        supabase
          .from("product_images")
          .select(
            "id, product_id, storage_bucket, storage_path, file_name, alt_text, is_primary, product:products!product_images_product_id_fkey(id, title)",
          )
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(MAX),
        supabase.from("product_images").select("id", { count: "exact", head: true }),
      ]);
      if (!active) return;
      setImages(
        (rows.data ?? []).map((r) => ({
          ...r,
          product: first(r.product) as ImageRow["product"],
        })) as ImageRow[],
      );
      setTotal(count.count ?? 0);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!images) return [];
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter(
      (i) =>
        (i.product?.title ?? "").toLowerCase().includes(q) ||
        (i.file_name ?? "").toLowerCase().includes(q),
    );
  }, [images, search]);

  const isEmpty = !loading && images && images.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">Creative</div>
        <h1 className="text-3xl font-bold">Mockups</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Product mockup imagery across the catalog
          {total > 0 && ` — ${total.toLocaleString()} image${total === 1 ? "" : "s"}`}
          {total > MAX && ` (showing latest ${MAX})`}
          .
        </p>
      </header>

      {!isEmpty && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by product or file name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-[12px]" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <ImageIcon className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">
            No mockups yet. Product images sync from Shopify and appear here.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((img) => (
            <Link
              key={img.id}
              to={`/admin/products/${img.product_id}`}
              className="group block rounded-[12px] overflow-hidden border border-border bg-[hsl(var(--muted))] relative"
              title={img.product?.title ?? undefined}
            >
              <div className="aspect-square w-full overflow-hidden">
                <img
                  src={resolveUrl(img.storage_bucket, img.storage_path)}
                  alt={img.alt_text ?? img.product?.title ?? "Product mockup"}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              {img.is_primary && (
                <span className="absolute top-2 left-2 ax-badge-success">Primary</span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-[11px] text-white truncate">
                  {img.product?.title ?? "Untitled"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && images && images.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No mockups match your search.
        </div>
      )}
    </div>
  );
}
