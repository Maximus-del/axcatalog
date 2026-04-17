import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

const PRODUCT_TYPES = [
  "athlete_merch",
  "team_merch",
  "blank_bulk",
  "pod",
  "other",
] as const;
const STATUSES = ["draft", "internal", "published", "archived", "needs_review"] as const;
const ATHLETE_ROLES = ["primary", "featured", "collab"] as const;
const PLACEMENTS = [
  "front",
  "back",
  "left_sleeve",
  "right_sleeve",
  "hem",
  "chest",
  "pocket",
  "hood",
  "sleeve_wrap",
  "all_over",
  "other",
] as const;
const NONE = "__none__";

type ProductType = (typeof PRODUCT_TYPES)[number];
type ProductStatus = (typeof STATUSES)[number];
type AthleteRole = (typeof ATHLETE_ROLES)[number];
type Placement = (typeof PLACEMENTS)[number];

interface AthletePick {
  athlete_id: string;
  role: AthleteRole;
  team_id_at_release: string | null;
  memberships: Array<{ team_id: string; team_name: string }>;
}

interface DesignPick {
  design_id: string;
  placement: Placement;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ProductFormDrawer({ open, onOpenChange, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [productType, setProductType] = useState<ProductType>("athlete_merch");
  const [status, setStatus] = useState<ProductStatus>("draft");
  const [notes, setNotes] = useState("");
  const [blankId, setBlankId] = useState<string | null>(null);

  const [athletes, setAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [designs, setDesigns] = useState<Array<{ id: string; title: string }>>([]);
  const [blanks, setBlanks] = useState<Array<{ id: string; name: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);

  const [pickedAthletes, setPickedAthletes] = useState<AthletePick[]>([]);
  const [pickedTeams, setPickedTeams] = useState<string[]>([]);
  const [pickedDesigns, setPickedDesigns] = useState<DesignPick[]>([]);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset
    setTitle("");
    setSlug("");
    setSlugDirty(false);
    setDescription("");
    setSku("");
    setPrice("");
    setCompareAt("");
    setProductType("athlete_merch");
    setStatus("draft");
    setNotes("");
    setBlankId(null);
    setPickedAthletes([]);
    setPickedTeams([]);
    setPickedDesigns([]);
    setPickedTags([]);
    setNewTag("");

    (async () => {
      const [a, t, d, b, tg] = await Promise.all([
        supabase
          .from("athletes")
          .select("id, first_name, last_name, full_name")
          .order("last_name"),
        supabase.from("teams").select("id, name").order("name"),
        supabase.from("designs").select("id, title").order("title"),
        supabase.from("blanks").select("id, name").order("name"),
        supabase.from("tags").select("id, name").order("name"),
      ]);
      setAthletes(
        (a.data ?? []).map((r) => ({
          id: r.id,
          name: r.full_name ?? `${r.first_name} ${r.last_name}`,
        })),
      );
      setTeams(t.data ?? []);
      setDesigns(d.data ?? []);
      setBlanks(b.data ?? []);
      setTags(tg.data ?? []);
    })();
  }, [open]);

  // Auto-slug from title
  useEffect(() => {
    if (slugDirty) return;
    setSlug(slugify(title));
  }, [title, slugDirty]);

  // Load memberships for any newly-added athlete
  async function addAthlete(athleteId: string) {
    if (pickedAthletes.some((p) => p.athlete_id === athleteId)) return;
    const { data } = await supabase
      .from("team_memberships")
      .select("team_id, teams!team_memberships_team_id_fkey(name)")
      .eq("athlete_id", athleteId);
    const memberships = (data ?? []).map((m) => ({
      team_id: m.team_id,
      team_name:
        (Array.isArray(m.teams) ? m.teams[0]?.name : (m.teams as { name?: string })?.name) ??
        "Team",
    }));
    setPickedAthletes((prev) => [
      ...prev,
      { athlete_id: athleteId, role: "primary", team_id_at_release: null, memberships },
    ]);
  }

  function removeAthlete(athleteId: string) {
    setPickedAthletes((prev) => prev.filter((p) => p.athlete_id !== athleteId));
  }

  function updateAthlete(athleteId: string, patch: Partial<AthletePick>) {
    setPickedAthletes((prev) =>
      prev.map((p) => (p.athlete_id === athleteId ? { ...p, ...patch } : p)),
    );
  }

  function toggleTeam(teamId: string) {
    setPickedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    );
  }

