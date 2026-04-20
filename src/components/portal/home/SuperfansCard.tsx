// Mobile-first. Test at 375px before merging.
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

const STUB = [
  { rank: 1, label: "Anonymous Fan #4821", orders: 12, ltv: "$—" },
  { rank: 2, label: "Anonymous Fan #2104", orders: 9, ltv: "$—" },
  { rank: 3, label: "Anonymous Fan #9933", orders: 7, ltv: "$—" },
  { rank: 4, label: "Anonymous Fan #1572", orders: 6, ltv: "$—" },
  { rank: 5, label: "Anonymous Fan #6210", orders: 5, ltv: "$—" },
];

export function SuperfansCard() {
  return (
    <div className="ax-card p-0 overflow-hidden">
      <ul className="divide-y divide-border">
        {STUB.map((row) => (
          <li
            key={row.rank}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="ax-label w-6 text-center shrink-0">#{row.rank}</div>
            <div className="h-9 w-9 rounded-full bg-[hsl(var(--dark))] flex items-center justify-center shrink-0">
              {row.rank === 1 ? (
                <Crown className="h-4 w-4 text-accent" strokeWidth={2} />
              ) : (
                <span className="text-xs font-bold text-muted-foreground">
                  F{row.rank}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.orders} orders</p>
            </div>
            <div className="text-sm font-semibold tabular-nums text-muted-foreground shrink-0">
              {row.ltv}
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-border p-3">
        <Button
          disabled
          variant="outline"
          className="w-full tap-target text-xs font-bold uppercase tracking-[0.14em]"
        >
          Customer insights — coming soon
        </Button>
      </div>
    </div>
  );
}