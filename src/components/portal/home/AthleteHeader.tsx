// Mobile-first. Global portal header: identity + tier + lifetime revenue.
import { Menu, Bell, TrendingUp } from "lucide-react";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { useCountUp } from "@/hooks/useCountUp";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { getTierProgress } from "@/lib/portal-config";

interface Props {
  onMenuClick: () => void;
  onBellClick?: () => void;
  /** Optional MoM trend %, when available. Omitted in Phase 1 (no backend). */
  trendPct?: number | null;
}

/**
 * Premium athlete header shown across the portal. Left: menu + avatar +
 * name + position · THE VAULT + tier chip. Right: lifetime revenue + bell.
 * Reads athlete + sales from portal context so it stays athlete-agnostic.
 */
export function AthleteHeader({ onMenuClick, onBellClick, trendPct = null }: Props) {
  const { athlete, sales } = usePortalData();
  const fullName = athlete.full_name || `${athlete.first_name} ${athlete.last_name}`.trim();
  const color = avatarColorFor(fullName);
  const initials = initialsFor(fullName);

  const tier = getTierProgress(sales.lifetimeRevenue);
  const animated = useCountUp(sales.lifetimeRevenue ?? 0, 900);
  const revenue =
    sales.loading && sales.lifetimeRevenue === 0
      ? "$—"
      : `$${animated.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const position = athlete.position ?? "Athlete";

  return (
    <header id="sec-home" className="relative bg-[hsl(var(--dark))] border-b border-border">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-safe">
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="tap-target -ml-2 h-10 w-10 flex items-center justify-center rounded-lg text-foreground hover:bg-accent/10 hover:text-accent shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold text-white shadow-md shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <h1
              className="font-bold text-foreground truncate leading-tight"
              style={{ fontSize: "19px", letterSpacing: "0.01em" }}
              title={fullName}
            >
              {fullName}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground truncate">
                {position} · The Vault
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground leading-none">
                Lifetime
              </p>
              <p className="font-bold text-accent tabular-nums leading-none mt-1" style={{ fontSize: "18px" }}>
                {revenue}
              </p>
              {trendPct != null && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-accent mt-0.5">
                  <TrendingUp className="h-3 w-3" />
                  {trendPct >= 0 ? "+" : ""}
                  {trendPct}%
                </span>
              )}
            </div>
            <button
              onClick={onBellClick}
              aria-label="Notifications"
              className="tap-target h-10 w-10 flex items-center justify-center rounded-lg text-foreground hover:bg-accent/10 hover:text-accent"
            >
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tier chip row */}
        <div className="pb-3 -mt-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 border border-accent/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
            {tier.label}
          </span>
        </div>
      </div>
    </header>
  );
}
