// Mobile-first. Test at 375px before merging.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Sparkles, Target, Users } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface Rec {
  icon: typeof TrendingUp;
  title: string;
  body: string;
  cta: string;
  to: string;
  tone: "accent" | "purple" | "blue" | "amber";
}

// These used to quote statistics nobody had measured — "fans buy 2.4x more in
// the 48 hrs after a new drop", "your last drop was 12 days ago", "23 superfans
// haven't bought in 60+ days", "most of your audience is in Atlanta". All four
// were string literals, identical for every athlete, and two of the four cards
// carried an enabled button with no click handler at all.
//
// They are prompts, not analytics, so they now read as prompts and every one of
// them goes somewhere. When there is real per-athlete data to lead with, these
// bodies are where it belongs.
const RECS: Rec[] = [
  {
    icon: TrendingUp,
    title: "Share what's selling",
    body: "Ready-to-post images and captions for the products already in your lineup.",
    cta: "Open content",
    to: "/portal/content",
    tone: "accent",
  },
  {
    icon: Sparkles,
    title: "Start something new",
    body: "Send the AX team an idea — a vibe, a reference, a sketch — and they'll build it out.",
    cta: "Open studio",
    to: "/portal/studio",
    tone: "purple",
  },
  {
    icon: Target,
    title: "Order for an event",
    body: "Camp, game day or team order — pick pieces and sizes and we'll quote it.",
    cta: "Build an order",
    to: "/portal/build/camp",
    tone: "blue",
  },
  {
    icon: Users,
    title: "See how it's performing",
    body: "Attributed revenue by month and the products doing the work.",
    cta: "Open analytics",
    to: "/portal/analytics",
    tone: "amber",
  },
];

const TONE_BG: Record<Rec["tone"], string> = {
  accent: "linear-gradient(135deg, #0d3320 0%, #1a5c3a 100%)",
  purple: "linear-gradient(135deg, #2d1a3a 0%, #4a2a5a 100%)",
  blue: "linear-gradient(135deg, #1a1a3a 0%, #2a2a5a 100%)",
  amber: "linear-gradient(135deg, #3a2a0d 0%, #5a4a1a 100%)",
};
const TONE_ICON: Record<Rec["tone"], string> = {
  accent: "#2ecc71",
  purple: "#c77dff",
  blue: "#7c8aff",
  amber: "#f0b429",
};

export function RecommendationsCarousel() {
  const navigate = useNavigate();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Track active card based on scroll position
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let lastIdx = 0;
    const onScroll = () => {
      const cardW = rail.clientWidth * 0.85 + 12; // card + gap
      const idx = Math.round(rail.scrollLeft / cardW);
      const clamped = Math.max(0, Math.min(RECS.length - 1, idx));
      if (clamped !== lastIdx) {
        lastIdx = clamped;
        setActive(clamped);
        haptic.tap();
      }
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => rail.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const cardW = rail.clientWidth * 0.85 + 12;
    rail.scrollTo({ left: i * cardW, behavior: "smooth" });
  };

  return (
    <div className="space-y-3">
      <div
        ref={railRef}
        className="snap-rail flex gap-3 overflow-x-auto -mx-4 px-4 pb-1"
        aria-label="Recommendations"
      >
        {RECS.map((r, i) => {
          const Icon = r.icon;
          return (
            <article
              key={i}
              className="snap-card ax-card flex-shrink-0 w-[85%] flex flex-col gap-3 stagger-fade"
              style={{ ["--i" as string]: i }}
            >
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center"
                style={{ background: TONE_BG[r.tone] }}
              >
                <Icon className="h-5 w-5" style={{ color: TONE_ICON[r.tone] }} strokeWidth={2} />
              </div>
              <div>
                <h3 className="font-semibold text-base leading-tight">{r.title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{r.body}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate(r.to)}
                className="pressable mt-auto self-start text-xs font-bold uppercase tracking-[0.16em] text-accent"
              >
                {r.cta} →
              </button>
            </article>
          );
        })}
      </div>

      <div className="flex justify-center gap-1.5" role="tablist" aria-label="Carousel pagination">
        {RECS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to recommendation ${i + 1}`}
            aria-selected={i === active}
            onClick={() => goTo(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === active ? "w-6 bg-accent" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}