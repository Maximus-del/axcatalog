// Who gets into this client's locker, and how the public sees it.
//
//   Invite links  — copy the Owner link (C-level: sales, earnings, playbook)
//                   or the Team link (their gear, no money). The link carries
//                   the role; you still approve every person.
//   Requests      — name, email, their answers, the role they asked for, and
//                   a suggestion when the answers disagree with the link.
//                   Approve / approve as the other role / deny.
//   In the locker — everyone with access and their role, switchable.
//   Public locker — on/off, web address, headline. Retail only.
import { useState } from "react";
import { Car, Check, Copy, ExternalLink, Globe, Link2, Loader2, ShieldCheck, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useDriveEntity } from "@/components/test-drive/TestDriveBar";
import { DRIVE_ROLES, DRIVE_STAGES, driveHref } from "@/lib/portal/test-drive";
import { toast } from "sonner";
import { toneText } from "@/components/admin-v2/primitives";
import { inviteUrl, lockerUrl, onboardingSummary, type PortalRole } from "@/lib/portal/invites";
import {
  useDecideAccess,
  useEnsureInvite,
  usePortalAccess,
  useRevokeInvite,
  useSaveLocker,
  useSetMemberRole,
  type LockerSettings,
} from "@/lib/v2/portal-access";
import { relativeTime } from "@/lib/v2/entity-overview";

interface Props {
  entityId: string;
  entityName: string;
  organizationId: string | null;
}

const ROLE_COPY: Record<PortalRole, { label: string; sub: string }> = {
  owner: { label: "Owner link", sub: "C-level: sales, earnings, playbook, everything" },
  team: { label: "Team link", sub: "Coaches & staff: their gear and orders, no financials" },
};

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy — select it and copy by hand.");
  }
}

function Pill({ children, tone = "--ax-accent" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `hsl(var(${tone}) / 0.14)`, color: toneText(`var(${tone})`) }}>
      {children}
    </span>
  );
}

const btn = "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold";
const primary = `${btn} bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]`;
const ghost = `${btn} border border-[hsl(var(--ax-line))] hover:border-[hsl(var(--ax-accent)/0.5)]`;

