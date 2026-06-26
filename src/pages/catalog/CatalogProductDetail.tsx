import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Shirt, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  usePublicCatalogItem,
  usePublicCatalogColors,
  usePublicCatalogSizes,
} from "@/hooks/usePublicCatalog";
import { formatGarmentType } from "@/lib/blank-status";
import { useCart, type CartCustomization } from "./CartContext";
import { priceForTier, useCatalogAccess } from "./CatalogAccessContext";
import MockupEditor from "@/components/catalog/MockupEditor";

export default function CatalogProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: item, isLoading, error } = usePublicCatalogItem(id);
  const { data: colors = [] } = usePublicCatalogColors(id);
  const { data: sizes = [] } = usePublicCatalogSizes(id);
  const { addLine } = useCart();
  const { tier } = useCatalogAccess();

  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [view, setView] = useState<"front" | "back">("front");
  const [mockup, setMockup] = useState<
    | {
        file: File;
        previewUrl: string;
        placement: Omit<
          CartCustomization,
          "asset_path" | "asset_filename" | "asset_mime" | "preview_url"
        >;
        getPrintReadyFile: (filename?: string) => Promise<File>;
      }
    | null
  >(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!color && colors.length) setColor(colors[0].color_name);
  }, [colors, color]);
  // Default to front when color changes
  useEffect(() => {
    setView("front");
  }, [color]);
  useEffect(() => {
    if (!size && sizes.length) setSize(sizes[0].size);
  }, [sizes, size]);

  const canAdd = !!item && !!color && !!size && qty > 0;

  const handleAdd = async () => {
    if (!item || !color || !size) return;

    let customization: CartCustomization | undefined;
    if (mockup) {
      setUploading(true);
      try {
        // Render the print-ready PNG (clipped to the zone box, at zone pixel size).
        const baseName = mockup.file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "design";
        const printFile = await mockup.getPrintReadyFile(`${baseName}.png`);
        const { data: signed, error: signErr } = await supabase.functions.invoke<
          { path: string; token: string }
        >("mockup-upload-url", { body: { filename: printFile.name } });
        if (signErr || !signed?.path || !signed?.token) {
          throw signErr ?? new Error("Could not get upload URL");
        }
        const { error: upErr } = await supabase.storage
          .from("design-files")
          .uploadToSignedUrl(signed.path, signed.token, printFile, {
            contentType: "image/png",
            upsert: false,
          });
        if (upErr) throw upErr;
        const path = signed.path;
        customization = {
          ...mockup.placement,
          asset_path: path,
          asset_filename: printFile.name,
          asset_mime: "image/png",
          preview_url: mockup.previewUrl,
        };
      } catch (e: any) {
        toast({
          title: "Upload failed",
          description: e?.message ?? "Could not upload your design.",
          variant: "destructive",
        });
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    addLine({
      blank_id: item.id,
      sku: item.sku,
      name: item.name,
      color,
      size,
      quantity: qty,
      customization,
    });
    toast({
      title: "Added to cart",
      description: customization
        ? `${qty} × ${item.name} (${color} / ${size}) — with your design`
        : `${qty} × ${item.name} (${color} / ${size})`,
    });
    setMockup(null);
  };

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
          {(() => {
            const selectedColor = colors.find((c) => c.color_name === color) ?? null;
            const frontSrc = selectedColor?.image_url ?? item.image_url ?? null;
            const backSrc = selectedColor?.image_url_back ?? null;
            const hasBack = !!backSrc;
            const mainSrc = view === "back" && hasBack ? backSrc : frontSrc;
            return (
              <div className="relative aspect-square rounded-lg bg-white flex items-center justify-center overflow-hidden">
                {mainSrc ? (
                  <img
                    src={mainSrc}
                    alt={`${item.name}${selectedColor ? ` — ${selectedColor.color_name}` : ""} (${view})`}
                    className="h-full w-full object-contain p-6"
                  />
                ) : (
                  <Shirt className="h-24 w-24 text-muted-foreground/40" strokeWidth={1.5} />
                )}
                {hasBack && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex rounded-full border border-border bg-background/80 backdrop-blur p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setView("front")}
                      className={`px-3 py-1 rounded-full transition ${
                        view === "front"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Front
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("back")}
                      className={`px-3 py-1 rounded-full transition ${
                        view === "back"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Back
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

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

            {(() => {
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
                <div className="rounded-lg border border-border px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Your price
                  </div>
                  {customerPrice != null ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-bold tabular-nums">
                        ${customerPrice.toFixed(2)}
                      </span>
                      {showSavings && (
                        <span className="text-sm text-muted-foreground line-through tabular-nums">
                          ${listPrice!.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Contact for pricing</div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Color
                </div>
                {colors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No colors listed.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => {
                      const active = c.color_name === color;
                      return (
                        <button
                          key={c.color_name}
                          type="button"
                          onClick={() => setColor(c.color_name)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border hover:border-foreground/50"
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {c.color_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Size
                </div>
                {sizes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sizes listed.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((s) => {
                      const active = s.size === size;
                      return (
                        <button
                          key={s.size}
                          type="button"
                          onClick={() => setSize(s.size)}
                          className={`min-w-[3rem] rounded-md border px-3 py-1.5 text-xs font-medium tabular-nums transition ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border hover:border-foreground/50"
                          }`}
                        >
                          {s.size}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Quantity
                </div>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) =>
                    setQty(Math.max(1, parseInt(e.target.value || "1", 10) || 1))
                  }
                  className="w-28"
                />
              </div>
            </div>

            <Button onClick={handleAdd} disabled={!canAdd} className="w-full">
              {uploading ? "Uploading…" : "Add to cart"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Final pricing is confirmed at checkout.
            </p>

            <div className="pt-4 border-t border-border">
              <MockupEditor
                garmentType={item.garment_type}
                fallbackImage={item.image_url}
                selectedColor={colors.find((c) => c.color_name === color) ?? null}
                onChange={setMockup}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}