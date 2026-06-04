import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

type QType = "short_text" | "long_text" | "single_choice" | "multi_choice" | "image_choice" | "image_upload";

interface Q {
  id: string;
  prompt: string;
  help_text: string | null;
  required: boolean;
  type: QType;
  options: { id: string; label: string | null; image_url: string | null }[];
}

export default function QuestionnairePreview({
  questionnaire,
  questions,
}: {
  questionnaire: { title: string; description: string | null; intro_text: string | null };
  questions: Q[];
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const toggle = (qid: string, oid: string, multi: boolean) =>
    setPicked((p) => {
      const cur = p[qid] ?? [];
      const next = multi ? (cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid]) : [oid];
      return { ...p, [qid]: next };
    });

  return (
    <div className="bg-background px-6 pb-6 pt-2">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">{questionnaire.title}</h1>
          {questionnaire.description && <p className="text-muted-foreground">{questionnaire.description}</p>}
          {questionnaire.intro_text && <p className="text-sm whitespace-pre-wrap">{questionnaire.intro_text}</p>}
        </header>

        <div className="ax-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Your name</Label><Input disabled placeholder="Jane Athlete" /></div>
          <div><Label>Email</Label><Input disabled placeholder="you@example.com" /></div>
        </div>

        {questions.length === 0 && (
          <div className="ax-card p-8 text-center text-sm text-muted-foreground">No questions yet — add some on the Build tab.</div>
        )}

        {questions.map((question, idx) => (
          <div key={question.id} className="ax-card p-5 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Question {idx + 1}{question.required && " · required"}</div>
              <h3 className="text-lg font-semibold">{question.prompt}</h3>
              {question.help_text && <p className="text-sm text-muted-foreground mt-1">{question.help_text}</p>}
            </div>

            {question.type === "short_text" && <Input placeholder="Short answer" />}
            {question.type === "long_text" && <Textarea rows={4} placeholder="Long answer" />}
            {question.type === "single_choice" && (
              <RadioGroup>
                {question.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 py-1">
                    <RadioGroupItem value={o.id} id={`prev-${o.id}`} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
            {question.type === "multi_choice" && (
              <div className="space-y-2">
                {question.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2">
                    <Checkbox /><span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
            {question.type === "image_choice" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {question.options.map((o) => {
                  const checked = (picked[question.id] ?? []).includes(o.id);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => toggle(question.id, o.id, true)}
                      className={cn("ax-card overflow-hidden text-left transition-all", checked && "ring-2 ring-accent")}
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
              <div className="ax-card border-dashed p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Upload className="h-6 w-6" />
                <div>Athletes will be able to upload reference images here.</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}