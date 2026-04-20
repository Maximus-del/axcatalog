import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Tag } from "lucide-react";
import { TagChipInput } from "./TagChipInput";
import { applyTagsToProducts, type ApplyResult } from "@/lib/apply-tags";
import { toast } from "sonner";

interface Props {
  selectedIds: string[];
  onCancel: () => void;
  onApplied: (result: ApplyResult) => void;
}

export function BulkTagBar({ selectedIds, onCancel, onApplied }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = !!progress;

  async function handleApply() {
    if (tags.length === 0 || selectedIds.length === 0) return;
    setProgress({ done: 0, total: selectedIds.length });
    const result = await applyTagsToProducts({
      productIds: selectedIds,
      addTags: tags,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setProgress(null);
    if (result.failed.length === 0) {
      toast.success(
        `Tagged ${result.succeeded.length} product${result.succeeded.length === 1 ? "" : "s"} with: ${tags.join(", ")}`,
      );
    } else {
      toast.error(
        `Tagged ${result.succeeded.length}, failed ${result.failed.length}. First error: ${result.failed[0].error}`,
      );
    }
    setTags([]);
    onApplied(result);
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 bg-background/85 backdrop-blur-md border-b border-accent/40 shadow-[0_4px_16px_-8px_hsl(var(--accent)/0.4)]">
      <div className="max-w-[1600px] mx-auto flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
          <Tag className="h-4 w-4 text-accent" />
          <span className="tabular-nums">
            {selectedIds.length} {selectedIds.length === 1 ? "product" : "products"} selected
          </span>
        </div>
        <div className="flex-1 min-w-[260px]">
          <TagChipInput
            tags={tags}
            onChange={setTags}
            placeholder="Add tags: athlete:darnell-mooney, team:atlanta-falcons, premium…"
          />
        </div>
        {progress && (
          <span className="text-xs text-muted-foreground tabular-nums">
            Tagging {progress.done} of {progress.total}…
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={busy || tags.length === 0 || selectedIds.length === 0}
          className="gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Apply Tags
        </Button>
      </div>
    </div>
  );
}
