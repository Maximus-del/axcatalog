// /test-drive/:entityId?role=owner|team&stage=invite|questions|waiting|approved
//
// The real invite and onboarding screens, fed a fake request, for AX to walk
// through as an Owner or Team invitee. Nothing is written: Continue moves to
// the next step, answers live in this tab only (sessionStorage), and
// "Enter the locker" opens the real portal in View-as for that role.
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { TestDriveBar, useDriveEntity } from "@/components/test-drive/TestDriveBar";
import PortalInvite from "./PortalInvite";
import { PendingView } from "./PendingAccess";
import { parseOnboarding, type MyRequest, type OnboardingAnswers } from "@/lib/portal/invites";
import { driveHref, stageFor, type DriveRole, type DriveStage } from "@/lib/portal/test-drive";

const answersKey = (entityId: string, role: DriveRole) => `ax.testdrive.${entityId}.${role}`;

function loadAnswers(entityId: string, role: DriveRole): OnboardingAnswers | null {
  try {
    return parseOnboarding(JSON.parse(sessionStorage.getItem(answersKey(entityId, role)) ?? "null"));
  } catch {
    return null;
  }
}

export default function TestDrive() {
  const { entityId = "" } = useParams<{ entityId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role: DriveRole = params.get("role") === "team" ? "team" : params.get("role") === "customer" ? "customer" : "owner";
  const stage = stageFor(role, params.get("stage"));
  const entity = useDriveEntity(entityId);
  const [answers, setAnswers] = useState<OnboardingAnswers | null>(() => loadAnswers(entityId, role));

  // Switching role swaps to that role's answers.
  useEffect(() => setAnswers(loadAnswers(entityId, role)), [entityId, role]);

  const go = (s: DriveStage) => navigate(driveHref(entityId, role, s, entity.data?.lockerSlug ?? ""));

  const request: MyRequest | null = useMemo(
    () =>
      entity.data
        ? {
            id: "test-drive",
            athleteId: entityId,
            entityName: entity.data.name,
            theme: entity.data.theme,
            status: stage === "approved" ? "approved" : "pending",
            requestedRole: role === "team" ? "team" : "owner",
            onboarding: answers,
            answered: Boolean(answers),
          }
        : null,
    [entity.data, entityId, stage, role, answers],
  );

  if (entity.isLoading) return <LoadingScreen />;
  if (!entity.data || !request) return <Navigate to="/admin-v2/people" replace />;
  // The customer has no invite flow — straight to the locker.
  if (role === "customer") return <Navigate to={driveHref(entityId, "customer", "locker", entity.data.lockerSlug)} replace />;

  const bar = <TestDriveBar entityId={entityId} role={role} stage={stage} />;

  if (stage === "invite") {
    return (
      <>
        {bar}
        <PortalInvite
          preview={{
            info: { role: request.requestedRole, entityName: entity.data.name, theme: entity.data.theme },
            onContinue: () => go("questions"),
          }}
        />
      </>
    );
  }

  return (
    <>
      {bar}
      <PendingView
        request={request}
        stage={stage === "questions" ? "questions" : stage === "approved" ? "approved" : "waiting"}
        canEnter
        onEnter={() => go("portal")}
        onEditAnswers={() => go("questions")}
        onPreviewAnswers={(a) => {
          setAnswers(a);
          try {
            sessionStorage.setItem(answersKey(entityId, role), JSON.stringify(a));
          } catch {
            /* private mode — answers just won't survive a reload */
          }
        }}
        onAnswered={() => go("waiting")}
        // Test drive: any 8-character code shows the instant-access path (nothing is redeemed).
        onRedeemCode={async (code) => (code.length === 8 ? (go("approved"), null) : "Codes are 8 letters and numbers.")}
      />
    </>
  );
}