  function addDesign(designId: string) {
    if (pickedDesigns.some((d) => d.design_id === designId)) return;
    setPickedDesigns((prev) => [...prev, { design_id: designId, placement: "front" }]);
  }
  function removeDesign(designId: string) {
    setPickedDesigns((prev) => prev.filter((d) => d.design_id !== designId));
  }
  function updateDesignPlacement(designId: string, placement: Placement) {
    setPickedDesigns((prev) =>
      prev.map((d) => (d.design_id === designId ? { ...d, placement } : d)),
    );
  }

  function toggleTag(tagId: string) {
    setPickedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function createTagInline() {
    const name = newTag.trim();
    if (!name) return;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", userId ?? "")
      .maybeSingle();
    if (!profile?.organization_id) return;
    const { data, error } = await supabase
      .from("tags")
      .insert({
        name,
        slug: slugify(name),
        organization_id: profile.organization_id,
        category: "other",
      })
      .select("id, name")
      .single();
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setTags((prev) => [...prev, data]);
      setPickedTags((prev) => [...prev, data.id]);
      setNewTag("");
    }
  }

  const athleteName = useMemo(
    () => Object.fromEntries(athletes.map((a) => [a.id, a.name])),
    [athletes],
  );
  const designTitle = useMemo(
    () => Object.fromEntries(designs.map((d) => [d.id, d.title])),
    [designs],
  );
  const teamName = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t.name])),
    [teams],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userId ?? "")
        .maybeSingle();
      if (!profile?.organization_id) {
        toast({ title: "Organization not found", variant: "destructive" });
        return;
      }

      const { data: product, error } = await supabase
        .from("products")
        .insert({
          organization_id: profile.organization_id,
          title: title.trim(),
          slug: slug.trim() || slugify(title),
          description: description.trim() || null,
          sku: sku.trim() || null,
          price: price ? Number(price) : null,
          compare_at_price: compareAt ? Number(compareAt) : null,
          product_type: productType,
          status,
          notes: notes.trim() || null,
          blank_id: blankId,
        })
        .select("id")
        .single();
      if (error) throw error;
      const productId = product.id;

      const errors: string[] = [];
      if (pickedAthletes.length) {
        const { error: e } = await supabase.from("product_athletes").insert(
          pickedAthletes.map((p) => ({
            product_id: productId,
            athlete_id: p.athlete_id,
            role: p.role,
            team_id_at_release: p.team_id_at_release,
          })),
        );
        if (e) errors.push(e.message);
      }
      if (pickedTeams.length) {
        const { error: e } = await supabase
          .from("product_teams")
          .insert(pickedTeams.map((team_id) => ({ product_id: productId, team_id })));
        if (e) errors.push(e.message);
      }
      if (pickedDesigns.length) {
        const { error: e } = await supabase.from("product_designs").insert(
          pickedDesigns.map((d) => ({
            product_id: productId,
            design_id: d.design_id,
            placement: d.placement,
          })),
        );
        if (e) errors.push(e.message);
      }
      if (pickedTags.length) {
        const { error: e } = await supabase
          .from("product_tags")
          .insert(pickedTags.map((tag_id) => ({ product_id: productId, tag_id })));
        if (e) errors.push(e.message);
      }
      if (errors.length) {
        toast({
          title: `Saved product, but: ${errors.join("; ")}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Product created" });
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Product</SheetTitle>
          <SheetDescription>Add a new product manually.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-8">
          {/* SECTION 1 — BASICS */}
          <section className="space-y-4">
            <div className="ax-section-header">Basics</div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugDirty(true);
                  setSlug(e.target.value);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="compare">Compare at Price</Label>
                <Input
                  id="compare"
                  type="number"
                  step="0.01"
                  value={compareAt}
                  onChange={(e) => setCompareAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Product Type *</Label>
                <Select
                  value={productType}
                  onValueChange={(v) => setProductType(v as ProductType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProductStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* SECTION 2 — LINKS */}
          <section className="space-y-4">
            <div className="ax-section-header">Links</div>

            {/* Blank */}
            <div className="space-y-1.5">
              <Label>Blank</Label>
              <Combobox
                value={blankId}
                onChange={setBlankId}
                options={blanks.map((b) => ({ value: b.id, label: b.name }))}
                placeholder="Search blanks…"
                emptyText="No blanks found"
                allowClear
              />
            </div>

            {/* Athletes */}
            <div className="space-y-2">
              <Label>Linked Athletes</Label>
              <Combobox
                value={null}
                onChange={(id) => id && addAthlete(id)}
                options={athletes
                  .filter((a) => !pickedAthletes.some((p) => p.athlete_id === a.id))
                  .map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Add an athlete…"
                emptyText="No athletes"
              />
              <div className="space-y-2">
                {pickedAthletes.map((p) => (
                  <div
                    key={p.athlete_id}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {athleteName[p.athlete_id]}
                      </div>
                    </div>
                    <Select
                      value={p.role}
                      onValueChange={(v) =>
                        updateAthlete(p.athlete_id, { role: v as AthleteRole })
                      }
                    >
                      <SelectTrigger className="w-[120px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ATHLETE_ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={p.team_id_at_release ?? NONE}
                      onValueChange={(v) =>
                        updateAthlete(p.athlete_id, {
                          team_id_at_release: v === NONE ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue placeholder="Team @ release" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No team era</SelectItem>
                        {p.memberships.map((m) => (
                          <SelectItem key={m.team_id} value={m.team_id}>
                            {m.team_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeAthlete(p.athlete_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Teams */}
            <div className="space-y-2">
              <Label>Linked Teams</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                  >
                    {pickedTeams.length
                      ? `${pickedTeams.length} selected`
                      : "Select teams…"}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search teams…" />
                    <CommandList>
                      <CommandEmpty>No teams</CommandEmpty>
                      <CommandGroup>
                        {teams.map((t) => {
                          const checked = pickedTeams.includes(t.id);
                          return (
                            <CommandItem
                              key={t.id}
                              onSelect={() => toggleTeam(t.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  checked ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {t.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {pickedTeams.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pickedTeams.map((id) => (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {teamName[id]}
                      <button
                        type="button"
                        onClick={() => toggleTeam(id)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Designs */}
            <div className="space-y-2">
              <Label>Linked Designs</Label>
              <Combobox
                value={null}
                onChange={(id) => id && addDesign(id)}
                options={designs
                  .filter((d) => !pickedDesigns.some((p) => p.design_id === d.id))
                  .map((d) => ({ value: d.id, label: d.title }))}
                placeholder="Add a design…"
                emptyText="No designs"
              />
              <div className="space-y-2">
                {pickedDesigns.map((p) => (
                  <div
                    key={p.design_id}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                  >
                    <div className="flex-1 min-w-0 text-sm font-medium truncate">
                      {designTitle[p.design_id]}
                    </div>
                    <Select
                      value={p.placement}
                      onValueChange={(v) =>
                        updateDesignPlacement(p.design_id, v as Placement)
                      }
                    >
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLACEMENTS.map((pl) => (
                          <SelectItem key={pl} value={pl} className="capitalize">
                            {pl.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeDesign(p.design_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* SECTION 3 — TAGS */}
          <section className="space-y-4">
            <div className="ax-section-header">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const checked = pickedTags.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs border transition-colors",
                      checked
                        ? "bg-accent/15 border-accent text-accent"
                        : "border-border text-muted-foreground hover:border-accent/50",
                    )}
                  >
                    {t.name}
                  </button>
                );
              })}
              {tags.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No tags yet — create one below.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="New tag name"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createTagInline();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={createTagInline}
                disabled={!newTag.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </section>

          {/* SECTION 4 — NOTES */}
          <section className="space-y-4">
            <div className="ax-section-header">Notes</div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes (not visible to clients)"
            />
          </section>

          <SheetFooter className="sticky bottom-0 -mx-6 px-6 py-4 bg-background border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create Product"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface ComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  emptyText: string;
  allowClear?: boolean;
}

function Combobox({
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  allowClear,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {allowClear && value && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="mr-2 h-4 w-4" /> Clear
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      o.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
