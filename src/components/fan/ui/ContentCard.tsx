// Fan content card for operator-authored content_assets. Access/VIP content the
// fan can't open shows an attractive LOCKED teaser + Unlock prompt rather than
// disappearing.
import { Link } from "react-router-dom";
import { Lock, Play, ShoppingBag } from "lucide-react";
import type { PublicContent } from "@/lib/ecosystem/content";
import { canView, type AccessState, type Visibility } from "@/lib/ecosystem/access";
import { gradientFor } from "@/lib/ecosystem/visual";
import { agoLabel } from "@/lib/ecosystem/demo-content";

function hoursAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
}

export function ContentCard({ content, access }: { content: PublicContent; access: AccessState }) {
  const unlocked = canView(content.visibility as Visibility, access);
  const isVideo = content.type === "video";

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="relative aspect-[16/9]" style={{ background: gradientFor(content.id) }}>
        {content.hero_url && (
          <img
            src={content.hero_url}
            alt=""
            loading="lazy"
            className={`absolute inset-0 h-full w-full object-cover ${unlocked ? "" : "blur-xl scale-110"}`}
          />
        )}
        {!unlocked && <div className="absolute inset-0 bg-black/40" />}
        {unlocked && isVideo && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-12 w-12 rounded-full bg-black/50 backdrop-blur flex items-center justify-center"><Play className="h-5 w-5 text-white fill-white" /></span>
          </span>
        )}
        {!unlocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <span className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center mb-2"><Lock className="h-5 w-5 text-white" /></span>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/90">{content.visibility === "vip" ? "VIP Only" : "Access Only"}</div>
          </div>
        )}
      </div>
      <div className="p-3.5">
        {content.athlete_name && <div className="text-[11px] uppercase tracking-wider text-accent font-bold truncate">{content.athlete_name}</div>}
        <h3 className="font-bold leading-snug mt-0.5">{content.title}</h3>
        {unlocked ? (
          content.body && <p className="text-[13px] text-muted-foreground mt-1 line-clamp-3">{content.body}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground mt-1">Unlock Access to see this content.</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-muted-foreground">{agoLabel(hoursAgo(content.publish_at ?? content.created_at))}</span>
          {content.product_id && unlocked && (
            <Link to={`/p/${content.product_id}`} className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-accent">
              <ShoppingBag className="h-3.5 w-3.5" /> Shop the Look
            </Link>
          )}
          {!unlocked && content.athlete_slug && (
            <Link to={`/a/${content.athlete_slug}?tab=access`} className="ml-auto inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-accent text-accent-foreground text-[12px] font-bold">
              Unlock Access
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
