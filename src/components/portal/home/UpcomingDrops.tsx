// Mobile-first. Test at 375px before merging.
import { CalendarClock } from "lucide-react";

export function UpcomingDrops() {
  return (
    <div className="ax-card p-8 text-center">
      <CalendarClock
        className="h-9 w-9 text-muted-foreground/40 mx-auto mb-3"
        strokeWidth={1.5}
      />
      <p className="text-sm text-muted-foreground">
        No upcoming drops scheduled. Your team will tag drops here as they're planned.
      </p>
    </div>
  );
}