// Can this client actually sign in, where they've got to, and the tools to
// get them in.
//
// The portal was finished and unreachable. Nothing in the app could create a
// non-admin account, so every athlete's answer to "can they see it" was no, and
// nothing on screen said so. This states it plainly and fixes it in one click.
//
// PASSWORDS ARE SHOWN ONCE AND NEVER STORED. Keeping the one-time password
// readable "until they change it" would mean a live credential sitting where
// anyone with dashboard or database access could read it. Instead the card
// shows WHERE THEY ARE — waiting for first sign-in / signed in but still on the
// one-time password / set their own — and offers two things that cover every
// real case: copy the sign-in link again (no password, safe any time), or issue
// a new one-time password, which kills the old one.
import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, Link2, Loader2, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  PORTAL_ORIGIN,
  PORTAL_SIGN_IN_URL,
  handoffText,
  hasClientLogin,
  signInText,
  useClientAccess,
  useClientLoginStatus,
  useCreateClientLogin,
  useResetClientPassword,
  type ClientLoginStatus,
  type CreatedLogin,
  type LoginStage,
} from "@/lib/v2/client-access";
import { relativeTime } from "@/lib/v2/entity-overview";

interface Props {
  entityId: string;
  entityName: string;
}

const STAGE: Record<LoginStage, { label: string; tone: string }> = {
  waiting: { label: "Waiting for first sign-in", tone: "--ax-amber" },
  needs_password: { label: "Signed in — hasn't set their own password yet", tone: "--ax-amber" },
  active: { label: "Active — using their own password", tone: "--ax-accent" },
};

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
    return false;
  }
}

export default function ClientAccessCard({ entityId, entityName }: Props) {
  const { data: access, isLoading } = useClientAccess(entityId);
  const signedUp = hasClientLogin(access);
  const statusQ = useClientLoginStatus(entityId, signedUp);
  const create = useCreateClientLogin();
  const reset = useResetClientPassword();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<CreatedLogin | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Status comes from auth.users via the edge function; the profile email is
  // the fallback while it loads or if the function is older than this card.
  const status: ClientLoginStatus | null = statusQ.data?.[0] ?? null;
  const client = access?.clients[0] ?? null;
  const loginEmail = status?.email ?? client?.email ?? null;
  const loginUserId = status?.userId ?? client?.userId ?? null;

  const handoff = useMemo(
    () => (issued ? handoffText(entityName, issued.email, issued.tempPassword, PORTAL_ORIGIN) : ""),
    [issued, entityName],
  );

  async function copyHandoff() {
    if (await copy(handoff, "Copied — paste it to them")) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  function submit() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter their email address.");
      return;
    }
    create.mutate(
      { entityId, email: trimmed, fullName: entityName },
      {
        onSuccess: (res) => {
          setIssued(res);
          setOpen(false);
          setEmail("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function issueNewPassword() {
    if (!loginUserId) return;
    reset.mutate(
      { entityId, userId: loginUserId, email: loginEmail ?? "" },
      {
        onSuccess: (res) => {
          setIssued(res);
          setConfirmReset(false);
        },
        onError: (e) => {
          setConfirmReset(false);
          toast.error(e.message);
        },
      },
    );
  }

  if (isLoading) return null;

  const stage = status ? STAGE[status.stage] : null;
  const iconTone = signedUp ? (stage?.tone ?? "--ax-accent") : "--ax-amber";

  return (
    <div className="mb-6">
      <div className="ax-card flex flex-wrap items-center gap-3 px-3.5 py-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `hsl(var(${iconTone}) / 0.14)`, color: `hsl(var(${iconTone}))` }}
          aria-hidden
        >
          {signedUp ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">
            {signedUp ? (stage?.label ?? "Has a login") : "No login yet"}
          </div>
          <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
            {signedUp
              ? [
                  loginEmail ?? "Portal access is set up.",
                  status?.lastSignInAt ? `last signed in ${relativeTime(status.lastSignInAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : `${entityName} cannot open the portal until you create one.`}
          </div>
        </div>

        {!signedUp && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create login
          </button>
        )}

        {signedUp && loginEmail && (
          <button
            type="button"
            onClick={() => void copy(signInText(entityName, loginEmail), "Sign-in link copied")}
            className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
            title={PORTAL_SIGN_IN_URL}
          >
            <Link2 className="h-3.5 w-3.5" />
            Copy sign-in link
          </button>
        )}

        {signedUp && loginUserId && !confirmReset && (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Issue new password
          </button>
        )}
      </div>

      {confirmReset && (
        <div className="ax-card mt-1.5 flex flex-wrap items-center gap-2 px-3.5 py-3">
          <p className="min-w-0 flex-1 text-[12px] text-[hsl(var(--ax-secondary))]">
            Their current password stops working right away, and they'll set a new one on next sign-in.
          </p>
          <button
            type="button"
            disabled={reset.isPending}
            onClick={issueNewPassword}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-60"
          >
            {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Issue it
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(false)}
            className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
          >
            Cancel
          </button>
        </div>
      )}

      {open && (
        <div className="ax-card mt-1.5 px-3.5 py-3">
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">
            Their email address
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="name@example.com"
              className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
            />
            <button
              type="button"
              disabled={create.isPending}
              onClick={submit}
              className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-60"
            >
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">
            They get a one-time password and set their own on first sign-in. This account sees only their own
            portal. To test it yourself, use a plus-address of your own email (you+name@gmail.com) and sign in
            from an Incognito window.
          </p>
        </div>
      )}

      {issued && (
        <div className="ax-card mt-1.5 px-3.5 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">Send them this. The password is shown once.</div>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--ax-border))] bg-black/20 px-3 py-2 text-[12px] leading-relaxed text-[hsl(var(--ax-secondary))]">
                {handoff}
              </pre>
              <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-faint))]">
                Lost it? Close this and use Issue new password — that's the only way to see one again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIssued(null)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={copyHandoff}
            className="mt-2 flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy the message"}
          </button>
        </div>
      )}
    </div>
  );
}
