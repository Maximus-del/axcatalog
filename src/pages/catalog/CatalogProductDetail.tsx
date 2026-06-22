import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePublicCatalogItem } from "@/hooks/usePublicCatalog";
import { formatGarmentType } from "@/lib/blank-status";

export default function CatalogProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: item, isLoading, error } = usePublicCatalogItem(id);

  return (
    <div className="space-y-6">
      <Link
        to="/catalog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to catalog
      </Link>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Couldn't load this product.</p>
      )}
      {!isLoading && !error && !item && (
        <p className="text-sm text-muted-foreground">Product not found.</p>
      )}

      {item && (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-square bg-muted/40 rounded-lg flex items-center justify-center overflow-hidden border border-border">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                className="h-full w-full object-contain p-6"
              />
            ) : (
              <Shirt className="h-24 w-24 text-muted-foreground/40" strokeWidth={1.5} />
            )}
          </div>

          <div className="space-y-5">
            <div>
              {item.garment_type && (
                <Badge variant="outline" className="capitalize mb-2">
                  {formatGarmentType(item.garment_type)}
                </Badge>
              )}
              <h1 className="text-2xl font-bold tracking-tight">{item.name}</h1>
              <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                SKU: {item.sku ?? "—"}
              </p>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              {[
                { label: "Tier 1", value: item.price_athlete },
                { label: "Tier 2", value: item.price_corporate },
                { label: "Tier 3", value: item.price_standard },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="font-medium">{row.label}</span>
                  <span className="tabular-nums">
                    {typeof row.value === "number" && row.value > 0
                      ? `$${row.value.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Colors, sizes, and ordering will be added in the next step.
            </div>

            <Button disabled className="w-full">
              Add to order (coming soon)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}