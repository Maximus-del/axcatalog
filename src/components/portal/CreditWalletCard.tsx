import { Wallet, Plus, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAthleteCredit } from "@/hooks/useAthleteCredit";

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function daysUntilNextCredit(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ms = next.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function CreditWalletCard({
  athleteId,
  onUseCredit,
}: {
  athleteId: string;
  onUseCredit?: () => void;
}) {
  const { wallet, loading } = useAthleteCredit(athleteId);

  if (loading) return <Skeleton className="h-36 rounded-xl" />;
  if (!wallet) return null;

  const pct = wallet.max_balance > 0
    ? Math.min(100, (wallet.balance / wallet.max_balance) * 100)
    : 0;
  const days = daysUntilNextCredit();
  const atMax = wallet.balance >= wallet.max_balance;

  return (
    <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-accent" />
          </div>
          <div>
            <div className="ax-label">Athlete Credit Balance</div>
            <div className="text-2xl font-bold text-accent leading-tight tabular-nums">
              {fmt(wallet.balance)}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            {atMax ? (
              <span>At max balance</span>
            ) : (
              <span>
                Next credit in <span className="text-foreground tabular-nums">{days}</span> {days === 1 ? "day" : "days"}
              </span>
            )}
          </div>
          {onUseCredit && wallet.balance > 0 && (
            <Button
              size="sm"
              onClick={onUseCredit}
              className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold text-[11px]"
            >
              <Plus className="h-3 w-3 mr-1" />
              Use on New Order
            </Button>
          )}
        </div>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="ax-label text-[9px]">Monthly</div>
          <div className="text-sm font-semibold">{fmt(wallet.monthly_credit)}</div>
        </div>
        <div>
          <div className="ax-label text-[9px]">Max</div>
          <div className="text-sm font-semibold">{fmt(wallet.max_balance)}</div>
        </div>
        <div>
          <div className="ax-label text-[9px]">Used</div>
          <div className="text-sm font-semibold">{fmt(wallet.total_used)}</div>
        </div>
      </div>
    </div>
  );
}