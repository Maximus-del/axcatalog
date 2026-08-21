// PNG Creation — the one production prompt, shown wherever a design gets
// uploaded.
//
// Every design upload surface renders THIS component. There is no per-page
// copy of the text: it reads the org's global prompt, so editing it in
// Admin → Prompts changes it everywhere at once. Deliberately has no
// primary/backup/variation concept — extraction has one correct answer.
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, FileImage } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { composeSystemPrompt, PNG_CREATION_KEY } from "@/lib/ecosystem/prompts";
import { useSystemPrompt } from "@/hooks/useSystemPrompt";

export function PngCreationPanel({
  organizationId,
  designName,
  onDesignNameChange,
  defaultOpen = false,
}: {
  organizationId?: string | null;
  /** Supply it when the surface already knows the name — a concept title, say. */
  designName?: string;
  /** Omit to hide the field entirely; the prompt still works without a name. */
  onDesignNameChange?: (value: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [extra, setExtra] = useState("");
  const [copied, setCopied] = useState(false);
  const { prompt } = useSystemPrompt(PNG_CREATION_KEY, organizationId);

  const full = composeSystemPrompt({
    body: prompt.body,
    designName,
    additionalInstructions: extra,
  });

  async function copy() {
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast.success("PNG Creation prompt copied");
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--ax-border))]">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <FileImage className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">PNG Creation</span>
            <span className="block text-[11px] text-[hsl(var(--ax-faint))] truncate">
              {prompt.description}
            </span>
          </span>
          {open
            ? <ChevronUp className="h-4 w-4 ml-auto shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 ml-auto shrink-0 text-muted-foreground" />}
        </button>
        <button
          type="button"
          onClick={copy}
          className="h-8 px-3 shrink-0 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy prompt
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {onDesignNameChange && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
                Design name <span className="normal-case tracking-normal font-normal opacity-70">(optional)</span>
              </div>
              <Input
                value={designName ?? ""}
                onChange={(e) => onDesignNameChange(e.target.value)}
                placeholder="Abbotsford Collegiate Crest"
                className="h-9 text-[13px]"
              />
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
              Additional instructions <span className="normal-case tracking-normal font-normal opacity-70">(optional)</span>
            </div>
            <Textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="Keep the cream distressing. Make sure the number 17 stays red."
            />
          </div>

          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-[hsl(var(--ax-secondary))] max-h-56 overflow-y-auto rounded-lg bg-[hsl(var(--ax-line)/0.4)] p-2.5">
            {full}
          </pre>

          <p className="text-[11px] text-[hsl(var(--ax-faint))]">
            Extraction, not generation — it rebuilds the artwork already in your image rather than designing a new one.
            Paste this with the mockup, then drop the transparent PNG that comes back into the upload above.
            {prompt.customized ? " Your team has edited the master version." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
