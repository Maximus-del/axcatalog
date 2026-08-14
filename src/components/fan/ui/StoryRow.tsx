// Instagram-style story row of followed athletes. A green ring marks athletes
// with something new. Tapping opens the athlete profile.
import { Link } from "react-router-dom";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthletePhoto } from "./AthletePhoto";
import { cn } from "@/lib/utils";

export function StoryRow({ athletes, newIds }: { athletes: PublicAthlete[]; newIds: Set<string> }) {
  if (athletes.length === 0) return null;
  return (
    <div className="flex gap-4 overflow-x-auto -mx-4 px-4 pb-1 scroll-touch">
      {athletes.map((a) => {
        const isNew = newIds.has(a.id);
        return (
          <Link key={a.id} to={`/a/${a.slug}`} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <span className={cn("rounded-full p-[2px]", isNew ? "bg-accent" : "bg-border")}>
              <AthletePhoto athlete={a} className="h-14 w-14 rounded-full border-2 border-background" textClass="text-sm" />
            </span>
            <span className="text-[11px] text-muted-foreground text-center leading-tight truncate w-full">
              {athleteName(a).split(" ")[0]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
