// Mobile-first. "Your Packages" — Game Day / Camp / VIP.
import { Trophy, Users, Crown, ArrowRight, type LucideIcon } from "lucide-react";
import { PORTAL_PACKAGES, type PortalPackage } from "@/lib/portal-config";
import { usePortalActions } from "@/components/portal/usePortalActions";
import { haptic } from "@/lib/haptics";

const META: Record<PortalPackage["key"], { icon: LucideIcon; tag: string }> = {
  game_day: { icon: Trophy, tag: "GAME DAY" },
  camp: { icon: Users, tag: "CAMP" },
  vip: { icon: Crown, tag: "VIP" },
};

export function PackagesRow() {
  const run = usePortalActions();
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-foreground">Your Packages</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto scroll-touch -mx-4 px-4 pb-1 snap-x">
        {PORTAL_PACKAGES.map((p) => {
          const Icon = META[p.key].icon;
          return (
            <div
              key={p.key}
              className="snap-start shrink-0 w-[210px] rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
            >
              <div className="relative h-24 bg-gradient-to-br from-accent/25 via-accent/5 to-transparent flex items-center px-4">
                <span className="h-11 w-11 rounded-xl bg-background/40 border border-accent/25 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-accent" />
                </span>
                <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-[0.16em] text-accent/80">
                  {META[p.key].tag}
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="font-bold text-foreground">{p.name}</div>
                <p className="text-[12px] text-muted-foreground mt-1 flex-1">{p.description}</p>
                <button
                  onClick={() => {
                    haptic.tap();
                    run(p.action);
                  }}
                  className="pressable mt-3 h-10 rounded-xl bg-accent text-accent-foreground font-bold text-[12px] uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  {p.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
