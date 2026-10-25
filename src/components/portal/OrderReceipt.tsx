// The confirmation a client sees after placing an order.
//
// Phase 2 orders are paid off-platform: AX emails an invoice and the client pays
// by Zelle or the invoice. So the receipt says exactly that — the order number,
// what is due, how to pay (the instructions AX set in the V2 pricing sheet), and
// what happens next — instead of a toast that disappears in three seconds.
//
// Any order flow calls announceOrder(); one <OrderReceiptHost/> in the portal
// layout shows it, so the bulk sheet, the product dialog and the builders all
// end the same way.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalPlaybook } from "@/hooks/usePortalApi";
import { portalLink } from "@/components/portal/mooney/navigation";
import { dueLabel } from "@/lib/portal/cart";
import { isSafePaymentUrl } from "@/lib/portal/api/checkout";

export interface PlacedOrder {
  orderNumber: string | null;
  units: number;
  subtotal: number | null;
  creditApplied: number;
  amountDue: number | null;
  replayed?: boolean;
  /** Set by the cart checkout when the owner picked how to pay. */
  payment?: {
    terms: "pay_now" | "net_30";
    payNowDiscount?: number;
    dueDate?: string | null;
    paymentUrl?: string | null;
    /** Online payment couldn't be set up yet — AX sends the link. */
    linkComing?: boolean;
  } | null;
}

const EVENT = "portal:order-placed";

export function announceOrder(order: PlacedOrder) {
  window.dispatchEvent(new CustomEvent<PlacedOrder>(EVENT, { detail: order }));
  // Brand HQ, Locker Room and order history refetch on this.
  window.dispatchEvent(new Event("portal:refresh"));
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? "font-bold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-accent" : ""}`}>{value}</span>
    </div>
  );
}

export function OrderReceiptHost() {
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const { user } = useAuth();
  const playbook = usePortalPlaybook();
  const location = useLocation();

  useEffect(() => {
    const on = (e: Event) => setOrder((e as CustomEvent<PlacedOrder>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const instructions = playbook.data?.terms?.paymentInstructions ?? null;
  const fullyCredited = order?.amountDue != null && order.amountDue <= 0.01;

  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v) setOrder(null); }}>
      <DialogContent className="max-w-md">
        {order && (
          <>
            <DialogHeader className="text-left">
              <CheckCircle2 className="h-9 w-9 text-accent mb-1" aria-hidden />
              <DialogTitle>{order.replayed ? "Already placed" : "Order placed"}</DialogTitle>
              <DialogDescription>
                {order.orderNumber ? `Order ${order.orderNumber}` : "Your order"} · {order.units.toLocaleString()} unit{order.units === 1 ? "" : "s"}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border p-3 space-y-1.5">
              <Row label="Order total" value={usd(order.subtotal)} />
              {order.creditApplied > 0 && <Row label="Paid with AX credit" value={`−${usd(order.creditApplied)}`} />}
              <Row label="Amount due" value={usd(order.amountDue)} strong />
            </div>
            <div className="space-y-1.5 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-accent">{fullyCredited ? "Nothing to pay" : "How to pay"}</h3>
              {fullyCredited ? (
                <p className="text-muted-foreground">Your AX credit covered this order.</p>
              ) : order.payment?.terms === "net_30" ? (
                <>
                  <p>
                    <strong>{dueLabel(order.payment.dueDate) ?? "Due in 30 days"}.</strong> Your gear goes ahead now — sell it, then pay.
                  </p>
                  <p className="text-muted-foreground">
                    {order.payment.linkComing
                      ? `AX will email the invoice${user?.email ? ` to ${user.email}` : ""}.`
                      : "Shopify emails the invoice and a reminder before it's due. Pay any time from the invoice page."}
                  </p>
                  {isSafePaymentUrl(order.payment.paymentUrl) && (
                    <Button variant="outline" asChild className="mt-1">
                      <a href={order.payment.paymentUrl} target="_blank" rel="noopener noreferrer">View invoice</a>
                    </Button>
                  )}
                </>
              ) : order.payment?.terms === "pay_now" ? (
                <>
                  <p>
                    You're getting 5% off{order.payment.payNowDiscount ? ` (${usd(order.payment.payNowDiscount)})` : ""} for paying now.
                  </p>
                  {isSafePaymentUrl(order.payment.paymentUrl) ? (
                    <Button asChild className="mt-1">
                      <a href={order.payment.paymentUrl}>Pay {usd(order.amountDue)}</a>
                    </Button>
                  ) : (
                    <p className="text-muted-foreground">
                      AX will email your secure payment link{user?.email ? ` to ${user.email}` : ""} shortly — the 5% stays on it.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {instructions && <p>{instructions}</p>}
                  <p className="text-muted-foreground">
                    AX will email your invoice{user?.email ? ` to ${user.email}` : ""}. Pay by Zelle or through the invoice, whichever is easiest.
                  </p>
                </>
              )}
              <h3 className="pt-2 text-xs font-bold uppercase tracking-wider text-accent">What happens next</h3>
              <p className="text-muted-foreground">
                {order.payment
                  ? "AX confirms the order and sizes and starts production. Track it under Recent orders in Brand HQ."
                  : "AX confirms the order and sizes, sends the invoice, and starts production once it's paid. Track it under Recent orders in Brand HQ."}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="outline" asChild>
                <Link to={portalLink("/portal/analytics", location.search)} onClick={() => setOrder(null)}>
                  See my orders
                </Link>
              </Button>
              <Button onClick={() => setOrder(null)}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
