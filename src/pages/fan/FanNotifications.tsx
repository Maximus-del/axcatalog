// Notifications — a projection of the shared feed-engine event stream, filtered
// by per-athlete preferences. Marks itself seen on open (clears the bell badge).
// BACKEND: a real notifications table + server fan-out replaces this later.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ShoppingBag, Calendar, Sparkles, Ticket, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFanEvents } from "@/hooks/useFanEvents";
import { athleteName } from "@/lib/ecosystem/types";
import type { NotifItem } from "@/lib/ecosystem/feed-engine";
import { agoLabel } from "@/lib/ecosystem/demo-content";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/fan/ui/EmptyState";
import { cn } from "@/lib/utils";

type Cat = NotifItem["cat"];
const CATS: Cat[] = ["drops", "camps", "content", "events"];
const CAT_ICON: Record<Cat, LucideIcon> = { drops: ShoppingBag, camps: Calendar, content: Sparkles, events: Ticket };
type Prefs = Record<string, Partial<Record<Cat, boolean>>>;

export default function FanNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { notifications, followed } = useFanEvents();

  const [fullPrefs, setFullPrefs] = useState<Record<string, unknown>>({});
  const [prefs, setPrefs] = useState<Prefs>({});
  const [prefsOpen, setPrefsOpen] = useState(false);
  const seenThreshold = useRef<number>(0); // hours-ago cutoff captured at mount

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("fan_profiles" as never).select("preferences").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      const p = ((data as { preferences?: Record<string, unknown> } | null)?.preferences) ?? {};
      setFullPrefs(p);
      setPrefs((p.notif as Prefs) ?? {});
      const iso = p.notif_seen as string | undefined;
      seenThreshold.current = iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000) : 24 * 30;
      // Mark seen now so the bell badge clears.
      await supabase.from("fan_profiles" as never).update({ preferences: { ...p, notif_seen: new Date().toISOString() } } as never).eq("id", user.id);
      qc.invalidateQueries({ queryKey: ["notif-seen", user.id] });
    })();
    return () => { cancelled = true; };
  }, [user, qc]);

  const enabled = useCallback((athleteId: string, cat: Cat) => prefs[athleteId]?.[cat] ?? true, [prefs]);

  async function toggle(athleteId: string, cat: Cat) {
    const next: Prefs = { ...prefs, [athleteId]: { ...prefs[athleteId], [cat]: !enabled(athleteId, cat) } };
    setPrefs(next);
    if (user) await supabase.from("fan_profiles" as never).update({ preferences: { ...fullPrefs, notif: next } } as never).eq("id", user.id);
  }

  const visible = useMemo(() => notifications.filter((n) => enabled(n.athleteId, n.cat)), [notifications, enabled]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight">Notifications</h1>
        {followed.length > 0 && (
          <button onClick={() => setPrefsOpen(true)} className="h-9 px-3 rounded-lg border border-border text-[13px] font-semibold inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="h-4 w-4" /> Preferences
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" body="Follow athletes to get drops, camps, and content alerts here." ctaLabel="Discover Athletes" ctaTo="/feed/discover" />
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => {
            const Icon = CAT_ICON[n.cat];
            const isNew = n.offsetHours <= seenThreshold.current;
            return (
              <li key={n.id}>
                <button onClick={() => navigate(n.to)} className="w-full text-left flex items-start gap-3 rounded-xl border border-border bg-card p-3 hover:border-accent/40 transition-colors">
                  <span className="h-9 w-9 rounded-lg bg-accent/12 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">{n.title}</div>
                    <div className="text-[12px] text-muted-foreground truncate">{n.sub} · {agoLabel(n.offsetHours)}</div>
                  </div>
                  {isNew && <span className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" aria-label="new" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={prefsOpen} onOpenChange={setPrefsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[85vh] overflow-y-auto">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left"><SheetTitle>Notification preferences</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            {followed.map((a) => (
              <div key={a.id}>
                <div className="font-semibold text-sm mb-2">{athleteName(a)}</div>
                <div className="flex flex-wrap gap-2">
                  {CATS.map((c) => {
                    const on = enabled(a.id, c);
                    return (
                      <button key={c} onClick={() => toggle(a.id, c)} className={cn("h-8 px-3 rounded-full text-[12px] font-semibold border capitalize transition-colors", on ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground")}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
