import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  productId: string | null;
  initialTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newTitle: string) => void;
}

/**
 * Inline modal to rename a product. Updates Supabase, then pushes the new
 * title to Shopify via the shopify-update-product edge function.
 */
export function EditTitleDialog({ productId, initialTitle, open, onOpenChange, onSaved }: Props) {
  const [value, setValue] = useState(initialTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(initialTitle);
  }, [open, initialTitle]);

  async function handleSave() {
    if (!productId) return;
    const next = value.trim();
    if (!next) {
      toast.error("Title cannot be empty");
      return;
    }
    if (next === initialTitle) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ title: next })
        .eq("id", productId);
      if (error) throw error;

      // Push to Shopify. Local update already succeeded, so we keep the new
      // title even on Shopify failure — but show the user what happened.
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        "shopify-update-product",
        { body: { product_id: productId, title: next } },
      );
      const shopifyErr =
        fnErr?.message ??
        (fnData && !fnData.ok ? fnData.error : null);
      if (shopifyErr) {
        console.warn("Shopify title push failed:", shopifyErr);
        if (fnData?.queued) {
          toast.warning(
            `Saved locally — Shopify sync queued for retry: ${shopifyErr}`,
          );
        } else {
          toast.warning(`Saved locally — Shopify sync failed: ${shopifyErr}`);
        }
      } else {
        toast.success("Title updated");
      }
      onSaved(next);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update title");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit product title</DialogTitle>
          <DialogDescription>
            Updates locally and pushes to Shopify.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          autoFocus
          disabled={saving}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !value.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
