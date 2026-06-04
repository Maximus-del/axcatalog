import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, Eye, GripVertical, Plus, Trash2 } from "lucide-react";
import QuestionnairePreview from "@/components/admin/QuestionnairePreview";

type QType = "short_text" | "long_text" | "single_choice" | "multi_choice" | "image_choice" | "image_upload";

interface Q {
  id: string;
  position: number;
  type: QType;
  prompt: string;
  help_text: string | null;
  required: boolean;
  options: Opt[];
}
interface Opt {
  id: string;
  position: number;
  label: string | null;
  design_id: string | null;
  image_url: string | null;
}
interface Questionnaire {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  intro_text: string | null;
  thank_you_text: string | null;
  is_active: boolean;
}
interface DesignOption {
  id: string;
  title: string;
  image_url: string | null;
}
interface Response {
  id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: string;
}

const TYPE_LABELS: Record<QType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  image_choice: "Image picker",
  image_upload: "Image upload",
};

async function resolveDesignImage(designId: string): Promise<string | null> {
  const { data } = await supabase
    .from("design_files")
    .select("storage_bucket,storage_path,is_primary,sort_order")
    .eq("design_id", designId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1);
  const f = data?.[0];
  if (!f) return null;
  const { data: signed } = await supabase.storage.from(f.storage_bucket).createSignedUrl(f.storage_path, 60 * 60 * 24 * 365);
  return signed?.signedUrl ?? null;
}

