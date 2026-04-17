import { useMemo, useState } from "react";
import { Minus, Plus, Loader2, Shirt } from "lucide-react";
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
  if (p.sizes.length === 1) return true;
  return false;
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

  const totalUnits = useMemo(
    () =>
      Object.values(draft).reduce(
        (sum, sizes) => sum + Object.values(sizes).reduce((a, b) => a + b, 0),
        0,
      ),
    [draft],
  );

  // Distinct columns we'll show across the table:
  // standard sizes that any non-one-size product offers, plus a "One Size" column if any one-size product exists.
  const { sizeCols, hasOneSize } = useMemo(() => {
    const cols = new Set<string>();
    let hasOne = false;
    for (const p of products) {
      if (isOneSize(p)) {
        hasOne = true;
        continue;
      }
      for (const s of p.sizes) cols.add(s);
    }
    // Order standard sizes first, then any extras alphabetically
    const ordered = STANDARD_SIZES.filter((s) => cols.has(s));
    const extras = [...cols].filter((s) => !STANDARD_SIZES.includes(s as typeof STANDARD_SIZES[number])).sort();
    return { sizeCols: [...ordered, ...extras], hasOneSize: hasOne };
  }, [products]);

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

  const renderQtyCell = (productId: string, size: string) => {
    const qty = draft[productId]?.[size] ?? 0;
    return (
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setQty(productId, size, Math.max(0, qty - 1))}
          className="h-6 w-6 rounded border border-border hover:border-accent flex items-center justify-center"
          aria-label={`Decrease ${size}`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          type="number"
          min={0}
          value={qty}
          onChange={(e) =>
            setQty(productId, size, Math.max(0, parseInt(e.target.value || "0", 10) || 0))
          }
          className={cn(
            "h-6 w-12 text-center text-xs rounded bg-background border border-border",
            qty > 0 && "border-accent text-accent font-semibold",
          )}
        />
        <button
          type="button"
          onClick={() => setQty(productId, size, qty + 1)}
          className="h-6 w-6 rounded border border-border hover:border-accent flex items-center justify-center"
          aria-label={`Increase ${size}`}
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
          {products.length === 0 ? (
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
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 ax-label">Product</th>
                  {sizeCols.map((s) => (
                    <th key={s} className="text-center px-2 py-3 ax-label">
                      {s}
                    </th>
                  ))}
                  {hasOneSize && (
                    <th className="text-center px-2 py-3 ax-label whitespace-nowrap">
                      One Size
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const oneSize = isOneSize(p);
                  return (
                    <tr key={p.id} className="border-b border-border/60 hover:bg-accent/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div className="h-10 w-10 rounded bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden shrink-0">
                            {p.primary_image_url ? (
                              <img
                                src={p.primary_image_url}
                                alt=""
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Shirt
                                className="h-5 w-5 text-muted-foreground/40"
                                strokeWidth={1.5}
                              />
                            )}
                          </div>
                          <span className="text-sm truncate max-w-[180px]" title={p.title}>
                            {p.title}
                          </span>
                        </div>
                      </td>
                      {sizeCols.map((s) => (
                        <td key={s} className="px-2 py-2">
                          {!oneSize && p.sizes.includes(s) ? (
                            renderQtyCell(p.id, s)
                          ) : (
                            <div className="text-center text-muted-foreground/30 text-xs">—</div>
                          )}
                        </td>
                      ))}
                      {hasOneSize && (
                        <td className="px-2 py-2">
                          {oneSize ? (
                            renderQtyCell(p.id, p.sizes[0] ?? "ONE")
                          ) : (
                            <div className="text-center text-muted-foreground/30 text-xs">—</div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 bg-[hsl(var(--dark))]">
          <div className="text-sm">
            <span className="ax-label">Total Units</span>
            <div className="text-2xl font-bold text-accent leading-none mt-1">{totalUnits}</div>
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
              disabled={submitting || totalUnits === 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
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
