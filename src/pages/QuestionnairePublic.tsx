import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Upload, X } from "lucide-react";

type QType = "short_text" | "long_text" | "single_choice" | "multi_choice" | "image_choice" | "image_upload";

interface Q {
  id: string;
  prompt: string;
  help_text: string | null;
  required: boolean;
  type: QType;
  position: number;
  options: { id: string; label: string | null; image_url: string | null }[];
}
interface Questionnaire {
  id: string;
  title: string;
  description: string | null;
  intro_text: string | null;
  thank_you_text: string | null;
  is_active: boolean;
}

export default function QuestionnairePublic() {
  const { slug } = useParams<{ slug: string }>();
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, { text?: string; options?: string[] }>>({});
  const [uploads, setUploads] = useState<Record<string, string[]>>({});
  const [uploadingQid, setUploadingQid] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: qd } = await supabase.from("questionnaires").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      if (!qd) { setNotFound(true); setLoading(false); return; }
      const { data: qq } = await supabase
        .from("questionnaire_questions")
        .select("*")
        .eq("questionnaire_id", qd.id)
        .order("position");
      const qIds = (qq ?? []).map((x: any) => x.id);
      let opts: any[] = [];
      if (qIds.length) {
        const { data: od } = await supabase
          .from("questionnaire_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("position");
        opts = od ?? [];
      }
      const byQ = new Map<string, any[]>();
      opts.forEach((o) => {
        const arr = byQ.get(o.question_id) ?? [];
        arr.push({ id: o.id, label: o.label, image_url: o.image_url });
        byQ.set(o.question_id, arr);
      });
      setQ(qd as Questionnaire);
      setQuestions((qq ?? []).map((x: any) => ({ ...x, options: byQ.get(x.id) ?? [] })));
      setLoading(false);
    })();
  }, [slug]);

  const setAnswer = (qid: string, patch: { text?: string; options?: string[] }) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  };

  const toggleOption = (qid: string, oid: string, multi: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qid]?.options ?? [];
      const next = multi
        ? cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid]
        : [oid];
      return { ...prev, [qid]: { ...prev[qid], options: next } };
    });
  };

  const handleUpload = async (qid: string, files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadingQid(qid);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${slug ?? "anon"}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("questionnaire-uploads").upload(path, file, { upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("questionnaire-uploads").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      setUploads((p) => ({ ...p, [qid]: [...(p[qid] ?? []), ...urls] }));
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploadingQid(null);
    }
  };

  const removeUpload = (qid: string, url: string) => {
    setUploads((p) => ({ ...p, [qid]: (p[qid] ?? []).filter((u) => u !== url) }));
  };

  const submit = async () => {
    if (!q) return;
    for (const question of questions) {
      if (!question.required) continue;
      const a = answers[question.id];
      if (question.type === "short_text" || question.type === "long_text") {
        if (!a?.text?.trim()) return toast({ title: `"${question.prompt}" is required`, variant: "destructive" });
      } else if (question.type === "image_upload") {
        if (!(uploads[question.id]?.length)) return toast({ title: `"${question.prompt}" is required`, variant: "destructive" });
      } else {
        if (!a?.options?.length) return toast({ title: `"${question.prompt}" is required`, variant: "destructive" });
      }
    }
    setSubmitting(true);
    try {
      const { data: resp, error } = await supabase
        .from("questionnaire_responses")
        .insert({ questionnaire_id: q.id, respondent_name: name || null, respondent_email: email || null })
        .select("id")
        .single();
      if (error) throw error;
      const rows = questions.map((qu) => {
        const a = answers[qu.id] ?? {};
        return {
          response_id: resp.id,
          question_id: qu.id,
          text_value: a.text ?? null,
          selected_option_ids: a.options ?? [],
          uploaded_file_urls: uploads[qu.id] ?? [],
        };
      });
      if (rows.length) {
        const { error: aerr } = await supabase.from("questionnaire_answers").insert(rows);
        if (aerr) throw aerr;
      }
      setDone(true);
    } catch (e: any) {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (notFound) return <div className="p-10 text-center text-muted-foreground">This questionnaire is not available.</div>;
  if (!q) return null;

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="ax-card p-10 max-w-lg text-center space-y-3">
          <div className="text-2xl font-semibold">Thanks!</div>
          <p className="text-muted-foreground whitespace-pre-wrap">{q.thank_you_text || "Your response has been recorded. We'll be in touch."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">{q.title}</h1>
          {q.description && <p className="text-muted-foreground">{q.description}</p>}
          {q.intro_text && <p className="text-sm whitespace-pre-wrap">{q.intro_text}</p>}
        </header>

        <div className="ax-card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Athlete" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
          </div>
        </div>

        {questions.map((question, idx) => (
          <div key={question.id} className="ax-card p-5 space-y-3">
            <div>
              <div className="text-sm text-muted-foreground">Question {idx + 1}{question.required && " · required"}</div>
              <h3 className="text-lg font-semibold">{question.prompt}</h3>
              {question.help_text && <p className="text-sm text-muted-foreground mt-1">{question.help_text}</p>}
            </div>

            {question.type === "short_text" && (
              <Input value={answers[question.id]?.text ?? ""} onChange={(e) => setAnswer(question.id, { text: e.target.value })} />
            )}
            {question.type === "long_text" && (
              <Textarea rows={4} value={answers[question.id]?.text ?? ""} onChange={(e) => setAnswer(question.id, { text: e.target.value })} />
            )}
            {question.type === "single_choice" && (
              <RadioGroup value={answers[question.id]?.options?.[0] ?? ""} onValueChange={(v) => toggleOption(question.id, v, false)}>
                {question.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 cursor-pointer py-1">
                    <RadioGroupItem value={o.id} id={o.id} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
            {question.type === "multi_choice" && (
              <div className="space-y-2">
                {question.options.map((o) => {
                  const checked = (answers[question.id]?.options ?? []).includes(o.id);
                  return (
                    <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={() => toggleOption(question.id, o.id, true)} />
                      <span>{o.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {question.type === "image_choice" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {question.options.map((o) => {
                  const checked = (answers[question.id]?.options ?? []).includes(o.id);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => toggleOption(question.id, o.id, true)}
                      className={cn(
                        "ax-card overflow-hidden text-left transition-all",
                        checked && "ring-2 ring-accent",
                      )}
                    >
                      {o.image_url ? (
                        <img src={o.image_url} alt={o.label ?? ""} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square bg-muted" />
                      )}
                      <div className="p-2 text-sm">{o.label}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {question.type === "image_upload" && (
              <div className="space-y-3">
                {(uploads[question.id]?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {uploads[question.id].map((url) => (
                      <div key={url} className="ax-card overflow-hidden relative group">
                        <img src={url} alt="" className="w-full aspect-square object-cover" />
                        <button
                          type="button"
                          onClick={() => removeUpload(question.id, url)}
                          className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                          aria-label="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="ax-card border-dashed p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/30 transition">
                  <Upload className="h-6 w-6" />
                  <div>{uploadingQid === question.id ? "Uploading…" : "Click to upload images"}</div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploadingQid === question.id}
                    onChange={(e) => void handleUpload(question.id, e.target.files)}
                  />
                </label>
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-end">
          <Button size="lg" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}