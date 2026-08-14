// You — the fan's Goat Farm account hub. Stats + sections; account editing
// lives behind Settings rather than dominating the page.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  User, Star, Sparkles, Bookmark, Calendar, ShoppingBag, Bell, Settings as SettingsIcon,
  LogOut, ChevronRight, Loader2, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollows } from "@/hooks/useFan";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

export default function FanProfile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { rows } = useFollows();
  const [displayName, setDisplayName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("fan_profiles" as never).select("display_name").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setDisplayName(((data as { display_name?: string } | null)?.display_name) ?? "");
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const following = rows.filter((r) => r.state !== "blocked" && r.state !== "former").length;
  const access = rows.filter((r) => r.state === "subscriber" || r.state === "vip").length;

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("fan_profiles" as never).update({ display_name: displayName.trim() || null } as never).eq("id", user.id);
      if (error) throw error;
      toast.success("Saved");
      setSettingsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const stats = [
    { v: following, l: "Following" },
    { v: access, l: "Access" },
    { v: 0, l: "Saved" },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="h-14 w-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
          <User className="h-7 w-7 text-accent" />
        </span>
        <div className="min-w-0">
          <div className="font-black text-lg truncate">{displayName || "Goat Farm Access"}</div>
          <div className="text-[13px] text-muted-foreground truncate">{user?.email}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border border-border bg-card py-3.5 text-center">
            <div className="text-2xl font-black text-accent">{s.v}</div>
            <div className="ax-label mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        <RowLink icon={Star} label="Your Athletes" to="/feed/following" />
        <RowLink icon={Sparkles} label="Memberships" to="/feed/access" />
        <RowLink icon={Bookmark} label="Saved" to="/feed/saved" />
        <RowLink icon={Calendar} label="Camps & Events" to="/feed/camps" />
        <RowLink icon={Bell} label="Notifications" to="/feed/notifications" />
        <RowSoon icon={ShoppingBag} label="Orders" />
        <RowButton icon={SettingsIcon} label="Account & Settings" onClick={() => setSettingsOpen(true)} />
      </div>

      <button
        onClick={async () => { await signOut(); navigate("/join", { replace: true }); }}
        className="w-full h-11 rounded-xl border border-border text-muted-foreground hover:text-foreground font-semibold text-sm flex items-center justify-center gap-2"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>

      {/* Settings sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left">
            <SheetTitle>Account & Settings</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <label className="ax-label block mb-1.5">Display name</label>
              <input
                className="portal-input w-full"
                value={displayName}
                disabled={!loaded}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="text-[13px] text-muted-foreground">{user?.email}</div>
            <button
              onClick={save}
              disabled={saving || !loaded}
              className="w-full h-11 rounded-xl bg-accent text-accent-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RowLink({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 h-14 hover:bg-white/[0.03] transition-colors">
      <Icon className="h-5 w-5 text-accent" />
      <span className="flex-1 font-semibold text-sm">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
function RowButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 h-14 hover:bg-white/[0.03] transition-colors text-left">
      <Icon className="h-5 w-5 text-accent" />
      <span className="flex-1 font-semibold text-sm">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
function RowSoon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 h-14 opacity-60">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="flex-1 font-semibold text-sm">{label}</span>
      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground bg-white/8 px-2 py-0.5 rounded-full">Soon</span>
    </div>
  );
}
