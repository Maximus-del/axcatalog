// Mobile-first. Sticky order summary + AX Credit toggle + submit.
// Credit is applied BEFORE the amount due, per the checkout rule (section 25).
import { Switch } from "@/components/ui/switch";
import { computeCredit } from "@/lib/portal-commerce";
import { fmtUsd } from "@/lib/portal-config";

const fmtMoneyLabel = (n: number) => fmtUsd(n, { cents: true });

export function CheckoutBar({
  subtotal,
  creditAvailable,
  applyCredit,
  onToggleCredit,
  submitting,
  ctaLabel = "Continue to Checkout",
  onSubmit,
  disabled,
  hint,
}: {
  subtotal: number;
  creditAvailable: number;
  applyCredit: boolean;
  onToggleCredit: (v: boolean) => void;
  submitting: boolean;
  ctaLabel?: string;
  onSubmit: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  const math = computeCredit(subtotal, creditAvailable, applyCredit);
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md pb-safe">
      <div className="max-w-[1200px] mx-auto px-4 py-3 space-y-2">
        {creditAvailable > 0 && (
          <div className="flex items-center justify-between">
            <label htmlFor="apply-credit" className="text-[13px] text-muted-foreground">
              Apply {fmtMoneyLabel(creditAvailable)} AX Credit
            </label>
            <Switch id="apply-credit" checked={applyCredit} onCheckedChange={onToggleCredit} />
          </div>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="text-[12px] leading-tight text-muted-foreground">
            <div className="flex justify-between gap-6">
              <span>Subtotal</span>
              <span className="tabular-nums text-foreground">{fmtMoneyLabel(math.subtotal)}</span>
            </div>
            {math.creditApplied > 0 && (
              <div className="flex justify-between gap-6 text-accent">
                <span>AX Credit</span>
                <span className="tabular-nums">−{fmtMoneyLabel(math.creditApplied)}</span>
              </div>
            )}
            <div className="flex justify-between gap-6 font-bold text-foreground mt-0.5">
              <span>Due</span>
              <span className="tabular-nums">{fmtMoneyLabel(math.amountDue)}</span>
            </div>
          </div>
          <button
            onClick={onSubmit}
            disabled={submitting || disabled}
            className="pressable h-12 px-6 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-[13px] disabled:opacity-50 shrink-0"
          >
            {submitting ? "Submitting…" : ctaLabel}
          </button>
        </div>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