export default function PortalInvitesCard({ entityId, entityName, organizationId }: Props) {
  const access = usePortalAccess(entityId);
  const driveEntity = useDriveEntity(entityId);
  const ensure = useEnsureInvite(entityId, organizationId);
  const revoke = useRevokeInvite(entityId);
  const decide = useDecideAccess(entityId);
  const setRole = useSetMemberRole(entityId);
  const saveLocker = useSaveLocker(entityId);
  const [locker, setLocker] = useState<LockerSettings | null>(null);
  const [showDecided, setShowDecided] = useState(false);

  if (access.isLoading) return null;
  if (access.error) {
    return <div className="ax-card mb-6 px-3.5 py-3 text-[12px] text-[hsl(var(--ax-faint))]">Invites couldn't load: {(access.error as Error).message}</div>;
  }
  const { invites, requests, members, locker: savedLocker } = access.data!;
  const form = locker ?? savedLocker;
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");
  const clientMembers = members.filter((m) => m.accountRole !== "admin");

  const copyInvite = async (role: PortalRole) => {
    try {
      const inv = await ensure.mutateAsync(role);
      // Links point at whichever deployment you are on — production in production, the preview while testing.
      await copyText(inviteUrl(inv.token, window.location.origin), `${ROLE_COPY[role].label} copied`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((e: Error) => toast.error(e.message));

  const liveUrl = savedLocker.enabled && savedLocker.slug ? lockerUrl(savedLocker.slug) : null;
  const previewUrl = savedLocker.slug ? lockerUrl(savedLocker.slug, window.location.origin) : null;

  return (
    <div className="ax-card mb-6 space-y-5 px-4 py-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "hsl(var(--ax-accent) / 0.14)", color: toneText("var(--ax-accent)") }}>
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Locker access</div>
          <div className="text-[12px] text-[hsl(var(--ax-faint))]">
            {pending.length ? `${pending.length} waiting for you` : `${clientMembers.length} ${clientMembers.length === 1 ? "person" : "people"} in ${entityName}'s locker`}
          </div>
        </div>
        {pending.length ? <Pill tone="--ax-amber">{pending.length} to review</Pill> : null}
      </div>

      {/* test drive: be the Owner, a coach, or a customer — no account, nothing saved */}
      <div className="rounded-xl border border-[hsl(var(--ax-line))] p-3">
        <div className="flex items-center gap-2">
          <Car className="h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
          <span className="text-[13px] font-semibold">Test drive</span>
          <span className="text-[12px] text-[hsl(var(--ax-faint))]">See exactly what they see. No account, nothing saved.</span>
        </div>
        <div className="mt-2.5 space-y-2">
          {DRIVE_ROLES.map((r) => (
            <div key={r.value} className="flex flex-wrap items-center gap-1.5">
              <span className="w-[76px] shrink-0 text-[12px] font-semibold" title={r.sub}>{r.label}</span>
              {DRIVE_STAGES[r.value].map((st, i) => (
                <Link
                  key={st.value}
                  to={driveHref(entityId, r.value, st.value, driveEntity.data?.lockerSlug ?? "")}
                  className={i === 0 ? primary : ghost}
                >
                  {i === 0 ? `Start: ${st.label}` : st.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* invite links */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(["owner", "team"] as PortalRole[]).map((r) => {
          const live = invites.find((i) => i.role === r && i.active);
          return (
            <div key={r} className="rounded-xl border border-[hsl(var(--ax-line))] p-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
                <span className="text-[13px] font-semibold">{ROLE_COPY[r].label}</span>
                {live ? <Pill>Live</Pill> : null}
              </div>
              <p className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">{ROLE_COPY[r].sub}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={ensure.isPending} onClick={() => void copyInvite(r)}>
                  {ensure.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy link
                </button>
                {live ? (
                  <button type="button" className={ghost} onClick={() => run(revoke.mutateAsync(live.id), "Link turned off — anyone holding it is locked out")}>
                    Turn off
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* requests */}
      {pending.length ? (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">Waiting for approval</div>
          {pending.map((r) => {
            const other: PortalRole = r.requestedRole === "owner" ? "team" : "owner";
            return (
              <div key={r.id} className="rounded-xl border border-[hsl(var(--ax-amber)/0.4)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">{r.fullName || r.email || "Unnamed"}</span>
                  <Pill tone={r.requestedRole === "owner" ? "--ax-accent" : "--ax-blue"}>asked for {r.requestedRole === "owner" ? "Owner" : "Team"}</Pill>
                  {r.suggested !== r.requestedRole ? <Pill tone="--ax-amber">answers say {r.suggested === "owner" ? "Owner" : "Team"}</Pill> : null}
                  <span className="ml-auto text-[11px] text-[hsl(var(--ax-faint))]">{relativeTime(r.createdAt)}</span>
                </div>
                <div className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">{r.email}</div>
                <div className="mt-1.5 text-[12px]">{onboardingSummary(r.onboarding)}</div>
                {r.onboarding?.notes ? <div className="mt-1 text-[12px] italic text-[hsl(var(--ax-faint))]">"{r.onboarding.notes}"</div> : null}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" className={primary} disabled={decide.isPending} onClick={() => run(decide.mutateAsync({ requestId: r.id, decision: "approve", role: r.requestedRole }), `${r.fullName ?? "They"} can sign in now`)}>
                    <Check className="h-3.5 w-3.5" /> Approve as {r.requestedRole === "owner" ? "Owner" : "Team"}
                  </button>
                  <button type="button" className={ghost} disabled={decide.isPending} onClick={() => run(decide.mutateAsync({ requestId: r.id, decision: "approve", role: other }), `Approved as ${other === "owner" ? "Owner" : "Team"}`)}>
                    Approve as {other === "owner" ? "Owner" : "Team"}
                  </button>
                  <button type="button" className={ghost} disabled={decide.isPending} onClick={() => run(decide.mutateAsync({ requestId: r.id, decision: "deny" }), "Request denied")}>
                    <X className="h-3.5 w-3.5" /> Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* members */}
      {clientMembers.length ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">In the locker</div>
          {clientMembers.map((m) => (
            <div key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg px-1 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
              <span className="text-[13px] font-medium">{m.fullName || m.email}</span>
              <span className="truncate text-[12px] text-[hsl(var(--ax-faint))]">{m.onboarding ? onboardingSummary(m.onboarding) : m.email}</span>
              <div className="ml-auto flex overflow-hidden rounded-full border border-[hsl(var(--ax-line))] text-[11px] font-semibold">
                {(["owner", "team"] as PortalRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={setRole.isPending}
                    onClick={() => m.role !== r && run(setRole.mutateAsync({ userId: m.userId, role: r }), `${m.fullName ?? "They"} is now ${r === "owner" ? "Owner" : "Team"}`)}
                    className={`px-2.5 py-1 ${m.role === r ? "bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]" : ""}`}
                  >
                    {r === "owner" ? "Owner" : "Team"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {decided.length ? (
        <button type="button" onClick={() => setShowDecided((v) => !v)} className="text-[12px] text-[hsl(var(--ax-faint))] underline">
          {showDecided ? "Hide" : "Show"} past requests ({decided.length})
        </button>
      ) : null}
      {showDecided ? (
        <div className="space-y-1 text-[12px] text-[hsl(var(--ax-faint))]">
          {decided.map((r) => (
            <div key={r.id}>
              {r.fullName || r.email} — {r.status === "approved" ? `approved as ${r.grantedRole === "owner" ? "Owner" : "Team"}` : "denied"}
            </div>
          ))}
        </div>
      ) : null}

      {/* public locker */}
      <div className="rounded-xl border border-[hsl(var(--ax-line))] p-3">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
          <span className="text-[13px] font-semibold">Public locker</span>
          {savedLocker.enabled ? <Pill>Open</Pill> : <Pill tone="--ax-faint">Off</Pill>}
          <label className="ml-auto flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setLocker({ ...form, enabled: e.target.checked })} />
            Open to the public
          </label>
        </div>
        <p className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">No login. Retail prices only, checkout with Apple Pay / Shop Pay through Shopify.</p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-[180px_1fr]">
          <label className="text-[12px]">
            <span className="mb-1 block text-[hsl(var(--ax-faint))]">Web address</span>
            <div className="flex items-center rounded-lg border border-[hsl(var(--ax-line))] bg-transparent px-2">
              <span className="text-[11px] text-[hsl(var(--ax-faint))]">/</span>
              <input value={form.slug} onChange={(e) => setLocker({ ...form, slug: e.target.value })} placeholder="proactive" className="w-full bg-transparent px-1 py-1.5 text-[13px] outline-none" />
            </div>
          </label>
          <label className="text-[12px]">
            <span className="mb-1 block text-[hsl(var(--ax-faint))]">Headline (optional)</span>
            <input value={form.headline} onChange={(e) => setLocker({ ...form, headline: e.target.value })} placeholder={entityName} className="w-full rounded-lg border border-[hsl(var(--ax-line))] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
          </label>
        </div>
        <label className="mt-2 block text-[12px]">
          <span className="mb-1 block text-[hsl(var(--ax-faint))]">Tagline (optional)</span>
          <input value={form.tagline} onChange={(e) => setLocker({ ...form, tagline: e.target.value })} className="w-full rounded-lg border border-[hsl(var(--ax-line))] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primary}
            disabled={saveLocker.isPending || !locker}
            onClick={() => run(saveLocker.mutateAsync(form).then(() => setLocker(null)), form.enabled ? "Locker is open" : "Locker saved")}
          >
            {saveLocker.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
          </button>
          {liveUrl ? (
            <button type="button" className={ghost} onClick={() => void copyText(liveUrl, "Locker link copied")}>
              <Copy className="h-3.5 w-3.5" /> {liveUrl.replace(/^https:\/\//, "")}
            </button>
          ) : null}
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noreferrer" className={ghost}>
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
