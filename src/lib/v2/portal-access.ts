// Operator side of portal invites: the Owner/Team links, the approval queue,
// who's in (and as what), and the public locker switch.
//
// Every write either goes through a security-definer RPC that checks
// current_user_is_operator() (decide, set role) or through tables whose RLS is
// operator-only (portal_invites). The athlete metadata write follows
// useSavePortalTheme: read-merge-write with .select() so an RLS miss is loud.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanLockerSlug,
  parseOnboarding,
  suggestedRole,
  type OnboardingAnswers,
  type PortalRole,
} from "@/lib/portal/invites";
import { must, t, type Row } from "./db";

export interface Invite {
  id: string;
  role: PortalRole;
  token: string;
  active: boolean;
  createdAt: string;
}

export interface AccessRequest {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  requestedRole: PortalRole;
  grantedRole: PortalRole | null;
  status: "pending" | "approved" | "denied";
  onboarding: OnboardingAnswers | null;
  suggested: PortalRole;
  createdAt: string;
}

export interface Member {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: PortalRole;
  /** user_profiles.role — 'admin' rows are AX staff linked for testing. */
  accountRole: string | null;
  onboarding: OnboardingAnswers | null;
}

export interface LockerSettings {
  enabled: boolean;
  slug: string;
  headline: string;
  tagline: string;
}

const key = (entityId: string) => ["v2", "portal-access", entityId];
const role = (v: unknown): PortalRole => (v === "owner" ? "owner" : "team");

/** Pure: rows → requests, newest pending first. Exported for tests. */
export function toRequests(rows: Row[]): AccessRequest[] {
  const order = { pending: 0, approved: 1, denied: 2 } as const;
  return rows
    .map((r) => {
      const onboarding = parseOnboarding(r.onboarding);
      const requestedRole = role(r.requested_role);
      const status = r.status === "approved" || r.status === "denied" ? r.status : "pending";
      return {
        id: String(r.id),
        userId: String(r.user_id),
        fullName: typeof r.full_name === "string" ? r.full_name : null,
        email: typeof r.email === "string" ? r.email : null,
        requestedRole,
        grantedRole: r.granted_role == null ? null : role(r.granted_role),
        status,
        onboarding,
        suggested: suggestedRole(onboarding, requestedRole),
        createdAt: String(r.created_at ?? ""),
      } satisfies AccessRequest;
    })
    .sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
}

export function usePortalAccess(entityId: string) {
  return useQuery({
    queryKey: key(entityId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [inv, req, links, meta] = await Promise.all([
        t("portal_invites").select("id, role, token, active, created_at").eq("athlete_id", entityId).order("created_at", { ascending: false }),
        t("portal_access_requests")
          .select("id, user_id, full_name, email, requested_role, granted_role, status, onboarding, created_at")
          .eq("athlete_id", entityId),
        t("user_athlete_links").select("user_id, portal_role").eq("athlete_id", entityId),
        t("athletes").select("metadata").eq("id", entityId).maybeSingle(),
      ]);
      for (const r of [inv, req, links, meta]) if (r.error) throw new Error(r.error.message);

      const invites: Invite[] = ((inv.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        role: role(r.role),
        token: String(r.token),
        active: r.active === true,
        createdAt: String(r.created_at ?? ""),
      }));
      const requests = toRequests((req.data ?? []) as Row[]);

      const linkRows = (links.data ?? []) as Row[];
      const ids = linkRows.map((l) => String(l.user_id));
      let profiles: Row[] = [];
      if (ids.length) {
        const p = await t("user_profiles").select("id, full_name, email, role").in("id", ids);
        if (p.error) throw new Error(p.error.message);
        profiles = (p.data ?? []) as Row[];
      }
      const byId = new Map(profiles.map((p) => [String(p.id), p]));
      const answers = new Map(requests.map((r) => [r.userId, r.onboarding]));
      const members: Member[] = linkRows.map((l) => {
        const p = byId.get(String(l.user_id));
        return {
          userId: String(l.user_id),
          fullName: typeof p?.full_name === "string" ? p.full_name : null,
          email: typeof p?.email === "string" ? p.email : null,
          role: role(l.portal_role),
          accountRole: typeof p?.role === "string" ? p.role : null,
          onboarding: answers.get(String(l.user_id)) ?? null,
        };
      });

      const m = ((meta.data as Row | null)?.metadata ?? {}) as Row;
      const pl = (m.public_locker ?? {}) as Row;
      const locker: LockerSettings = {
        enabled: pl.enabled === true,
        slug: typeof pl.slug === "string" ? pl.slug : "",
        headline: typeof pl.headline === "string" ? pl.headline : "",
        tagline: typeof pl.tagline === "string" ? pl.tagline : "",
      };
      return { invites, requests, members, locker };
    },
  });
}

