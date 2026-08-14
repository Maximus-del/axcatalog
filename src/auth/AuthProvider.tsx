import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "member" | null;

export interface OrgRole {
  organizationId: string;
  role: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  /** From user_profiles.role. Null until resolved or if no profile exists. */
  role: AppRole;
  /** Athletes this user is linked to via user_athlete_links. */
  linkedAthleteIds: string[];
  /** True when user_profiles.is_platform_admin is set. */
  isPlatformAdmin: boolean;
  /** Org memberships (organization_id + role) from organization_memberships. */
  orgRoles: OrgRole[];
  /** True when the user has a Goat Farm Access (fan) profile. */
  hasFanProfile: boolean;
  loading: boolean;
  /** Re-resolve profile/links/memberships/fan state for the current user. */
  reload: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [linkedAthleteIds, setLinkedAthleteIds] = useState<string[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [orgRoles, setOrgRoles] = useState<OrgRole[]>([]);
  const [hasFanProfile, setHasFanProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  // Start true so consumers wait for profile resolution before routing.
  const [profileLoading, setProfileLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // CRITICAL ORDER: register the listener BEFORE getSession to avoid missing events.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setRole(null);
        setLinkedAthleteIds([]);
        setIsPlatformAdmin(false);
        setOrgRoles([]);
        setHasFanProfile(false);
        setProfileLoading(false);
      } else {
        // New session arrived — profile must be re-resolved before routing.
        setProfileLoading(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (!data.session) setProfileLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Resolve role + links + memberships + fan profile whenever the user changes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setRole(null);
      setLinkedAthleteIds([]);
      setIsPlatformAdmin(false);
      setOrgRoles([]);
      setHasFanProfile(false);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    // Defer to avoid running inside the auth callback.
    setTimeout(async () => {
      const [profileRes, linksRes, membershipsRes, fanRes] = await Promise.all([
        supabase.from("user_profiles").select("role, is_platform_admin").eq("id", userId).maybeSingle(),
        supabase.from("user_athlete_links").select("athlete_id").eq("user_id", userId),
        supabase
          .from("organization_memberships" as never)
          .select("organization_id, role")
          .eq("user_id", userId)
          .eq("status", "active"),
        supabase.from("fan_profiles" as never).select("id").eq("id", userId).maybeSingle(),
      ]);

      if (cancelled) return;

      const resolvedRole = (profileRes.data?.role as AppRole) ?? null;
      setRole(resolvedRole);
      setIsPlatformAdmin(Boolean((profileRes.data as { is_platform_admin?: boolean } | null)?.is_platform_admin));
      setLinkedAthleteIds((linksRes.data ?? []).map((r) => r.athlete_id));
      setOrgRoles(
        ((membershipsRes.data ?? []) as unknown as { organization_id: string; role: string }[]).map((m) => ({
          organizationId: m.organization_id,
          role: m.role,
        })),
      );
      setHasFanProfile(Boolean((fanRes.data as { id?: string } | null)?.id));
      setProfileLoading(false);
    }, 0);

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, reloadNonce]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      linkedAthleteIds,
      isPlatformAdmin,
      orgRoles,
      hasFanProfile,
      loading: loading || profileLoading,
      reload,
      signOut,
    }),
    [session, role, linkedAthleteIds, isPlatformAdmin, orgRoles, hasFanProfile, loading, profileLoading, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
