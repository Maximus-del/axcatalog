// Operator Events tab: create camps/events (shared events object) → appear in
// Goat Farm Access for followers, with Access early-registration windows.
import { useState } from "react";
import { Plus, Loader2, MapPin, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useOperatorEvents } from "@/hooks/useContent";
import { createEvent, type EventInput } from "@/lib/ecosystem/content";
import { useAuth } from "@/auth/AuthProvider";

const EVENT_TYPES = ["camp", "meet_greet", "signing", "watch_party", "merch_launch", "training", "charity", "livestream", "qa"];
const STATUSES = ["draft", "announced", "registration_open", "completed", "cancelled"];

export function AthleteEventsTab({ athleteId, organizationId, athleteName }: { athleteId: string; organizationId: string; athleteName: string }) {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useOperatorEvents(athleteId);
  const [composing, setComposing] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["op-events", athleteId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Camps & Events</h3>
        <button onClick={() => setComposing(true)} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-semibold text-[13px] inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New Event
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>
      ) : events.length === 0 ? (
        <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">No events yet. Create a camp or event — it appears in Goat Farm Access.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {events.map((e) => (
            <div key={e.id} className="ax-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">{e.type.replace("_", " ")}</span>
                <span className="text-[11px] text-[hsl(var(--ax-faint))] capitalize">{e.status.replace("_", " ")}</span>
              </div>
              <div className="font-bold mt-1">{e.name}</div>
              <div className="mt-1.5 space-y-0.5 text-[12px] text-[hsl(var(--ax-secondary))]">
                {e.city && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {e.city}</div>}
                {e.event_date && <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {new Date(e.event_date).toLocaleDateString()}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {composing && (
        <EventComposer athleteId={athleteId} organizationId={organizationId} athleteName={athleteName} onClose={() => setComposing(false)} onSaved={() => { setComposing(false); refresh(); }} />
      )}
    </div>
  );
}

function EventComposer({ athleteId, organizationId, athleteName, onClose, onSaved }: { athleteId: string; organizationId: string; athleteName: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState({ type: "camp", name: "", city: "", location: "", description: "", image_url: "", registration_url: "", event_date: "", access_date: "", public_date: "", status: "announced" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    if (!f.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const input: EventInput = {
        organization_id: organizationId, athlete_id: athleteId, type: f.type, name: f.name.trim(),
        city: f.city || null, location: f.location || null, description: f.description || null,
        image_url: f.image_url || null, registration_url: f.registration_url || null,
        event_date: f.event_date ? new Date(f.event_date).toISOString() : null,
        access_date: f.access_date ? new Date(f.access_date).toISOString() : null,
        public_date: f.public_date ? new Date(f.public_date).toISOString() : null,
        status: f.status, created_by: user?.id ?? null,
      };
      await createEvent(input);
      toast.success("Event created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1">New Event</h3>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">For {athleteName}</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldE label="Type"><select className="ax-field" value={f.type} onChange={(e) => set("type", e.target.value)}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></FieldE>
          <FieldE label="Status"><select className="ax-field capitalize" value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></FieldE>
        </div>
        <div className="mt-3 space-y-3">
          <FieldE label="Name"><input className="ax-field" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Youth Football Camp" /></FieldE>
          <div className="grid grid-cols-2 gap-3">
            <FieldE label="City"><input className="ax-field" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Atlanta, GA" /></FieldE>
            <FieldE label="Event date"><input className="ax-field" type="date" value={f.event_date} onChange={(e) => set("event_date", e.target.value)} /></FieldE>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldE label="Access early date"><input className="ax-field" type="date" value={f.access_date} onChange={(e) => set("access_date", e.target.value)} /></FieldE>
            <FieldE label="Public date"><input className="ax-field" type="date" value={f.public_date} onChange={(e) => set("public_date", e.target.value)} /></FieldE>
          </div>
          <FieldE label="Registration URL"><input className="ax-field" value={f.registration_url} onChange={(e) => set("registration_url", e.target.value)} placeholder="https://…" /></FieldE>
          <FieldE label="Description"><textarea className="ax-field min-h-[70px]" value={f.description} onChange={(e) => set("description", e.target.value)} /></FieldE>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Event
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldE({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">{label}</label>
      {children}
    </div>
  );
}
