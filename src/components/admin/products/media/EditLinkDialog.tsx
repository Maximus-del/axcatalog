// Mobile-first. Test at 375px before merging.
//
// Edit an existing product_designs link: change placement, promote/demote
// between primary and variation, change variation_of and variation_label.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PLACEMENT_OPTIONS, type DesignPlacement } from "./placements";
import type { LinkRow } from "./DesignsTab";
import type { PrimaryOption } from "./DesignPickerDialog";

interface Props {
  open: boolean;
  row: LinkRow | null;
  primaryOptions: PrimaryOption[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

export function EditLinkDialog({ open, row, primaryOptions, onOpenChange, onSaved }: Props) {
  const [placement, setPlacement] = useState<DesignPlacement>("front");
  const [asVariation, setAsVariation] = useState(false);
  const [variationOf, setVariationOf] = useState<string>("none");
  const [variationLabel, setVariationLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setPlacement(row.placement);
    setAsVariation(row.is_variation);
    setVariationOf(row.variation_of ?? "none");
    setVariationLabel(row.variation_label ?? "");
  }, [open, row]);

  // Filter "Variation of" options so a row can't pick itself
  const variationOfChoices = primaryOptions.filter((p) => p.id !== row?.id);

  async function handleSave() {
    if (!row) return;
    setSaving(true);
    const trimmed = variationLabel.trim().slice(0, 50);
    const payload = {
      placement,
      is_variation: asVariation,
      variation_of: asVariation && variationOf !== "none" ? variationOf : null,
      variation_label: asVariation && trimmed ? trimmed : null,
    };
    const { error } = await supabase
      .from("product_designs")
      .update(payload)
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Failed to update");
      return;
    }
    toast.success("Link updated");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Edit link{row && <span className="text-xs font-normal text-muted-foreground"> — {row.design.title}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Placement
            </Label>
            <Select value={placement} onValueChange={(v) => setPlacement(v as DesignPlacement)}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENT_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="edit-as-variation"
              checked={asVariation}
              onCheckedChange={setAsVariation}
            />
            <Label htmlFor="edit-as-variation" className="text-sm cursor-pointer">
              Mark as variation
            </Label>
          </div>

          {asVariation && (
            <>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Variation of
                </Label>
                <Select value={variationOf} onValueChange={setVariationOf}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (unlinked)</SelectItem>
                    {variationOfChoices.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.design_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label
                  htmlFor="edit-variation-label"
                  className="text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  Variation label (optional)
                </Label>
                <Input
                  id="edit-variation-label"
                  value={variationLabel}
                  onChange={(e) => setVariationLabel(e.target.value.slice(0, 50))}
                  placeholder="e.g. Navy colorway, Alt layout, v2"
                  maxLength={50}
                  className="h-9 mt-1"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}