// What this client's Brand HQ one-pagers say about the split.
//
// The one-pagers ("How your money works", "Your code"…) fill themselves from
// live data. The one number only AX can supply is the client's store revenue
// share; until it is set here the portal says "set in your AX agreement"
// instead of guessing. Saved to athletes.metadata.brand_terms.
import { useEffect, useState } from "react";
import { BadgeDollarSign, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EMPTY_TERMS, brandTermsError, useBrandTerms, useSaveBrandTerms, type BrandTerms } from "@/lib/v2/brand-terms";

export default function BrandTermsCard({ entityId, entityName }: { entityId: string; entityName: string }) {
  const { data, isLoading, isError } = useBrandTerms(entityId);
  const save = useSaveBrandTerms(entityId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BrandTerms>(EMPTY_TERMS);
  const [pctText, setPctText] = useState("");

  useEffect(() => {
    if (!data) return;
    setDraft(data);
    setPctText(data.revenueSharePercent == null ? "" : String(data.revenueSharePercent));
  }, [data]);

  if (isLoading || isError) return null;
  const saved = data ?? EMPTY_TERMS;
  const problem = brandTermsError(draft);
  const summary = saved.revenueSharePercent != null
    ? `${saved.revenueSharePercent}% of store sales${saved.payoutSchedule ? ` · ${saved.payoutSchedule}` : ""}`
    : `Not set — ${entityName}'s "How your money works" page says it's in their agreement.`;

  function setPct(v: string) {
    setPctText(v);
    const n = v.trim() === "" ? null : Number(v);
    setDraft((d) => ({ ...d, revenueSharePercent: n != null && Number.isFinite(n) ? n : n === null ? null : NaN }));
  }

  return (
    <div className="mb-6">
      <div className="ax-card flex flex-wrap items-center gap-3 px-3.5 py-3">
        <BadgeDollarSign className="h-5 w-5 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Brand HQ terms</div>
          <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">{summary}</div>
        </div>
        <a
          href={`/portal/analytics?as=${encodeURIComponent(entityId)}&guide=money`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
        >
          <Eye className="h-3.5 w-3.5" />
          See the one-pagers
        </a>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
          >
            Edit terms
          </button>
        )}
      </div>
      {open && (
        <form
          className="ax-card mt-1.5 grid gap-4 px-3.5 py-4 sm:grid-cols-[160px_minmax(0,1fr)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (problem) return;
            save.mutate(draft, {
              onSuccess: () => { toast.success("Terms saved — the one-pagers update right away."); setOpen(false); },
              onError: (err) => toast.error(err.message),
            });
          }}
        >
          <label className="grid gap-1 text-[12px]">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">Store revenue share</span>
            <span className="flex items-center gap-1">
              <input
                inputMode="decimal"
                value={pctText}
                onChange={(e) => setPct(e.target.value)}
                placeholder="e.g. 20"
                className="w-20 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 py-1.5 text-[13px]"
                aria-label="Store revenue share percent"
              />
              %
            </span>
          </label>
          <label className="grid gap-1 text-[12px]">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">Paid out</span>
            <input
              value={draft.payoutSchedule}
              onChange={(e) => setDraft((d) => ({ ...d, payoutSchedule: e.target.value }))}
              placeholder="e.g. Monthly, by the 15th"
              className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 py-1.5 text-[13px]"
            />
          </label>
          <label className="grid gap-1 text-[12px] sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">Note on “How your money works” (optional)</span>
            <textarea
              rows={2}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 py-1.5 text-[13px]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            {problem && <span className="text-[12px] text-[hsl(var(--ax-danger,0_70%_55%))]">{problem}</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => { setDraft(saved); setPctText(saved.revenueSharePercent == null ? "" : String(saved.revenueSharePercent)); setOpen(false); }} className="rounded-full px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]">Cancel</button>
            <button type="submit" disabled={!!problem || save.isPending} className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50">
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save terms
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
