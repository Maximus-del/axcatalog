// Can this client actually sign in, and a way to give them a login.
//
// The portal was finished and unreachable. Nothing in the app could create a
// non-admin account, so every athlete's answer to "can they see it" was no, and
// nothing on screen said so. This states it plainly and fixes it in one click.
//
// The temporary password is shown ONCE. It is not stored anywhere we can read
// back — a second look means issuing a new one — so the panel holds it until
// the operator dismisses it rather than closing itself on success.
import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  handoffText,
  hasClientLogin,
  useClientAccess,
  useCreateClientLogin,
  type CreatedLogin,
} from "@/lib/v2/client-access";

interface Props {
  entityId: string;
  entityName: string;
}

export default function ClientAccessCard({ entityId, entityName }: Props) {
  const { data: access, isLoading } = useClientAccess(entityId);
  const create = useCreateClientLogin();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<CreatedLogin | null>(null);
  const [copied, setCopied] = useState(false);

  const signedUp = hasClientLogin(access);
  const client = access?.clients[0] ?? null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const handoff = useMemo(
    () => (issued ? handoffText(entityName, issued.email, issued.tempPassword, origin) : ""),
    [issued, entityName, origin],
  );

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(handoff);
      setCopied(true);
      toast.success("Copied — paste it to them");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
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

  if (isLoading) return null;

  return (
    <div className="mb-6">
      <div className="ax-card flex flex-wrap items-center gap-3 px-3.5 py-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: signedUp ? "hsl(var(--ax-accent) / 0.14)" : "hsl(var(--ax-amber) / 0.14)",
            color: signedUp ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))",
          }}
          aria-hidden
        >
          {signedUp ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">
            {signedUp ? "Can sign in" : "No login yet"}
          </div>
          <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
            {signedUp
              ? client?.email ?? "Portal access is set up."
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
      </div>

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
            They get a one-time password and set their own on first sign-in. This account sees only
            their own portal.
          </p>
        </div>
      )}

      {issued && (
        <div className="ax-card mt-1.5 px-3.5 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">Send them this. It is shown once.</div>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--ax-border))] bg-black/20 px-3 py-2 text-[12px] leading-relaxed text-[hsl(var(--ax-secondary))]">
                {handoff}
              </pre>
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
