// Large featured moment at the top of Home — the single most relevant event.
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, Timer } from "lucide-react";
import { FEED_TYPE_LABEL } from "@/lib/ecosystem/content-types";
import { dropCountdown, type EnrichedFeedItem } from "@/lib/ecosystem/feed-engine";
import { gradientFor } from "@/lib/ecosystem/visual";
import { productImageUrl, shopLink } from "@/lib/ecosystem/image";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";

export function FeaturedCard({ item, athlete }: { item: EnrichedFeedItem; athlete: PublicAthlete }) {
  const img = item.product ? productImageUrl(item.product) : null;
  const href = item.product ? shopLink(item.product.shopify_handle) : null;
  const countdown = item.type === "drop" ? dropCountdown(item.liveInHours) : null;
  const label = item.type === "drop" ? (href ? item.cta : "View Drop") : item.cta;

  return (
    <div className="relative rounded-3xl overflow-hidden border border-border">
      {img ? (
        <img src={img} alt={item.headline} className="h-64 w-full object-cover" />
      ) : (
        <div className="h-64 w-full" style={{ background: gradientFor(item.id) }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-accent">{FEED_TYPE_LABEL[item.type]}</span>
          {countdown && (
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-white/15 text-[10px] font-bold text-white">
              <Timer className="h-3 w-3" /> {countdown}
            </span>
          )}
        </div>
        <Link to={`/a/${athlete.slug}`} className="text-[12px] font-bold text-white/80">{athleteName(athlete)}</Link>
        <h2 className="text-xl font-black text-white leading-tight mt-0.5">{item.headline}</h2>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent text-accent-foreground font-bold text-[13px]">
            {label} <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <Link to={`/a/${athlete.slug}`} className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white text-black font-bold text-[13px]">
            {label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
