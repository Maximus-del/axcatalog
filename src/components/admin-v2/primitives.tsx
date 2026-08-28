import { ReactNode } from "react";
import { useSignedUrl } from "@/lib/storage";
import { initialsOf, tintOf } from "@/lib/v2/entity";

/* --------------------------------------------------------------- asset image */

/**
 * One image component for every V2 surface.
 *
 * The live database mixes three storage situations and V1 handles each in a
 * different place: `product-images` and `blanks` are PUBLIC buckets, while
 * `design-files` and `mockups` are PRIVATE and need a signed URL. Concepts may
 * also carry a plain external URL. Resolving that here means no V2 page has to
 * know which case it is looking at.
 */
export function AssetImage({
  url,
  bucket,
  path,
  alt,
  className = "",
  fallbackSeed,
  fit = "cover",
}: {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  alt: string;
  className?: string;
  fallbackSeed?: string;
  fit?: "cover" | "contain";
}) {
  const needsSigning = !url && Boolean(bucket && path);
  const { url: signed } = useSignedUrl(needsSigning ? bucket ?? null : null, needsSigning ? path ?? null : null);
  const src = url ?? signed;

  if (!src) {
    const seed = fallbackSeed ?? alt;
    return (
      <div
        className={`flex items-center justify-center text-[11px] font-semibold uppercase tracking-widest text-white/45 ${className}`}
        style={{ background: tintOf(seed) }}
      >
        {initialsOf(alt)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}

/* ---------------------------------------------------------------- structure */

export function Section({
  id,
  title,
  count,
  action,
  children,
  empty,
}: {
  /** Anchor id, so in-page workflow navigation can scroll here. Additive — every existing caller omits it. */
  id?: string;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <section id={id} className="mb-9 scroll-mt-32">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
          {title}
        </h2>
        {count != null && (
          <span className="text-[13px] tabular-nums text-[hsl(var(--ax-faint))]">{count}</span>
        )}
        <div className="ml-auto">{action}</div>
      </div>
      {isEmpty && empty ? <EmptyState>{empty}</EmptyState> : children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(var(--ax-border))] px-5 py-8 text-center text-[13px] text-[hsl(var(--ax-faint))]">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-semibold tracking-tight sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-[hsl(var(--ax-secondary))]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- chips */

export function Chip({
  children,
  tone,
  active,
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const style = tone
    ? { background: `hsl(${tone} / 0.14)`, color: `hsl(${tone})` }
    : active
      ? { background: "hsl(var(--ax-accent) / 0.16)", color: "hsl(var(--ax-accent))" }
      : undefined;
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        !tone && !active ? "bg-white/[0.06] text-[hsl(var(--ax-secondary))]" : "",
        onClick ? "transition-colors hover:brightness-125" : "",
      ].join(" ")}
      style={style}
    >
      {children}
    </Comp>
  );
}

export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`ax-card ${onClick ? "ax-card-hover text-left transition-all" : ""} overflow-hidden ${className}`}
    >
      {children}
    </Comp>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ax-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
        {label}
      </div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}
