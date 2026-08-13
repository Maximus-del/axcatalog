// Mobile-first. Contextual promo card. Content is config-driven so AX can
// eventually select the active card server-side (game week, new drops, etc.).
import { ArrowRight } from "lucide-react";
import { DEFAULT_ACTION_CARD, type DynamicActionCard as CardModel } from "@/lib/portal-config";
import { usePortalActions } from "@/components/portal/usePortalActions";
import { haptic } from "@/lib/haptics";

export function DynamicActionCard({ card = DEFAULT_ACTION_CARD }: { card?: CardModel }) {
  const run = usePortalActions();
  return (
    <button
      onClick={() => {
        haptic.tap();
        run(card.action);
      }}
      className="pressable relative w-full overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/18 via-card to-card p-5 text-left"
    >
      <div className="pointer-events-none absolute -bottom-16 -right-8 h-44 w-44 rounded-full bg-accent/15 blur-2xl" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-accent">{card.eyebrow}</div>
        <div className="mt-2 text-lg font-bold text-foreground leading-tight">{card.title}</div>
        <p className="mt-1.5 text-[13px] text-muted-foreground max-w-[85%]">{card.body}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent uppercase tracking-wider">
          {card.ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}
