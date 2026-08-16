// One product status, rendered the same everywhere. The label comes from
// lifecycleOf() rather than any single column, and the clock says exactly what
// is still missing instead of leaving the operator to guess.
import { Clock, ExternalLink, RefreshCw } from "lucide-react";
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_TONE,
  hasUnsyncedChanges,
  lifecycleOf,
  missingRequirements,
  shopifyProductUrl,
  showsPendingClock,
  type ProductLike,
} from "@/lib/ecosystem/merch";

const TONE_CLASS: Record<string, string> = {
  neutral: "border border-[hsl(var(--ax-border))] text-muted-foreground",
  accent: "bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]",
  warn: "bg-[hsl(40_90%_55%/0.15)] text-[hsl(40_90%_60%)]",
  good: "bg-[hsl(150_60%_45%/0.15)] text-[hsl(150_60%_55%)]",
};

export function ProductStatusChip({ product, className = "" }: { product: ProductLike; className?: string }) {
  const stage = lifecycleOf(product);
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap ${TONE_CLASS[LIFECYCLE_TONE[stage]]} ${className}`}
    >
      {LIFECYCLE_LABELS[stage]}
    </span>
  );
}

/** The clock. Hover explains what's blocking publication. */
export function PendingClock({ product }: { product: ProductLike }) {
  if (!showsPendingClock(product)) return null;
  const missing = missingRequirements(product);
  return (
    <span
      className="h-5 w-5 rounded-full bg-black/70 flex items-center justify-center cursor-help"
      title={`Product configuration pending — missing: ${missing.map((m) => m.label).join(", ")}`}
    >
      <Clock className="h-3 w-3 text-[hsl(40_90%_60%)]" />
    </span>
  );
}

/** Setup checklist, for a detail view where there's room to be explicit. */
export function SetupPendingList({ product }: { product: ProductLike }) {
  const missing = missingRequirements(product);
  if (missing.length === 0) return null;
  return (
    <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-[hsl(40_90%_60%)] mb-1.5 inline-flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Setup pending
      </div>
      <ul className="text-[12px] text-muted-foreground space-y-0.5">
        {missing.map((m) => <li key={m.key}>Missing: {m.label}</li>)}
      </ul>
    </div>
  );
}

/** Live-product affordances: open the storefront, or flag drift since sync. */
export function ShopifyLinkRow({ product }: { product: ProductLike }) {
  const url = shopifyProductUrl(product.shopify_handle);
  if (!url) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1 hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> View product
      </a>
      {hasUnsyncedChanges(product) && (
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(40_90%_55%/0.15)] text-[hsl(40_90%_60%)] inline-flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Unsynced changes
        </span>
      )}
    </div>
  );
}
