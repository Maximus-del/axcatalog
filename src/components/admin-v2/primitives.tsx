import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Search } from "lucide-react";
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
  onNaturalSize,
}: {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  alt: string;
  className?: string;
  fallbackSeed?: string;
  fit?: "cover" | "contain";
  /**
   * Natural aspect ratio (w/h) once the image has decoded.
   *
   * The mockup canvas needs this to scale artwork without distorting it, and
   * the only reliable source is the decoded image itself — the database records
   * no dimensions for design files.
   */
  onNaturalSize?: (aspect: number) => void;
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
      onLoad={(e) => {
        if (!onNaturalSize) return;
        const img = e.currentTarget as HTMLImageElement;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          onNaturalSize(img.naturalWidth / img.naturalHeight);
        }
      }}
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
  eyebrow,
  detail,
  count,
  action,
  children,
  empty,
}: {
  /** Anchor id, so in-page workflow navigation can scroll here. Additive — every existing caller omits it. */
  id?: string;
  title: string;
  /**
   * Small accent label above the title.
   *
   * Optional, and every pre-existing caller omits it — a section without one
   * renders exactly as it always did. With it, the section gets the same
   * three-tier hierarchy the Creative page uses: category, then name, then
   * explanation.
   */
  eyebrow?: string;
  /** One line under the title saying what this section is for. */
  detail?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
}) {
  const isEmpty = count === 0;
  const rich = Boolean(eyebrow || detail);
  return (
    <section id={id} className="mb-9 scroll-mt-32">
      <div className="mb-3 flex items-end gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--ax-accent))]">
              {eyebrow}
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <h2
              className={
                rich
                  ? "mt-1 text-[17px] font-semibold"
                  : "text-[13px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]"
              }
            >
              {title}
            </h2>
            {count != null && (
              <span className="text-[13px] tabular-nums text-[hsl(var(--ax-faint))]">{count}</span>
            )}
          </div>
          {detail && <p className="text-[11px] text-[hsl(var(--ax-faint))]">{detail}</p>}
        </div>
        <div className="ml-auto shrink-0">{action}</div>
      </div>
      {isEmpty && empty ? <EmptyState>{empty}</EmptyState> : children}
    </section>
  );
}

/* ------------------------------------------------------ the Creative look */
//
// These came out of V2Creative, which is the page whose visual language we
// settled on. They live here rather than there so every V2 surface uses the
// same components instead of re-implementing the same card six times — the
// look stays consistent because there is one copy of it, not because six files
// happen to agree.

/**
 * A headline number.
 *
 * Micro-label and icon on one row, the number below at a size you can read
 * across the room. Tabular figures so a row of them does not jitter as values
 * change.
 */
export function Metric({
  label,
  value,
  loading,
  icon,
  onClick,
  href,
}: {
  label: string;
  value: ReactNode;
  loading?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  /** Where this number lives. A figure you cannot open is decoration. */
  href?: string;
}) {
  const body = (
    <>
      <div className="mb-3 flex items-center justify-between text-[hsl(var(--ax-secondary))]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
        {icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      </div>
      {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-[27px] font-semibold tabular-nums">{value}</div>}
    </>
  );
  const interactive = "ax-card ax-card-hover block px-4 py-3.5 text-left transition-all";
  if (href) {
    return (
      <Link to={href} className={interactive}>
        {body}
      </Link>
    );
  }
  return onClick ? (
    <button type="button" onClick={onClick} className={interactive}>
      {body}
    </button>
  ) : (
    <div className="ax-card px-4 py-3.5">{body}</div>
  );
}

/** Section heading: accent eyebrow, title, one line of explanation. */
export function Heading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--ax-accent))]">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-[17px] font-semibold">{title}</h2>
      {detail && <p className="text-[11px] text-[hsl(var(--ax-faint))]">{detail}</p>}
    </div>
  );
}

/**
 * A destination card: icon tile, optional count, name, description, next action.
 *
 * `min-h-10` on the description is deliberate — it keeps the action lines of a
 * row of cards on the same baseline even when the copy runs to different
 * lengths, which is the difference between a grid that looks designed and one
 * that looks assembled.
 */
