// Mobile-first. Prominent AX Credit wallet card for Home.
import { useState } from "react";
import { Wallet, Plus, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAthleteCredit } from "@/hooks/useAthleteCredit";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { fmtUsd } from "@/lib/portal-config";

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

const TX_LABEL: Record<string, string> = {
  accrual: "Credit earned",
  used: "Applied to order",
  adjustment: "Adjustment",
  refund: "Refund",
};

export function AxCreditCard() {
  const { athlete, openOrderSheet } = usePortalData();
  const { wallet, transactions, loading } = useAthleteCredit(athlete.id);
  const [activityOpen, setActivityOpen] = useState(false);

  if (loading) return <Skeleton className="h-44 rounded-2xl" />;

  const balance = wallet?.balance ?? 0;

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-card to-card p-5 sm:p-6">
        {/* glow */}
        <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-accent/20 blur-2xl" />

        <div className="relative flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-accent" />
          </div>
          <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
            AX Credit
          </span>
        </div>

        <div className="relative text-[44px] leading-none font-extrabold text-foreground tabular-nums mt-2">
          {fmt(balance)}
        </div>
        <p className="relative text-[12px] text-muted-foreground mt-2">
          Earn $1 for every $10 you spend.
        </p>

        <div className="relative mt-5 flex items-center gap-2">
          {balance > 0 && (
            <button
              onClick={openOrderSheet}
              className="pressable flex-1 h-11 rounded-xl bg-accent text-accent-foreground font-bold text-[13px] uppercase tracking-wider flex items-center justify-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Use Credit
            </button>
          )}
          <button
            onClick={() => setActivityOpen(true)}
            className={`pressable h-11 rounded-xl border border-border bg-background/40 text-foreground font-semibold text-[13px] flex items-center justify-center gap-1.5 px-4 ${balance > 0 ? "" : "flex-1"}`}
          >
            View Activity
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[80vh] overflow-y-auto">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left">
            <SheetTitle>Credit activity</SheetTitle>
          </SheetHeader>

          <div className="mt-3 mb-4 rounded-xl border border-border bg-card p-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="ax-label text-[9px]">Balance</div>
              <div className="text-sm font-bold text-accent tabular-nums">{fmt(balance)}</div>
            </div>
            <div>
              <div className="ax-label text-[9px]">Earned</div>
              <div className="text-sm font-semibold tabular-nums">{fmtUsd(wallet?.total_earned ?? 0)}</div>
            </div>
            <div>
              <div className="ax-label text-[9px]">Used</div>
              <div className="text-sm font-semibold tabular-nums">{fmtUsd(wallet?.total_used ?? 0)}</div>
            </div>
          </div>

          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No credit activity yet. Earn $1 for every $10 you spend.
            </p>
          ) : (
            <ul className="divide-y divide-border pb-4">
              {transactions.map((t) => {
                const positive = t.amount >= 0;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{TX_LABEL[t.type] ?? t.type}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </div>
                    </div>
                    <div
                      className={`text-sm font-bold tabular-nums shrink-0 ${positive ? "text-accent" : "text-foreground"}`}
                    >
                      {positive ? "+" : "−"}
                      {fmt(Math.abs(t.amount))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
