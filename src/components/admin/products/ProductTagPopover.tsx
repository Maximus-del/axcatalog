// Mobile-first. Test at 375px before merging.
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TagChipInput } from "./TagChipInput";
import { supabase } from "@/integrations/supabase/client";
import { applyTagsToProducts } from "@/lib/apply-tags";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { haptic } from "@/lib/haptics";

interface Props {
  productId: string | null;
  anchor: HTMLElement | null;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Edit tags on a single product.
 * - Desktop: anchored popover
 * - Mobile (<768px): full-screen bottom sheet with large input
 */
export function ProductTagPopover({ productId, anchor, onClose, onSaved }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  // On mobile we don't need the anchor — opening is purely controlled by productId
  const open = !!productId && (isMobile || !!anchor);

  useEffect(() => {
    if (!productId) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      const [tagsRes, athRes, teamRes] = await Promise.all([
        supabase
          .from("product_tags")
          .select("tag:tags!product_tags_tag_id_fkey(name)")
          .eq("product_id", productId),
        supabase
          .from("product_athletes")
          .select("athlete:athletes!product_athletes_athlete_id_fkey(slug)")
          .eq("product_id", productId),
        supabase
          .from("product_teams")
          .select("team:teams!product_teams_team_id_fkey(slug)")
          .eq("product_id", productId),
      ]);
      if (cancel) return;
      const out: string[] = [];
      (athRes.data ?? []).forEach((r) => {
        const a = Array.isArray(r.athlete) ? r.athlete[0] : r.athlete;
        if (a?.slug) out.push(`athlete:${a.slug}`);
      });
      (teamRes.data ?? []).forEach((r) => {
        const t = Array.isArray(r.team) ? r.team[0] : r.team;
        if (t?.slug) out.push(`team:${t.slug}`);
      });
      (tagsRes.data ?? []).forEach((r) => {
        const t = Array.isArray(r.tag) ? r.tag[0] : r.tag;
        if (t?.name) out.push(t.name);
      });
      setTags(out);
      setOriginal(out);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [productId]);

  async function handleSave() {
    if (!productId) return;
    const added = tags.filter((t) => !original.includes(t));
    const removed = original.filter((t) => !tags.includes(t));
    if (added.length === 0 && removed.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const { failed } = await applyTagsToProducts({
        productIds: [productId],
        addTags: added,
        removeTags: removed,
      });
      if (failed.length > 0) {
        toast.error(`Tag update failed: ${failed[0].error}`);
      } else {
        haptic.success();
        toast.success("Tags updated");
        onSaved?.();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TagChipInput
          tags={tags}
          onChange={setTags}
          placeholder="athlete:..., team:..., or freeform"
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size={isMobile ? "default" : "sm"} onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size={isMobile ? "default" : "sm"} onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[90vh] overflow-y-auto">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left">
            <SheetTitle>Manage tags</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        {/* Anchor handled via virtual reference using a hidden span */}
        <span
          ref={(el) => {
            if (el && anchor) {
              const r = anchor.getBoundingClientRect();
              el.style.position = "fixed";
              el.style.top = `${r.bottom + window.scrollY}px`;
              el.style.left = `${r.left + window.scrollX}px`;
              el.style.width = "1px";
              el.style.height = "1px";
            }
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-3" align="end">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tags
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}
