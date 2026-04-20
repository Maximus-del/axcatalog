// Mobile-first. Test at 375px before merging.
import { Menu } from "lucide-react";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/useCountUp";

interface Props {
  firstName: string;
  lastName: string;
  /** Lifetime revenue in dollars. Pass null while loading or unknown. */
  lifetimeRevenue: number | null;
  onMenuClick: () => void;
}

/**
 * Compact mobile header: avatar on the left, greeting in the middle,
 * lifetime revenue on the right. Single horizontal row, never wraps.
 * On md+ falls back to the original centered hero look.
 */
export function MobileHeader({ firstName, lastName, lifetimeRevenue, onMenuClick }: Props) {
  const fullName = `${firstName} ${lastName}`.trim();
  const color = avatarColorFor(fullName);
  const initials = initialsFor(fullName);
  const animated = useCountUp(lifetimeRevenue ?? 0, 800);
  const display =
    lifetimeRevenue == null
      ? "$—"
      : `$${animated.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <header
      id="sec-home"
      className="relative bg-[hsl(var(--dark))] border-b border-border"
    >
      {/* Mobile compact header */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 pt-safe">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="tap-target text-foreground hover:bg-accent/10 hover:text-accent shrink-0 -ml-2"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div
          className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-md shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground leading-none">
            Welcome back
          </p>
          <h1
            className="font-bold text-foreground truncate leading-tight mt-1"
            style={{ fontSize: "22px", letterSpacing: "0.02em" }}
            title={fullName}
          >
            {firstName}
          </h1>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground leading-none">
            Lifetime
          </p>
          <p
            className="font-bold text-accent tabular-nums leading-none mt-1"
            style={{ fontSize: "20px" }}
          >
            {display}
          </p>
        </div>
      </div>

      {/* Desktop hero — keep original look */}
      <div className="hidden md:block">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="absolute top-4 left-4 text-foreground hover:bg-accent/10 hover:text-accent"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="max-w-[1200px] mx-auto px-6 py-12 sm:py-16 flex flex-col items-center text-center">
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold text-white shadow-lg mb-6"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            {initials}
          </div>
          <h1
            className="font-bold uppercase leading-tight text-3xl sm:text-5xl"
            style={{ letterSpacing: "0.1em" }}
          >
            <span className="text-foreground">{firstName}</span>{" "}
            <span className="text-accent">{lastName}</span>
          </h1>
          <p className="mt-3 text-xs sm:text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Athlete Xclusive Portal
          </p>
          <p className="mt-6 text-3xl font-bold text-accent tabular-nums">{display}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
            Lifetime Revenue
          </p>
        </div>
      </div>
    </header>
  );
}