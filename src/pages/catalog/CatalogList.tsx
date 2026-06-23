import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shirt, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePublicCatalog, type CatalogItem } from "@/hooks/usePublicCatalog";
import { formatGarmentType } from "@/lib/blank-status";
import { priceForTier, useCatalogAccess } from "./CatalogAccessContext";

export default function CatalogList() {
  const { data, isLoading, error } = usePublicCatalog();
  const { tier } = useCatalogAccess();
  const [search, setSearch] = useState("");
  const [garmentType, setGarmentType] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "price-asc" | "price-desc">("name");

  const items = data ?? [];

  const garmentTypes = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.garment_type) set.add(i.garment_type);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items.filter((i) => {
      if (garmentType !== "all" && i.garment_type !== garmentType) return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.sku ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
    if (sort === "name") {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      out = [...out].sort((a, b) => {
        const pa = priceForTier(a, tier) ?? Infinity;
        const pb = priceForTier(b, tier) ?? Infinity;
        return sort === "price-asc" ? pa - pb : pb - pa;
      });
    }
    return out;
  }, [items, search, garmentType, sort, tier]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catalog</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse available blanks. Click any item for details.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={garmentType} onValueChange={setGarmentType}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {garmentTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {formatGarmentType(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="price-asc">Price (low to high)</SelectItem>
            <SelectItem value="price-desc">Price (high to low)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}
      {error && (
        <p className="text-sm text-destructive">Couldn't load the catalog. Try again later.</p>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No products match your filters.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((item) => {
          const customerPrice = priceForTier(item, tier);
          const listPrice =
            typeof item.price_standard === "number" && item.price_standard > 0
              ? item.price_standard
              : null;
          const showSavings =
            tier !== "standard" &&
            customerPrice != null &&
            listPrice != null &&
            listPrice > customerPrice;
          return (
            <Link
              key={item.id}
              to={`/catalog/${item.id}`}
              className="rounded-lg border border-border bg-card overflow-hidden hover:border-accent transition-colors flex flex-col"
            >
              <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <Shirt
                    className="h-12 w-12 text-muted-foreground/40"
                    strokeWidth={1.5}
                  />
                )}
              </div>
              <div className="p-3 flex flex-col gap-2 flex-1">
                <h3 className="text-sm font-semibold leading-tight line-clamp-2" title={item.name}>
                  {item.name}
                </h3>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums truncate">
                    {item.sku ?? "—"}
                  </span>
                  {item.garment_type && (
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {formatGarmentType(item.garment_type)}
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium tabular-nums mt-auto flex items-baseline gap-2">
                  {customerPrice != null ? (
                    <>
                      <span>${customerPrice.toFixed(2)}</span>
                      {showSavings && (
                        <span className="text-xs text-muted-foreground line-through font-normal">
                          ${listPrice!.toFixed(2)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Contact for pricing</span>
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}