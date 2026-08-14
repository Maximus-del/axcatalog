// Camp/event card. Registration status is computed from the demo offsets.
import { Link } from "react-router-dom";
import { MapPin, Calendar, Clock } from "lucide-react";
import type { Camp } from "@/lib/ecosystem/content-types";
import { inDaysLabel } from "@/lib/ecosystem/demo-content";
import { gradientFor } from "@/lib/ecosystem/visual";
import { SaveButton } from "./SaveButton";

export function CampCard({ camp, athleteName, block = false }: { camp: Camp; athleteName?: string; block?: boolean }) {
  const open = camp.regOpensOffsetDays <= 0;
  return (
    <Link
      to={`/a/${camp.athleteSlug}?tab=camps`}
      className={`block shrink-0 snap-start rounded-2xl overflow-hidden border border-border bg-card ${block ? "w-full" : "w-[280px]"}`}
    >
      <div className="h-28 flex items-center justify-center relative" style={{ background: gradientFor(camp.id) }}>
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Camp</span>
        <div className="absolute top-2 right-2">
          <SaveButton item={{ type: "camp", ref: camp.id, athleteId: camp.athleteId, title: camp.name }} />
        </div>
      </div>
      <div className="p-3.5">
        {athleteName && <div className="text-[11px] uppercase tracking-wider text-accent font-bold truncate">{athleteName}</div>}
        <div className="font-bold leading-snug mt-0.5">{camp.name}</div>
        <div className="mt-2 space-y-1 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {camp.city}</div>
          <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {inDaysLabel(camp.dateOffsetDays)}</div>
        </div>
        <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold">
          <Clock className="h-3.5 w-3.5 text-accent" />
          {open ? (
            <span className="text-accent">Registration open</span>
          ) : (
            <span className="text-muted-foreground">Opens in {camp.regOpensOffsetDays}d · Access {camp.accessEarlyHours}h early</span>
          )}
        </div>
      </div>
    </Link>
  );
}
