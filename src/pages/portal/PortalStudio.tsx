// Mobile-first. Design Studio (Phase 3): request flow + Projects tracking.
// Submitting creates a real design request (portal_threads) the AX team sees
// in the admin Inbox; the athlete tracks it under Projects here.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, ImagePlus, X, ArrowRight, CheckCircle2, FolderOpen, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { STUDIO_CATEGORIES, STUDIO_VIBES, threadToProject, PROJECT_STAGES, type Project } from "@/lib/portal-studio";
import { categoryLabel, threadTimeAgo, type PortalThread } from "@/lib/portal-messaging";
import { cn } from "@/lib/utils";

export default function PortalStudio() {
  const navigate = useNavigate();
  const { athlete } = usePortalData();
  const { user } = useAuth();

  const [category, setCategory] = useState<string>("merch");
  const [idea, setIdea] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [refs, setRefs] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const catLabel = STUDIO_CATEGORIES.find((c) => c.key === category)?.label ?? "New Merch";

  async function loadProjects() {
    const { data } = await supabase
      .from("portal_threads")
      .select("*")
      .eq("athlete_id", athlete.id)
      .in("category", ["design_feedback", "order_request"])
      .order("last_message_at", { ascending: false });
    setProjects(((data ?? []) as PortalThread[]).map(threadToProject));
  }
  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete.id]);

  function toggleVibe(v: string) {
    setVibes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setRefs((cur) => [...cur, ...Array.from(list)].slice(0, 8));
  }

  function startVoice() {
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SR) {
      toast.info("Voice input isn't supported on this device.");
      return;
    }
    try {
      const rec = new (SR as new () => {
        lang: string;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        start: () => void;
      })();
      rec.lang = "en-US";
      rec.onresult = (e) => {
        const text = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
          .map((r) => r[0].transcript)
          .join(" ");
        setIdea((cur) => (cur ? `${cur} ${text}` : text));
      };
      rec.start();
      toast.info("Listening…");
    } catch {
      toast.info("Couldn't start voice input.");
    }
  }

  async function submit() {
    if (!idea.trim() || !user) {
      toast.error("Tell us your idea first.");
      return;
    }
    setSubmitting(true);
    const subject = `${catLabel}: ${idea.trim().slice(0, 60)}${idea.trim().length > 60 ? "…" : ""}`;
    const body = [
      `New ${catLabel} idea from ${athlete.first_name} ${athlete.last_name}.`,
      "",
      `Idea: ${idea.trim()}`,
      vibes.length ? `Vibe: ${vibes.join(", ")}` : null,
      notes.trim() ? `Include: ${notes.trim()}` : null,
      // NOTE (Phase 3.5): reference-image upload needs a storage bucket + RLS
      // decision. For now we flag the count so AX can request them.
      refs.length ? `Reference images: ${refs.length} (athlete will share)` : null,
    ]
      .filter((x) => x !== null)
      .join("\n");

    const { data: thread, error } = await supabase
      .from("portal_threads")
      .insert({
        organization_id: athlete.organization_id,
        athlete_id: athlete.id,
        subject,
        category: "design_feedback",
        created_by: user.id,
        created_by_role: "portal",
      })
      .select("*")
      .single();
    if (error || !thread) {
      setSubmitting(false);
      toast.error("Couldn't send your idea. Try again.");
      return;
    }
    await supabase.from("portal_messages").insert({
      thread_id: thread.id,
      organization_id: athlete.organization_id,
      sender_user_id: user.id,
      sender_role: "portal",
      body,
    });
    setSubmitting(false);
    setDone(true);
    setIdea("");
    setVibes([]);
    setNotes("");
    setRefs([]);
    void loadProjects();
  }

  const refPreviews = useMemo(() => refs.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })), [refs]);

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-8 pb-bottom-nav md:pb-32">
      <header>
        <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">Design Studio</div>
        <h1 className="text-2xl font-bold mt-1">What should we make next?</h1>
      </header>

      {done ? (
        <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/12 to-transparent p-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-7 w-7 text-accent" />
          </div>
          <p className="font-bold">Sent to the AX design team</p>
          <p className="text-sm text-muted-foreground mt-1">We'll get to work and track it below.</p>
          <button onClick={() => setDone(false)} className="mt-4 text-sm font-semibold text-accent">
            Start another →
          </button>
        </div>
      ) : (
        <>
          {/* Category */}
          <div className="grid grid-cols-3 gap-2.5">
            {STUDIO_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn(
                  "rounded-xl border py-3 px-2 text-[12px] font-semibold",
                  category === c.key ? "border-accent ring-1 ring-accent text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Idea */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="ax-label">Tell us your idea</div>
              <button onClick={startVoice} className="flex items-center gap-1 text-[12px] text-accent font-semibold">
                <Mic className="h-3.5 w-3.5" /> Voice
              </button>
            </div>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder="Describe what you want to make…"
              className="portal-input resize-none"
            />
          </div>

          {/* Inspiration */}
          <div>
            <div className="ax-label mb-2">Add inspiration</div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
            <div className="flex gap-2 flex-wrap">
              {refPreviews.map((r, i) => (
                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border border-border">
                  <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
                  <button
                    onClick={() => setRefs((cur) => cur.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="h-16 w-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Vibe */}
          <div>
            <div className="ax-label mb-2">What's the vibe?</div>
            <div className="flex gap-2 flex-wrap">
              {STUDIO_VIBES.map((v) => (
                <button
                  key={v}
                  onClick={() => toggleVibe(v)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-medium",
                    vibes.includes(v) ? "border-accent ring-1 ring-accent text-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="ax-label mb-2">Anything we should include?</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Number, name, city, quotes, colors, event info…"
              className="portal-input resize-none"
            />
          </div>

          <button
            onClick={submit}
            disabled={submitting}
            className="pressable w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? "Sending…" : "Send to AX Design Team"}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </>
      )}

      {/* Projects */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] mb-3">Your Projects</h2>
        {projects === null ? (
          <div className="rounded-2xl border border-border bg-card h-24 animate-pulse" />
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-accent/12 flex items-center justify-center mb-3">
              <FolderOpen className="h-5 w-5 text-accent" />
            </div>
            <p className="text-sm font-medium">Nothing in the works yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Send an idea above and we'll track it here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate({ pathname: "/portal/messages", search: window.location.search })}
                className="w-full text-left rounded-2xl border border-border bg-card p-4 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {categoryLabel(p.category)} · {threadTimeAgo(p.updatedAt)}
                    </div>
                  </div>
                  {p.actionRequired && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider px-2 py-1">
                      <AlertCircle className="h-3 w-3" /> Action
                    </span>
                  )}
                </div>
                {/* Timeline */}
                <div className="mt-3 flex items-center gap-1">
                  {PROJECT_STAGES.map((s, i) => (
                    <div key={s} className="flex-1">
                      <div className={cn("h-1.5 rounded-full", i <= p.stageIndex ? "bg-accent" : "bg-muted")} />
                      <div className={cn("text-[9px] mt-1 truncate", i === p.stageIndex ? "text-accent font-semibold" : "text-muted-foreground")}>
                        {s}
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
