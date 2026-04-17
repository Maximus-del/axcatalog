import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "member" | null;

interface AuthState {
  session: Session | null;
  user: User | null;
  /** From user_profiles.role. Null until resolved or if no profile exists. */
  role: AppRole;
  /** Athletes this user is linked to via user_athlete_links. */
  linkedAthleteIds: string[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [linkedAthleteIds, setLinkedAthleteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Start true so consumers wait for profile resolution before routing.
  const [profileLoading, setProfileLoading] = useState(true);

  // CRITICAL ORDER: register the listener BEFORE getSession to avoid missing events.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setRole(null);
        setLinkedAthleteIds([]);
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

  // Resolve role + athlete links whenever the user changes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setRole(null);
      setLinkedAthleteIds([]);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    // Defer to avoid running inside the auth callback.
    setTimeout(async () => {
      const [profileRes, linksRes] = await Promise.all([
        supabase.from("user_profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.from("user_athlete_links").select("athlete_id").eq("user_id", userId),
      ]);

      if (cancelled) return;

      const resolvedRole = (profileRes.data?.role as AppRole) ?? null;
      setRole(resolvedRole);
      setLinkedAthleteIds((linksRes.data ?? []).map((r) => r.athlete_id));
      setProfileLoading(false);
    }, 0);

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      linkedAthleteIds,
      loading: loading || profileLoading,
      signOut,
    }),
    [session, role, linkedAthleteIds, loading, profileLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
