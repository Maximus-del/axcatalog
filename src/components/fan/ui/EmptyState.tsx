// Reusable, visually interesting empty state with a primary CTA.
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  ctaLabel,
  ctaTo,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-accent" />
      </div>
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{body}</p>
      {ctaLabel && ctaTo && (
        <Link to={ctaTo} className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-accent text-accent-foreground font-bold text-sm">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
