// /demo/:token — a no-sign-in, read-only walk-through of a client's portal.
//
// AX makes a demo link (portal_demo_links) to show a prospect or a partner
// the real portal. Opening it signs this browser into a dedicated demo
// account (edge function demo-session → one-time magic-link hash → session)
// and lands in the portal. The account is flagged ax_demo, so the portal is
// read-only: nothing can be ordered or changed. Deleting the demo account
// ends the link everywhere.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { GateCard, ThemedGate } from "@/components/portal/invite/ThemedGate";

export default function DemoLink() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: fnErr } = await supabase.functions.invoke("demo-session", { body: { token } });
      const hash = (data as { token_hash?: string } | null)?.token_hash;
      if (cancelled) return;
      if (fnErr || !hash) {
        setError((data as { error?: string } | null)?.error ?? "This demo link has ended.");
        return;
      }
      const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
      if (cancelled) return;
      if (vErr) {
        setError("This demo link couldn't open. Try it again.");
        return;
      }
      reload();
      navigate("/portal", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate, reload]);

  if (!error) return <LoadingScreen />;
  return (
    <ThemedGate>
      <GateCard className="text-center">
        <h1 className="text-xl font-bold">Demo unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </GateCard>
    </ThemedGate>
  );
}
