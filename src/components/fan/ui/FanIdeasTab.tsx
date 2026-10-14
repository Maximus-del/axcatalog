// "Have an idea?" — the fan side of design submissions.
//
// Two doors on purpose. Someone with a picture in their head and someone with
// a finished PNG are at completely different points, and asking the first
// person for a file or the second person to answer twelve questions is how you
// lose both. Members pick a door; everyone else sees what they'd get.
import { useEffect, useState } from "react";
import { Lightbulb, Upload, Loader2, Check, X, Lock, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  createSubmission,
  listMySubmissions,
  loadFanDesignSurvey,
  missingRequired,
  saveSurveyResponse,
  stageOf,
  submissionFileUrl,
  STAGE_BLURB,
  STAGE_LABEL,
  type DesignSubmission,
  type Survey,
  type SurveyAnswer,
} from "@/lib/ecosystem/submissions";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { AccessButton } from "@/components/fan/ui/AccessButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Door = null | "idea" | "artwork";

export function FanIdeasTab({
  athlete, isMember, canFollow,
}: {
  athlete: { id: string; organization_id: string; first_name: string };
  isMember: boolean;
  canFollow: boolean;
}) {
  const [door, setDoor] = useState<Door>(null);
  const [mine, setMine] = useState<DesignSubmission[]>([]);

  const refresh = () => {
    listMySubmissions(athlete.id).then(setMine).catch(() => setMine([]));
  };
  useEffect(() => { if (isMember) refresh(); }, [athlete.id, isMember]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isMember) {
    return (
      <div className="space-y-4 max-w-xl">
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
          <Lock className="h-6 w-6 mx-auto text-accent" />
          <h2 className="font-black text-lg">Design for {athlete.first_name}</h2>
          <p className="text-sm text-muted-foreground">
            Members can send in design ideas — or upload artwork they've already made — to be considered for the
            store. If it gets picked up, it gets made.
          </p>
          {canFollow
            ? <AccessButton athleteId={athlete.id} className="w-full" />
            : <p className="text-[12px] text-muted-foreground">Join to become a member.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      {door === null && (
        <>
          <div className="space-y-3">
            <Door
              icon={<Lightbulb className="h-5 w-5" />}
              title="Have an idea?"
              blurb="Answer a few questions about what you'd want to see. No design skills needed."
              cta="Fill out the design survey"
              onClick={() => setDoor("idea")}
            />
            <Door
              icon={<ImagePlus className="h-5 w-5" />}
              title="Already made something?"
              blurb={`Upload your design and it goes straight to the team. Get featured on ${athlete.first_name}'s store.`}
              cta="Upload a design"
              onClick={() => setDoor("artwork")}
            />
          </div>
          <MySubmissions items={mine} />
        </>
      )}

      {door === "idea" && (
        <IdeaForm athlete={athlete} onDone={() => { setDoor(null); refresh(); }} onCancel={() => setDoor(null)} />
      )}

      {door === "artwork" && (
        <ArtworkForm athlete={athlete} onDone={() => { setDoor(null); refresh(); }} onCancel={() => setDoor(null)} />
      )}
    </div>
  );
}

function Door({ icon, title, blurb, cta, onClick }: {
  icon: React.ReactNode; title: string; blurb: string; cta: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-border bg-card p-5 hover:border-accent/60 transition-colors"
    >
      <span className="inline-flex items-center gap-2 text-accent">{icon}<span className="font-black">{title}</span></span>
      <p className="text-[13px] text-muted-foreground mt-1.5">{blurb}</p>
      <span className="mt-3 inline-flex h-9 px-4 rounded-full bg-accent text-accent-foreground font-bold text-[13px] items-center">
        {cta}
      </span>
    </button>
  );
}

function FormShell({ title, blurb, onCancel, children, footer }: {
  title: string; blurb: string; onCancel: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-lg">{title}</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">{blurb}</p>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {children}
      <div className="flex justify-end gap-2 pt-1">{footer}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{children}</div>;
}

// ---- Idea (survey) --------------------------------------------------------

function IdeaForm({ athlete, onDone, onCancel }: {
  athlete: { id: string; organization_id: string; first_name: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFanDesignSurvey(athlete.id, athlete.organization_id)
      .then(setSurvey)
      .catch(() => setSurvey(null))
      .finally(() => setLoading(false));
  }, [athlete.id, athlete.organization_id]);

  function setAnswer(question_id: string, patch: Partial<SurveyAnswer>) {
    setAnswers((prev) => {
      const found = prev.find((a) => a.question_id === question_id);
      if (!found) return [...prev, { question_id, ...patch }];
      return prev.map((a) => (a.question_id === question_id ? { ...a, ...patch } : a));
    });
  }

  async function submit() {
    // The free-text brief is the real payload; the survey is a way of drawing
    // it out of someone who doesn't know where to start.
    if (!brief.trim()) { toast.error("Tell them what you're picturing"); return; }
    const missing = survey ? missingRequired(survey.questions, answers) : [];
    if (missing.length) { toast.error(`Still needed: ${missing[0]}`); return; }

    setSaving(true);
    try {
      let responseId: string | null = null;
      if (survey && answers.length) {
        responseId = await saveSurveyResponse({
          survey_id: survey.id,
          athlete_id: athlete.id,
          answers,
        });
      }
      await createSubmission({
        organization_id: athlete.organization_id,
        athlete_id: athlete.id,
        kind: "idea",
        title,
        brief,
        notes,
        questionnaire_response_id: responseId,
      });
      toast.success(survey?.thank_you_text || "Sent — thanks for this");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send that");
    } finally { setSaving(false); }
  }

  return (
    <FormShell
      title={survey?.title || `An idea for ${athlete.first_name}`}
      blurb={survey?.intro_text || "The more specific, the better the odds it gets made."}
      onCancel={onCancel}
      footer={
        <>
          <button onClick={onCancel} className="h-9 px-4 rounded-full border border-border font-semibold text-[13px]">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !brief.trim()}
            className="h-9 px-4 rounded-full bg-accent text-accent-foreground font-bold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />} Send idea
          </button>
        </>
      }
    >
      <div>
        <Label>Call it something</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Retro warm-up tee" />
      </div>

      <div>
        <Label>What are you picturing?</Label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="Faded navy hoodie, big number on the back, small script on the chest…"
        />
      </div>

      {loading ? (
        <div className="text-[12px] text-muted-foreground">Loading questions…</div>
      ) : survey ? (
        <div className="space-y-4 pt-1">
          {survey.questions.map((q) => {
            const a = answers.find((x) => x.question_id === q.id);
            const selected = a?.selected_option_ids ?? [];
            const multi = q.type === "multi_choice";
            return (
              <div key={q.id}>
                <Label>{q.prompt}{q.required && <span className="text-accent"> *</span>}</Label>
                {q.help_text && <p className="text-[11px] text-muted-foreground -mt-1 mb-1.5">{q.help_text}</p>}

                {q.type === "short_text" && (
                  <Input value={a?.text_value ?? ""} onChange={(e) => setAnswer(q.id, { text_value: e.target.value })} />
                )}
                {q.type === "long_text" && (
                  <Textarea rows={3} value={a?.text_value ?? ""} onChange={(e) => setAnswer(q.id, { text_value: e.target.value })} />
                )}
                {(q.type === "single_choice" || q.type === "multi_choice" || q.type === "image_choice") && (
                  <div className={cn("gap-2", q.type === "image_choice" ? "grid grid-cols-3" : "flex flex-wrap")}>
                    {q.options.map((op) => {
                      const on = selected.includes(op.id);
                      const toggle = () =>
                        setAnswer(q.id, {
                          selected_option_ids: multi
                            ? (on ? selected.filter((x) => x !== op.id) : [...selected, op.id])
                            : (on ? [] : [op.id]),
                        });
                      if (q.type === "image_choice") {
                        return (
                          <button key={op.id} onClick={toggle} className={cn("rounded-xl overflow-hidden border-2 aspect-square", on ? "border-accent" : "border-border")}>
                            {op.image_url
                              ? <img src={op.image_url} alt={op.label} className="h-full w-full object-cover" />
                              : <span className="h-full w-full flex items-center justify-center text-[11px] p-1 text-center">{op.label}</span>}
                          </button>
                        );
                      }
                      return (
                        <button
                          key={op.id}
                          onClick={toggle}
                          className={cn(
                            "text-[12px] font-semibold rounded-full px-3 py-1.5 border",
                            on ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground",
                          )}
                        >{op.label}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <div>
        <Label>Anything you'd want changed</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional — colours, fit, anything you'd tweak"
        />
      </div>
    </FormShell>
  );
}

// ---- Artwork (upload) -----------------------------------------------------

function ArtworkForm({ athlete, onDone, onCancel }: {
  athlete: { id: string; organization_id: string; first_name: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { isOver, dropProps } = useFileDropZone({
    onFiles: (f) => setFiles((prev) => [...prev, ...f]),
    accept: ["image/"],
    paste: true,
  });

  async function submit() {
    if (files.length === 0) { toast.error("Add your design first"); return; }
    setSaving(true);
    try {
      await createSubmission({
        organization_id: athlete.organization_id,
        athlete_id: athlete.id,
        kind: "artwork",
        title: title || files[0].name.replace(/\.[^.]+$/, ""),
        brief,
        notes,
        files,
      });
      toast.success("Sent — the team will take a look");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setSaving(false); }
  }

  return (
    <FormShell
      title="Upload your design"
      blurb={`Made something already? Send it in to be considered for ${athlete.first_name}'s store.`}
      onCancel={onCancel}
      footer={
        <>
          <button onClick={onCancel} className="h-9 px-4 rounded-full border border-border font-semibold text-[13px]">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || files.length === 0}
            className="h-9 px-4 rounded-full bg-accent text-accent-foreground font-bold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Send design
          </button>
        </>
      }
    >
      <div
        {...dropProps}
        className={cn(
          "rounded-xl border border-dashed p-6 text-center transition-colors",
          isOver ? "border-accent bg-accent/10" : "border-border",
        )}
      >
        {files.length === 0 ? (
          <>
            <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground mt-2">Drop your design here, or paste it</p>
            <label className="inline-block mt-2 text-[13px] font-bold text-accent cursor-pointer">
              or browse
              <input
                type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }}
              />
            </label>
          </>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {files.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt="" className="h-20 w-20 object-cover rounded-lg border border-border" />
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 text-white flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Name it</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <Label>What is it?</Label>
        <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="What it's for, what you were going for" />
      </div>
      <div>
        <Label>Anything you'd want changed</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional — things you'd tweak if it gets picked" />
      </div>
    </FormShell>
  );
}

// ---- What I've sent -------------------------------------------------------

function MySubmissions({ items }: { items: DesignSubmission[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="ax-section-header mb-3">What you've sent</h2>
      <div className="space-y-2">
        {items.map((s) => {
          const stage = stageOf(s);
          const img = s.files?.[0];
          return (
            <div key={s.id} className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
              <span className="h-14 w-14 rounded-lg overflow-hidden border border-border shrink-0 bg-muted flex items-center justify-center">
                {img
                  ? <img src={submissionFileUrl(img)} alt="" className="h-full w-full object-cover" />
                  : <Lightbulb className="h-4 w-4 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[13px] truncate">{s.title || (s.kind === "idea" ? "Design idea" : "Design")}</div>
                <div className="text-[11px] text-muted-foreground">{STAGE_BLURB[stage]}</div>
                {s.review_notes && (
                  <div className="text-[11px] mt-1 text-foreground/80 border-l-2 border-accent pl-2">{s.review_notes}</div>
                )}
              </div>
              <span className={cn(
                "shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full",
                stage === "in_production" || stage === "accepted"
                  ? "bg-accent/15 text-accent"
                  : stage === "declined" || stage === "archived"
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted text-foreground/70",
              )}>
                {stage === "in_production" ? <Check className="h-3 w-3 inline -mt-0.5 mr-0.5" /> : null}
                {STAGE_LABEL[stage]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
