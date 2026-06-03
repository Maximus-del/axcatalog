import { useMemo, useState } from "react";
import { Plus, Minus, Loader2, Shirt } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { useOrderDraft } from "./OrderDraftContext";
import { pickDiscount, usePortalPricing } from "@/hooks/usePortalPricing";

const STANDARD_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
const ONE_SIZE_TYPES = new Set(["hat", "beanie"]);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: PortalProduct[];
  athleteId: string;
  organizationId: string;
  onSubmitted?: () => void;
  /** When true, the submit button is intercepted via onBlockedSubmit. */
  impersonating?: boolean;
  onBlockedSubmit?: () => void;
}

function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BR-${year}-${rand}`;
}

function isOneSize(p: PortalProduct): boolean {
  // Heuristic: hat/beanie product types use a single One Size column.
  // Also: if the linked blank only exposes a single size, treat as one-size.
  if (ONE_SIZE_TYPES.has(p.product_type)) return true;
  if (p.sizes.length <= 1) return true;
  return false;
}

const EXCLUDED_TITLE_PREFIXES = ["ATL", "WR", "Rise Up"];
function isExcluded(title: string): boolean {
  const t = title.trim();
  return EXCLUDED_TITLE_PREFIXES.some((pre) =>
    t.toLowerCase().startsWith(pre.toLowerCase()),
  );
}

export function BulkOrderSheet({
  open,
  onOpenChange,
  products,
  athleteId,
  organizationId,
  onSubmitted,
  impersonating,
  onBlockedSubmit,
}: Props) {
  const { user } = useAuth();
  const { draft, setQty, clear } = useOrderDraft();
  const [submitting, setSubmitting] = useState(false);
  const { config } = usePortalPricing(organizationId);

  const visibleProducts = useMemo(
    () => products.filter((p) => !isExcluded(p.title)),
    [products],
  );

  const totalUnits = useMemo(
    () =>
      Object.values(draft).reduce(
        (sum, sizes) => sum + Object.values(sizes).reduce((a, b) => a + b, 0),
        0,
      ),
    [draft],
  );

  const discountPct = pickDiscount(config.tiers, totalUnits);
  const markupMult = 1 + config.base_markup_pct / 100;
  const discountMult = 1 - discountPct / 100;

  const nextTier = useMemo(() => {
    const ts = [...config.tiers].sort((a, b) => a.min_qty - b.min_qty);
    return ts.find((t) => totalUnits < t.min_qty) ?? null;
  }, [config.tiers, totalUnits]);

  const orderSizes = (sizes: string[]): string[] => {
    const std = STANDARD_SIZES.filter((s) => sizes.includes(s));
    const extras = sizes
      .filter((s) => !STANDARD_SIZES.includes(s as typeof STANDARD_SIZES[number]))
      .sort();
    return [...std, ...extras];
  };

  const handleSubmit = async () => {
    if (impersonating) {
      onBlockedSubmit?.();
      return;
    }
    if (totalUnits <= 0) {
      toast.error("Add at least one unit before submitting");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to submit an order");
      return;
    }
    setSubmitting(true);
    try {
      const orderNumber = generateOrderNumber();
      // 1) Insert order request
      const { data: orderRow, error: orderErr } = await supabase
        .from("bulk_order_requests")
        .insert({
          organization_id: organizationId,
          athlete_id: athleteId,
          requested_by: user.id,
          status: "submitted",
          order_number: orderNumber,
          // total_units recalculated by trigger after items insert
        })
        .select("id, order_number")
        .single();

      if (orderErr || !orderRow) throw orderErr ?? new Error("Insert failed");

      // 2) Build items from draft
      const items: Array<{
        order_request_id: string;
        product_id: string;
        product_name_snapshot: string;
        size: string;
        quantity: number;
      }> = [];

      const productById = new Map(products.map((p) => [p.id, p]));
      for (const [productId, sizes] of Object.entries(draft)) {
        const p = productById.get(productId);
        if (!p) continue;
        for (const [size, qty] of Object.entries(sizes)) {
          if (qty > 0) {
            items.push({
              order_request_id: orderRow.id,
              product_id: productId,
              product_name_snapshot: p.title,
              size,
              quantity: qty,
            });
          }
        }
      }

      if (items.length) {
        const { error: itemsErr } = await supabase.from("bulk_order_items").insert(items);
        if (itemsErr) throw itemsErr;
      }

      toast.success(`Order ${orderRow.order_number ?? ""} submitted — we'll be in touch`);
      clear();
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      console.error("Order submit error", err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const SizeStepper = ({
    productId,
    size,
    label,
  }: {
    productId: string;
    size: string;
    label: string;
  }) => {
    const qty = draft[productId]?.[size] ?? 0;
    const active = qty > 0;
    return (
      <div
        className={cn(
          "flex items-center gap-1 rounded border bg-background pl-0.5 pr-0.5 py-0.5",
          active ? "border-accent" : "border-border",
        )}
      >
        <button
          type="button"
          onClick={() => setQty(productId, size, Math.max(0, qty - 1))}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-accent hover:bg-accent/10"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3 w-3" />
        </button>
        {active ? (
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) =>
              setQty(productId, size, Math.max(0, parseInt(e.target.value || "0", 10) || 0))
            }
            onFocus={(e) => e.currentTarget.select()}
            className="h-6 w-10 text-center text-sm font-semibold text-accent rounded bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wider w-10 text-center text-muted-foreground">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setQty(productId, size, qty + 1)}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-accent hover:bg-accent/10"
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl flex flex-col p-0 bg-card border-border"
      >
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="text-accent uppercase tracking-[0.18em] text-sm">
            Bulk Order Sheet
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Enter quantities per size. We'll review and confirm timing.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          {visibleProducts.length === 0 ? (
            <div className="p-12 text-center">
              <Shirt
                className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">
                No products available to order yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {visibleProducts.map((p) => {
                const sizes = [...STANDARD_SIZES];
                const productTotal = Object.values(draft[p.id] ?? {}).reduce(
                  (a, b) => a + b,
                  0,
                );
                return (
                  <li key={p.id} className="px-5 py-3 hover:bg-accent/5">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="h-16 w-16 rounded bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden shrink-0">
                        {p.primary_image_url ? (
                          <img
                            src={p.primary_image_url}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <Shirt
                            className="h-6 w-6 text-muted-foreground/40"
                            strokeWidth={1.5}
                          />
                        )}
                      </div>
                      <span className="text-sm truncate flex-1" title={p.title}>
                        {p.title}
                      </span>
                      {productTotal > 0 && (
                        <span className="text-[11px] uppercase tracking-wider text-accent font-semibold shrink-0">
                          {productTotal} pcs
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-20">
                      {sizes.map((s) => (
                        <SizeStepper
                          key={s}
                          productId={p.id}
                          size={s}
                          label={s}
                        />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 bg-[hsl(var(--dark))]">
          <div className="text-sm">
            <span className="ax-label">Total Units</span>
            <div className="text-2xl font-bold text-accent leading-none mt-1">{totalUnits}</div>
            {discountPct > 0 && (
              <div className="text-[11px] text-accent uppercase tracking-wider mt-1">
                {discountPct}% volume discount
              </div>
            )}
            {nextTier && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                +{nextTier.min_qty - totalUnits} more for {nextTier.discount_pct}% off
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Close
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || (totalUnits === 0 && !impersonating)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
              title={impersonating ? "Blocked while impersonating" : undefined}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Order
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
