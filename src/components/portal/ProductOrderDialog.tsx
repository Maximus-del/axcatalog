// Mobile-first. Test at 375px before merging.
//
// Bulk order dialog for a single product. Extracted from the portal
// ProductCard so the same flow is reused on the product detail page.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { ProductImage } from "@/components/shared/ProductImage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { pickDiscount, usePortalPricing } from "@/hooks/usePortalPricing";
import { distributeByCurve, useSizeDistributionCurve } from "@/hooks/useSizeDistributionCurve";
import { MilestoneSlider } from "./MilestoneSlider";

const STANDARD_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;

interface Props {
  product: PortalProduct;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BR-${year}-${rand}`;
}

export function ProductOrderDialog({ product, open, onOpenChange }: Props) {
  // qtys keyed by `${color}|${size}` — color is "" for products without colorways.
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [autoDistribute, setAutoDistribute] = useState(false);
  const [autoTotal, setAutoTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const { user } = useAuth();
  const { athlete, isImpersonating } = useCurrentAthlete();
  const { config } = usePortalPricing(athlete?.organization_id ?? null);
  const curve = useSizeDistributionCurve(athlete?.organization_id ?? null);

  const hasVariants = product.variants && product.variants.length > 0;

  // Color rows: when real variants exist, derive from them so we never mix
  // generic blank colors with real Shopify colorways.
  const colorRows: Array<{ key: string; name: string; hex: string | null }> = hasVariants
    ? (() => {
        const seen = new Set<string>();
        const rows: Array<{ key: string; name: string; hex: string | null }> = [];
        for (const v of product.variants) {
          const name = v.color ?? "";
          if (seen.has(name)) continue;
          seen.add(name);
          const hex =
            product.colors.find((c) => c.name === name)?.hex ?? null;
          rows.push({ key: name, name: name || "One color", hex });
        }
        return rows;
      })()
    : product.colors && product.colors.length
    ? product.colors.map((c) => ({ key: c.name, name: c.name, hex: c.hex }))
    : [{ key: "", name: "One color", hex: null }];

  // Size set: union of variant sizes (in first-seen order) when variants exist,
  // else the standard size set so manual/non-Shopify products still work.
  const sizes = useMemo<readonly string[]>(() => {
    if (!hasVariants) return STANDARD_SIZES;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of product.variants) {
      const s = v.size ?? "";
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out.length ? out : STANDARD_SIZES;
  }, [hasVariants, product.variants]);

  // Lookup: variant by `${color}|${size}` (color is "" when null).
  const variantByCell = useMemo(() => {
    const m = new Map<string, (typeof product.variants)[number]>();
    if (hasVariants) {
      for (const v of product.variants) {
        m.set(`${v.color ?? ""}|${v.size ?? ""}`, v);
      }
    }
    return m;
  }, [hasVariants, product.variants]);

  // When variants exist, prefer per-color image (shopifyImageId → product.images).
  const [activeColor, setActiveColor] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setActiveColor(null);
  }, [open]);

  const heroImages = useMemo(() => {
    if (hasVariants && activeColor != null) {
      const v = product.variants.find(
        (x) => (x.color ?? "") === activeColor && x.shopifyImageId,
      );
      const match = v
        ? product.images.find((i) => i.shopifyImageId && i.shopifyImageId === v.shopifyImageId)
        : null;
      if (match) return [match];
    }
    return product.images;
  }, [hasVariants, activeColor, product.variants, product.images]);

  const cellKey = (color: string, size: string) => `${color}|${size}`;

  const isCellAvailable = (color: string, size: string): boolean => {
    if (!hasVariants) return true;
    const v = variantByCell.get(cellKey(color, size));
    return !!v && v.available === true;
  };

  const applyAutoTotal = (total: number) => {
    const clamped = Math.max(0, Math.min(500, Math.floor(total)));
    setAutoTotal(clamped);
    // Split total evenly across color rows, then distribute by curve per row.
    // When variants exist, skip cells that aren't available.
    const next: Record<string, number> = {};
    const n = colorRows.length;
    const base = Math.floor(clamped / n);
    const remainder = clamped - base * n;
    colorRows.forEach((row, idx) => {
      const rowTotal = base + (idx < remainder ? 1 : 0);
      const availSizes = sizes.filter((s) => isCellAvailable(row.key, s));
      const targetSizes = availSizes.length ? availSizes : (sizes as readonly string[]);
      const rowDist = distributeByCurve(rowTotal, targetSizes as string[], curve);
      sizes.forEach((s) => {
        next[cellKey(row.key, s)] = rowDist[s] ?? 0;
      });
    });
    setQtys(next);
  };

  const totalUnits = useMemo(
    () => Object.values(qtys).reduce((a, b) => a + (b || 0), 0),
    [qtys],
  );

  // Athlete-tier MOQ baseline, derived via compute_wholesale_price in the hook.
  const unitWholesale = product.athlete_unit_price ?? product.wholesale_price ?? null;
  const discountPct = pickDiscount(config.tiers, totalUnits);
  const subtotal =
    unitWholesale != null ? unitWholesale * totalUnits * (1 - discountPct / 100) : null;
  const grossSubtotal =
    unitWholesale != null ? unitWholesale * totalUnits : null;
  const discountAmount =
    grossSubtotal != null && subtotal != null ? grossSubtotal - subtotal : null;
  const breakdownRows = colorRows.flatMap((row) =>
    sizes
      .map((s) => ({
        color: row.name,
        hex: row.hex,
        size: s,
        qty: qtys[cellKey(row.key, s)] ?? 0,
      }))
      .filter((r) => r.qty > 0),
  );

  const bumpQty = (color: string, size: string, delta: number) => {
    if (delta > 0 && !isCellAvailable(color, size)) return;
    setQtys((p) => ({
      ...p,
      [cellKey(color, size)]: Math.max(0, (p[cellKey(color, size)] ?? 0) + delta),
    }));
  };

  const handleSubmit = async () => {
    if (isImpersonating) {
      toast.error("Submission blocked while impersonating");
      return;
    }
    if (totalUnits <= 0) {
      toast.error("Enter at least one quantity");
      return;
    }
    // Block submission of any unavailable variant.
    if (hasVariants) {
      const bad = Object.entries(qtys).find(([k, q]) => {
        if (!q || q <= 0) return false;
        const [c, s] = k.split("|");
        return !isCellAvailable(c, s);
      });
      if (bad) {
        toast.error("Remove quantities on out-of-stock sizes before submitting");
        return;
      }
    }
    if (!user || !athlete) {
      toast.error("You must be signed in to submit an order");
      return;
    }
    setSubmitting(true);
    try {
      const orderNumber = generateOrderNumber();
      const { data: orderRow, error: orderErr } = await supabase
        .from("bulk_order_requests")
        .insert({
          organization_id: athlete.organization_id,
          athlete_id: athlete.id,
          requested_by: user.id,
          status: "submitted",
          order_number: orderNumber,
        })
        .select("id, order_number")
        .single();
      if (orderErr || !orderRow) throw orderErr ?? new Error("Insert failed");

      const items = Object.entries(qtys)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => {
          const [color, size] = key.split("|");
          const variant = hasVariants ? variantByCell.get(cellKey(color, size)) : undefined;
          const variantPrice = variant?.price ?? null;
          const notes = variant
            ? JSON.stringify({
                shopify_variant_id: variant.shopifyVariantId,
                sku: variant.sku ?? null,
              })
            : null;
          return {
            order_request_id: orderRow.id,
            product_id: product.id,
            product_name_snapshot: product.title,
            size,
            color: color || null,
            quantity: qty,
            unit_wholesale_price: unitWholesale,
            unit_retail_price: variantPrice ?? product.price,
            notes,
          };
        });

      if (items.length) {
        const { error: itemsErr } = await supabase.from("bulk_order_items").insert(items);
        if (itemsErr) throw itemsErr;
      }

      toast.success(`Order ${orderRow.order_number ?? ""} submitted — we'll be in touch`);
      setQtys({});
      setAutoTotal(0);
      setAutoDistribute(false);
      onOpenChange(false);
    } catch (err) {
      console.error("Order submit error", err);
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 bg-card border-border overflow-hidden">
        <div className="h-56 bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden">
          <ProductImage
            images={heroImages}
            url={heroImages[0]?.url ?? product.primary_image_url}
            alt={product.title}
            viewMode="athlete"
            size="hero"
            imgClassName="p-4"
          />
        </div>

        <div className="px-6 pt-4 pb-2">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold leading-tight">
              {product.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {unitWholesale != null
                ? `$${unitWholesale.toFixed(2)} / unit at your tier (MOQ 10)`
                : "Pricing not set yet"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-4 space-y-4">
          <div className="rounded-md border border-border/60 bg-[hsl(var(--dark))]/40 px-3 py-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label htmlFor={`auto-${product.id}`} className="text-xs uppercase tracking-wider">
                  Auto-distribute
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  Slide a total to split evenly across S–3XL
                </span>
              </div>
              <Switch
                id={`auto-${product.id}`}
                checked={autoDistribute}
                onCheckedChange={setAutoDistribute}
              />
            </div>
            {autoDistribute && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-accent leading-none tabular-nums">
                      {autoTotal}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      units
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    value={autoTotal || ""}
                    placeholder="0"
                    onChange={(e) =>
                      applyAutoTotal(parseInt(e.target.value || "0", 10) || 0)
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-8 w-20 text-center text-base sm:text-sm rounded bg-background border border-border focus:outline-none focus:border-accent"
                  />
                </div>
                <MilestoneSlider
                  min={0}
                  max={500}
                  step={1}
                  value={autoTotal}
                  onValueChange={applyAutoTotal}
                  organizationId={athlete?.organization_id ?? null}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* Header row with size labels */}
            <div className="grid grid-cols-[88px_repeat(6,minmax(0,1fr))] gap-1.5 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Color
              </span>
              {sizes.map((s) => (
                <span
                  key={s}
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center"
                >
                  {s}
                </span>
              ))}
            </div>
            {colorRows.map((row) => {
              const rowTotal = sizes.reduce(
                (sum, s) => sum + (qtys[cellKey(row.key, s)] ?? 0),
                0,
              );
              const rowHasAnyAvailable = hasVariants
                ? sizes.some((s) => isCellAvailable(row.key, s))
                : true;
              return (
                <div
                  key={row.key || "default"}
                  className="grid grid-cols-[88px_repeat(6,minmax(0,1fr))] gap-1.5 items-center"
                  style={{
                    gridTemplateColumns: `88px repeat(${sizes.length}, minmax(0,1fr))`,
                  }}
                  onMouseEnter={() => hasVariants && setActiveColor(row.key)}
                >
                  <button
                    type="button"
                    onClick={() => hasVariants && setActiveColor(row.key)}
                    className="flex items-center gap-1.5 min-w-0 text-left"
                    aria-label={`Show ${row.name} image`}
                  >
                    {row.hex && (
                      <span
                        className="h-4 w-4 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: row.hex }}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        "text-xs font-semibold truncate",
                        rowTotal > 0 ? "text-accent" : "text-foreground",
                        hasVariants && activeColor === row.key && "underline underline-offset-2",
                      )}
                      title={row.name}
                    >
                      {row.name}
                    </span>
                  </button>
                  {sizes.map((size) => {
                    const qty = qtys[cellKey(row.key, size)] ?? 0;
                    const active = qty > 0;
                    const available = isCellAvailable(row.key, size);
                    return (
                      <div
                        key={size}
                        className={cn(
                          "flex items-center justify-center rounded border bg-background px-0.5 py-1",
                          active ? "border-accent" : "border-border",
                          !available && "opacity-40 bg-muted/30",
                        )}
                        title={!available ? "Out of stock" : undefined}
                        aria-label={!available ? `${row.name} ${size} out of stock` : undefined}
                      >
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={qty || ""}
                          placeholder="0"
                          disabled={!available}
                          onFocus={(e) => {
                            e.currentTarget.select();
                            if (hasVariants) setActiveColor(row.key);
                          }}
                          onChange={(e) => {
                            if (!available) return;
                            setQtys((p) => ({
                              ...p,
                              [cellKey(row.key, size)]: Math.max(
                                0,
                                parseInt(e.target.value || "0", 10) || 0,
                              ),
                            }));
                          }}
                          className={cn(
                            "h-7 w-full text-center text-base sm:text-sm rounded bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            active && "text-accent font-semibold",
                            !available && "cursor-not-allowed",
                          )}
                        />
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => bumpQty(row.key, size, +1)}
                            className="h-3 w-3 flex items-center justify-center text-muted-foreground hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Increase ${row.name} ${size}`}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => bumpQty(row.key, size, -1)}
                            className="h-3 w-3 flex items-center justify-center text-muted-foreground hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Decrease ${row.name} ${size}`}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {hasVariants && !rowHasAnyAvailable && (
                    <div
                      className="col-span-full text-[11px] text-muted-foreground italic pl-[96px] -mt-1"
                    >
                      No sizes currently in stock for {row.name}.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {totalUnits > 0 && (
          <button
            type="button"
            onClick={() => setBreakdownOpen((v) => !v)}
            className="w-full flex flex-col items-center gap-1 border-t border-border pt-2 pb-1 bg-[hsl(var(--dark))] text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={breakdownOpen}
            aria-label={breakdownOpen ? "Hide breakdown" : "Show breakdown"}
          >
            <span className="h-1 w-10 rounded-full bg-border" />
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
              {breakdownOpen ? (
                <>
                  <ChevronDown className="h-3 w-3" /> Hide breakdown
                </>
              ) : (
                <>
                  <ChevronUp className="h-3 w-3" /> Show breakdown
                </>
              )}
            </span>
          </button>
        )}
        {breakdownOpen && totalUnits > 0 && (
          <div className="px-6 py-3 bg-[hsl(var(--dark))]/70 border-t border-border max-h-64 overflow-y-auto">
            <div className="ax-label mb-2">Order breakdown</div>
            <div className="space-y-1.5">
              {breakdownRows.map((r) => {
                const line = unitWholesale != null ? unitWholesale * r.qty : null;
                return (
                  <div
                    key={`${r.color}-${r.size}`}
                    className="flex items-center justify-between text-xs tabular-nums"
                  >
                    <span className="font-semibold flex items-center gap-1.5 w-28 truncate">
                      {r.hex && (
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-border shrink-0"
                          style={{ backgroundColor: r.hex }}
                          aria-hidden
                        />
                      )}
                      <span className="truncate">{r.color}</span>
                      <span className="uppercase tracking-wider text-muted-foreground">
                        {r.size}
                      </span>
                    </span>
                    <span className="flex-1 text-muted-foreground text-right pr-3">
                      {r.qty} × {unitWholesale != null ? `$${unitWholesale.toFixed(2)}` : "—"}
                    </span>
                    <span className="w-16 text-right font-semibold">
                      {line != null ? `$${line.toFixed(2)}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t border-border/60 space-y-1 text-xs tabular-nums">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal ({totalUnits} units)</span>
                <span>{grossSubtotal != null ? `$${grossSubtotal.toFixed(2)}` : "—"}</span>
              </div>
              {discountPct > 0 && discountAmount != null && (
                <div className="flex justify-between text-accent">
                  <span>Volume discount ({discountPct}%)</span>
                  <span>−${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>Total</span>
                <span className="text-accent">
                  {subtotal != null ? `$${subtotal.toFixed(2)}` : "—"}
                </span>
              </div>
            </div>
          </div>
        )}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 bg-[hsl(var(--dark))]">
          <div>
            <div className="ax-label">Subtotal · {totalUnits} units</div>
            <div className="text-2xl font-bold text-accent leading-none mt-1">
              {subtotal != null ? `$${subtotal.toFixed(2)}` : "—"}
            </div>
            {discountPct > 0 && (
              <div className="text-[11px] text-accent uppercase tracking-wider mt-1">
                {discountPct}% volume discount
              </div>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting || totalUnits === 0}
            className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