export function WorkspaceCard({
  icon,
  title,
  count,
  description,
  action,
  onClick,
  href,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  description: string;
  action: string;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <div className="mb-5 flex justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
        {count != null && <span className="text-[22px] font-semibold tabular-nums">{count}</span>}
      </div>
      <div className="text-[14px] font-semibold">{title}</div>
      <p className="mt-1.5 min-h-10 text-[11px] text-[hsl(var(--ax-faint))]">{description}</p>
      <div className="mt-4 text-[11px] font-semibold text-[hsl(var(--ax-accent))]">
        {action} <ArrowRight className="inline h-3 w-3" />
      </div>
    </>
  );
  if (!href) {
    return (
      <Card onClick={onClick} className="p-4">
        {body}
      </Card>
    );
  }
  // An internal destination routes; a full page reload would throw away the
  // whole React tree and the query cache to move one screen.
  return href.startsWith("/") ? (
    <Link to={href} className="ax-card ax-card-hover block p-4">
      {body}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" className="ax-card ax-card-hover block p-4">
      {body}
    </a>
  );
}

/**
 * Something waiting on a decision.
 *
 * At zero it shows a check rather than an arrow and says nothing is waiting —
 * an empty queue should read as finished, not as a dead link.
 */
export function ActionCard({
  count,
  title,
  detail,
  onClick,
  href,
}: {
  count: number;
  title: string;
  detail: string;
  onClick?: () => void;
  /** Where the queue lives, when it is a route rather than a filter on this page. */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/[0.06] text-[14px] font-semibold tabular-nums">
          {count}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold">{title}</div>
          <p className="mt-1 text-[11px] text-[hsl(var(--ax-faint))]">{count ? detail : "Nothing waiting here."}</p>
        </div>
        {count ? (
          <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--ax-faint))]" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
        )}
      </div>
    </>
  );
  return href ? (
    <Link to={href} className="ax-card ax-card-hover block p-4 text-left transition-all">
      {body}
    </Link>
  ) : (
    <Card onClick={onClick} className="p-4">
      {body}
    </Card>
  );
}

/** Pill search with the filters that belong to it sitting alongside. */
export function Toolbar({
  query,
  onQuery,
  placeholder = "Search…",
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <label className="relative mr-auto min-w-[220px] max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-full border border-[hsl(var(--ax-border))] bg-white/[0.03] py-2 pl-9 pr-3 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
        />
      </label>
      {children}
    </div>
  );
}

/** Underlined tab bar. The active tab is marked by the rule, not by a filled pill. */
export function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: readonly T[];
  active: T;
  onSelect: (tab: T) => void;
  label: (tab: T) => string;
}) {
  return (
    <div className="mb-6 flex border-b border-[hsl(var(--ax-line))]">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelect(tab)}
          className={`relative px-4 pb-3 pt-1 text-[12px] font-semibold transition-colors ${
            active === tab ? "text-[hsl(var(--ax-accent))]" : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          }`}
        >
          {label(tab)}
          {active === tab && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-[hsl(var(--ax-accent))]" />}
        </button>
      ))}
    </div>
  );
}

/**
 * A query that failed, said out loud.
 *
 * Every V2 page used to render its empty state when a read failed — "No blanks
 * match", "No mockups yet" — which tells the operator the opposite of what
 * happened and sends them looking for data that is actually there. An empty
 * shelf and an unreachable database are different facts.
 */
export function ErrorState({
  error,
  what = "this",
  onRetry,
}: {
  error: unknown;
  /** What could not be loaded, e.g. "the blank catalog". */
  what?: string;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : null;
  return (
    <div className="rounded-2xl border border-[hsl(var(--ax-red)/0.4)] bg-[hsl(var(--ax-red)/0.06)] px-5 py-6 text-center">
      <div className="text-[13px] font-medium text-[hsl(var(--ax-ink))]">Could not load {what}.</div>
      {message && <p className="mt-1 text-[11px] text-[hsl(var(--ax-faint))]">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-[hsl(var(--ax-border))] px-4 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
        >
          Try again
        </button>
      )}
    </div>
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
