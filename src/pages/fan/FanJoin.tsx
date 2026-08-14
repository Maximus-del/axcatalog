// Goat Farm Access onboarding. Two paths:
//  - already signed in (e.g. an athlete/admin adding fan access): just create
//    a fan_profile row and go to the feed.
//  - not signed in: create an account, then the fan_profile.
// No payment. Following is free.
import { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { LoadingScreen } from "@/components/brand/LoadingScreen";

export default function FanJoin() {
  const { session, user, hasFanProfile, loading, reload } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentConfirm, setSentConfirm] = useState(false);

  if (loading) return <LoadingScreen />;
  // Already a fan → straight to the feed.
  if (session && hasFanProfile) return <Navigate to="/feed" replace />;

  async function createFanProfile(userId: string, name: string) {
    const { error } = await supabase
      .from("fan_profiles" as never)
      .upsert({ id: userId, display_name: name || null } as never, { onConflict: "id" });
    if (error) throw error;
  }

  async function handleSignedIn(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await createFanProfile(user.id, displayName.trim());
      reload();
      toast.success("Goat Farm Access is live");
      navigate("/welcome", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create your access");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/feed` },
      });
      if (error) throw error;
      // If email confirmation is required, there is no session yet.
      if (data.session && data.user) {
        await createFanProfile(data.user.id, displayName.trim());
        reload();
        toast.success("Welcome to Goat Farm Access");
        navigate("/welcome", { replace: true });
      } else {
        setSentConfirm(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 flex items-center px-4 sm:px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center text-accent-foreground font-black text-sm">G</span>
          <span className="font-black tracking-tight text-[15px]">GOAT FARM <span className="text-accent">ACCESS</span></span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-5 h-12 w-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Star className="h-6 w-6 text-accent" />
          </div>
          <h1 className="text-2xl font-black text-center tracking-tight">
            {session ? "Turn on Goat Farm Access" : "Follow your athletes"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-2 mb-7">
            One account. Follow every athlete you love, see their drops first, and unlock exclusive access — all in one feed.
          </p>

          {sentConfirm ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-sm">Check your email to confirm your account, then come back and sign in.</p>
              <Link to="/login" className="mt-4 inline-block text-accent font-semibold text-sm">Go to sign in</Link>
            </div>
          ) : session ? (
            <form onSubmit={handleSignedIn} className="space-y-3">
              <input
                className="portal-input w-full"
                placeholder="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Start following athletes
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3">
              <input
                className="portal-input w-full"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <input
                type="email"
                required
                className="portal-input w-full"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={6}
                className="portal-input w-full"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Goat Farm Access
              </button>
              <p className="text-center text-[13px] text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-accent font-semibold">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
