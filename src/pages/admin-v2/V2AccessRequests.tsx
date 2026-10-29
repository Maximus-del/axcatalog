import { Link } from "react-router-dom";
import { ArrowUpRight, Check, KeyRound, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";
import { onboardingSummary, type PortalRole } from "@/lib/portal/invites";
import { useDecideAccessAny, usePendingAccessAll } from "@/lib/v2/portal-access";
import { relativeTime } from "@/lib/v2/entity-overview";

// ACCESS REQUESTS — everyone waiting to get into a client's locker, across
// every client, in one queue. Approve as the role they asked for, approve as
// the other role, or deny. Someone you've already vetted shouldn't wait here:
// give them the client's instant access code instead (on the client's page).

const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40";
const primary = `${btn} bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]`;
const ghost = `${btn} border border-[hsl(var(--ax-line))] hover:border-[hsl(var(--ax-accent)/0.5)]`;
const roleName = (r: PortalRole) => (r === "owner" ? "Owner" : "Team");

export default function V2AccessRequests() {
  const q = usePendingAccessAll();
  const decide = useDecideAccessAny();
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast.success(ok)).catch((e: Error) => toast.error(e.message));

  return (
    <>
      <PageHeader
        eyebrow="Client Spaces · Access requests"
        title={q.data?.length ? `${q.data.length} waiting for you` : "No one waiting"}
        subtitle="People who opened an invite link and asked to get into a client's locker. Approving lets them in on the spot — their screen opens by itself."
      />
      {q.isLoading ? <Skeleton className="h-40" /> : q.error ? <ErrorState error={q.error} what="access requests" onRetry={() => void q.refetch()} /> : !q.data?.length ? (
        <EmptyState>All clear. New requests show up here and on each client's page under Locker access. For people you already know, send them the client's instant access code instead.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {q.data.map((r) => {
            const other: PortalRole = r.requestedRole === "owner" ? "team" : "owner";
            return (
              <div key={r.id} className="ax-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">{r.fullName || r.email || "Unnamed"}</span>
                  <span className="text-[12px] text-[hsl(var(--ax-faint))]">wants into</span>
                  <Link to={`/admin-v2/people/${r.athleteId}`} className="inline-flex items-center gap-0.5 text-[13px] font-semibold underline-offset-2 hover:underline">
                    {r.entityName}<ArrowUpRight className="h-3 w-3" />
                  </Link>
                  <span className="rounded-full bg-[hsl(var(--ax-accent)/0.14)] px-2 py-0.5 text-[11px] font-semibold">asked for {roleName(r.requestedRole)}</span>
                  {r.suggested !== r.requestedRole && (
                    <span className="rounded-full bg-[hsl(var(--ax-amber)/0.16)] px-2 py-0.5 text-[11px] font-semibold">answers say {roleName(r.suggested)}</span>
                  )}
                  <span className="ml-auto text-[11px] text-[hsl(var(--ax-faint))]">{relativeTime(r.createdAt)}</span>
                </div>
                <div className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">{r.email}</div>
                <div className="mt-1.5 text-[12.5px]">{r.onboarding ? onboardingSummary(r.onboarding) : "Hasn't answered the questions yet."}</div>
                {r.onboarding?.notes && <div className="mt-1 text-[12px] italic text-[hsl(var(--ax-faint))]">"{r.onboarding.notes}"</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={primary} disabled={decide.isPending}
                    onClick={() => run(decide.mutateAsync({ requestId: r.id, decision: "approve", role: r.requestedRole }), `${r.fullName ?? "They"} can get in now`)}>
                    <Check className="h-3.5 w-3.5" />Approve as {roleName(r.requestedRole)}
                  </button>
                  <button type="button" className={ghost} disabled={decide.isPending}
                    onClick={() => run(decide.mutateAsync({ requestId: r.id, decision: "approve", role: other }), `Approved as ${roleName(other)}`)}>
                    Approve as {roleName(other)}
                  </button>
                  <button type="button" className={ghost} disabled={decide.isPending}
                    onClick={() => run(decide.mutateAsync({ requestId: r.id, decision: "deny" }), "Request denied")}>
                    <X className="h-3.5 w-3.5" />Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-6 flex items-center gap-1.5 text-[12px] text-[hsl(var(--ax-faint))]">
        <KeyRound className="h-3.5 w-3.5" />Instant access codes live on each client's page → Locker access.
      </p>
    </>
  );
}