/** One active link per role: reuse it if it exists, otherwise mint it. */
export function useEnsureInvite(entityId: string, organizationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: PortalRole): Promise<Invite> => {
      const existing = await t("portal_invites").select("id, role, token, active, created_at").eq("athlete_id", entityId).eq("role", r).eq("active", true).limit(1);
      if (existing.error) throw new Error(existing.error.message);
      const row = ((existing.data ?? []) as Row[])[0];
      if (row) return { id: String(row.id), role: r, token: String(row.token), active: true, createdAt: String(row.created_at) };
      if (!organizationId) throw new Error("This entity has no organization yet.");
      const res = await must(
        t("portal_invites").insert({ athlete_id: entityId, organization_id: organizationId, role: r } as never).select("id, role, token, active, created_at").single(),
      );
      const d = res.data as Row;
      return { id: String(d.id), role: r, token: String(d.token), active: true, createdAt: String(d.created_at) };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(entityId) }),
  });
}

/** Kill a link (it stops working at once) — a new one is minted next time it's copied. */
export function useRevokeInvite(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await must(t("portal_invites").update({ active: false } as never).eq("id", inviteId).select("id"));
      if (!(res.data as Row[] | null)?.length) throw new Error("Couldn't turn that link off.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(entityId) }),
  });
}

export function useDecideAccess(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { requestId: string; decision: "approve" | "deny"; role?: PortalRole }) => {
      const { error } = await supabase.rpc("portal_decide_access" as never, { _request_id: v.requestId, _decision: v.decision, _role: v.role ?? null } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(entityId) });
      qc.invalidateQueries({ queryKey: ["v2", "client-access", entityId] });
    },
  });
}

export function useSetMemberRole(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { userId: string; role: PortalRole }) => {
      const { error } = await supabase.rpc("portal_set_link_role" as never, { _user_id: v.userId, _athlete_id: entityId, _role: v.role } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(entityId) }),
  });
}

export function useSaveLocker(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: LockerSettings) => {
      const slug = cleanLockerSlug(s.slug);
      if (s.enabled && !slug) throw new Error("Pick a short web address (letters, numbers, dashes).");
      if (slug) {
        // One locker per address.
        const clash = await t("athletes").select("id").neq("id", entityId).filter("metadata->public_locker->>slug", "eq", slug).limit(1);
        if (clash.error) throw new Error(clash.error.message);
        if ((clash.data as Row[] | null)?.length) throw new Error(`"${slug}" is already another locker's address.`);
      }
      const current = await t("athletes").select("metadata").eq("id", entityId).maybeSingle();
      if (current.error) throw new Error(current.error.message);
      const base = (((current.data as Row | null)?.metadata ?? {}) as Row) || {};
      const next = {
        ...base,
        public_locker: { enabled: s.enabled, slug: slug ?? "", headline: s.headline.trim().slice(0, 60), tagline: s.tagline.trim().slice(0, 140) },
      };
      const res = await t("athletes").update({ metadata: next } as never).eq("id", entityId).select("id");
      if (res.error) throw new Error(res.error.message);
      if (!(res.data as Row[] | null)?.length) throw new Error("Not saved — you may not have access to edit this entity.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(entityId) }),
  });
}
