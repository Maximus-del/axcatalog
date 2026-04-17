import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { slugify } from "@/lib/slug";

const LEAGUES = ["NFL", "NBA", "MLB", "NHL", "MLS", "WNBA", "NCAA", "OTHER"] as const;
const STATUSES = ["active", "inactive", "archived"] as const;
const NONE = "__none__";

type League = (typeof LEAGUES)[number];
type Status = (typeof STATUSES)[number];

export interface AthleteFormValues {
  id?: string;
  first_name: string;
  last_name: string;
  slug: string;
  current_team_id: string | null;
  position: string;
  jersey_number: string;
  league: League | null;
  status: Status;
  notes: string;
}

const EMPTY: AthleteFormValues = {
  first_name: "",
  last_name: "",
  slug: "",
  current_team_id: null,
  position: "",
  jersey_number: "",
  league: null,
  status: "active",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AthleteFormValues;
  onSaved?: () => void;
}

export function AthleteFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const isEdit = !!initial?.id;
  const [values, setValues] = useState<AthleteFormValues>(initial ?? EMPTY);
  const [slugDirty, setSlugDirty] = useState(isEdit);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(initial ?? EMPTY);
      setSlugDirty(!!initial?.id);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("teams")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTeams(data ?? []));
  }, [open]);

  // Auto-slug
  useEffect(() => {
    if (slugDirty) return;
    const candidate = slugify(`${values.first_name} ${values.last_name}`);
    setValues((v) => ({ ...v, slug: candidate }));
  }, [values.first_name, values.last_name, slugDirty]);

  const set = <K extends keyof AthleteFormValues>(key: K, val: AthleteFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.first_name.trim() || !values.last_name.trim()) {
      toast({ title: "First and last name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      if (!profile?.organization_id) {
        toast({ title: "Organization not found", variant: "destructive" });
        return;
      }

      const payload = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        slug: values.slug.trim() || slugify(`${values.first_name} ${values.last_name}`),
        current_team_id: values.current_team_id,
        position: values.position.trim() || null,
        jersey_number: values.jersey_number.trim() || null,
        league: values.league,
        status: values.status,
        notes: values.notes.trim() || null,
      };

      if (isEdit && initial?.id) {
        const { error } = await supabase
          .from("athletes")
          .update(payload)
          .eq("id", initial.id);
        if (error) throw error;
        toast({ title: "Athlete updated" });
      } else {
        const { data: inserted, error } = await supabase
          .from("athletes")
          .insert({ ...payload, organization_id: profile.organization_id })
          .select("id")
          .single();
        if (error) throw error;

        if (payload.current_team_id && inserted?.id) {
          await supabase.from("team_memberships").insert({
            athlete_id: inserted.id,
            team_id: payload.current_team_id,
            organization_id: profile.organization_id,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: null,
          });
        }
        toast({ title: "Athlete added" });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Athlete" : "Add Athlete"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={values.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={values.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={values.slug}
              onChange={(e) => {
                setSlugDirty(true);
                set("slug", e.target.value);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Current Team</Label>
              <Select
                value={values.current_team_id ?? NONE}
                onValueChange={(v) => set("current_team_id", v === NONE ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Free Agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Free Agent</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>League</Label>
              <Select
                value={values.league ?? NONE}
                onValueChange={(v) =>
                  set("league", v === NONE ? null : (v as League))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {LEAGUES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                value={values.position}
                onChange={(e) => set("position", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jersey">Jersey #</Label>
              <Input
                id="jersey"
                value={values.jersey_number}
                onChange={(e) => set("jersey_number", e.target.value)}
                placeholder="#23"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as Status)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save" : "Add Athlete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
