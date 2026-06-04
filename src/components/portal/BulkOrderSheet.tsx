import { useMemo, useState } from "react";
import { Plus, Minus, Loader2, Shirt, Check, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { useOrderDraft } from "./OrderDraftContext";
import { pickDiscount, usePortalPricing } from "@/hooks/usePortalPricing";
import { ProductPreviewDialog } from "./ProductPreviewDialog";
import type { VolumeTier } from "@/hooks/usePortalPricing";
import {
  distributeByCurve,
  useSizeDistributionCurve,
} from "@/hooks/useSizeDistributionCurve";
import { MilestoneSlider } from "./MilestoneSlider";

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

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * Athlete-facing pricing model.
 * Athlete tier (what they pay): t-shirt $18, hoodie $35.25.
 * Wholesale comparison price (what they'd pay elsewhere): t-shirt $21, hoodie $40.
 * "Saved vs Wholesale" compares their effective unit to the wholesale price.
 */
function productPricing(p: PortalProduct): {
  athleteUnit: number | null;
  wholesaleUnit: number | null;
} {
  const t = (p.product_type || "").toLowerCase();
  const isHoodie = t.includes("hood");
  const isTee =
    t.includes("tee") || t.includes("tshirt") || t === "t-shirt" || t.includes("shirt");
  if (isHoodie) {
    return { athleteUnit: 35.25, wholesaleUnit: 40 };
  }
  if (isTee) {
    return { athleteUnit: 18, wholesaleUnit: 21 };
  }
  // Fallback to DB-driven values when type isn't a known category.
  // Athlete tier = athlete_unit_price. Wholesale comparison = wholesale_price
  // (fall back to retail only if no wholesale is set).
  const athlete = p.athlete_unit_price ?? null;
  const wholesale = p.wholesale_price ?? p.price ?? null;
  return { athleteUnit: athlete, wholesaleUnit: wholesale };
}

function ProductAnalytics({
  product,
  qty,
  orderDiscountPct,
  tiers,
  totalOrderUnits,
  nextTier,
}: {
  product: PortalProduct;
  qty: number;
  orderDiscountPct: number;
  tiers: VolumeTier[];
  totalOrderUnits: number;
  nextTier: VolumeTier | null;
}) {
  const { athleteUnit: base, wholesaleUnit } = productPricing(product);
  const effectiveUnit =
    base != null ? base * (1 - orderDiscountPct / 100) : null;
  const subtotal = effectiveUnit != null ? effectiveUnit * qty : null;
  const savings =
    wholesaleUnit != null && effectiveUnit != null
      ? Math.max(0, (wholesaleUnit - effectiveUnit) * qty)
      : null;
  const savingsPct =
    wholesaleUnit != null && effectiveUnit != null && wholesaleUnit > 0
      ? Math.max(0, ((wholesaleUnit - effectiveUnit) / wholesaleUnit) * 100)
      : null;

  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);

  return (
    <div className="flex-1 min-w-0 rounded border border-border/60 bg-background/40 p-2.5">
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Qty
          </div>
          <div className="text-sm font-bold text-foreground leading-tight">
            {qty}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Unit
          </div>
          <div className="text-sm font-bold text-foreground leading-tight">
            {fmtMoney(effectiveUnit)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total
          </div>
          <div className="text-sm font-bold text-accent leading-tight">
            {qty > 0 ? fmtMoney(subtotal) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saved vs Wholesale
          </div>
          <div
            className={cn(
              "text-sm font-bold leading-tight",
              savings != null && savings > 0
                ? "text-emerald-500"
                : "text-muted-foreground",
            )}
          >
            {qty > 0 && savings != null ? (
              <>
                {fmtMoney(savings)}
                {savingsPct != null && savingsPct > 0 && (
                  <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                    ({savingsPct.toFixed(0)}%)
                  </span>
                )}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      {sortedTiers.length > 0 && base != null && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Volume Pricing
          </div>
          <div className="flex flex-wrap gap-1">
            {sortedTiers.map((t) => {
              const each = base * (1 - t.discount_pct / 100);
              const hit = totalOrderUnits >= t.min_qty;
              return (
                <span
                  key={t.min_qty}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    hit
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border text-muted-foreground",
                  )}
                  title={`${t.discount_pct}% off at ${t.min_qty}+`}
                >
                  {t.min_qty}+: {fmtMoney(each)}
                </span>
              );
            })}
          </div>
          {nextTier && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              <span className="text-accent font-semibold">
                +{nextTier.min_qty - totalOrderUnits}
              </span>{" "}
              more units unlocks {nextTier.discount_pct}% off
            </div>
          )}
        </div>
      )}
    </div>
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
  const curve = useSizeDistributionCurve(organizationId);
  const [previewProduct, setPreviewProduct] = useState<PortalProduct | null>(null);
  const [selectedColor, setSelectedColor] = useState<Record<string, string>>({});
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState<Record<string, boolean>>({});
  const [autoTotal, setAutoTotal] = useState<Record<string, number>>({});

  const visibleProducts = useMemo(
    () => products.filter((p) => !isExcluded(p.title)),
    [products],
  );

  const sumSizes = (sizes: Record<string, number> | undefined) =>
    sizes ? Object.values(sizes).reduce((a, b) => a + b, 0) : 0;
  const sumProduct = (byColor: Record<string, Record<string, number>> | undefined) =>
    byColor ? Object.values(byColor).reduce((s, sz) => s + sumSizes(sz), 0) : 0;

  const totalUnits = useMemo(
    () => Object.values(draft).reduce((sum, byColor) => sum + sumProduct(byColor), 0),
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

  const applyAutoTotal = (
    productId: string,
    color: string,
    total: number,
  ) => {
    const clamped = Math.max(0, Math.min(500, Math.floor(total)));
    const key = `${productId}::${color}`;
    setAutoTotal((prev) => ({ ...prev, [key]: clamped }));
    const dist = distributeByCurve(clamped, [...STANDARD_SIZES], curve);
    for (const s of STANDARD_SIZES) {
      setQty(productId, s, dist[s] ?? 0, color);
    }
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
        color?: string | null;
      }> = [];

      const productById = new Map(products.map((p) => [p.id, p]));
      for (const [productId, byColor] of Object.entries(draft)) {
        const p = productById.get(productId);
        if (!p) continue;
        for (const [color, sizes] of Object.entries(byColor)) {
          for (const [size, qty] of Object.entries(sizes)) {
            if (qty > 0) {
              items.push({
                order_request_id: orderRow.id,
                product_id: productId,
                product_name_snapshot: p.title,
                size,
                quantity: qty,
                color: color || null,
              });
            }
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
    color,
  }: {
    productId: string;
    size: string;
    label: string;
    color: string;
  }) => {
    const qty = draft[productId]?.[color]?.[size] ?? 0;
    const active = qty > 0;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider h-3.5 leading-none",
            active ? "text-accent" : "text-transparent",
          )}
        >
          {label}
        </span>
        <div
          className={cn(
            "flex items-center gap-1 rounded border bg-background pl-0.5 pr-0.5 py-0.5",
            active ? "border-accent" : "border-border",
          )}
        >
          <button
            type="button"
            onClick={() => setQty(productId, size, Math.max(0, qty - 1), color)}
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
                setQty(
                  productId,
                  size,
                  Math.max(0, parseInt(e.target.value || "0", 10) || 0),
                  color,
                )
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
            onClick={() => setQty(productId, size, qty + 1, color)}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-accent hover:bg-accent/10"
            aria-label={`Increase ${label}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
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
                const productByColor = draft[p.id] ?? {};
                const productTotal = sumProduct(productByColor);
                const colorList = p.colors ?? [];
                const activeColor =
                  selectedColor[p.id] ??
                  (colorList[0]?.name ?? "");
                const activeColorQty = sumSizes(productByColor[activeColor]);
                const justAddedKey = `${p.id}::${activeColor}`;
                return (
                  <li key={p.id} className="px-5 py-3 hover:bg-accent/5">
                    <button
                      type="button"
                      onClick={() => setPreviewProduct(p)}
                      className="flex items-center gap-4 mb-2 w-full text-left group"
                      aria-label={`Preview ${p.title}`}
                    >
                      <div className="h-16 w-16 rounded bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-transparent group-hover:ring-accent/40 transition">
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
                      <span className="text-sm truncate flex-1 group-hover:text-accent transition" title={p.title}>
                        {p.title}
                      </span>
                      {productTotal > 0 && (
                        <span className="text-[11px] uppercase tracking-wider text-accent font-semibold shrink-0">
                          {productTotal} pcs
                        </span>
                      )}
                    </button>
                    {(colorList.length > 0 || true) && (
                      <div className="pl-20 mb-2 flex flex-wrap items-start gap-3">
                        {(() => {
                          const autoKey = `${p.id}::${activeColor}`;
                          const on = autoOn[autoKey] ?? false;
                          const total = autoTotal[autoKey] ?? 0;
                          return (
                            <div className="rounded border border-border/60 bg-background/40 p-2.5 flex-1 min-w-[240px]">
                              <div className="flex items-center justify-between mb-1.5">
                                <Label
                                  htmlFor={`auto-${autoKey}`}
                                  className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                  Auto-distribute
                                </Label>
                                <Switch
                                  id={`auto-${autoKey}`}
                                  checked={on}
                                  onCheckedChange={(v) =>
                                    setAutoOn((prev) => ({ ...prev, [autoKey]: v }))
                                  }
                                />
                              </div>
                              {on && (
                                <div className="space-y-2">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-xl font-bold text-accent leading-none tabular-nums">
                                        {total}
                                      </span>
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        units
                                      </span>
                                    </div>
                                    <input
                                      type="number"
                                      min={0}
                                      max={500}
                                      value={total || ""}
                                      placeholder="0"
                                      onChange={(e) =>
                                        applyAutoTotal(
                                          p.id,
                                          activeColor,
                                          parseInt(e.target.value || "0", 10) || 0,
                                        )
                                      }
                                      onFocus={(e) => e.currentTarget.select()}
                                      className="h-6 w-16 text-center text-xs rounded bg-background border border-border focus:outline-none focus:border-accent"
                                    />
                                  </div>
                                  <MilestoneSlider
                                    min={0}
                                    max={500}
                                    step={1}
                                    value={total}
                                    onValueChange={(v) =>
                                      applyAutoTotal(p.id, activeColor, v)
                                    }
                                    organizationId={organizationId}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div className="rounded border border-border/60 bg-background/40 p-2.5 flex items-center gap-2">
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {activeColor || "Color"}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (activeColorQty <= 0) {
                                toast.error("Add a quantity first");
                                return;
                              }
                              setRecentlyAdded(justAddedKey);
                              toast.success(
                                `${activeColor || "Item"} added to cart`,
                              );
                              setTimeout(
                                () =>
                                  setRecentlyAdded((k) =>
                                    k === justAddedKey ? null : k,
                                  ),
                                1500,
                              );
                            }}
                            className={cn(
                              "h-6 w-6 flex items-center justify-center rounded border transition",
                              recentlyAdded === justAddedKey
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                                : activeColorQty > 0
                                  ? "border-accent bg-accent/10 text-accent hover:bg-accent/20"
                                  : "border-border text-muted-foreground/60",
                            )}
                            aria-label="Add to cart"
                            title={
                              activeColorQty > 0
                                ? "Confirm this color"
                                : "Set a quantity first"
                            }
                          >
                            {recentlyAdded === justAddedKey ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <ShoppingCart className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-6 pl-20">
                      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                        {sizes.map((s) => (
                          <SizeStepper
                            key={s}
                            productId={p.id}
                            size={s}
                            label={s}
                            color={activeColor}
                          />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <ProductAnalytics
                          product={p}
                          qty={productTotal}
                          orderDiscountPct={discountPct}
                          tiers={config.tiers}
                          totalOrderUnits={totalUnits}
                          nextTier={nextTier}
                        />
                        <div className="rounded border border-border/60 bg-background/40 p-2.5">
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Available Colors
                          </div>
                          {colorList.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {colorList.map((c) => {
                                const hasQty = sumSizes(productByColor[c.name]) > 0;
                                const isActive = c.name === activeColor;
                                return (
                                  <button
                                    key={c.name}
                                    type="button"
                                    onClick={() =>
                                      setSelectedColor((prev) => ({
                                        ...prev,
                                        [p.id]: c.name,
                                      }))
                                    }
                                    title={c.name}
                                    className={cn(
                                      "relative h-6 w-6 rounded border shadow-sm transition",
                                      isActive
                                        ? "border-accent ring-2 ring-accent/40"
                                        : "border-border hover:border-accent/60",
                                    )}
                                    style={{
                                      backgroundColor: c.hex ?? "transparent",
                                    }}
                                  >
                                    {hasQty && (
                                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                                        <Check className="h-2 w-2" strokeWidth={3} />
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="h-6 w-full rounded border border-dashed border-border/60 bg-muted/30 flex items-center justify-center">
                              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                                No colors available
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
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
      <ProductPreviewDialog
        open={!!previewProduct}
        onOpenChange={(o) => !o && setPreviewProduct(null)}
        product={previewProduct}
      />
    </Sheet>
  );
}
