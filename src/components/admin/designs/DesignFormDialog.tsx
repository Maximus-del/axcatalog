import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Upload, X, XCircle } from "lucide-react";
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
import { uploadDesignFromFile } from "@/lib/upload-design";
import { cn } from "@/lib/utils";

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

  // PNG file uploads. When present, EACH file creates its own design.
  const [files, setFiles] = useState<File[]>([]);
  type Status = "pending" | "uploading" | "ok" | "fail";
  const [fileStatus, setFileStatus] = useState<Record<string, Status>>({});

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
    setFiles([]);
    setFileStatus({});
  }

  const athleteTeamMap = useMemo(() => new Map<string, string | null>(), []);

  function fileKey(f: File) {
    return `${f.name}-${f.size}-${f.lastModified}`;
  }

  function addFiles(picked: FileList | File[] | null) {
    if (!picked) return;
    const incoming = Array.from(picked);
    const pngs = incoming.filter((f) => f.type === "image/png");
    const skipped = incoming.length - pngs.length;
    if (skipped > 0) toast.error(`Skipped ${skipped} non-PNG file(s)`);
    if (!pngs.length) return;
    setFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      const merged = [...prev];
      pngs.forEach((f) => {
        if (!seen.has(fileKey(f))) merged.push(f);
      });
      return merged;
    });
  }

  function removeFile(f: File) {
    setFiles((prev) => prev.filter((x) => fileKey(x) !== fileKey(f)));
    setFileStatus((s) => {
      const next = { ...s };
      delete next[fileKey(f)];
      return next;
    });
  }

  async function handleSubmit() {
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    // Validation depends on which mode we're in.
    if (files.length === 0 && !title.trim()) {
      toast.error("Add a title or attach at least one PNG file");
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
      const targetCollectionId = collectionId === "none" ? null : collectionId;

      // ---- MODE A: file(s) attached → each file = its own design ----
      if (files.length > 0) {
        let okCount = 0;
        let failCount = 0;
        const initial: Record<string, Status> = {};
        files.forEach((f) => {
          initial[fileKey(f)] = "pending";
        });
        setFileStatus(initial);

        for (const file of files) {
          setFileStatus((s) => ({ ...s, [fileKey(file)]: "uploading" }));
          try {
            await uploadDesignFromFile({
              file,
              organizationId: orgId,
              collectionId: targetCollectionId,
              // Use the typed Title only if exactly one file is being uploaded.
              titleOverride: files.length === 1 && title.trim() ? title.trim() : undefined,
            });
            setFileStatus((s) => ({ ...s, [fileKey(file)]: "ok" }));
            okCount += 1;
          } catch (err) {
            console.error("Upload failed for", file.name, err);
            setFileStatus((s) => ({ ...s, [fileKey(file)]: "fail" }));
            failCount += 1;
          }
        }

        if (okCount > 0) toast.success(`Created ${okCount} design(s)`);
        if (failCount > 0) toast.error(`${failCount} upload(s) failed`);
        if (failCount === 0) {
          reset();
          onOpenChange(false);
        }
        onCreated?.();
        return;
      }

      // ---- MODE B: full metadata, no files (legacy behavior) ----
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
          design_collection_id: targetCollectionId,
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
          <Section title="Files (optional)">
            <p className="text-xs text-muted-foreground -mt-1">
              Attach one or more PNG files. <strong>Each file becomes its own design.</strong>{" "}
              When files are attached, the metadata below is ignored (you can edit each design
              afterwards). Leave empty to create a single metadata-only design.
            </p>
            <FilePickerArea
              files={files}
              fileStatus={fileStatus}
              fileKey={fileKey}
              onAdd={addFiles}
              onRemove={removeFile}
              disabled={submitting}
            />
          </Section>

          <Section title="Basics">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  files.length > 1
                    ? "Ignored — each file becomes its own design (titled by filename)"
                    : files.length === 1
                      ? "Optional — defaults to the filename"
                      : ""
                }
                disabled={files.length > 1}
              />
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
            {submitting
              ? files.length > 0
                ? `Uploading… (${Object.values(fileStatus).filter((s) => s === "ok" || s === "fail").length}/${files.length})`
                : "Creating…"
              : files.length > 0
                ? `Create ${files.length} Design${files.length === 1 ? "" : "s"}`
                : "Create Design"}
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

function FilePickerArea({
  files,
  fileStatus,
  fileKey,
  onAdd,
  onRemove,
  disabled,
}: {
  files: File[];
  fileStatus: Record<string, "pending" | "uploading" | "ok" | "fail">;
  fileKey: (f: File) => string;
  onAdd: (files: FileList | File[] | null) => void;
  onRemove: (f: File) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div className="space-y-3">
      <label
        onDragEnter={(e) => {
          if (disabled) return;
          if (!e.dataTransfer?.types?.includes("Files")) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          if (disabled) return;
          if (!e.dataTransfer?.types?.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setOver(false);
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(false);
          onAdd(e.dataTransfer?.files ?? null);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
          over
            ? "border-accent bg-accent/5"
            : "border-border hover:border-accent/50 hover:bg-muted/30",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">Drop PNG files here or click to browse</div>
        <div className="text-xs text-muted-foreground">PNG only · multiple files allowed</div>
        <input
          type="file"
          accept="image/png"
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(e.target.files);
            e.currentTarget.value = "";
          }}
          disabled={disabled}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-border p-2 bg-muted/20">
          {files.map((f) => {
            const st = fileStatus[fileKey(f)] ?? "pending";
            return (
              <li
                key={fileKey(f)}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-background"
              >
                <span className="flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="text-muted-foreground">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
                <span className="w-5 flex justify-center">
                  {st === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                  {st === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {st === "fail" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                </span>
                {st !== "uploading" && st !== "ok" && (
                  <button
                    type="button"
                    onClick={() => onRemove(f)}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
