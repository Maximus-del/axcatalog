// Where a signed-in person without portal access lands.
//
// If they came through an invite link, this is the second half of that flow:
// the questionnaire first (answers go to AX with the request), then the wait.
// It polls, so the moment AX approves, the "Enter" button lights up without a
// refresh. Someone with no request at all gets the old "reach out to your rep".
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { GateCard, RoleChip, ThemedGate } from "@/components/portal/invite/ThemedGate";
import { OnboardingForm } from "@/components/portal/invite/OnboardingForm";
import { onboardingSummary, useMyAccessRequests } from "@/lib/portal/invites";

export default function PendingAccess() {
  const { signOut, user, session, linkedAthleteIds, reload, loading } = useAuth();
  const navigate = useNavigate();
  const requests = useMyAccessRequests(Boolean(session));
  const [editing, setEditing] = useState(false);

  const current = (requests.data ?? []).find((r) => r.status !== "denied") ?? requests.data?.[0] ?? null;
  const approvedNow = current?.status === "approved";
  const linked = current ? linkedAthleteIds.includes(current.athleteId) : false;

  // Approval arrives by polling; refresh the session's links so /portal lets them in.
  useEffect(() => {
    if (approvedNow && !linked) reload();
  }, [approvedNow, linked, reload]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (loading || (session && requests.isLoading)) return <LoadingScreen />;

  const footer = (
    <div className="mt-6 text-center">
      {user?.email && <p className="mb-3 text-xs text-muted-foreground">Signed in as {user.email}</p>}
      <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">Sign out</Button>
    </div>
  );

  if (!current) {
    return (
      <ThemedGate>
        <GateCard className="text-center">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Account pending</p>
          <h1 className="text-2xl font-bold">You're almost in.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account isn't connected to a locker yet. Open the invite link you were sent, or reach out to your Athlete Xclusive rep.
          </p>
        </GateCard>
        {footer}
      </ThemedGate>
    );
  }

  const entity = current.entityName;
  const possessive = entity ? `${entity}'s` : "your";

  if ((!current.answered || editing) && current.status !== "denied") {
    return (
      <ThemedGate theme={current.theme} entityName={entity}>
        <GateCard>
          <OnboardingForm
            athleteId={current.athleteId}
            entityName={entity || "your team"}
            linkRole={current.requestedRole}
            initial={current.onboarding}
            onDone={() => {
              setEditing(false);
              if (current.status === "approved" && linked) navigate("/portal", { replace: true });
            }}
          />
        </GateCard>
        {footer}
      </ThemedGate>
    );
  }

  return (
    <ThemedGate theme={current.theme} entityName={entity}>
      <GateCard className="text-center">
        <div className="mb-4 flex justify-center"><RoleChip role={current.requestedRole} /></div>
        {current.status === "approved" ? (
          <>
            <h1 className="text-2xl font-bold">You're in.</h1>
            <p className="mt-2 text-sm text-muted-foreground">{entity ? `${entity}'s` : "Your"} locker is ready.</p>
            <Button
              className="mt-6 h-12 w-full rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90"
              disabled={!linked}
              onClick={() => navigate("/portal", { replace: true })}
            >
              {linked ? "Enter the locker" : <Loader2 className="h-4 w-4 animate-spin" />}
            </Button>
          </>
        ) : current.status === "denied" ? (
          <>
            <h1 className="text-2xl font-bold">Request not approved</h1>
            <p className="mt-2 text-sm text-muted-foreground">If that's a mistake, ask {entity || "your contact"} for a fresh link.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Request sent</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              AX is reviewing your access to {possessive} locker. This page opens it the moment you're approved — no need to refresh.
            </p>
            <div className="mt-5 rounded-xl border border-border/70 bg-background/40 p-3 text-left text-xs text-muted-foreground">
              {onboardingSummary(current.onboarding)}
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => setEditing(true)}>Edit my answers</Button>
          </>
        )}
      </GateCard>
      {footer}
    </ThemedGate>
  );
}
