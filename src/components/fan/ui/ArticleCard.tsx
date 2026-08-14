// Editorial "From the Farm" story card.
import { Link } from "react-router-dom";
import type { Article } from "@/lib/ecosystem/content-types";
import { agoLabel } from "@/lib/ecosystem/demo-content";
import { gradientFor } from "@/lib/ecosystem/visual";

export function ArticleCard({ article }: { article: Article }) {
  const to = article.athleteSlug ? `/a/${article.athleteSlug}` : "/feed";
  return (
    <Link to={to} className="block w-[300px] shrink-0 snap-start rounded-2xl overflow-hidden border border-border bg-card">
      <div className="h-36 flex items-end p-3" style={{ background: gradientFor(article.id) }}>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80 bg-black/30 px-2 py-1 rounded-full">
          {article.kicker}
        </span>
      </div>
      <div className="p-3.5">
        <h3 className="font-bold leading-snug">{article.title}</h3>
        <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{article.excerpt}</p>
        <div className="text-[11px] text-muted-foreground mt-2">{agoLabel(article.publishedOffsetHours)}</div>
      </div>
    </Link>
  );
}
