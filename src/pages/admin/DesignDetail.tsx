import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus, Palette, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type DesignStatus,
  designStatusBadgeClass,
  formatDesignStatus,
} from "@/lib/design-status";
import { getSignedUrl } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import { DesignFilesTab } from "@/components/admin/designs/DesignFilesTab";
import { DesignEditDialog } from "@/components/admin/designs/DesignEditDialog";
import { cn } from "@/lib/utils";

interface DesignDetailRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: DesignStatus;
  season: string | null;
  campaign: string | null;
  notes: string | null;
  primary_athlete: { id: string; first_name: string; last_name: string; full_name: string | null } | null;
  primary_team: { id: string; name: string } | null;
}

interface LinkedAthlete {
  athlete_id: string;
  team_id_at_creation: string | null;
  athlete_name: string;
  team_name: string | null;
}
interface LinkedTeam {
  team_id: string;
  name: string;
}
interface LinkedTag {
  tag_id: string;
  name: string;
}
interface LinkedProduct {
  product_id: string;
  title: string;
  placement: string;
  primary_image_url: string | null;
}

export default function DesignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const designId = id!;

  const [design, setDesign] = useState<DesignDetailRow | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [linkedAthletes, setLinkedAthletes] = useState<LinkedAthlete[]>([]);
  const [linkedTeams, setLinkedTeams] = useState<LinkedTeam[]>([]);
  const [linkedTags, setLinkedTags] = useState<LinkedTag[]>([]);
  const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[]>([]);

  const [allAthletes, setAllAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [allTeams, setAllTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string }>>([]);
  const [addAthleteId, setAddAthleteId] = useState<string>("");
  const [addTeamId, setAddTeamId] = useState<string>("");
  const [addTagId, setAddTagId] = useState<string>("");
  const [newTagName, setNewTagName] = useState("");

  async function loadDesign() {
    setLoading(true);
    const { data, error } = await supabase
      .from("designs")
      .select(
        `id, title, slug, description, status, season, campaign, notes,
         primary_athlete:athletes!designs_primary_athlete_id_fkey(id, first_name, last_name, full_name),
         primary_team:teams!designs_primary_team_id_fkey(id, name)`,
      )
      .eq("id", designId)
      .maybeSingle();
    if (error) console.error(error);
    if (data) {
      const a = Array.isArray(data.primary_athlete) ? data.primary_athlete[0] : data.primary_athlete;
      const t = Array.isArray(data.primary_team) ? data.primary_team[0] : data.primary_team;
      setDesign({
        id: data.id,
        title: data.title,
        slug: data.slug,
        description: data.description,
        status: data.status as DesignStatus,
        season: data.season,
        campaign: data.campaign,
        notes: data.notes,
        primary_athlete: a ?? null,
        primary_team: t ?? null,
      });
    }
    setLoading(false);
  }

  async function loadHero() {
    const { data } = await supabase
      .from("design_files")
      .select("storage_bucket, storage_path")
      .eq("design_id", designId)
      .eq("file_type", "mockup")
      .eq("is_primary", true)
      .maybeSingle();
    if (data) {
      const url = await getSignedUrl(data.storage_bucket, data.storage_path, 3600);
      setHeroUrl(url);
    } else {
      setHeroUrl(null);
    }
  }

  async function loadLinks() {
    const [aRes, tRes, tagRes, pdRes, athletesAll, teamsAll, tagsAll] = await Promise.all([
      supabase
        .from("design_athletes")
        .select(
          `athlete_id, team_id_at_creation,
           athlete:athletes!design_athletes_athlete_id_fkey(id, first_name, last_name, full_name),
           team:teams!design_athletes_team_id_at_creation_fkey(id, name)`,
        )
        .eq("design_id", designId),
      supabase
        .from("design_teams")
        .select("team_id, team:teams!design_teams_team_id_fkey(id, name)")
        .eq("design_id", designId),
      supabase
        .from("design_tags")
        .select("tag_id, tag:tags!design_tags_tag_id_fkey(id, name)")
        .eq("design_id", designId),
      supabase
        .from("product_designs")
        .select(
          `product_id, placement,
           product:products!product_designs_product_id_fkey(id, title)`,
        )
        .eq("design_id", designId),
      supabase.from("athletes").select("id, first_name, last_name, full_name").order("last_name"),
      supabase.from("teams").select("id, name").order("name"),
      supabase.from("tags").select("id, name").order("name"),
    ]);

    setLinkedAthletes(
      (aRes.data ?? []).map((r) => {
        const a = Array.isArray(r.athlete) ? r.athlete[0] : r.athlete;
        const t = Array.isArray(r.team) ? r.team[0] : r.team;
        return {
          athlete_id: r.athlete_id,
          team_id_at_creation: r.team_id_at_creation,
          athlete_name: a ? a.full_name ?? `${a.first_name} ${a.last_name}` : "Unknown",
          team_name: t?.name ?? null,
        };
      }),
    );
    setLinkedTeams(
      (tRes.data ?? []).map((r) => {
        const t = Array.isArray(r.team) ? r.team[0] : r.team;
        return { team_id: r.team_id, name: t?.name ?? "Unknown" };
      }),
    );
    setLinkedTags(
      (tagRes.data ?? []).map((r) => {
        const t = Array.isArray(r.tag) ? r.tag[0] : r.tag;
        return { tag_id: r.tag_id, name: t?.name ?? "Unknown" };
      }),
    );

    // products + their primary image
    const products = (pdRes.data ?? []).map((r) => {
      const p = Array.isArray(r.product) ? r.product[0] : r.product;
      return {
        product_id: r.product_id,
        title: p?.title ?? "Unknown",
        placement: r.placement as string,
      };
    });
    const productIds = products.map((p) => p.product_id);
    const imgMap = new Map<string, string>();
    if (productIds.length) {
      const imgRes = await supabase
        .from("product_images")
        .select("product_id, storage_bucket, storage_path, is_primary, sort_order")
        .in("product_id", productIds)
        .order("sort_order");
      (imgRes.data ?? []).forEach((img) => {
        if (!imgMap.has(img.product_id) || img.is_primary) {
          const { data: pub } = supabase.storage
            .from(img.storage_bucket)
            .getPublicUrl(img.storage_path);
          imgMap.set(img.product_id, pub.publicUrl);
        }
      });
    }
    setLinkedProducts(
      products.map((p) => ({ ...p, primary_image_url: imgMap.get(p.product_id) ?? null })),
    );

    setAllAthletes(
      (athletesAll.data ?? []).map((a) => ({
        id: a.id,
        name: a.full_name ?? `${a.first_name} ${a.last_name}`,
      })),
    );
    setAllTeams((teamsAll.data ?? []) as Array<{ id: string; name: string }>);
    setAllTags((tagsAll.data ?? []) as Array<{ id: string; name: string }>);
  }

  useEffect(() => {
    void loadDesign();
    void loadHero();
    void loadLinks();
  }, [designId]);

  async function handleDelete() {
    setDeleteOpen(false);
    const { error } = await supabase.from("designs").delete().eq("id", designId);
    if (error) {
      toast.error("Delete failed — design may be in use");
      console.error(error);
      return;
    }
    toast.success("Design deleted");
    navigate("/admin/designs");
  }

  async function addAthlete() {
    if (!addAthleteId) return;
    const memRes = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("athlete_id", addAthleteId)
      .is("end_date", null)
      .maybeSingle();
    const { error } = await supabase.from("design_athletes").insert({
      design_id: designId,
      athlete_id: addAthleteId,
      team_id_at_creation: memRes.data?.team_id ?? null,
    });
    if (error) {
      toast.error("Failed to link athlete");
      return;
    }
    setAddAthleteId("");
    void loadLinks();
  }

  async function removeAthlete(athleteId: string) {
    await supabase
      .from("design_athletes")
      .delete()
      .eq("design_id", designId)
      .eq("athlete_id", athleteId);
    void loadLinks();
  }

  async function addTeam() {
    if (!addTeamId) return;
    const { error } = await supabase
      .from("design_teams")
      .insert({ design_id: designId, team_id: addTeamId });
    if (error) {
      toast.error("Failed to link team");
      return;
    }
    setAddTeamId("");
    void loadLinks();
  }

  async function removeTeam(teamId: string) {
    await supabase.from("design_teams").delete().eq("design_id", designId).eq("team_id", teamId);
    void loadLinks();
  }

  async function addTag() {
    if (!addTagId) return;
    const { error } = await supabase
      .from("design_tags")
      .insert({ design_id: designId, tag_id: addTagId });
    if (error) {
      toast.error("Failed to add tag");
      return;
    }
    setAddTagId("");
    void loadLinks();
  }

  async function removeTag(tagId: string) {
    await supabase.from("design_tags").delete().eq("design_id", designId).eq("tag_id", tagId);
    void loadLinks();
  }

  async function createAndAddTag() {
    const name = newTagName.trim();
    if (!name || !design) return;
    const orgRes = await supabase
      .from("designs")
      .select("organization_id")
      .eq("id", designId)
      .maybeSingle();
    const orgId = orgRes.data?.organization_id;
    if (!orgId) return;
    const tagRes = await supabase
      .from("tags")
      .insert({ organization_id: orgId, name, slug: slugify(name) })
      .select("id")
      .single();
    if (tagRes.error || !tagRes.data) {
      toast.error("Failed to create tag");
      return;
    }
    await supabase.from("design_tags").insert({ design_id: designId, tag_id: tagRes.data.id });
    setNewTagName("");
    void loadLinks();
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!design) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin/designs")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="ax-card p-12 text-center text-muted-foreground mt-6">Design not found.</div>
      </div>
    );
  }

  const primaryAthleteName = design.primary_athlete
    ? design.primary_athlete.full_name ??
      `${design.primary_athlete.first_name} ${design.primary_athlete.last_name}`
    : null;
  const availableAthletes = allAthletes.filter(
    (a) => !linkedAthletes.some((la) => la.athlete_id === a.id),
  );
  const availableTeams = allTeams.filter((t) => !linkedTeams.some((lt) => lt.team_id === t.id));
  const availableTags = allTags.filter((t) => !linkedTags.some((lt) => lt.tag_id === t.id));

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/admin/designs")}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Designs
      </Button>

      {/* HERO */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
        <div className="ax-card p-0 overflow-hidden aspect-square bg-muted flex items-center justify-center">
          {heroUrl ? (
            <img src={heroUrl} alt={design.title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center space-y-3 text-muted-foreground p-8">
              <Palette className="h-10 w-10 mx-auto" />
              <p className="text-sm">No primary mockup yet</p>
              <p className="text-xs">Upload one in the Files tab below</p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold leading-tight">{design.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                    designStatusBadgeClass(design.status),
                  )}
                >
                  {formatDesignStatus(design.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {primaryAthleteName && (
              <div>
                <span className="text-muted-foreground">Primary athlete: </span>
                <span className="font-medium">{primaryAthleteName}</span>
              </div>
            )}
            {design.primary_team && (
              <div>
                <span className="text-muted-foreground">Primary team: </span>
                <span className="font-medium">{design.primary_team.name}</span>
              </div>
            )}
            {design.season && (
              <div>
                <span className="text-muted-foreground">Season: </span>
                <span>{design.season}</span>
              </div>
            )}
            {design.campaign && (
              <div>
                <span className="text-muted-foreground">Campaign: </span>
                <span>{design.campaign}</span>
              </div>
            )}
          </div>

          {design.description && (
            <div className="text-sm text-muted-foreground whitespace-pre-line">
              {design.description}
            </div>
          )}
          {design.notes && (
            <div className="ax-card bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-line">
              <div className="ax-label mb-1">Internal notes</div>
              {design.notes}
            </div>
          )}
        </div>
      </div>

      {/* TABS */}
      <Tabs defaultValue="files" className="w-full">
        <TabsList>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="products">Products ({linkedProducts.length})</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="mt-4">
          <DesignFilesTab designId={designId} designTitle={design?.title} onPrimaryChanged={loadHero} />
        </TabsContent>

        <TabsContent value="links" className="mt-4 space-y-6">
          <section className="ax-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Athletes</h3>
              <div className="flex items-center gap-2">
                <Select value={addAthleteId} onValueChange={setAddAthleteId}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="Add athlete…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAthletes.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No more athletes</div>
                    )}
                    {availableAthletes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={!addAthleteId} onClick={addAthlete}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {linkedAthletes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No athletes linked.</div>
            ) : (
              <div className="space-y-2">
                {linkedAthletes.map((a) => (
                  <div
                    key={a.athlete_id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{a.athlete_name}</span>
                      {a.team_name && (
                        <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                          {a.team_name} at creation
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => removeAthlete(a.athlete_id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ax-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Teams</h3>
              <div className="flex items-center gap-2">
                <Select value={addTeamId} onValueChange={setAddTeamId}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="Add team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No more teams</div>
                    )}
                    {availableTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={!addTeamId} onClick={addTeam}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {linkedTeams.length === 0 ? (
              <div className="text-sm text-muted-foreground">No teams linked.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {linkedTeams.map((t) => (
                  <span
                    key={t.team_id}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-border bg-muted/30"
                  >
                    {t.name}
                    <button onClick={() => removeTeam(t.team_id)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          {linkedProducts.length === 0 ? (
            <div className="ax-card p-12 text-center space-y-3">
              <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No products use this design yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-2 min-w-max">
                {linkedProducts.map((p) => (
                  <button
                    key={p.product_id}
                    onClick={() => navigate(`/admin/products/${p.product_id}`)}
                    className="ax-card p-0 overflow-hidden text-left w-48 hover:border-accent transition-colors"
                  >
                    <div className="aspect-square bg-muted">
                      {p.primary_image_url ? (
                        <img
                          src={p.primary_image_url}
                          alt={p.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ImagePlus className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs border border-border bg-muted text-muted-foreground capitalize">
                        {p.placement.replace(/_/g, " ")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tags" className="mt-4 space-y-4">
          <div className="ax-card space-y-3">
            <h3 className="font-semibold">Tags</h3>
            {linkedTags.length === 0 ? (
              <div className="text-sm text-muted-foreground">No tags yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {linkedTags.map((t) => (
                  <span
                    key={t.tag_id}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-accent/10 text-accent border border-accent/30"
                  >
                    {t.name}
                    <button onClick={() => removeTag(t.tag_id)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Select value={addTagId} onValueChange={setAddTagId}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Add existing…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No more tags</div>
                  )}
                  {availableTags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={!addTagId} onClick={addTag}>
                <Plus className="h-3 w-3" />
              </Button>
              <span className="text-xs text-muted-foreground mx-2">or</span>
              <Input
                placeholder="Create new…"
                className="h-8 text-xs flex-1"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAndAddTag();
                  }
                }}
              />
              <Button size="sm" variant="outline" className="h-8" onClick={createAndAddTag}>
                Create
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DesignEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        designId={designId}
        onSaved={loadDesign}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this design?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the design and unlinks it from athletes, teams, tags, and
              products. Files in storage will remain — clear them from the Files tab first if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
