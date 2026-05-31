// Mobile-first. Test at 375px before merging.
//
// Bulk order dialog for a single product. Extracted from the portal
// ProductCard so the same flow is reused on the product detail page.
import { useMemo, useState } from "react";
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
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [autoDistribute, setAutoDistribute] = useState(false);
  const [autoTotal, setAutoTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { athlete, isImpersonating } = useCurrentAthlete();
  const { config } = usePortalPricing(athlete?.organization_id ?? null);
  const curve = useSizeDistributionCurve(athlete?.organization_id ?? null);

  const sizes = STANDARD_SIZES;

  const applyAutoTotal = (total: number) => {
    const clamped = Math.max(0, Math.min(500, Math.floor(total)));
    setAutoTotal(clamped);
    setQtys(distributeByCurve(clamped, sizes, curve));
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

  const bumpQty = (size: string, delta: number) => {
    setQtys((p) => ({ ...p, [size]: Math.max(0, (p[size] ?? 0) + delta) }));
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
        .map(([size, qty]) => ({
          order_request_id: orderRow.id,
          product_id: product.id,
          product_name_snapshot: product.title,
          size,
          quantity: qty,
          unit_wholesale_price: unitWholesale,
          unit_retail_price: product.price,
        }));

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
            images={product.images}
            url={product.primary_image_url}
            alt={product.title}
            viewMode="athlete"
            size="hero"
            imgClassName="max-h-full max-w-full object-contain p-4"
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
                    min={0}
                    max={500}
                    value={autoTotal || ""}
                    placeholder="0"
                    onChange={(e) =>
                      applyAutoTotal(parseInt(e.target.value || "0", 10) || 0)
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-7 w-20 text-center text-sm rounded bg-background border border-border focus:outline-none focus:border-accent"
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

          <div className="grid grid-cols-6 gap-1.5">
            {sizes.map((size) => {
              const qty = qtys[size] ?? 0;
              const active = qty > 0;
              return (
                <div
                  key={size}
                  className={cn(
                    "flex flex-col items-center rounded border bg-background px-1 py-1.5 gap-1",
                    active ? "border-accent" : "border-border",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      active ? "text-accent" : "text-muted-foreground",
                    )}
                  >
                    {size}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      value={qty || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQtys((p) => ({
                          ...p,
                          [size]: Math.max(0, parseInt(e.target.value || "0", 10) || 0),
                        }))
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      className={cn(
                        "h-7 w-10 text-center text-sm rounded bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-70",
                        active && "text-accent font-semibold",
                      )}
                    />
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => bumpQty(size, +1)}
                        className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-accent"
                        aria-label={`Increase ${size}`}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => bumpQty(size, -1)}
                        className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-accent"
                        aria-label={`Decrease ${size}`}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
