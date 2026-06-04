import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Break {
  min_units: number;
  discount_percent: number;
}

interface Props {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  organizationId: string | null;
  /** Tick positions in unit counts. */
  ticks?: number[];
}

const DEFAULT_TICKS = [50, 100, 250, 500];

function discountFor(breaks: Break[], units: number): number {
  let pct = 0;
  for (const b of breaks) {
    if (b.min_units <= units && b.discount_percent > pct) pct = b.discount_percent;
  }
  return pct;
}

export function MilestoneSlider({
  value,
  onValueChange,
  min = 0,
  max = 500,
  step = 1,
  organizationId,
  ticks = DEFAULT_TICKS,
}: Props) {
  const [breaks, setBreaks] = useState<Break[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Match compute_wholesale_price: breaks scoped to org's pricing tier OR global.
      let tierId: string | null = null;
      if (organizationId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("pricing_tier_id")
          .eq("id", organizationId)
          .maybeSingle();
        tierId = (org?.pricing_tier_id as string | null) ?? null;
      }
      let q = supabase
        .from("volume_discount_breaks")
        .select("min_units, discount_percent");
      q = tierId
        ? q.or(`pricing_tier_id.eq.${tierId},pricing_tier_id.is.null`)
        : q.is("pricing_tier_id", null);
      const { data } = await q;
      if (cancelled) return;
      setBreaks(
        (data ?? []).map((b) => ({
          min_units: b.min_units,
          discount_percent: Number(b.discount_percent),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const range = Math.max(1, max - min);
  const visibleTicks = ticks.filter((t) => t >= min && t <= max);
  const maxTick = visibleTicks.length ? Math.max(...visibleTicks) : null;
  const thumbGlow = maxTick !== null && value >= maxTick;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "relative",
          thumbGlow &&
            "[&_[role=slider]]:ring-2 [&_[role=slider]]:ring-accent [&_[role=slider]]:ring-offset-2 [&_[role=slider]]:ring-offset-background [&_[role=slider]]:shadow-[0_0_12px_hsl(var(--accent)/0.6)]",
        )}
      >
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={(v) => onValueChange(v[0] ?? 0)}
        />
        {/* Tick overlay — vertical lines on track. Track is 8px tall, centered vertically. */}
        <div className="absolute inset-0">
          {visibleTicks.map((t) => {
            const left = ((t - min) / range) * 100;
            const active = value >= t;
            return (
              <button
                key={`line-${t}`}
                type="button"
                onClick={() => onValueChange(t)}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-2 -ml-1 h-5 cursor-pointer",
                  active ? "text-accent" : "text-muted-foreground/40",
                )}
                style={{ left: `${left}%` }}
                aria-label={`Set quantity to ${t}`}
              >
                <span
                  className={cn(
                    "block mx-auto w-px h-3",
                    active ? "bg-accent" : "bg-muted-foreground/40",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
      {/* Labels below — clickable to snap slider */}
      <div className="relative h-7">
        {visibleTicks.map((t) => {
          const left = ((t - min) / range) * 100;
          const active = value >= t;
          const pct = discountFor(breaks, t);
          return (
            <button
              key={`lbl-${t}`}
              type="button"
              onClick={() => onValueChange(t)}
              className={cn(
                "absolute top-0 -translate-x-1/2 text-[9px] leading-tight tracking-tight text-center whitespace-nowrap tabular-nums cursor-pointer transition-colors hover:opacity-100",
                active ? "text-accent font-semibold" : "text-muted-foreground/70 opacity-70 hover:opacity-100",
              )}
              style={{ left: `${left}%` }}
              aria-label={`Set quantity to ${t}`}
            >
              <div>{t}</div>
              <div>{pct > 0 ? `${pct}% off` : "—"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}