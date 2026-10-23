// /invite/:token — the link an operator sends.
//
// The link carries a role (Owner or Team) for one entity. Opening it lets the
// person create an account or sign in, then files an access request. Nothing
// is granted here: the request waits for an operator, and the person is sent
// to /pending-access, which runs the questionnaire and the wait.
import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { GateCard, RoleChip, ThemedGate } from "@/components/portal/invite/ThemedGate";
import { useQueryClient } from "@tanstack/react-query";
import { myRequestsKey, requestAccess, useInviteInfo } from "@/lib/portal/invites";

type Mode = "create" | "signin";

export default function PortalInvite() {
  const { token } = useParams<{ token: string }>();
  const { session, user, role, loading, reload } = useAuth();
  const info = useInviteInfo(token);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  if (loading || info.isLoading) return <LoadingScreen />;

  if (!info.data) {
    return (
      <ThemedGate>
        <GateCard className="text-center">
          <h1 className="text-xl font-bold">This link isn't active</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ask whoever sent it for a fresh one.</p>
          <Button asChild variant="outline" className="mt-6 w-full">
            <Link to="/login">Sign in instead</Link>
          </Button>
        </GateCard>
      </ThemedGate>
    );
  }

  const { entityName, role: linkRole, theme } = info.data;

  const file = async (fullName: string) => {
    const status = await requestAccess(token!, fullName);
    await qc.invalidateQueries({ queryKey: myRequestsKey });
    reload();
    if (status === "approved") navigate("/portal", { replace: true });
    else navigate("/pending-access", { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (session) {
        await file(name || (user?.user_metadata?.full_name as string) || "");
        return;
      }
      if (mode === "create") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/invite/${token}` },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await file(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(/already registered/i.test(msg) ? "That email already has an account — use Sign in." : msg);
      if (/already registered/i.test(msg)) setMode("signin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedGate theme={theme} entityName={entityName}>
      <GateCard>
        <div className="mb-5 space-y-3 text-center">
          <RoleChip role={linkRole} />
          <h1 className="text-2xl font-bold leading-tight">You're invited to {entityName}'s locker</h1>
          <p className="text-sm text-muted-foreground">
            {linkRole === "owner"
              ? "Full access: your gear, designs, orders, sales and earnings."
              : "Your team gear, in your size, ready to order."}
          </p>
        </div>

        {checkEmail ? (
          <div className="rounded-xl border border-border p-4 text-center text-sm">
            Check <b>{email}</b> for a confirmation link. It brings you right back here.
          </div>
        ) : role === "admin" ? (
          <div className="space-y-3 text-center text-sm text-muted-foreground">
            <p>You're signed in as AX staff — you don't need an invite.</p>
            <Button asChild className="w-full"><Link to="/admin-v2">Back to the dashboard</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!session ? (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-background/60 p-1 text-sm">
                {(["create", "signin"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-lg py-2 font-semibold ${mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                  >
                    {m === "create" ? "Create account" : "I have an account"}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">Signed in as {user?.email}</p>
            )}

            {(session || mode === "create") && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-11 bg-background/60" />
              </div>
            )}
            {!session && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-11 bg-background/60" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "create" ? "new-password" : "current-password"}
                    className="h-11 bg-background/60"
                  />
                </div>
              </>
            )}

            <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : session ? "Request access" : mode === "create" ? "Create account" : "Sign in & request access"}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">AX approves every request — usually same day.</p>
          </form>
        )}
      </GateCard>
    </ThemedGate>
  );
}
