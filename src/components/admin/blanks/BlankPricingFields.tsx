import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface BlankPricingValues {
  cost: number | null;
  price_athlete: number | null;
  price_corporate: number | null;
  price_standard: number | null;
}

type FieldKey = keyof BlankPricingValues;

interface Props {
  value: BlankPricingValues;
  onChange: (patch: Partial<BlankPricingValues>) => void;
  /** Called on blur — for inline-save mode. Omit for create dialogs. */
  onCommit?: (patch: Partial<BlankPricingValues>) => void;
}

const TIER_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "price_athlete", label: "Athlete" },
  { key: "price_corporate", label: "Corporate" },
  { key: "price_standard", label: "Standard" },
];

function parseNum(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function marginColor(pct: number): string {
  if (pct >= 40) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 20) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function BlankPricingFields({ value, onChange, onCommit }: Props) {
  const handleChange = (key: FieldKey, raw: string) => {
    onChange({ [key]: parseNum(raw) } as Partial<BlankPricingValues>);
  };
  const handleBlur = (key: FieldKey) => {
    if (onCommit) onCommit({ [key]: value[key] } as Partial<BlankPricingValues>);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="ax-label">My Cost</div>
          <div className="space-y-2">
            <Label>Cost per unit ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.cost ?? ""}
              onChange={(e) => handleChange("cost", e.target.value)}
              onBlur={() => handleBlur("cost")}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="ax-label">Selling Price (per unit at MOQ)</div>
          {TIER_FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label>{f.label} tier price ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={value[f.key] ?? ""}
                onChange={(e) => handleChange(f.key, e.target.value)}
                onBlur={() => handleBlur(f.key)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TIER_FIELDS.map((f) => {
          const price = value[f.key];
          const cost = value.cost;
          const hasPrice = price != null && price > 0;
          const profit = hasPrice && cost != null ? price! - cost : null;
          const margin = hasPrice && cost != null ? ((price! - cost) / price!) * 100 : null;
          return (
            <div key={f.key} className="rounded-md border border-border p-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {f.label}
              </div>
              {!hasPrice ? (
                <div className="text-xs text-muted-foreground py-2">
                  Set a price to see profit
                </div>
              ) : (
                <>
                  <div className="text-sm">
                    Price: <span className="font-semibold">${price!.toFixed(2)}</span>
                  </div>
                  <div className="text-sm">
                    Profit:{" "}
                    <span className="font-semibold">
                      {profit != null ? `$${profit.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <div className={cn("text-sm font-semibold", margin != null && marginColor(margin))}>
                    Margin: {margin != null ? `${margin.toFixed(1)}%` : "—"}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Volume discounts adjust the final selling price — these numbers are the MOQ baseline (10 units).
      </p>
    </div>
  );
}