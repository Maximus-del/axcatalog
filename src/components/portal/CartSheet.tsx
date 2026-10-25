// Mobile-first. Test at 375px before merging.
//
// The portal cart and checkout. Everything Quick Order, the product page and
// the bulk sheet added lands here. One live server price for the whole cart
// (volume discount included), then — for owners — how to pay:
//
//   Pay now   5% off, straight to a secure Shopify checkout (card, Apple Pay).
//   Net 30    get the gear now, pay within 30 days (clients AX has approved).
//
// Team logins send the order and AX invoices the organization, as before.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Loader2, Minus, Plus, ShoppingCart, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalData } from "./PortalDataContext";
import { useOrderDraft } from "./OrderDraftContext";
import { usePortalCheckoutOptions, usePortalQuote, usePortalScope } from "@/hooks/usePortalApi";
import { draftToLines, dueLabel, missingShipTo, orderGrid, payNowPrice, type ShipTo } from "@/lib/portal/cart";
import { choosePayment, isSafePaymentUrl, startPayment, type PaymentTerms } from "@/lib/portal/api/checkout";
import { newIdempotencyKey } from "@/lib/portal/api/orders";
import { PortalApiError } from "@/lib/portal/api/contract";
import { submitPortalOrder, type PortalOrderItem } from "@/lib/portal-commerce";
import { sheetUnitPrice } from "@/lib/portal/api/products";
import { announceOrder } from "./OrderReceipt";
import type { PortalProduct } from "@/hooks/usePortalProducts";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CartSheet() {
  const { draft, setQty, clear, unitCount, cartOpen, setCartOpen } = useOrderDraft();
  const { athlete, isImpersonating, products, archivedProducts, refetchOrders, openGuard } = usePortalData();
  const scope = usePortalScope();
  const { user } = useAuth();

  const byId = useMemo(() => {
    const m = new Map<string, PortalProduct>();
    for (const p of [...products, ...archivedProducts]) m.set(p.id, p);
    return m;
  }, [products, archivedProducts]);
  const lines = useMemo(() => draftToLines(draft, new Set(byId.keys())), [draft, byId]);
  const units = lines.reduce((a, l) => a + l.quantity, 0);

  const [step, setStep] = useState<"cart" | "pay">("cart");
  const [terms, setTerms] = useState<PaymentTerms>("pay_now");
  const [useCredit, setUseCredit] = useState(false);
  const [ship, setShip] = useState<Partial<ShipTo>>({});
  const [shipOpen, setShipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderKey, setOrderKey] = useState(() => newIdempotencyKey());

  const quote = usePortalQuote(cartOpen ? lines : []);
  const options = usePortalCheckoutOptions(cartOpen);
  const opts = options.data;
  const canChoose = !!opts?.canChoose && !isImpersonating;

  // Prefill the ship-to from the last order once.
  useEffect(() => {
    if (opts?.shipTo && !Object.keys(ship).length) setShip(opts.shipTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once
  }, [opts?.shipTo]);
  useEffect(() => {
    if (!cartOpen) setStep("cart");
  }, [cartOpen]);
  useEffect(() => {
    if (opts && !opts.net30 && terms === "net_30") setTerms("pay_now");
  }, [opts, terms]);

  const serverQuote = quote.data && quote.data.units === units ? quote.data : null;
  const quoteError = !quote.isError
    ? null
    : quote.error instanceof PortalApiError && quote.error.error.fieldErrors
      ? Object.values(quote.error.error.fieldErrors).join(" · ")
      : quote.error instanceof Error ? quote.error.message : "Couldn't price this cart";
  const subtotal = serverQuote?.subtotalDollars ?? null;
  const creditAvailable = serverQuote?.creditAvailable ? serverQuote.creditAvailable.amountMinor / 100 : 0;
  const credit = canChoose && useCredit && subtotal != null ? Math.min(creditAvailable, subtotal) : 0;
  const due = subtotal != null ? Math.max(0, Math.round((subtotal - credit) * 100) / 100) : null;
  const nowPrice = due != null ? payNowPrice(due, opts?.payNowPct ?? 5) : null;
  const shipMissing = missingShipTo(ship);

  // Cart rows grouped by product.
  const groups = useMemo(() => {
    const out: Array<{ product: PortalProduct; rows: Array<{ color: string; size: string; qty: number; label: string }> }> = [];
    for (const [pid, byColor] of Object.entries(draft)) {
      const product = byId.get(pid);
      if (!product) continue;
      const grid = orderGrid(product);
      const rows: Array<{ color: string; size: string; qty: number; label: string }> = [];
      for (const [color, sizes] of Object.entries(byColor)) {
        const colorName = grid.colors.find((c) => c.key === color)?.name ?? color;
        for (const [size, qty] of Object.entries(sizes)) {
          if (qty <= 0) continue;
          const label = [color ? colorName : null, size || null].filter(Boolean).join(" · ") || "Qty";
          rows.push({ color, size, qty, label });
        }
      }
      if (rows.length) out.push({ product, rows });
    }
    return out;
  }, [draft, byId]);

  const place = async () => {
    if (isImpersonating) {
      openGuard();
      return;
    }
    if (!user || units === 0 || subtotal == null) return;
    const payAfter = canChoose && (due ?? 0) > 0.01;
    if (payAfter && terms === "net_30" && shipMissing.length) {
      setShipOpen(true);
      toast.error(`Add your shipping address: ${shipMissing.join(", ")}.`);
      return;
    }
    setBusy(true);
    try {
      const items: PortalOrderItem[] = lines.map((l) => ({
        product_id: l.productId,
        product_name: byId.get(l.productId)?.title ?? "Product",
        size: l.size ?? "",
        quantity: l.quantity,
        color: l.color,
      }));
      const res = await submitPortalOrder({
        organizationId: athlete.organization_id,
        athleteId: athlete.id,
        userId: user.id,
        items,
        summary: `Cart · ${groups.length} product${groups.length === 1 ? "" : "s"}`,
        creditToApply: Math.round(credit * 100) / 100,
        amountDue: due ?? 0,
        screenSubtotal: subtotal,
        idempotencyKey: orderKey,
        viewingAs: isImpersonating,
      });
      if (!res.ok || !res.orderId) {
        toast.error(res.error ?? "Couldn't place the order.");
        return;
      }
      // The order is in. Everything after this is about paying for it.
      clear();
      setOrderKey(newIdempotencyKey());
      refetchOrders();
      const placed = {
        orderNumber: res.orderNumber ?? null,
        units,
        subtotal: res.subtotal ?? subtotal,
        creditApplied: res.creditApplied ?? credit,
        amountDue: res.amountDue ?? due,
        replayed: res.replayed,
      };
      if (!payAfter || (res.amountDue ?? 0) <= 0.01) {
        setCartOpen(false);
        announceOrder(placed);
        return;
      }

      let choice;
      try {
        choice = await choosePayment(scope, res.orderId, terms, terms === "net_30" || shipMissing.length === 0 ? ship : null);
      } catch (e) {
        setCartOpen(false);
        announceOrder(placed);
        toast.error(e instanceof Error ? e.message : "Order placed — AX will send the invoice.");
        return;
      }
      const link = await startPayment(res.orderId);
      const payment = {
        terms: choice.terms,
        payNowDiscount: choice.payNowDiscount,
        dueDate: choice.dueDate ?? (terms === "net_30" ? addDays(30) : null),
        paymentUrl: link.ok ? link.paymentUrl ?? null : null,
        linkComing: !link.ok || !link.paymentUrl,
      };
      if (choice.terms === "pay_now" && link.ok && isSafePaymentUrl(link.paymentUrl)) {
        // Straight to the secure checkout. Coming back, the order shows under Recent orders.
        window.location.assign(link.paymentUrl);
        return;
      }
      setCartOpen(false);
      announceOrder({ ...placed, amountDue: choice.amountDue, payment });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't place the order.");
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof ShipTo, label: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
      {label}
      <input
        value={(ship[k] as string) ?? ""}
        onChange={(e) => setShip((s) => ({ ...s, [k]: e.target.value }))}
        className="h-10 rounded-md border border-border bg-background px-3 text-base sm:text-sm normal-case tracking-normal text-foreground focus:outline-none focus:border-accent"
        {...extra}
      />
    </label>
  );

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-card">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border text-left">
          <SheetTitle className="flex items-center gap-2">
            {step === "pay" ? (
              <button type="button" onClick={() => setStep("cart")} className="-ml-1 p-1 text-muted-foreground hover:text-foreground" aria-label="Back to cart">
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <ShoppingCart className="h-4 w-4 text-accent" />
            )}
            {step === "pay" ? "Checkout" : "Your cart"}
          </SheetTitle>
          <SheetDescription>
            {units === 0 ? "Nothing in your cart yet." : `${units.toLocaleString()} unit${units === 1 ? "" : "s"} · ${groups.length} product${groups.length === 1 ? "" : "s"}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "cart" && (
            <>
              {units === 0 && (
                <p className="text-sm text-muted-foreground">
                  Tap <strong>Quick order</strong> on any piece in My Gear to add sizes — they collect here.
                </p>
              )}
              {groups.map(({ product, rows }) => {
                const img = product.images?.[0]?.url ?? product.primary_image_url;
                return (
                  <div key={product.id} className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 rounded-md bg-[hsl(var(--dark))] overflow-hidden">
                      {img ? <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-tight truncate" title={product.title}>{product.title}</div>
                      <div className="text-[11px] text-muted-foreground">{usd(sheetUnitPrice(product).athleteUnit)} / unit</div>
                      <ul className="mt-1.5 space-y-1">
                        {rows.map((r) => (
                          <li key={`${r.color}|${r.size}`} className="flex items-center gap-2">
                            <span className="flex-1 text-xs truncate">{r.label}</span>
                            <div className="flex items-center rounded-full border border-border">
                              <button type="button" className="h-8 w-8 grid place-items-center text-muted-foreground hover:text-foreground" aria-label={`One less ${r.label}`} onClick={() => setQty(product.id, r.size, r.qty - 1, r.color)}>
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{r.qty}</span>
                              <button type="button" className="h-8 w-8 grid place-items-center text-muted-foreground hover:text-foreground" aria-label={`One more ${r.label}`} onClick={() => setQty(product.id, r.size, r.qty + 1, r.color)}>
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <button type="button" className="h-8 w-8 grid place-items-center text-muted-foreground hover:text-destructive" aria-label={`Remove ${r.label}`} onClick={() => setQty(product.id, r.size, 0, r.color)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {step === "pay" && (
            <>
              {creditAvailable > 0 && canChoose && (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  <span>Use AX credit <span className="text-muted-foreground">({usd(creditAvailable)} available)</span></span>
                  <Switch checked={useCredit} onCheckedChange={setUseCredit} aria-label="Use AX credit" />
                </label>
              )}

              {canChoose && (due ?? 0) > 0.01 ? (
                <div className="space-y-2" role="radiogroup" aria-label="How to pay">
                  <PayOption
                    selected={terms === "pay_now"}
                    onSelect={() => setTerms("pay_now")}
                    icon={<Zap className="h-4 w-4" />}
                    title="Pay now"
                    badge={`Save ${opts?.payNowPct ?? 5}%`}
                    amount={usd(nowPrice?.total)}
                    note="Card, Apple Pay or Shop Pay on a secure checkout."
                  />
                  <PayOption
                    selected={terms === "net_30"}
                    onSelect={() => opts?.net30 && setTerms("net_30")}
                    disabled={!opts?.net30}
                    icon={<CalendarClock className="h-4 w-4" />}
                    title="Net 30"
                    amount={usd(due)}
                    note={opts?.net30 ? `Get it now, sell it, pay by ${dueLabel(addDays(30))?.replace("Due ", "") ?? "30 days"}.` : "Pay in 30 days — ask AX to switch this on for your account."}
                  />
                </div>
              ) : canChoose ? (
                <p className="text-sm text-muted-foreground">Your AX credit covers this order — nothing to pay.</p>
              ) : (
                <p className="text-sm text-muted-foreground">AX sends the invoice to your organization's owner once the order is confirmed.</p>
              )}

              {canChoose && (due ?? 0) > 0.01 && (
                <div className="rounded-lg border border-border">
                  <button type="button" className="w-full flex items-center justify-between px-3 py-2.5 text-sm" onClick={() => setShipOpen((v) => !v)} aria-expanded={shipOpen}>
                    <span className="font-semibold">Ship to</span>
                    <span className={cn("text-xs truncate max-w-[60%]", shipMissing.length && terms === "net_30" ? "text-destructive" : "text-muted-foreground")}>
                      {shipMissing.length ? (terms === "net_30" ? "Required" : "Optional — asked at checkout") : [ship.address1, ship.city, ship.province].filter(Boolean).join(", ")}
                    </span>
                  </button>
                  {shipOpen && (
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      <div className="col-span-2">{field("name", "Name", { autoComplete: "name" })}</div>
                      <div className="col-span-2">{field("company", "Company (optional)", { autoComplete: "organization" })}</div>
                      <div className="col-span-2">{field("address1", "Street", { autoComplete: "address-line1" })}</div>
                      <div className="col-span-2">{field("address2", "Apt / suite (optional)", { autoComplete: "address-line2" })}</div>
                      {field("city", "City", { autoComplete: "address-level2" })}
                      {field("province", "State", { autoComplete: "address-level1", maxLength: 2, placeholder: "TX" })}
                      {field("zip", "ZIP", { autoComplete: "postal-code", inputMode: "numeric" })}
                      {field("phone", "Phone (optional)", { autoComplete: "tel", inputMode: "tel" })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {units > 0 && (
          <div className="border-t border-border px-5 py-4 bg-[hsl(var(--dark))] space-y-3">
            <div className="space-y-1 text-sm tabular-nums">
              {serverQuote && serverQuote.discountPct > 0 && (
                <div className="flex justify-between text-accent text-xs">
                  <span>Volume discount</span>
                  <span>{serverQuote.discountPct}% off eligible items</span>
                </div>
              )}
              {step === "pay" && credit > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>AX credit</span>
                  <span>−{usd(credit)}</span>
                </div>
              )}
              {step === "pay" && canChoose && terms === "pay_now" && nowPrice && nowPrice.discount > 0 && (
                <div className="flex justify-between text-xs text-accent">
                  <span>Pay-now 5% off</span>
                  <span>−{usd(nowPrice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{step === "pay" ? "Total" : "Subtotal"}</span>
                <span className="text-2xl font-bold text-accent">
                  {quote.isLoading && !serverQuote ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : step === "pay" && canChoose && terms === "pay_now" && nowPrice ? (
                    usd(nowPrice.total)
                  ) : step === "pay" ? (
                    usd(due)
                  ) : (
                    usd(subtotal)
                  )}
                </span>
              </div>
              {quoteError && <p className="text-xs text-destructive" role="alert">{quoteError}</p>}
            </div>
            {step === "cart" ? (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={clear} className="text-muted-foreground">Clear</Button>
                <Button
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
                  disabled={!serverQuote || !!quoteError}
                  onClick={() => (isImpersonating ? openGuard() : setStep("pay"))}
                >
                  Checkout
                </Button>
              </div>
            ) : (
              <Button
                className="w-full min-h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
                disabled={busy || !serverQuote || !!quoteError}
                onClick={place}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {!canChoose || (due ?? 0) <= 0.01
                  ? "Place order"
                  : terms === "pay_now"
                    ? `Pay ${usd(nowPrice?.total)}`
                    : "Place order · pay in 30 days"}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PayOption(props: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  amount: string;
  note: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      aria-disabled={props.disabled}
      onClick={props.onSelect}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-colors",
        props.selected ? "border-accent bg-accent/10" : "border-border hover:border-accent/50",
        props.disabled && "opacity-50 cursor-not-allowed hover:border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("grid h-7 w-7 place-items-center rounded-full", props.selected ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{props.icon}</span>
        <span className="font-semibold text-sm">{props.title}</span>
        {props.badge && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">{props.badge}</span>}
        <span className="ml-auto font-bold tabular-nums">{props.amount}</span>
      </div>
      <p className="mt-1 pl-9 text-xs text-muted-foreground">{props.note}</p>
    </button>
  );
}
