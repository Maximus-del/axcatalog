// Mobile-first. Test at 375px before merging.
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
 * - Desktop: Radix Popover anchored to the menu button via PopoverAnchor
 *   rendered through a portal at the anchor's live coordinates so scrolling
 *   the page doesn't desync the popover.
 * - Mobile (<768px): full-screen bottom sheet.
 */
export function ProductTagPopover({ productId, anchor, onClose, onSaved }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const isMobile = useIsMobile();
  const open = !!productId && (isMobile || !!anchor);

  // Track the anchor's bounding rect — refresh on scroll/resize so the
  // popover stays glued to the menu button even as the user scrolls.
  useLayoutEffect(() => {
    if (!anchor || isMobile) return;
    function update() {
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      setPos({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, isMobile]);

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
      // Order: athlete → team → collection → freeform.
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

  // Desktop: render a portaled invisible anchor element pinned to the menu
  // button's live position. PopoverAnchor wraps it so Radix positions the
  // PopoverContent next to it. Scrolling updates the anchor via the effect
  // above, so the popover follows.
  if (!anchor || !pos) return null;

  const anchorEl = (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        height: pos.height,
        pointerEvents: "none",
      }}
      aria-hidden
    />
  );

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor asChild>{anchorEl}</PopoverAnchor>
      <PopoverContent
        className="w-80 p-3 space-y-3 z-50"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tags
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}
