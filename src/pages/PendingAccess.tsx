// Where a signed-in person without portal access lands.
//
// If they came through an invite link, this is the second half of that flow:
// the questionnaire first (answers go to AX with the request), then the wait.
// It polls, so the moment AX approves, the "Enter" button lights up without a
// refresh. Someone with no request at all gets the old "reach out to your rep".
//
// Someone AX already knows can skip the wait: "Have an access code?" takes the
// 8-character code AX gave them and lets them straight in with that role.
//
// The screens themselves live in <PendingView>, which the Test drive renders
// directly with a fake request so AX can see every state without an account.
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { GateCard, RoleChip, ThemedGate } from "@/components/portal/invite/ThemedGate";
import { OnboardingForm } from "@/components/portal/invite/OnboardingForm";
import { myRequestsKey, onboardingSummary, redeemAccessCode, useMyAccessRequests, type MyRequest, type OnboardingAnswers } from "@/lib/portal/invites";

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
  /** Instant access: resolves with an error message, or null when it worked. */
  onRedeemCode?: (code: string) => Promise<string | null>;
}

/** "Have an access code?" — collapsed by default, or open when it's the main way in. */
export function CodeEntry({ onRedeem, open: startOpen = false }: { onRedeem: (code: string) => Promise<string | null>; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const shown = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <KeyRound className="h-3.5 w-3.5" />Have an access code?
      </button>
    );
  }
  const submit = async () => {
    if (clean.length !== 8 || busy) return;
    setBusy(true);
    setError(null);
    const err = await onRedeem(clean).catch((e: Error) => e.message);
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <form className="mt-5 text-left" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground" htmlFor="ax-access-code">Access code</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="ax-access-code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX"
          value={shown} onChange={(e) => { setCode(e.target.value); setError(null); }}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-3 text-center font-mono text-lg font-bold tracking-[0.25em] outline-none focus:border-accent"
        />
        <Button type="submit" disabled={clean.length !== 8 || busy} className="h-11 rounded-xl bg-accent px-5 font-bold text-accent-foreground hover:bg-accent/90">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
        </Button>
      </div>
      <p className={`mt-1.5 text-xs ${error ? "text-red-400" : "text-muted-foreground"}`}>{error ?? "Got a code from your Athlete Xclusive contact? Enter it to get in right away."}</p>
    </form>
  );
}

/** Pure presentation — every state of the post-invite screen. */
export function PendingView({ request, stage, canEnter, onEnter, onEditAnswers, onAnswered, onPreviewAnswers, footer, onRedeemCode }: PendingViewProps) {
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
            {onRedeemCode && <CodeEntry onRedeem={onRedeemCode} />}
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
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  // A good code links them on the server; refresh their requests + session links and the screen moves on.
  const redeem = async (code: string): Promise<string | null> => {
    const r = await redeemAccessCode(code);
    if ("message" in r) return r.message;
    await qc.invalidateQueries({ queryKey: myRequestsKey });
    reload();
    return null;
  };

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
            Your account isn't connected to a locker yet. Enter the access code you were given, open the invite link you were sent, or reach out to your Athlete Xclusive rep.
          </p>
          <CodeEntry onRedeem={redeem} open />
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
      onRedeemCode={redeem}
      onAnswered={() => {
        setEditing(false);
        if (current.status === "approved" && linked) navigate("/portal", { replace: true });
      }}
      footer={footer}
    />
  );
}