export default function QuestionnaireEditor() {
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [designs, setDesigns] = useState<DesignOption[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewResponseId, setViewResponseId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const publicUrl = useMemo(() => (q ? `${window.location.origin}/q/${q.slug}` : ""), [q]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: qData }, { data: qq }, { data: opts }, { data: ds }, { data: resp }] = await Promise.all([
      supabase.from("questionnaires").select("*").eq("id", id).single(),
      supabase.from("questionnaire_questions").select("*").eq("questionnaire_id", id).order("position"),
      supabase
        .from("questionnaire_question_options")
        .select("*, questionnaire_questions!inner(questionnaire_id)")
        .eq("questionnaire_questions.questionnaire_id", id)
        .order("position"),
      supabase.from("designs").select("id,title").order("created_at", { ascending: false }).limit(200),
      supabase.from("questionnaire_responses").select("id,respondent_name,respondent_email,submitted_at").eq("questionnaire_id", id).order("submitted_at", { ascending: false }),
    ]);
    setQ(qData as Questionnaire);
    const optsByQ = new Map<string, Opt[]>();
    (opts ?? []).forEach((o: any) => {
      const arr = optsByQ.get(o.question_id) ?? [];
      arr.push({ id: o.id, position: o.position, label: o.label, design_id: o.design_id, image_url: o.image_url });
      optsByQ.set(o.question_id, arr);
    });
    setQuestions((qq ?? []).map((row: any) => ({ ...row, options: optsByQ.get(row.id) ?? [] })));
    setDesigns((ds ?? []).map((d: any) => ({ id: d.id, title: d.title, image_url: null })));
    setResponses((resp ?? []) as Response[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [id]);

  const saveQuestionnaire = async (patch: Partial<Questionnaire>) => {
    if (!q) return;
    setQ({ ...q, ...patch });
    const { error } = await supabase.from("questionnaires").update(patch).eq("id", q.id);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
  };

  const addQuestion = async (type: QType) => {
    if (!id) return;
    const position = questions.length;
    const { data, error } = await supabase
      .from("questionnaire_questions")
      .insert({ questionnaire_id: id, type, prompt: "New question", position, required: false })
      .select("*")
      .single();
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setQuestions([...questions, { ...(data as any), options: [] }]);
  };

  const updateQuestion = async (qid: string, patch: Partial<Q>) => {
    setQuestions((qs) => qs.map((x) => (x.id === qid ? { ...x, ...patch } : x)));
    const { options, ...dbPatch } = patch as any;
    if (Object.keys(dbPatch).length) {
      await supabase.from("questionnaire_questions").update(dbPatch).eq("id", qid);
    }
  };

  const deleteQuestion = async (qid: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("questionnaire_questions").delete().eq("id", qid);
    setQuestions((qs) => qs.filter((x) => x.id !== qid));
  };

  const addOption = async (question: Q, designId?: string) => {
    let image_url: string | null = null;
    let label: string | null = "New option";
    if (designId) {
      const d = designs.find((x) => x.id === designId);
      label = d?.title ?? "Design";
      image_url = await resolveDesignImage(designId);
    }
    const { data, error } = await supabase
      .from("questionnaire_question_options")
      .insert({ question_id: question.id, position: question.options.length, label, design_id: designId ?? null, image_url })
      .select("*")
      .single();
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setQuestions((qs) => qs.map((x) => (x.id === question.id ? { ...x, options: [...x.options, data as Opt] } : x)));
  };

  const updateOption = async (qid: string, oid: string, patch: Partial<Opt>) => {
    setQuestions((qs) => qs.map((x) => (x.id === qid ? { ...x, options: x.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : x)));
    await supabase.from("questionnaire_question_options").update(patch).eq("id", oid);
  };

  const deleteOption = async (qid: string, oid: string) => {
    await supabase.from("questionnaire_question_options").delete().eq("id", oid);
    setQuestions((qs) => qs.map((x) => (x.id === qid ? { ...x, options: x.options.filter((o) => o.id !== oid) } : x)));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast({ title: "Link copied", description: publicUrl });
  };

  const reorderQuestions = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = questions.findIndex((x) => x.id === fromId);
    const toIdx = questions.findIndex((x) => x.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...questions];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const renumbered = next.map((q, i) => ({ ...q, position: i }));
    setQuestions(renumbered);
    await Promise.all(
      renumbered.map((q) =>
        supabase.from("questionnaire_questions").update({ position: q.position }).eq("id", q.id),
      ),
    );
  };

  if (loading || !q) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/questionnaires"><ArrowLeft className="h-4 w-4 mr-2" />All questionnaires</Link></Button>
        <div className="flex items-center gap-3">
          <Badge variant={q.is_active ? "default" : "outline"}>{q.is_active ? "Active" : "Inactive"}</Badge>
          <Switch checked={q.is_active} onCheckedChange={(v) => void saveQuestionnaire({ is_active: v })} />
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4 mr-2" />Preview</Button>
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="h-4 w-4 mr-2" />Copy public link</Button>
        </div>
      </div>

      <Tabs defaultValue="build">
        <TabsList>
          <TabsTrigger value="build">Build</TabsTrigger>
          <TabsTrigger value="responses">Responses ({responses.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="build" className="space-y-4 mt-6">
          {questions.map((question, idx) => (
            <QuestionEditor
              key={question.id}
              question={question}
              index={idx}
              designs={designs}
              isDragging={dragId === question.id}
              onDragStart={() => setDragId(question.id)}
              onDragEnd={() => setDragId(null)}
              onDropOn={() => { if (dragId) void reorderQuestions(dragId, question.id); setDragId(null); }}
              onChange={(patch) => void updateQuestion(question.id, patch)}
              onDelete={() => void deleteQuestion(question.id)}
              onAddOption={(designId) => void addOption(question, designId)}
              onUpdateOption={(oid, patch) => void updateOption(question.id, oid, patch)}
              onDeleteOption={(oid) => void deleteOption(question.id, oid)}
            />
          ))}

          <div className="ax-card p-4">
            <div className="text-sm font-medium mb-3">Add a question</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as QType[]).map((t) => (
                <Button key={t} variant="outline" size="sm" onClick={() => void addQuestion(t)}>
                  <Plus className="h-3 w-3 mr-1" />{TYPE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="responses" className="mt-6">
          {responses.length === 0 ? (
            <div className="ax-card p-8 text-center text-muted-foreground">No responses yet. Share the link to start collecting.</div>
          ) : (
            <div className="ax-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left">
                  <tr>
                    <th className="p-3">Respondent</th>
                    <th className="p-3">Submitted</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="p-3">
                        <div className="font-medium">{r.respondent_name || "Anonymous"}</div>
                        {r.respondent_email && <div className="text-xs text-muted-foreground">{r.respondent_email}</div>}
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(r.submitted_at).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" onClick={() => setViewResponseId(r.id)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-6 max-w-2xl">
          <div>
            <Label>Title</Label>
            <Input value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} onBlur={() => void saveQuestionnaire({ title: q.title })} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={q.description ?? ""} onChange={(e) => setQ({ ...q, description: e.target.value })} onBlur={() => void saveQuestionnaire({ description: q.description })} />
          </div>
          <div>
            <Label>Intro shown at top of form</Label>
            <Textarea value={q.intro_text ?? ""} onChange={(e) => setQ({ ...q, intro_text: e.target.value })} onBlur={() => void saveQuestionnaire({ intro_text: q.intro_text })} />
          </div>
          <div>
            <Label>Thank-you message after submit</Label>
            <Textarea value={q.thank_you_text ?? ""} onChange={(e) => setQ({ ...q, thank_you_text: e.target.value })} onBlur={() => void saveQuestionnaire({ thank_you_text: q.thank_you_text })} />
          </div>
          <div>
            <Label>Public URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={publicUrl} className="font-mono text-xs" />
              <Button variant="outline" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ResponseDialog
        responseId={viewResponseId}
        questions={questions}
        onClose={() => setViewResponseId(null)}
        onCollectionCreated={() => setViewResponseId(null)}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Preview — what athletes will see</DialogTitle>
          </DialogHeader>
          <QuestionnairePreview questionnaire={q} questions={questions} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionEditor({
  question, index, designs, isDragging, onDragStart, onDragEnd, onDropOn,
  onChange, onDelete, onAddOption, onUpdateOption, onDeleteOption,
}: {
  question: Q; index: number; designs: DesignOption[];
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onChange: (patch: Partial<Q>) => void;
  onDelete: () => void;
  onAddOption: (designId?: string) => void;
  onUpdateOption: (oid: string, patch: Partial<Opt>) => void;
  onDeleteOption: (oid: string) => void;
}) {
  const [designId, setDesignId] = useState("");
  const isChoice = question.type === "single_choice" || question.type === "multi_choice";
  const isImage = question.type === "image_choice";

  return (
    <div
      className={`ax-card p-4 space-y-3 transition-opacity ${isDragging ? "opacity-50" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Q{index + 1}</Badge>
            <span>{TYPE_LABELS[question.type]}</span>
          </div>
          <Input
            value={question.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder="What's your question?"
            className="font-medium"
          />
          <Input
            value={question.help_text ?? ""}
            onChange={(e) => onChange({ help_text: e.target.value })}
            placeholder="Helper text (optional)"
            className="text-sm"
          />
          <label className="inline-flex items-center gap-2 text-xs">
            <Switch checked={question.required} onCheckedChange={(v) => onChange({ required: v })} />
            Required
          </label>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>

      {(isChoice || isImage) && (
        <div className="pl-8 space-y-2">
          {isImage ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {question.options.map((o) => (
                <div key={o.id} className="ax-card overflow-hidden">
                  {o.image_url ? (
                    <img src={o.image_url} alt={o.label ?? ""} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-muted grid place-items-center text-xs text-muted-foreground">No image</div>
                  )}
                  <div className="p-2 flex items-center gap-2">
                    <Input value={o.label ?? ""} onChange={(e) => onUpdateOption(o.id, { label: e.target.value })} className="h-8 text-xs" />
                    <Button variant="ghost" size="icon" onClick={() => onDeleteOption(o.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {question.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <Input value={o.label ?? ""} onChange={(e) => onUpdateOption(o.id, { label: e.target.value })} placeholder="Option label" />
                  <Button variant="ghost" size="icon" onClick={() => onDeleteOption(o.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}

          {isImage ? (
            <div className="flex items-center gap-2">
              <Select value={designId} onValueChange={setDesignId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a design to add as an image option" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {designs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!designId} onClick={() => { void onAddOption(designId); setDesignId(""); }}>
                <Plus className="h-3 w-3 mr-1" />Add
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onAddOption()}><Plus className="h-3 w-3 mr-1" />Add option</Button>
          )}
        </div>
      )}
    </div>
  );
}

function ResponseDialog({
  responseId, questions, onClose, onCollectionCreated,
}: {
  responseId: string | null;
  questions: Q[];
  onClose: () => void;
  onCollectionCreated: () => void;
}) {
  const [answers, setAnswers] = useState<any[]>([]);
  const [response, setResponse] = useState<Response | null>(null);
  const [creating, setCreating] = useState(false);
  const [collectionName, setCollectionName] = useState("");

  useEffect(() => {
    if (!responseId) return;
    (async () => {
      const [{ data: r }, { data: a }] = await Promise.all([
        supabase.from("questionnaire_responses").select("*").eq("id", responseId).single(),
        supabase.from("questionnaire_answers").select("*").eq("response_id", responseId),
      ]);
      setResponse(r as Response);
      setAnswers(a ?? []);
      setCollectionName(`${(r as any)?.respondent_name ?? "Athlete"} — Style Picks`);
    })();
  }, [responseId]);

  const selectedDesignIds = useMemo(() => {
    const ids: string[] = [];
    for (const q of questions) {
      if (q.type !== "image_choice") continue;
      const a = answers.find((x) => x.question_id === q.id);
      if (!a) continue;
      for (const optId of a.selected_option_ids ?? []) {
        const opt = q.options.find((o) => o.id === optId);
        if (opt?.design_id) ids.push(opt.design_id);
      }
    }
    return Array.from(new Set(ids));
  }, [questions, answers]);

  const createCollection = async () => {
    if (selectedDesignIds.length === 0) return toast({ title: "No image picks to add", variant: "destructive" });
    setCreating(true);
    try {
      const { data: orgId, error: orgErr } = await supabase.rpc("current_user_org_id");
      if (orgErr || !orgId) throw new Error(orgErr?.message ?? "No organization");
      const slug = `${collectionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: col, error } = await supabase
        .from("collections")
        .insert({ name: collectionName, slug, organization_id: orgId as unknown as string, collection_type: "campaign" })
        .select("id")
        .single();
      if (error) throw error;
      const rows = selectedDesignIds.map((design_id, i) => ({ collection_id: col.id, design_id, sort_order: i }));
      await supabase.from("collection_designs").insert(rows);
      toast({ title: "Collection created", description: `${selectedDesignIds.length} designs added` });
      onCollectionCreated();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={!!responseId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{response?.respondent_name || "Anonymous"} — Response</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {response?.respondent_email && <p className="text-sm text-muted-foreground">{response.respondent_email}</p>}
          {questions.map((q) => {
            const a = answers.find((x) => x.question_id === q.id);
            return (
              <div key={q.id} className="border-b border-border pb-3">
                <div className="text-xs text-muted-foreground mb-1">{q.prompt}</div>
                {q.type === "image_choice" ? (
                  <div className="grid grid-cols-3 gap-2">
                    {(a?.selected_option_ids ?? []).map((oid: string) => {
                      const opt = q.options.find((o) => o.id === oid);
                      if (!opt) return null;
                      return (
                        <div key={oid} className="ax-card overflow-hidden">
                          {opt.image_url && <img src={opt.image_url} className="w-full aspect-square object-cover" />}
                          <div className="p-2 text-xs">{opt.label}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : q.type === "single_choice" || q.type === "multi_choice" ? (
                  <div className="flex flex-wrap gap-1">
                    {(a?.selected_option_ids ?? []).map((oid: string) => {
                      const opt = q.options.find((o) => o.id === oid);
                      return <Badge key={oid} variant="outline">{opt?.label ?? oid}</Badge>;
                    })}
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{a?.text_value || <span className="text-muted-foreground italic">No answer</span>}</div>
                )}
              </div>
            );
          })}

          {selectedDesignIds.length > 0 && (
            <div className="ax-card p-4 space-y-3">
              <div className="text-sm font-medium">Create collection from picks</div>
              <p className="text-xs text-muted-foreground">{selectedDesignIds.length} design(s) selected via image picker questions.</p>
              <Input value={collectionName} onChange={(e) => setCollectionName(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {selectedDesignIds.length > 0 && (
            <Button disabled={creating} onClick={() => void createCollection()}>
              {creating ? "Creating…" : "Create collection"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}