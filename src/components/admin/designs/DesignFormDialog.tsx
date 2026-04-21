import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
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
import { useAuth } from "@/auth/AuthProvider";
import { slugify } from "@/lib/slug";
import { DESIGN_STATUSES, formatDesignStatus } from "@/lib/design-status";

interface AthleteOption {
  id: string;
  name: string;
}
interface TeamOption {
  id: string;
  name: string;
}
interface TagOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** If provided, the design will be pre-assigned to this collection. */
  defaultCollectionId?: string | null;
}

export function DesignFormDialog({ open, onOpenChange, onCreated, defaultCollectionId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("concept");
  const [primaryAthlete, setPrimaryAthlete] = useState<string>("none");
  const [primaryTeam, setPrimaryTeam] = useState<string>("none");
  const [season, setSeason] = useState("");
  const [campaign, setCampaign] = useState("");
  const [extraAthletes, setExtraAthletes] = useState<string[]>([]);
  const [extraTeams, setExtraTeams] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState("");
  const [collectionId, setCollectionId] = useState<string>("none");

  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setCollectionId(defaultCollectionId ?? "none");
    void (async () => {
      const [aRes, tRes, tagRes, cRes] = await Promise.all([
        supabase.from("athletes").select("id, first_name, last_name, full_name").order("last_name"),
        supabase.from("teams").select("id, name").order("name"),
        supabase.from("tags").select("id, name").order("name"),
        supabase.from("design_collections").select("id, name").order("name"),
      ]);
      setAthletes(
        (aRes.data ?? []).map((a) => ({
          id: a.id,
          name: a.full_name ?? `${a.first_name} ${a.last_name}`,
        })),
      );
      setTeams((tRes.data ?? []) as TeamOption[]);
      setTags((tagRes.data ?? []) as TagOption[]);
      setCollections((cRes.data ?? []) as Array<{ id: string; name: string }>);
    })();
  }, [open, defaultCollectionId]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  function reset() {
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setDescription("");
    setStatus("concept");
    setPrimaryAthlete("none");
    setPrimaryTeam("none");
    setSeason("");
    setCampaign("");
    setExtraAthletes([]);
    setExtraTeams([]);
    setTagIds([]);
    setNewTag("");
    setNotes("");
  }

  const athleteTeamMap = useMemo(() => new Map<string, string | null>(), []);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    setSubmitting(true);
    try {
      const profileRes = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      const orgId = profileRes.data?.organization_id;
      if (!orgId) throw new Error("No organization for user");

      const insertRes = await supabase
        .from("designs")
        .insert({
          organization_id: orgId,
          title: title.trim(),
          slug: slug || slugify(title),
          description: description || null,
          status: status as "concept" | "in_progress" | "approved" | "production_ready" | "archived",
          primary_athlete_id: primaryAthlete === "none" ? null : primaryAthlete,
          primary_team_id: primaryTeam === "none" ? null : primaryTeam,
          season: season || null,
          campaign: campaign || null,
          notes: notes || null,
          design_collection_id: collectionId === "none" ? null : collectionId,
        })
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;
      const designId = insertRes.data.id;

      // Athletes — fetch current team for each
      if (extraAthletes.length) {
        const memRes = await supabase
          .from("team_memberships")
          .select("athlete_id, team_id, end_date")
          .in("athlete_id", extraAthletes)
          .is("end_date", null);
        (memRes.data ?? []).forEach((m) => {
          if (!athleteTeamMap.has(m.athlete_id)) athleteTeamMap.set(m.athlete_id, m.team_id);
        });
        await supabase.from("design_athletes").insert(
          extraAthletes.map((id) => ({
            design_id: designId,
            athlete_id: id,
            team_id_at_creation: athleteTeamMap.get(id) ?? null,
          })),
        );
      }
      if (extraTeams.length) {
        await supabase
          .from("design_teams")
          .insert(extraTeams.map((team_id) => ({ design_id: designId, team_id })));
      }
      if (tagIds.length) {
        await supabase
          .from("design_tags")
          .insert(tagIds.map((tag_id) => ({ design_id: designId, tag_id })));
      }

      toast.success("Design created — upload files from the detail page");
      reset();
      onOpenChange(false);
      onCreated?.();
      navigate(`/admin/designs/${designId}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create design");
    } finally {
      setSubmitting(false);
    }
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name || !user) return;
    const profileRes = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profileRes.data?.organization_id;
    if (!orgId) return;
    const res = await supabase
      .from("tags")
      .insert({ organization_id: orgId, name, slug: slugify(name) })
      .select("id, name")
      .single();
    if (res.data) {
      setTags((t) => [...t, res.data]);
      setTagIds((ids) => [...ids, res.data.id]);
      setNewTag("");
    }
  }

  function toggleArr(arr: string[], v: string, setter: (x: string[]) => void) {
    if (arr.includes(v)) setter(arr.filter((x) => x !== v));
    else setter([...arr, v]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Design</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section title="Basics">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Label>Collection</Label>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Uncollected —</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section title="Links">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Primary Athlete</Label>
                <Select value={primaryAthlete} onValueChange={setPrimaryAthlete}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {athletes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Primary Team</Label>
                <Select value={primaryTeam} onValueChange={setPrimaryTeam}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Season</Label>
                <Input
                  placeholder="Spring 2026"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} />
              </div>
            </div>

            <MultiPicker
              label="Additional Athletes"
              options={athletes.map((a) => ({ id: a.id, label: a.name }))}
              selected={extraAthletes}
              onToggle={(id) => toggleArr(extraAthletes, id, setExtraAthletes)}
            />
            <MultiPicker
              label="Additional Teams"
              options={teams.map((t) => ({ id: t.id, label: t.name }))}
              selected={extraTeams}
              onToggle={(id) => toggleArr(extraTeams, id, setExtraTeams)}
            />
          </Section>

          <Section title="Tags">
            <MultiPicker
              label="Tags"
              options={tags.map((t) => ({ id: t.id, label: t.name }))}
              selected={tagIds}
              onToggle={(id) => toggleArr(tagIds, id, setTagIds)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Create new tag…"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={createTag}>
                Add
              </Button>
            </div>
          </Section>

          <Section title="Notes">
            <Textarea
              placeholder="Internal notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Design"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="ax-section-header">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MultiPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2 p-2 border border-border rounded-md max-h-32 overflow-y-auto bg-muted/20">
        {options.length === 0 && (
          <span className="text-xs text-muted-foreground">No options yet.</span>
        )}
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                on
                  ? "bg-accent/15 text-accent border-accent/40"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {on && <X className="inline h-3 w-3 mr-1" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
