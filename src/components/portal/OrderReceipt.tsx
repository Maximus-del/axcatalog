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

export interface PlacedOrder {
  orderNumber: string | null;
  units: number;
  subtotal: number | null;
  creditApplied: number;
  amountDue: number | null;
  replayed?: boolean;
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
                AX confirms the order and sizes, sends the invoice, and starts production once it's paid. Track it under Recent orders in Brand HQ.
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
