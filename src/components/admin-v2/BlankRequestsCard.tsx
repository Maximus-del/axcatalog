// What this client picked from the blank catalog ("Add to my shop") and where
// each request is: Requested → In design → In their shop (or Not available).
// Hidden until the client has asked for something.
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { toneText } from "@/components/admin-v2/primitives";
import { relativeTime } from "@/lib/v2/entity-overview";
import { useBlankRequests, useSetBlankRequestStatus, type BlankRequestStatus } from "@/lib/v2/blank-requests";

const LABEL: Record<BlankRequestStatus, { label: string; tone: string }> = {
  pending: { label: "Requested", tone: "--ax-amber" },
  in_progress: { label: "In design", tone: "--ax-blue" },
  added: { label: "In their shop", tone: "--ax-accent" },
  declined: { label: "Not available", tone: "--ax-faint" },
};
const NEXT: Record<BlankRequestStatus, { to: BlankRequestStatus; label: string }[]> = {
  pending: [{ to: "in_progress", label: "Start design" }, { to: "declined", label: "Decline" }],
  in_progress: [{ to: "added", label: "Mark added to shop" }, { to: "pending", label: "Back to requested" }],
  added: [{ to: "in_progress", label: "Reopen" }],
  declined: [{ to: "pending", label: "Reopen" }],
};

const btn = "rounded-full px-3 py-1.5 text-[12px] font-semibold";

export default function BlankRequestsCard({ entityId, entityName }: { entityId: string; entityName: string }) {
  const q = useBlankRequests(entityId);
  const set = useSetBlankRequestStatus(entityId);
  const rows = q.data ?? [];
  if (q.isLoading || !rows.length) return null;
  const open = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="ax-card mb-6 px-4 py-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "hsl(var(--ax-accent) / 0.14)", color: toneText("var(--ax-accent)") }}>
          <LayoutGrid className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Blank catalog requests</div>
          <div className="text-[12px] text-[hsl(var(--ax-faint))]">
            {open ? `${open} new from ${entityName}` : `What ${entityName} picked from the catalog`}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-[hsl(var(--ax-line))] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold">{r.blankName}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `hsl(var(${LABEL[r.status].tone}) / 0.14)`, color: toneText(`var(${LABEL[r.status].tone})`) }}>
                {LABEL[r.status].label}
              </span>
              <span className="ml-auto text-[11px] text-[hsl(var(--ax-faint))]">{relativeTime(r.createdAt)}</span>
            </div>
            <div className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">
              {[
                r.colors.length ? r.colors.join(", ") : "No colors picked",
                r.quantity ? `~${r.quantity} pcs` : null,
                r.unitPrice != null ? `$${r.unitPrice.toFixed(2)}/pc (${r.tier})` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {r.notes ? <div className="mt-1 text-[12px] italic">"{r.notes}"</div> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {NEXT[r.status].map((n, i) => (
                <button
                  key={n.to}
                  type="button"
                  disabled={set.isPending}
                  onClick={() => set.mutateAsync({ id: r.id, status: n.to }).then(() => toast.success(LABEL[n.to].label)).catch((e: Error) => toast.error(e.message))}
                  className={i === 0 ? `${btn} bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]` : `${btn} border border-[hsl(var(--ax-line))]`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
