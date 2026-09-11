// Mobile-first. Test at 375px before merging.
//
// The honest stand-in for a module whose data source is not connected yet.
//
// The portal is shown to real clients, and several of its modules used to fill
// the wait with invented numbers — a map asserting which cities an athlete's
// fans live in, a leaderboard of five fabricated superfans, recommendations
// quoting a drop cadence nobody measured. A client who acts on one of those and
// finds out costs more trust than an empty slot ever could.
//
// So: keep the slot, keep the visual weight, say plainly what will appear here
// and what it is waiting on. Never assert a fact that is not in the database.
import type { ReactNode } from "react";

export function PendingPanel({
  icon,
  title,
  body,
  waitingOn,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  /** What this module will show. Written as a promise, not as data. */
  body: string;
  /** The concrete thing that has to happen first. */
  waitingOn?: string;
  className?: string;
}) {
  return (
    <div className={`ax-card p-6 text-center ${className}`}>
      {icon && (
        <div className="mx-auto mb-3 h-11 w-11 rounded-full bg-accent/10 flex items-center justify-center text-accent">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">{body}</p>
      {waitingOn && (
        <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {waitingOn}
        </p>
      )}
    </div>
  );
}
