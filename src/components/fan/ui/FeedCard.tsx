// The flexible feed card — renders every FeedItem type. Visual is a real
// product image when linked, otherwise a gradient block with the type label.
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { FeedItem } from "@/lib/ecosystem/content-types";
import { FEED_TYPE_LABEL } from "@/lib/ecosystem/content-types";
import { agoLabel } from "@/lib/ecosystem/demo-content";
import { gradientFor, TYPE_ACCENT } from "@/lib/ecosystem/visual";
import { productImageUrl, shopLink, fmtPrice } from "@/lib/ecosystem/image";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import type { PublicAthleteProduct } from "@/lib/ecosystem/types";
import { AccessBadge } from "./AccessBadge";
import { SaveButton } from "./SaveButton";
import { AthletePhoto } from "./AthletePhoto";

function ctaTarget(item: FeedItem, product?: PublicAthleteProduct): { href?: string; to?: string } {
  if (item.type === "drop" && product) {
    const href = shopLink(product.shopify_handle);
    if (href) return { href };
    return { to: `/a/${item.athleteSlug}?tab=shop` };
  }
  if (item.type === "drop") return { to: `/a/${item.athleteSlug}?tab=shop` };
  if (item.type === "exclusive" || item.type === "event") return { to: `/a/${item.athleteSlug}?tab=access` };
  if (item.type === "camp") return { to: `/a/${item.athleteSlug}?tab=camps` };
  return { to: `/a/${item.athleteSlug}` };
}

export function FeedCard({
  item,
  athlete,
  product,
}: {
  item: FeedItem;
  athlete: PublicAthlete;
  product?: PublicAthleteProduct;
}) {
  const img = product ? productImageUrl(product) : null;
  const target = ctaTarget(item, product);
  const price = product ? fmtPrice(product.price) : null;

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
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
          {item.type === "drop" && product ? (
            <SaveButton item={{ type: "product", ref: product.id, athleteId: athlete.id, title: product.title }} variant="overlay" />
          ) : (
            <SaveButton item={{ type: "content", ref: item.id, athleteId: athlete.id, title: item.headline }} variant="overlay" />
          )}
        </div>
      </div>

      {/* Visual */}
      {img ? (
        <div className="aspect-[4/3] bg-muted">
          <img src={img} alt={item.headline} loading="lazy" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[16/9] flex items-center justify-center" style={{ background: gradientFor(item.id) }}>
          <span className="text-sm font-black uppercase tracking-[0.2em] text-white/70">{FEED_TYPE_LABEL[item.type]}</span>
        </div>
      )}

      {/* Body */}
      <div className="p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <AccessBadge level={item.accessLevel} />
        </div>
        <h3 className="font-bold leading-snug">{item.headline}</h3>
        <p className="text-[13px] text-muted-foreground mt-1">{item.body}</p>
        {price && <div className="text-[13px] font-semibold mt-1.5">{price}</div>}

        {target.href ? (
          <a href={target.href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-accent text-accent-foreground font-bold text-[13px]">
            {item.cta} <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <Link to={target.to!} className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white/8 hover:bg-white/12 font-bold text-[13px] transition-colors">
            {item.cta} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}
