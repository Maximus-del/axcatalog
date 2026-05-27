// Mobile-first. Test at 375px before merging.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Tag, X } from "lucide-react";
import { TagChipInput } from "./TagChipInput";
import { applyTagsToProducts, type ApplyResult } from "@/lib/apply-tags";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  selectedIds: string[];
  onCancel: () => void;
  onApplied: (result: ApplyResult) => void;
  /** Optional quick-pick lists; selecting one appends athlete:slug/team:slug to the tags array. */
  athleteOptions?: Array<{ id: string; slug: string; name: string }>;
  teamOptions?: Array<{ id: string; slug: string; name: string }>;
}

/**
 * Bulk-tag bar.
 * - Desktop: sticky to the top of the page (above the page header).
 * - Mobile: fixed to the bottom of the viewport, sitting above the
 *   bottom tab nav, with a stacked layout so the tag input gets the
 *   full width.
 */
export function BulkTagBar({ selectedIds, onCancel, onApplied, athleteOptions = [], teamOptions = [] }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = !!progress;
  const isMobile = useIsMobile();

  function addAthlete(slug: string) {
    const tag = `athlete:${slug}`;
    if (tags.includes(tag)) return;
    setTags([...tags, tag]);
  }
  function addTeam(slug: string) {
    const tag = `team:${slug}`;
    if (tags.includes(tag)) return;
    setTags([...tags, tag]);
  }

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
      haptic.success();
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

  if (isMobile) {
    // Bottom-fixed bar sitting above the 56px bottom nav + safe area
    return (
      <div
        className={cn(
          "md:hidden fixed inset-x-0 z-40 px-3 pt-3 pb-3",
          "bg-background/95 backdrop-blur-md border-t border-accent/40",
          "shadow-[0_-4px_20px_-8px_hsl(var(--accent)/0.4)]",
        )}
        style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Tag className="h-4 w-4 text-accent" />
            <span className="tabular-nums">
              {selectedIds.length} selected
            </span>
            {progress && (
              <span className="text-xs text-muted-foreground tabular-nums">
                · {progress.done}/{progress.total}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel bulk tag mode"
            className="pressable h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <TagChipInput
          tags={tags}
          onChange={setTags}
          placeholder="Add tags…"
        />
        <Button
          onClick={handleApply}
          disabled={busy || tags.length === 0 || selectedIds.length === 0}
          className="w-full mt-2 h-11 gap-2 pressable"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Apply Tags
        </Button>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 bg-dark/95 backdrop-blur-md border-b-2 border-accent shadow-[0_8px_24px_-8px_hsl(var(--accent)/0.5)]">
      <div className="max-w-[1600px] mx-auto flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
          <Tag className="h-4 w-4 text-accent" />
          <span className="tabular-nums">
            {selectedIds.length} {selectedIds.length === 1 ? "product" : "products"} selected
          </span>
        </div>
        {athleteOptions.length > 0 && (
          <Select value="" onValueChange={addAthlete}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="+ Athlete tag" />
            </SelectTrigger>
            <SelectContent>
              {athleteOptions.map((a) => (
                <SelectItem key={a.id} value={a.slug}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {teamOptions.length > 0 && (
          <Select value="" onValueChange={addTeam}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="+ Team tag" />
            </SelectTrigger>
            <SelectContent>
              {teamOptions.map((t) => (
                <SelectItem key={t.id} value={t.slug}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
