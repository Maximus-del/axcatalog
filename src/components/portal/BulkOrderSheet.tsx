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
import { effectiveTiers, pickDiscount, usePortalPricing } from "@/hooks/usePortalPricing";
import { sheetUnitPrice } from "@/lib/portal/api/products";
import { submitPortalOrder, type PortalOrderItem } from "@/lib/portal-commerce";
import { newIdempotencyKey } from "@/lib/portal/api/orders";
import { ProductImageLightbox } from "./ProductImageLightbox";
import type { VolumeTier } from "@/hooks/usePortalPricing";
import { useAthleteCredit } from "@/hooks/useAthleteCredit";
import {
  distributeByCurve,
  useSizeDistributionCurve,
} from "@/hooks/useSizeDistributionCurve";
import { MilestoneSlider } from "./MilestoneSlider";
import { announceOrder } from "./OrderReceipt";

const STANDARD_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
/** Full apparel size ladder used to order real Shopify variant sizes. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] as const;
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
  /** Locker Room (world) shell presentation. Presentation only. */
  world?: boolean;
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
 * Athlete tier (what they pay): t-shirt $18, hoodie $35.
 * Wholesale comparison price (what they'd pay elsewhere): t-shirt $25, hoodie $48.
 * "Saved vs Wholesale" compares their effective unit to the wholesale price.
 */
function productPricing(p: PortalProduct): {
  athleteUnit: number | null;
  wholesaleUnit: number | null;
} {
  // One rule for the whole portal (and the server): sheetUnitPrice, which
  // honours the price AX sets in the V2 pricing sheet.
  const { athleteUnit, compareUnit } = sheetUnitPrice(p);
  return { athleteUnit, wholesaleUnit: compareUnit };
}

function ProductAnalytics({
  product,
  qty,
  orderDiscountPct,
  tiers,
  totalOrderUnits,
  nextTier,
  world,
}: {
  product: PortalProduct;
  qty: number;
  orderDiscountPct: number;
  tiers: VolumeTier[];
  totalOrderUnits: number;
  nextTier: VolumeTier | null;
  world?: boolean;
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
    <div className={cn("flex-1 min-w-0 self-stretch rounded border border-border/60 bg-background/40 p-2.5", world && "mw-bulk-panel")}>
      {/* Current Discount + Next Tier */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 rounded bg-accent/10 border border-accent/30 px-2 py-1">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-accent">
            Current Discount
          </div>
          <div className="text-sm font-bold text-accent leading-tight">
            {orderDiscountPct > 0 ? `${orderDiscountPct}% off` : "No discount yet"}
          </div>
        </div>
        {nextTier ? (
          <div className="flex-1 rounded bg-muted/40 border border-border px-2 py-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Units to Next
            </div>
            <div className="text-sm font-bold text-foreground leading-tight">
              <span className="text-accent">{nextTier.min_qty - totalOrderUnits}</span>{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                for {nextTier.discount_pct}% off
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
              Max Discount
            </div>
            <div className="text-sm font-bold text-emerald-500 leading-tight">
              25% off unlocked
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
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
          <div className="text-sm font-bold text-foreground leading-tight flex items-baseline gap-1.5">
            {fmtMoney(effectiveUnit)}
            {wholesaleUnit != null &&
              effectiveUnit != null &&
              wholesaleUnit > effectiveUnit && (
                <span className="text-[10px] font-medium text-muted-foreground line-through">
                  {fmtMoney(wholesaleUnit)}
                </span>
              )}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total
          </div>
          <div className="text-sm font-bold text-accent leading-tight">
            {qty > 0 ? fmtMoney(subtotal) : fmtMoney(effectiveUnit)}
          </div>
        </div>
      </div>
      <div className="mb-2">
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
          {savings != null ? (
            <>
              {fmtMoney(
                qty > 0
                  ? savings
                  : wholesaleUnit != null && effectiveUnit != null
                    ? wholesaleUnit - effectiveUnit
                    : 0,
              )}
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
  world,
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
  const { wallet, refetch: refetchWallet } = useAthleteCredit(athleteId);
  const [creditInput, setCreditInput] = useState<string>("");
  // One key per checkout attempt, kept across retries and double-clicks;
  // replaced only after a successful submit.
  const [orderKey, setOrderKey] = useState(() => newIdempotencyKey());

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

  // Prefer real org volume tiers when configured; fall back to defaults silently.
  const volumeTiers = useMemo<VolumeTier[]>(
    () => effectiveTiers(config.tiers),
    [config.tiers],
  );
  const discountPct = pickDiscount(volumeTiers, totalUnits);
  const markupMult = 1 + config.base_markup_pct / 100;
  const discountMult = 1 - discountPct / 100;

  const nextTier = useMemo(
    () =>
      [...volumeTiers]
        .sort((a, b) => a.min_qty - b.min_qty)
        .find((t) => totalUnits < t.min_qty) ?? null,
    [totalUnits, volumeTiers],
  );

  // Order subtotal (post-discount) across all products in the draft. Rounded
  // per line exactly as portal_quote_order rounds, so a large order cannot
  // drift a few cents from the server and be refused.
  const localSubtotal = useMemo(() => {
    let sum = 0;
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const [pid, byColor] of Object.entries(draft)) {
      const p = byId.get(pid);
      if (!p) continue;
      const { athleteUnit } = productPricing(p);
      if (athleteUnit == null) continue;
      for (const sizes of Object.values(byColor)) {
        for (const qty of Object.values(sizes)) {
          if (qty > 0) sum += Math.round(athleteUnit * qty * discountMult * 100) / 100;
        }
      }
    }
    return Math.round(sum * 100) / 100;
  }, [draft, products, discountMult]);
  // When the server prices the order differently it says so once; from then on
  // this sheet shows (and submits against) the server's number for that draft.
  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);
  const [serverPrice, setServerPrice] = useState<{ key: string; subtotal: number } | null>(null);
  const orderSubtotal = serverPrice && serverPrice.key === draftKey ? serverPrice.subtotal : localSubtotal;

  const availableCredit = wallet?.balance ?? 0;
  const maxApplicable = Math.min(availableCredit, orderSubtotal);
  const creditToApply = Math.max(
    0,
    Math.min(maxApplicable, parseFloat(creditInput || "0") || 0),
  );
  const amountDue = Math.max(0, orderSubtotal - creditToApply);

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
    availableSizes?: readonly string[],
  ) => {
    const clamped = Math.max(0, Math.min(500, Math.floor(total)));
    const key = `${productId}::${color}`;
    setAutoTotal((prev) => ({ ...prev, [key]: clamped }));
    const targets = availableSizes && availableSizes.length
      ? [...availableSizes]
      : [...STANDARD_SIZES];
    const dist = distributeByCurve(clamped, targets, curve);
    // Zero out any standard sizes not in target list, then assign distribution.
    for (const s of STANDARD_SIZES) {
      if (!targets.includes(s)) setQty(productId, s, 0, color);
    }
    for (const s of targets) {
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
    // Block submission when any quantity targets an unavailable variant.
    {
      const productById = new Map(products.map((p) => [p.id, p]));
      for (const [productId, byColor] of Object.entries(draft)) {
        const p = productById.get(productId);
        if (
          !p ||
          !p.variants ||
          p.variants.length === 0 ||
          !p.variants.some(
            (v) => (v.color ?? "") !== "" || (v.size ?? "") !== "",
          )
        )
          continue;
        const lookup = new Map<string, (typeof p.variants)[number]>();
        for (const v of p.variants) {
          lookup.set(`${v.color ?? ""}|${v.size ?? ""}`, v);
        }
        for (const [color, sizes] of Object.entries(byColor)) {
          for (const [size, qty] of Object.entries(sizes)) {
            if (!qty || qty <= 0) continue;
            const v = lookup.get(`${color ?? ""}|${size}`);
            if (!v || (p.status !== "archived" && v.available !== true)) {
              toast.error(
                `Remove out-of-stock items (${p.title} · ${color || "—"} · ${size}) before submitting`,
              );
              return;
            }
          }
        }
      }
    }
    setSubmitting(true);
    try {
      // What, not what it costs: the server prices it (bulk-sheet rules), checks
      // stock, applies the credit and records the amount due in one transaction.
      const items: PortalOrderItem[] = [];
      const productById = new Map(products.map((p) => [p.id, p]));
      for (const [productId, byColor] of Object.entries(draft)) {
        const p = productById.get(productId);
        if (!p) continue;
        for (const [color, sizes] of Object.entries(byColor)) {
          for (const [size, qty] of Object.entries(sizes)) {
            if (qty > 0) {
              items.push({
                product_id: productId,
                product_name: p.title,
                size,
                quantity: qty,
                color: color || null,
              });
            }
          }
        }
      }

      const res = await submitPortalOrder({
        organizationId,
        athleteId,
        userId: user.id,
        items,
        summary: "Bulk order sheet",
        creditToApply,
        amountDue,
        idempotencyKey: orderKey,
        viewingAs: impersonating,
        screenSubtotal: Math.round(orderSubtotal * 100) / 100,
      });
      if (!res.ok) {
        if (res.newQuote) setServerPrice({ key: draftKey, subtotal: res.newQuote.subtotalDollars });
        toast.error(res.error ?? "Submit failed");
        return;
      }
      if ((res.creditApplied ?? creditToApply) > 0) await refetchWallet();

      announceOrder({
        orderNumber: res.orderNumber ?? null,
        units: totalUnits,
        subtotal: res.subtotal ?? orderSubtotal,
        creditApplied: res.creditApplied ?? 0,
        amountDue: res.amountDue ?? null,
        replayed: res.replayed,
      });
      clear();
      setCreditInput("");
      setOrderKey(newIdempotencyKey());
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
    disabled = false,
  }: {
    productId: string;
    size: string;
    label: string;
    color: string;
    disabled?: boolean;
  }) => {
    const qty = draft[productId]?.[color]?.[size] ?? 0;
    const active = qty > 0;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider h-3.5 leading-none",
            disabled
              ? "text-muted-foreground/50"
              : active
                ? "text-accent"
                : "text-transparent",
          )}
        >
          {disabled ? "Out" : label}
        </span>
        <div
          className={cn(
            "flex items-center gap-1 rounded border bg-background pl-0.5 pr-0.5 py-0.5",
            disabled
              ? "border-dashed border-border/50 opacity-50"
              : active
                ? "border-accent"
                : "border-border",
          )}
          title={disabled ? "Out of stock" : undefined}
        >
          <button
            type="button"
            onClick={() => setQty(productId, size, Math.max(0, qty - 1), color)}
            disabled={disabled}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            aria-label={`Decrease ${label}`}
          >
            <Minus className="h-3 w-3" />
          </button>
          {active ? (
            <input
              type="number"
              min={0}
              value={qty}
              disabled={disabled}
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
            disabled={disabled}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            aria-label={`Increase ${label}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  // Locker Room shell: Live products first, then the Archive (reprints).
  const rowGroups: { key: string; items: typeof visibleProducts }[] = world
    ? [
        { key: "live", items: visibleProducts.filter((p) => p.status !== "archived") },
        { key: "archive", items: visibleProducts.filter((p) => p.status === "archived") },
      ]
    : [{ key: "all", items: visibleProducts }];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-full sm:max-w-3xl flex flex-col p-0 border-border", world ? "mw-bulk" : "bg-card")}
      >
        <SheetHeader className={cn("px-6 py-4 border-b border-border", world && "mw-bulk-head")}>
          <SheetTitle className={cn("text-accent uppercase tracking-[0.18em] text-sm", world && "mw-bulk-title")}>
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
              {rowGroups.flatMap((group) => [
                world && group.key === "archive" && group.items.length > 0 ? (
                  <li key="mw-archive-group" className="mw-bulk-group">Archive</li>
                ) : null,
                ...group.items.map((p) => {
                // Skip single-variant "Default Title" products so the standard
                // size grid remains usable (no real color/size dimensions).
                const hasVariants =
                  (p.variants?.length ?? 0) > 0 &&
                  p.variants.some(
                    (v) => (v.color ?? "") !== "" || (v.size ?? "") !== "",
                  );
                // When variants exist, build size list from real variants;
                // otherwise keep the standard columns for manual products.
                const sizes: string[] = hasVariants
                  ? (() => {
                      const seen = new Set<string>();
                      const out: string[] = [];
                      // Prefer standard order for known sizes, then extras in variant order.
                      const variantSizes = new Set<string>();
                      for (const v of p.variants) {
                        const s = v.size ?? "";
                        if (s) variantSizes.add(s);
                      }
                      for (const s of STANDARD_SIZES) {
                        if (variantSizes.has(s) && !seen.has(s)) {
                          seen.add(s);
                          out.push(s);
                        }
                      }
                      for (const v of p.variants) {
                        const s = v.size ?? "";
                        if (!s || seen.has(s)) continue;
                        seen.add(s);
                        out.push(s);
                      }
                      return out.length ? out : [...STANDARD_SIZES];
                    })()
                  : [...STANDARD_SIZES];
                // Variant lookup by `${color}|${size}` (color "" when null).
                const variantByCell = new Map<
                  string,
                  (typeof p.variants)[number]
                >();
                if (hasVariants) {
                  for (const v of p.variants) {
                    variantByCell.set(`${v.color ?? ""}|${v.size ?? ""}`, v);
                  }
                }
                const isAvailable = (color: string, size: string): boolean => {
                  if (!hasVariants) return true;
                  const v = variantByCell.get(`${color}|${size}`);
                  // Archived: reprinted from the design file, so Shopify stock no
                  // longer applies (the server treats it as made to order).
                  if (p.status === "archived") return !!v;
                  return !!v && v.available === true;
                };
                const productByColor = draft[p.id] ?? {};
                const productTotal = sumProduct(productByColor);
                const rawColors = p.colors ?? [];
                // When real variants exist, never inject a synthetic "Black";
                // use exactly the colorways Shopify reports.
                // Without variants, use the product's own colourways (blank or
                // library pictures); only a product with NO colour at all gets a
                // single "Black" row, never one prepended to real colourways.
                const colorList = hasVariants || rawColors.length
                  ? rawColors
                  : [{ name: "Black", hex: "#000000" }];
                const activeColor =
                  selectedColor[p.id] ??
                  (hasVariants
                    ? colorList[0]?.name ?? ""
                    : colorList.find(
                        (c) => c.name.trim().toLowerCase() === "black",
                      )?.name ??
                      colorList[0]?.name ??
                      "Black");
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
                            className="h-full w-full object-contain p-1"
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
                    {world && p.status === "archived" && <p className="mw-bulk-archive">Reprinted from the design file</p>}
                    {hasVariants ? (
                      (() => {
                        // Group real variants by color and render each group as its
                        // own row of size steppers. Unavailable variants stay visible
                        // but disabled (see SizeStepper's `disabled` prop).
                        type V = (typeof p.variants)[number];
                        const groups = new Map<
                          string,
                          { variants: V[]; minPos: number }
                        >();
                        for (const v of p.variants) {
                          const key = v.color ?? "";
                          const g = groups.get(key) ?? {
                            variants: [],
                            minPos: Number.POSITIVE_INFINITY,
                          };
                          g.variants.push(v);
                          g.minPos = Math.min(
                            g.minPos,
                            v.position ?? Number.POSITIVE_INFINITY,
                          );
                          groups.set(key, g);
                        }
                        const groupArr = Array.from(groups.entries())
                          .map(([name, g]) => ({ name, ...g }))
                          .sort((a, b) => {
                            if (
                              isFinite(a.minPos) &&
                              isFinite(b.minPos) &&
                              a.minPos !== b.minPos
                            ) {
                              return a.minPos - b.minPos;
                            }
                            return a.name.localeCompare(b.name);
                          });
                        const sortGroupSizes = (vs: V[]) => {
                          const bySize = new Map<string, V>();
                          for (const v of vs) bySize.set(v.size ?? "", v);
                          const allSizes = Array.from(bySize.keys());
                          const std = SIZE_ORDER.filter((s) =>
                            bySize.has(s),
                          ) as string[];
                          const extras = allSizes
                            .filter(
                              (s) =>
                                s !== "" &&
                                !(SIZE_ORDER as readonly string[]).includes(s),
                            )
                            .sort();
                          const ordered = [...std, ...extras];
                          if (bySize.has("")) ordered.push("");
                          return ordered.map((s) => ({
                            size: s,
                            variant: bySize.get(s)!,
                          }));
                        };
                        return (
                          <div className="pl-20 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-6">
                            <div className="flex-1 min-w-0 flex flex-col gap-2">
                              {groupArr.map((group) => {
                                const colorKey = group.name;
                                const sized = sortGroupSizes(group.variants);
                                const availSizes = sized
                                  .filter((x) => x.variant.available)
                                  .map((x) => x.size);
                                const colorQty = sumSizes(
                                  productByColor[colorKey],
                                );
                                const hex =
                                  (p.colors ?? []).find(
                                    (c) =>
                                      c.name.trim().toLowerCase() ===
                                      colorKey.trim().toLowerCase(),
                                  )?.hex ?? null;
                                const thumbId =
                                  group.variants.find(
                                    (v) => v.shopifyImageId,
                                  )?.shopifyImageId ?? null;
                                const thumbUrl = thumbId
                                  ? p.images.find(
                                      (i) => i.shopifyImageId === thumbId,
                                    )?.url ?? null
                                  : null;
                                const autoKey = `${p.id}::${colorKey}`;
                                const on = autoOn[autoKey] ?? false;
                                const total = autoTotal[autoKey] ?? 0;
                                return (
                                  <div
                                    key={colorKey || "__nocolor__"}
                                    className={cn("rounded border border-border/60 bg-background/30 p-2.5", world && "mw-bulk-panel")}
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      {thumbUrl ? (
                                        <img
                                          src={thumbUrl}
                                          alt=""
                                          className="h-9 w-9 rounded object-cover bg-[hsl(var(--dark))] shrink-0"
                                        />
                                      ) : hex ? (
                                        <span
                                          className="h-9 w-9 rounded border border-border shrink-0"
                                          style={{ backgroundColor: hex }}
                                        />
                                      ) : (
                                        <span className="h-9 w-9 rounded border border-dashed border-border/60 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div
                                          className="text-xs font-semibold uppercase tracking-wider text-foreground truncate"
                                          title={colorKey || "One Color"}
                                        >
                                          {colorKey || "One Color"}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {availSizes.length}/{sized.length} in stock
                                        </div>
                                      </div>
                                      {colorQty > 0 && (
                                        <span className="text-[11px] uppercase tracking-wider text-accent font-semibold shrink-0">
                                          {colorQty} pcs
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-5 gap-x-2 gap-y-1.5">
                                      {sized.map(({ size, variant }) => (
                                        <SizeStepper
                                          key={`${colorKey}|${size}`}
                                          productId={p.id}
                                          size={size}
                                          label={size || "OS"}
                                          color={colorKey}
                                          disabled={!variant.available}
                                        />
                                      ))}
                                    </div>
                                    {availSizes.length > 1 && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <Label
                                          htmlFor={`auto-${autoKey}`}
                                          className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                                        >
                                          Auto
                                        </Label>
                                        <Switch
                                          id={`auto-${autoKey}`}
                                          checked={on}
                                          onCheckedChange={(v) =>
                                            setAutoOn((prev) => ({
                                              ...prev,
                                              [autoKey]: v,
                                            }))
                                          }
                                        />
                                        {on && (
                                          <input
                                            type="number"
                                            min={0}
                                            max={500}
                                            value={total || ""}
                                            placeholder="0"
                                            onChange={(e) =>
                                              applyAutoTotal(
                                                p.id,
                                                colorKey,
                                                parseInt(
                                                  e.target.value || "0",
                                                  10,
                                                ) || 0,
                                                availSizes,
                                              )
                                            }
                                            onFocus={(e) =>
                                              e.currentTarget.select()
                                            }
                                            className="h-6 w-16 text-center text-xs rounded bg-background border border-border focus:outline-none focus:border-accent"
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="md:w-[280px] flex">
                              <ProductAnalytics
                                product={p}
                                qty={productTotal}
                                orderDiscountPct={discountPct}
                                tiers={volumeTiers}
                                totalOrderUnits={totalUnits}
                                nextTier={nextTier}
                                world={world}
                              />
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                    <>
                    <div className="pl-20 mb-2 flex flex-wrap items-start gap-3">
                        {(() => {
                          const autoKey = `${p.id}::${activeColor}`;
                          const on = autoOn[autoKey] ?? false;
                          const total = autoTotal[autoKey] ?? 0;
                          return (
                            <div className={cn("rounded border border-border/60 bg-background/40 p-2.5 flex-1 min-w-[240px]", world && "mw-bulk-panel")}>
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
                                          hasVariants
                                            ? sizes.filter((s) =>
                                                isAvailable(activeColor, s),
                                              )
                                            : sizes,
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
                                      applyAutoTotal(
                                        p.id,
                                        activeColor,
                                        v,
                                        hasVariants
                                          ? sizes.filter((s) =>
                                              isAvailable(activeColor, s),
                                            )
                                          : sizes,
                                      )
                                    }
                                    organizationId={organizationId}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div className={cn("rounded border border-border/60 bg-background/40 p-2.5 flex items-center gap-2", world && "mw-bulk-panel")}>
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
                                `${activeColor || "Item"}: ${activeColorQty} units in this order`,
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
                    <div className="flex items-stretch gap-6 pl-20">
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                          {sizes.map((s) => (
                            <SizeStepper
                              key={s}
                              productId={p.id}
                              size={s}
                              label={s}
                              color={activeColor}
                              disabled={!isAvailable(activeColor, s)}
                            />
                          ))}
                        </div>
                        <div className={cn("rounded border border-border/60 bg-background/40 p-2.5", world && "mw-bulk-panel")}>
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
                      <div className="flex-1 min-w-0 flex">
                        <ProductAnalytics
                          product={p}
                          qty={productTotal}
                          orderDiscountPct={discountPct}
                          tiers={volumeTiers}
                          totalOrderUnits={totalUnits}
                          nextTier={nextTier}
                          world={world}
                        />
                      </div>
                    </div>
                    </>
                    )}
                  </li>
                );
                  })
                ])}
            </ul>
          )}
        </div>

        <div className={cn("border-t border-border px-6 py-4 bg-[hsl(var(--dark))] space-y-3", world && "mw-bulk-foot")}>
          {availableCredit > 0 && orderSubtotal > 0 && (
            <div className={cn("rounded border border-accent/30 bg-accent/5 p-3 space-y-2", world && "mw-bulk-credit")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="ax-label text-[10px]">{world ? "AX Credit" : "Credit Balance"}</div>
                  <div className="text-sm font-semibold text-accent">
                    ${availableCredit.toFixed(2)} available
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="credit-apply" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Apply
                  </Label>
                  <input
                    id="credit-apply"
                    type="number"
                    min={0}
                    max={maxApplicable}
                    step="0.01"
                    value={creditInput}
                    placeholder="0.00"
                    onChange={(e) => setCreditInput(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-8 w-24 text-right text-sm rounded bg-background border border-border px-2 focus:outline-none focus:border-accent"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] uppercase tracking-wider"
                    onClick={() => setCreditInput(maxApplicable.toFixed(2))}
                  >
                    Max
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
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
            {orderSubtotal > 0 && (
              <div className="text-right text-xs space-y-0.5">
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">${orderSubtotal.toFixed(2)}</span>
                </div>
                {creditToApply > 0 && (
                  <div className="flex justify-between gap-6 text-accent">
                    <span>Credit</span>
                    <span className="font-semibold">−${creditToApply.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-6 pt-1 border-t border-border/60">
                  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Due</span>
                  <span className="text-sm font-bold text-foreground">${amountDue.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
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
      <ProductImageLightbox
        open={!!previewProduct}
        onOpenChange={(o) => !o && setPreviewProduct(null)}
        product={previewProduct}
      />
    </Sheet>
  );
}
