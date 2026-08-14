// Fan profile & settings: display name, quick stats, sign out.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollows } from "@/hooks/useFan";

export default function FanProfile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { rows } = useFollows();
  const [displayName, setDisplayName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("fan_profiles" as never)
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setDisplayName(((data as { display_name?: string } | null)?.display_name) ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("fan_profiles" as never)
        .update({ display_name: displayName.trim() || null } as never)
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const subs = rows.filter((r) => r.state === "subscriber" || r.state === "vip").length;
  const following = rows.filter((r) => r.state !== "blocked" && r.state !== "former").length;

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center gap-3">
        <span className="h-14 w-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
          <User className="h-7 w-7 text-accent" />
        </span>
        <div className="min-w-0">
          <div className="font-black text-lg truncate">{displayName || "Goat Farm Access"}</div>
          <div className="text-[13px] text-muted-foreground truncate">{user?.email}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-2xl font-black text-accent">{following}</div>
          <div className="ax-label mt-1">Following</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-2xl font-black text-accent">{subs}</div>
          <div className="ax-label mt-1">Access</div>
        </div>
      </div>

      <div>
        <label className="ax-label block mb-1.5">Display name</label>
        <div className="flex gap-2">
          <input
            className="portal-input flex-1"
            value={displayName}
            disabled={!loaded}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="h-11 px-4 rounded-xl bg-accent text-accent-foreground font-bold text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>

      <button
        onClick={async () => {
          await signOut();
          navigate("/join", { replace: true });
        }}
        className="w-full h-11 rounded-xl border border-border text-muted-foreground hover:text-foreground font-semibold text-sm flex items-center justify-center gap-2"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
