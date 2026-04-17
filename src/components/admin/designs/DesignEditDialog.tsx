import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DESIGN_STATUSES, formatDesignStatus } from "@/lib/design-status";
import { slugify } from "@/lib/slug";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designId: string;
  onSaved?: () => void;
}

interface DesignDraft {
  title: string;
  slug: string;
  description: string;
  status: string;
  primary_athlete_id: string | null;
  primary_team_id: string | null;
  season: string;
  campaign: string;
  notes: string;
}

export function DesignEditDialog({ open, onOpenChange, designId, onSaved }: Props) {
  const [draft, setDraft] = useState<DesignDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [athletes, setAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [dRes, aRes, tRes] = await Promise.all([
        supabase
          .from("designs")
          .select(
            "title, slug, description, status, primary_athlete_id, primary_team_id, season, campaign, notes",
          )
          .eq("id", designId)
          .maybeSingle(),
        supabase.from("athletes").select("id, first_name, last_name, full_name").order("last_name"),
        supabase.from("teams").select("id, name").order("name"),
      ]);
      if (cancelled) return;
      if (dRes.data) {
        setDraft({
          title: dRes.data.title,
          slug: dRes.data.slug,
          description: dRes.data.description ?? "",
          status: dRes.data.status,
          primary_athlete_id: dRes.data.primary_athlete_id,
          primary_team_id: dRes.data.primary_team_id,
          season: dRes.data.season ?? "",
          campaign: dRes.data.campaign ?? "",
          notes: dRes.data.notes ?? "",
        });
      }
      setAthletes(
        (aRes.data ?? []).map((a) => ({
          id: a.id,
          name: a.full_name ?? `${a.first_name} ${a.last_name}`,
        })),
      );
      setTeams((tRes.data ?? []) as Array<{ id: string; name: string }>);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, designId]);

  async function handleSave() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("designs")
      .update({
        title: draft.title.trim(),
        slug: draft.slug || slugify(draft.title),
        description: draft.description || null,
        status: draft.status as "concept" | "in_progress" | "approved" | "production_ready" | "archived",
        primary_athlete_id: draft.primary_athlete_id,
        primary_team_id: draft.primary_team_id,
        season: draft.season || null,
        campaign: draft.campaign || null,
        notes: draft.notes || null,
      })
      .eq("id", designId);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Failed to save");
      return;
    }
    toast.success("Design updated");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Design</DialogTitle>
        </DialogHeader>

        {loading || !draft ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DESIGN_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {formatDesignStatus(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Season</Label>
                <Input value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Primary Athlete</Label>
                <Select
                  value={draft.primary_athlete_id ?? "none"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, primary_athlete_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {athletes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Primary Team</Label>
                <Select
                  value={draft.primary_team_id ?? "none"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, primary_team_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Campaign</Label>
                <Input value={draft.campaign} onChange={(e) => setDraft({ ...draft, campaign: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
