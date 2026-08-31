import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useEntityWorkspace, useDiscountBreaks } from "@/lib/v2/data";
import { useCart, useCartActions, useSubmitCart } from "@/lib/v2/cart-data";
import { quoteCart } from "@/lib/v2/bulk-pricing";
import { fmtMoney } from "@/lib/v2/pricing";
import { AssetImage, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";
import type { CartGroup } from "@/lib/v2/cart";

// THE CART.
//
// What it actually is: the one `draft` bulk_order_request this operator has
// open for this entity. Not a separate cart object, not a local list — the
// order itself, sitting at the status before the first one, which is why
// submitting it is a status change rather than a conversion.
//
// EVERY PRICE ON THIS PAGE IS DERIVED. The volume break depends on the cart's
// total units, so adding one hoodie re-prices every line. Storing those numbers
// would mean storing something that goes stale on the next keystroke. They are
// written down exactly once, at submit.

export default function V2Cart() {
  const { id } = useParams();
  const { user } = useAuth();
  const workspace = useEntityWorkspace(id);
  const cart = useCart(id, user?.id);
  const breaks = useDiscountBreaks();
  const actions = useCartActions(id ?? "", user?.id);
  const submit = useSubmitCart(id ?? "", user?.id);

  const entity = workspace.data?.entity ?? null;
  const groups = cart.data?.groups ?? [];
  const lines = useMemo(() => cart.data?.lines ?? [], [cart.data]);

  const [notes, setNotes] = useState<string | null>(null);
  const notesValue = notes ?? cart.data?.notes ?? "";

  const quote = useMemo(
    () => quoteCart(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitRetail })), breaks.data ?? []),
    [lines, breaks.data],
  );

  /** Line id -> its own quoted subtotal, so a card can show its share. */
  const lineSubtotal = useMemo(() => {
    const m = new Map<string, number>();
    lines.forEach((l, i) => m.set(l.id, quote.lines[i]?.lineSubtotal ?? 0));
    return m;
  }, [lines, quote.lines]);

  if (cart.isError) return <ErrorState error={cart.error} what="this cart" onRetry={() => void cart.refetch()} />;

  const unpriced = lines.filter((l) => l.unitRetail <= 0).length;

  return (
    <div>
      <PageHeader
        title={entity ? `${entity.name}'s cart` : "Cart"}
        subtitle={
          <span>
            A draft order. Nothing has been submitted, nothing has been charged, and the athlete cannot see it.{" "}
            {id && (
              <Link to={`/admin-v2/people/${id}`} className="text-[hsl(var(--ax-accent))] hover:underline">
                Back to the workspace
              </Link>
            )}
          </span>
        }
        actions={
          id && (
            <Link
              to={`/admin-v2/people/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workspace
            </Link>
          )
        }
      />

      {cart.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState>
          Nothing in the cart yet. Add quantities on the last screen of Create Mockup, or from a mockup&rsquo;s own
          panel, and they land here.
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {groups.map((g) => (
              <CartCard
                key={g.key}
                group={g}
                subtotalOf={(lineId) => lineSubtotal.get(lineId) ?? 0}
                discountPct={quote.discountPct}
                busy={actions.isPending || submit.isPending}
                onQuantity={(lineId, quantity) => {
                  actions.mutate(
                    { type: "set-quantity", lineId, quantity },
                    { onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change that quantity") },
                  );
                }}
                onRemove={() => {
                  actions.mutate(
                    { type: "remove-lines", lineIds: g.lines.map((l) => l.id) },
                    { onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove that") },
                  );
                }}
              />
            ))}
          </div>

          <div className="space-y-3">
            <Card>
              <h3 className="text-[13px] font-semibold">Order total</h3>
              <div className="mt-2 space-y-1 text-[12px]">
                <Row label="Units" value={String(quote.units)} />
                <Row label="Retail" value={fmtMoney(quote.retailEquivalent)} />
                {quote.discountPct > 0 ? (
                  <Row
                    label={`Volume discount (${quote.appliedBreak?.minQty}+)`}
                    value={`−${quote.discountPct}%`}
                    tone="var(--ax-accent)"
                  />
                ) : (
                  <Row label="Volume discount" value="none yet" tone="var(--ax-faint)" />
                )}
                <div className="my-1 border-t border-white/10" />
                <Row label="Subtotal" value={fmtMoney(quote.subtotal)} strong />
                {quote.savings > 0 && <Row label="Saving" value={fmtMoney(quote.savings)} tone="var(--ax-accent)" />}
              </div>

              {quote.nextBreak && (
                <p className="mt-2 text-[11px] text-[hsl(var(--ax-amber))]">
                  {quote.nextBreak.unitsAway} more unit{quote.nextBreak.unitsAway === 1 ? "" : "s"} reaches{" "}
                  {quote.nextBreak.discountPct}% off.
                </p>
              )}

              {breaks.isError && (
                <p className="mt-2 text-[11px] text-[hsl(var(--ax-red))]">
                  The volume discount ladder could not be read, so this quote shows no discount. Do not send it out.
                </p>
              )}

              {unpriced > 0 && (
                <p className="mt-2 text-[11px] text-[hsl(var(--ax-amber))]">
                  {unpriced} line{unpriced === 1 ? " has" : "s have"} no price. They count towards the volume break but
                  add nothing to the total — price the blank before quoting this.
                </p>
              )}

              <textarea
                value={notesValue}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes == null || notes === cart.data?.notes) return;
                  actions.mutate({ type: "set-notes", notes });
                }}
                rows={3}
                placeholder="Anything the fulfilment team should know"
                className="mt-3 w-full resize-none rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-2 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
              />

              <button
                type="button"
                disabled={quote.units === 0 || submit.isPending || actions.isPending}
                onClick={async () => {
                  try {
                    const res = await submit.mutateAsync({ breaks: breaks.data ?? [], notes: notesValue || null });
                    toast.success(`Order ${res.orderNumber} submitted`, {
                      description: `${res.units} units · ${fmtMoney(res.subtotal)}. It is now in Orders as a submitted request.`,
                    });
                    setNotes(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not submit that order");
                  }
                }}
                className="mt-3 w-full rounded-full bg-[hsl(var(--ax-accent))] py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-40"
              >
                {submit.isPending ? "Submitting…" : `Submit order${quote.units ? ` — ${quote.units} units` : ""}`}
              </button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                Submitting moves this out of the cart and into Orders for fulfilment. Prices are frozen at that
                moment. Nothing is sent to Shopify and no payment is taken.
              </p>
            </Card>

            <button
              type="button"
              disabled={actions.isPending || submit.isPending}
              onClick={() => {
                if (!window.confirm("Empty this cart? The mockups themselves are not affected.")) return;
                actions.mutate(
                  { type: "clear" },
                  {
                    onSuccess: () => toast.success("Cart emptied"),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not empty the cart"),
                  },
                );
              }}
              className="w-full rounded-full border border-[hsl(var(--ax-border))] py-2 text-[12px] text-[hsl(var(--ax-faint))] hover:border-[hsl(var(--ax-red)/0.5)] hover:text-[hsl(var(--ax-red))] disabled:opacity-40"
            >
              Empty the cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CartCard({
  group,
  subtotalOf,
  discountPct,
  busy,
  onQuantity,
  onRemove,
}: {
  group: CartGroup;
  subtotalOf: (lineId: string) => number;
  discountPct: number;
  busy: boolean;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: () => void;
}) {
  const subtotal = group.lines.reduce((n, l) => n + subtotalOf(l.id), 0);

  return (
    <Card>
      <div className="flex gap-3">
        <AssetImage
          url={group.imageUrl}
          alt={group.title}
          className="h-20 w-20 shrink-0 rounded-xl"
          fallbackSeed={group.key}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[13px] font-semibold">{group.title}</h3>
              <p className="truncate text-[11px] text-[hsl(var(--ax-faint))]">
                {group.colorName ?? "No colour"}
                {group.unitRetail > 0 ? ` · ${fmtMoney(group.unitRetail)} each` : " · unpriced"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              title="Remove this colourway from the cart"
              className="rounded-lg p-1.5 text-[hsl(var(--ax-faint))] hover:bg-white/10 hover:text-[hsl(var(--ax-red))] disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/*
            PER-SIZE QUANTITIES, EDITABLE IN PLACE.
            Setting a size to 0 removes that line rather than storing a zero —
            bulk_order_items has a quantity > 0 check, and a row reading 0 is a
            row somebody has to stop and think about.
          */}
          <div className="mt-2 flex flex-wrap gap-2">
            {group.lines.map((l) => (
              <label key={l.id} className="block w-[62px]">
                <span className="mb-0.5 block text-[10px] text-[hsl(var(--ax-faint))]">{l.size}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={`${group.title} ${group.colorName ?? ""} size ${l.size}`}
                  defaultValue={l.quantity}
                  disabled={busy}
                  onBlur={(e) => {
                    const next = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                    if (next !== l.quantity) onQuantity(l.id, next);
                  }}
                  className="w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2 py-1 text-[12px] tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
                />
              </label>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-[11px] text-[hsl(var(--ax-secondary))]">
            <span className="tabular-nums">
              {group.units} unit{group.units === 1 ? "" : "s"}
            </span>
            <span className="tabular-nums">{fmtMoney(subtotal)}</span>
            {discountPct > 0 && group.unitRetail > 0 && (
              <span className="text-[hsl(var(--ax-accent))]">at the cart&rsquo;s {discountPct}% rate</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[hsl(var(--ax-faint))]">{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""}`}
        style={tone ? { color: `hsl(${tone})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
