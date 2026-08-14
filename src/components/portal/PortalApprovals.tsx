// Athlete Action Required: products the operator sent for approval. Approving
// updates the shared product (and emits a product.approved event operators see).
import { useState } from "react";
import { Check, X, Loader2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePendingProducts } from "@/hooks/useContent";
import { setProductApproval, type OperatorProduct } from "@/lib/ecosystem/content";
import { storageUrl } from "@/lib/ecosystem/image";

export function PortalApprovals({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const { data: pending = [] } = usePendingProducts(athleteId);
  if (pending.length === 0) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["pending-products", athleteId] });

  return (
    <section>
      <div className="text-sm font-bold uppercase tracking-[0.1em] text-accent mb-3">Action Required · {pending.length}</div>
      <div className="space-y-2.5">
        {pending.map((p) => <ApprovalRow key={p.id} product={p} onDone={refresh} />)}
      </div>
    </section>
  );
}

function ApprovalRow({ product, onDone }: { product: OperatorProduct; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  const primary = (product.product_images ?? []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)[0];
  const img = primary ? storageUrl(primary.storage_bucket, primary.storage_path) : null;

  async function decide(approve: boolean) {
    setBusy(approve ? "a" : "r");
    try { await setProductApproval(product.id, approve, approve ? null : note.trim() || null); toast.success(approve ? "Approved" : "Sent back with changes"); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/[0.05] p-3">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted shrink-0 flex items-center justify-center">
          {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-accent font-bold">New product ready for approval</div>
          <div className="font-semibold truncate">{product.title}</div>
        </div>
      </div>
      {noting ? (
        <div className="mt-3 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" className="portal-input w-full min-h-[60px]" />
          <div className="flex gap-2">
            <button onClick={() => setNoting(false)} className="flex-1 h-9 rounded-lg border border-border text-sm font-semibold">Cancel</button>
            <button onClick={() => decide(false)} disabled={busy === "r"} className="flex-1 h-9 rounded-lg bg-destructive/90 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              {busy === "r" && <Loader2 className="h-4 w-4 animate-spin" />} Send Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <button onClick={() => setNoting(true)} className="flex-1 h-9 rounded-lg border border-border text-sm font-semibold inline-flex items-center justify-center gap-1.5">
            <X className="h-4 w-4" /> Request Changes
          </button>
          <button onClick={() => decide(true)} disabled={busy === "a"} className="flex-1 h-9 rounded-lg bg-accent text-accent-foreground text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
            {busy === "a" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
          </button>
        </div>
      )}
    </div>
  );
}
