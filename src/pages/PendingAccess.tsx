// Where a signed-in person without portal access lands.
//
// If they came through an invite link, this is the second half of that flow:
// the questionnaire first (answers go to AX with the request), then the wait.
// It polls, so the moment AX approves, the "Enter" button lights up without a
// refresh. Someone with no request at all gets the old "reach out to your rep".
//
// The screens themselves live in <PendingView>, which the Test drive renders
// directly with a fake request so AX can see every state without an account.
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { GateCard, RoleChip, ThemedGate } from "@/components/portal/invite/ThemedGate";
import { OnboardingForm } from "@/components/portal/invite/OnboardingForm";
import { onboardingSummary, useMyAccessRequests, type MyRequest, type OnboardingAnswers } from "@/lib/portal/invites";

export type PendingStage = "questions" | "waiting" | "approved" | "denied";

export interface PendingViewProps {
  request: MyRequest;
  stage: PendingStage;
  /** Approved and the session can already open the portal. */
  canEnter: boolean;
  onEnter: () => void;
  onEditAnswers: () => void;
  onAnswered: () => void;
  /** Test drive: answers come back here instead of being saved. */
  onPreviewAnswers?: (a: OnboardingAnswers) => void;
  footer?: ReactNode;
}

/** Pure presentation — every state of the post-invite screen. */
export function PendingView({ request, stage, canEnter, onEnter, onEditAnswers, onAnswered, onPreviewAnswers, footer }: PendingViewProps) {
  const entity = request.entityName;
  const possessive = entity ? `${entity}'s` : "your";

  if (stage === "questions") {
    return (
      <ThemedGate theme={request.theme} entityName={entity}>
        <GateCard>
          <OnboardingForm
            athleteId={request.athleteId}
            entityName={entity || "your team"}
            linkRole={request.requestedRole}
            initial={request.onboarding}
            onDone={onAnswered}
            onPreviewSubmit={onPreviewAnswers}
          />
        </GateCard>
        {footer}
      </ThemedGate>
    );
  }

  return (
    <ThemedGate theme={request.theme} entityName={entity}>
      <GateCard className="text-center">
        <div className="mb-4 flex justify-center"><RoleChip role={request.requestedRole} /></div>
        {stage === "approved" ? (
          <>
            <h1 className="text-2xl font-bold">You're in.</h1>
            <p className="mt-2 text-sm text-muted-foreground">{entity ? `${entity}'s` : "Your"} locker is ready.</p>
            <Button
              className="mt-6 h-12 w-full rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90"
              disabled={!canEnter}
              onClick={onEnter}
            >
              {canEnter ? "Enter the locker" : <Loader2 className="h-4 w-4 animate-spin" />}
            </Button>
          </>
        ) : stage === "denied" ? (
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
              {onboardingSummary(request.onboarding)}
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={onEditAnswers}>Edit my answers</Button>
          </>
        )}
      </GateCard>
      {footer}
    </ThemedGate>
  );
}

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

  const stage: PendingStage =
    current.status === "denied" ? "denied" : !current.answered || editing ? "questions" : current.status === "approved" ? "approved" : "waiting";

  return (
    <PendingView
      request={current}
      stage={stage}
      canEnter={linked}
      onEnter={() => navigate("/portal", { replace: true })}
      onEditAnswers={() => setEditing(true)}
      onAnswered={() => {
        setEditing(false);
        if (current.status === "approved" && linked) navigate("/portal", { replace: true });
      }}
      footer={footer}
    />
  );
}
