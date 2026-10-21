// The client's money at a glance, and the way into the pricing sheet.
//
// The split (share %, gross or profit), how they pay for orders, and every
// product's cost and bulk price are edited in ONE place — the pricing sheet at
// /admin-v2/people/:id/pricing — so there is never a second editor that could
// disagree with it. This card only summarises and links there.
import { BadgeDollarSign, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useBrandTerms } from "@/lib/v2/brand-terms";

export default function BrandTermsCard({ entityId, entityName }: { entityId: string; entityName: string }) {
  const { data, isLoading, isError } = useBrandTerms(entityId);
  if (isLoading || isError || !data) return null;
  const summary =
    data.revenueSharePercent != null
      ? `${data.revenueSharePercent}% of ${data.splitBasis === "gross" ? "each store sale" : "profit after cost"}${data.payoutSchedule ? ` · ${data.payoutSchedule}` : ""}`
      : `Split not set — ${entityName}'s "How your money works" page says it's in their agreement.`;
  return (
    <div className="mb-6">
      <div className="ax-card flex flex-wrap items-center gap-3 px-3.5 py-3">
        <BadgeDollarSign className="h-5 w-5 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Pricing &amp; split</div>
          <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">{summary}</div>
        </div>
        <a
          href={`/portal/analytics?as=${encodeURIComponent(entityId)}&guide=money`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
        >
          <Eye className="h-3.5 w-3.5" />
          Their one-pagers
        </a>
        <Link
          to={`/admin-v2/people/${entityId}/invoice`}
          className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
        >
          Build an invoice
        </Link>
        <Link
          to={`/admin-v2/people/${entityId}/pricing`}
          className="rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
        >
          Open pricing sheet
        </Link>
      </div>
    </div>
  );
}
