import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { LoadingScreen } from "@/components/brand/LoadingScreen";

export default function AffiliateSignup() {
  const { session, loading: authLoading } = useAuth();
  const { affiliate, loading: affLoading, refetch } = useMyAffiliate();
  const navigate = useNavigate();

  // Signup form (when no auth session)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading || affLoading) return <LoadingScreen />;
  if (affiliate) return <Navigate to="/affiliate" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // 1. Sign up if no session
      if (!session) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/affiliate` },
        });
        if (error) throw error;
        // If email confirmation is required there will be no session yet.
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (!newSession) {
          toast({ title: "Check your email", description: "Confirm your address to finish signup." });
          setSubmitting(false);
          return;
        }
      }
      // 2. Create affiliate row via SECURITY DEFINER function
      const { error: rpcError } = await supabase.rpc("affiliate_signup", {
        _display_name: displayName || email.split("@")[0],
        _email: email || session?.user?.email || null,
        _payout_notes: payoutNotes || null,
      });
      if (rpcError) throw rpcError;
      await refetch();
      toast({ title: "Application submitted", description: "An admin will approve your account shortly." });
      navigate("/affiliate", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      toast({ title: "Signup failed", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Wordmark size="lg" />
        </div>

        <div className="ax-card p-8">
          <h1 className="ax-section-header mb-1">Become an affiliate</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Earn 20% commission on every sale made with your unique discount code.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!session && (
              <>
                <div className="space-y-2">
                  <Label className="ax-label">Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="ax-label">Password</Label>
                  <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label className="ax-label">Display name</Label>
              <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Jordan Banks" className="h-11" />
              <p className="text-xs text-muted-foreground">Used to generate your unique code.</p>
            </div>
            <div className="space-y-2">
              <Label className="ax-label">How should we pay you?</Label>
              <Textarea value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} placeholder="Venmo @handle, PayPal email, etc." rows={3} />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider rounded-lg"
            >
              {submitting ? "Submitting…" : "Apply"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}