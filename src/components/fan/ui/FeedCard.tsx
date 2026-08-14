// The flexible feed card — renders every FeedItem type. When a product is
// linked (drops, "Shop the Look" on content) the visual is the product image
// and the CTA hands off to the AX store; otherwise a gradient block + in-app CTA.
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, Timer } from "lucide-react";
import type { FeedItem } from "@/lib/ecosystem/content-types";
import { FEED_TYPE_LABEL } from "@/lib/ecosystem/content-types";
import { agoLabel } from "@/lib/ecosystem/demo-content";
import { dropCountdown, type EnrichedFeedItem } from "@/lib/ecosystem/feed-engine";
import { gradientFor, TYPE_ACCENT } from "@/lib/ecosystem/visual";
import { productImageUrl, shopLink, fmtPrice } from "@/lib/ecosystem/image";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AccessBadge } from "./AccessBadge";
import { SaveButton } from "./SaveButton";
import { AthletePhoto } from "./AthletePhoto";

type Item = FeedItem & Partial<Pick<EnrichedFeedItem, "product" | "liveInHours" | "athleteName">>;

export function FeedCard({ item, athlete }: { item: Item; athlete: PublicAthlete }) {
  const product = item.product;
  const img = product ? productImageUrl(product) : null;
  const price = product ? fmtPrice(product.price) : null;
  const href = product ? shopLink(product.shopify_handle) : null;
  const countdown = item.type === "drop" ? dropCountdown(item.liveInHours) : null;
  const shopLabel = item.type === "drop" ? item.cta : "Shop the Look";

  const inAppTo =
    item.type === "camp" ? `/a/${item.athleteSlug}?tab=camps`
    : item.type === "exclusive" || item.type === "event" ? `/a/${item.athleteSlug}?tab=access`
    : item.type === "drop" ? `/a/${item.athleteSlug}?tab=shop`
    : `/a/${item.athleteSlug}`;

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 p-3">
        <Link to={`/a/${athlete.slug}`}>
          <AthletePhoto athlete={athlete} className="h-9 w-9 rounded-full" textClass="text-[11px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/a/${athlete.slug}`} className="font-semibold text-sm truncate block leading-tight">
            {athleteName(athlete)}
          </Link>
          <div className={`text-[11px] font-bold uppercase tracking-wider ${TYPE_ACCENT[item.type]}`}>
            {FEED_TYPE_LABEL[item.type]}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-muted-foreground">{agoLabel(item.publishedOffsetHours)}</span>
          <SaveButton
            item={
              product
                ? { type: "product", ref: product.id, athleteId: athlete.id, title: product.title }
                : { type: "content", ref: item.id, athleteId: athlete.id, title: item.headline }
            }
            variant="overlay"
          />
        </div>
      </div>

      {img ? (
        <div className="relative aspect-[4/3] bg-muted">
          <img src={img} alt={item.headline} loading="lazy" className="h-full w-full object-cover" />
          {countdown && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/60 backdrop-blur text-[11px] font-bold text-white">
              <Timer className="h-3 w-3" /> {countdown}
            </span>
          )}
        </div>
      ) : (
        <div className="relative aspect-[16/9] flex items-center justify-center" style={{ background: gradientFor(item.id) }}>
          <span className="text-sm font-black uppercase tracking-[0.2em] text-white/70">{FEED_TYPE_LABEL[item.type]}</span>
          {countdown && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/50 text-[11px] font-bold text-white">
              <Timer className="h-3 w-3" /> {countdown}
            </span>
          )}
        </div>
      )}

      <div className="p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <AccessBadge level={item.accessLevel} />
        </div>
        <h3 className="font-bold leading-snug">{item.headline}</h3>
        <p className="text-[13px] text-muted-foreground mt-1">{item.body}</p>
        {price && <div className="text-[13px] font-semibold mt-1.5">{price}</div>}

        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent text-accent-foreground font-bold text-[13px]">
            {shopLabel} <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <Link to={inAppTo} className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white/8 hover:bg-white/12 font-bold text-[13px] transition-colors">
            {item.cta} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}
