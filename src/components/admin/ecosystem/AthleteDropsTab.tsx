// Operator drop lifecycle: schedule access/public dates + send for athlete
// approval. Shared products object; fan state is derived from these timestamps.
import { useState } from "react";
import { Loader2, Send, Save, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAthleteOperatorProducts } from "@/hooks/useContent";
import { scheduleProduct, sendProductForApproval, type OperatorProduct } from "@/lib/ecosystem/content";
import { earlyAccess } from "@/lib/ecosystem/access";

const APPROVAL_CHIP: Record<string, string> = {
  none: "text-[hsl(var(--ax-faint))]",
  pending: "text-[hsl(var(--ax-amber))]",
  approved: "text-[hsl(var(--ax-accent))]",
  rejected: "text-[hsl(var(--ax-red))]",
};
const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDate = (d: string) => (d ? new Date(d + "T10:00:00").toISOString() : null);

export function AthleteDropsTab({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useAthleteOperatorProducts(athleteId);
  const refresh = () => qc.invalidateQueries({ queryKey: ["op-products", athleteId] });

  if (isLoading) return <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>;
  if (products.length === 0) return <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">No products yet for this athlete.</div>;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[hsl(var(--ax-faint))]">Set an Access-early date and a public date; the fan experience derives the drop state automatically. Send drafts to the athlete for approval.</p>
      {products.map((p) => <DropRow key={p.id} product={p} onChanged={refresh} />)}
    </div>
  );
}

function DropRow({ product, onChanged }: { product: OperatorProduct; onChanged: () => void }) {
  const [access, setAccess] = useState(toDate(product.access_date));
  const [pub, setPub] = useState(toDate(product.public_date));
  const [busy, setBusy] = useState<string | null>(null);
  const derived = earlyAccess(product.access_date, product.public_date, true);

  async function save() {
    setBusy("save");
    try { await scheduleProduct(product.id, { access_date: fromDate(access), public_date: fromDate(pub) }); toast.success("Schedule saved"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  async function send() {
    setBusy("send");
    try { await sendProductForApproval(product.id); toast.success("Sent to athlete for approval"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <div className="ax-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{product.title}</div>
          <div className="text-[12px] text-[hsl(var(--ax-faint))]">
            <span className="capitalize">{product.status}</span> · approval <span className={`capitalize font-semibold ${APPROVAL_CHIP[product.approval_state] ?? ""}`}>{product.approval_state}</span>
          </div>
        </div>
        {product.approval_state !== "pending" && product.approval_state !== "approved" && (
          <button onClick={send} disabled={busy === "send"} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send for Approval
          </button>
        )}
      </div>
      {product.approval_note && <div className="mt-2 text-[12px] text-[hsl(var(--ax-amber))]">Athlete note: {product.approval_note}</div>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Access early</span>
          <input type="date" className="ax-field mt-1" value={access} onChange={(e) => setAccess(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Public</span>
          <input type="date" className="ax-field mt-1" value={pub} onChange={(e) => setPub(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {derived.label ? (
          <span className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Fan state: {derived.label}</span>
        ) : <span />}
        <button onClick={save} disabled={busy === "save"} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Schedule
        </button>
      </div>
    </div>
  );
}
