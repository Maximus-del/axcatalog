import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  ExternalLink,
  ImageIcon,
  Star,
  Trash2,
  Upload,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import {
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  type ProductStatus,
  type ProductType,
  formatStatus,
  formatType,
  statusBadgeClass,
} from "@/lib/product-status";

interface ProductRow {
  id: string;
  organization_id: string;
  title: string;
  slug: string;
  description: string | null;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  status: ProductStatus;
  product_type: ProductType;
  needs_review: boolean;
  notes: string | null;
  source_url: string | null;
  ai_confidence_score: number | null;
  blank_id: string | null;
  shopify_handle: string | null;
  shopify_product_id: string | null;
  shopify_sync_status: string;
  updated_at: string;
  created_at: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  is_primary: boolean;
  sort_order: number;
  url: string;
}

interface AthleteLink {
  id: string;
  athlete_id: string;
  role: "primary" | "featured" | "collab";
  athlete: { id: string; first_name: string; last_name: string; full_name: string | null } | null;
}

interface TeamLink {
  team_id: string;
  team: { id: string; name: string } | null;
}

interface DesignLink {
  id: string;
  design_id: string;
  placement: string;
  design: { id: string; title: string } | null;
}

interface BlankLite {
  id: string;
  name: string;
  vendor: string | null;
  brand: string | null;
}

interface TagLite {
  id: string;
  name: string;
}

interface Props {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const PUBLIC_BUCKET = "product-images";

export function ProductDetailDrawer({ productId, open, onOpenChange, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [athletes, setAthletes] = useState<AthleteLink[]>([]);
  const [teams, setTeams] = useState<TeamLink[]>([]);
  const [designs, setDesigns] = useState<DesignLink[]>([]);
  const [tags, setTags] = useState<TagLite[]>([]);
  const [allTags, setAllTags] = useState<TagLite[]>([]);
  const [blank, setBlank] = useState<BlankLite | null>(null);

  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCompareAt, setEditCompareAt] = useState("");
  const [editStatus, setEditStatus] = useState<ProductStatus>("draft");
  const [editType, setEditType] = useState<ProductType>("athlete_merch");
  const [editNotes, setEditNotes] = useState("");
  const [editNeedsReview, setEditNeedsReview] = useState(false);

  const [newTagName, setNewTagName] = useState("");

  async function load() {
    if (!productId) return;
    setLoading(true);
    try {
      const [pRes, imgsRes, aRes, tRes, dRes, tagRes, allTagsRes] = await Promise.all([
        supabase.from("products").select("*").eq("id", productId).maybeSingle(),
        supabase
          .from("product_images")
          .select("id, product_id, storage_bucket, storage_path, file_name, is_primary, sort_order")
          .eq("product_id", productId)
          .order("sort_order"),
        supabase
          .from("product_athletes")
          .select(
            "id, athlete_id, role, athlete:athletes!product_athletes_athlete_id_fkey(id, first_name, last_name, full_name)",
          )
          .eq("product_id", productId),
        supabase
          .from("product_teams")
          .select("team_id, team:teams!product_teams_team_id_fkey(id, name)")
          .eq("product_id", productId),
        supabase
          .from("product_designs")
          .select("id, design_id, placement, design:designs!product_designs_design_id_fkey(id, title)")
          .eq("product_id", productId),
        supabase
          .from("product_tags")
          .select("tag_id, tag:tags!product_tags_tag_id_fkey(id, name)")
          .eq("product_id", productId),
        supabase.from("tags").select("id, name").order("name"),
      ]);

      if (pRes.error) console.error("product fetch error:", pRes.error);
      const p = (pRes.data as ProductRow | null) ?? null;
      setProduct(p);
      if (p) {
        setEditTitle(p.title);
        setEditSlug(p.slug);
        setEditDescription(p.description ?? "");
        setEditSku(p.sku ?? "");
        setEditPrice(p.price != null ? String(p.price) : "");
        setEditCompareAt(p.compare_at_price != null ? String(p.compare_at_price) : "");
        setEditStatus(p.status);
        setEditType(p.product_type);
        setEditNotes(p.notes ?? "");
        setEditNeedsReview(p.needs_review);

        if (p.blank_id) {
          const { data: b } = await supabase
            .from("blanks")
            .select("id, name, vendor, brand")
            .eq("id", p.blank_id)
            .maybeSingle();
          setBlank(b ?? null);
        } else {
          setBlank(null);
        }
      }

      const imgs = (imgsRes.data ?? []).map((i) => {
        const { data: pub } = supabase.storage.from(i.storage_bucket).getPublicUrl(i.storage_path);
        return { ...i, url: pub.publicUrl } as ProductImage;
      });
      setImages(imgs);

      setAthletes(
        (aRes.data ?? []).map((r) => ({
          ...r,
          athlete: Array.isArray(r.athlete) ? r.athlete[0] : r.athlete,
        })) as AthleteLink[],
      );
      setTeams(
        (tRes.data ?? []).map((r) => ({
          ...r,
          team: Array.isArray(r.team) ? r.team[0] : r.team,
        })) as TeamLink[],
      );
      setDesigns(
        (dRes.data ?? []).map((r) => ({
          ...r,
          design: Array.isArray(r.design) ? r.design[0] : r.design,
        })) as DesignLink[],
      );
      setTags(
        (tagRes.data ?? [])
          .map((r) => {
            const t = Array.isArray(r.tag) ? r.tag[0] : r.tag;
            return t ? { id: t.id, name: t.name } : null;
          })
          .filter((t): t is TagLite => !!t),
      );
      setAllTags(allTagsRes.data ?? []);
    } catch (err) {
      console.error("ProductDetailDrawer load failed:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && productId) {
      setTab("overview");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId]);

  async function handleSaveOverview() {
    if (!product) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          title: editTitle.trim(),
          slug: editSlug.trim() || slugify(editTitle),
          description: editDescription.trim() || null,
          sku: editSku.trim() || null,
          price: editPrice ? Number(editPrice) : null,
          compare_at_price: editCompareAt ? Number(editCompareAt) : null,
          status: editStatus,
          product_type: editType,
          notes: editNotes.trim() || null,
          needs_review: editNeedsReview,
        })
        .eq("id", product.id);
      if (error) throw error;
      toast({ title: "Product updated" });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    try {
      // Best-effort: remove images from storage
      if (images.length) {
        const paths = images.map((i) => i.storage_path);
        await supabase.storage.from(PUBLIC_BUCKET).remove(paths);
      }
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
      toast({ title: "Product deleted" });
      setDeleteOpen(false);
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Delete failed",
        variant: "destructive",
      });
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !product) return;
    setUploading(true);
    const errors: string[] = [];
    let uploaded = 0;
    try {
      const baseSort = images.length;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${product.id}/${Date.now()}-${i}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(PUBLIC_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          errors.push(`${file.name}: ${upErr.message}`);
          continue;
        }
        const isFirstEver = images.length === 0 && uploaded === 0;
        const { error: insErr } = await supabase.from("product_images").insert({
          product_id: product.id,
          storage_bucket: PUBLIC_BUCKET,
          storage_path: path,
          file_name: file.name,
          is_primary: isFirstEver,
          sort_order: baseSort + i,
        });
        if (insErr) errors.push(`${file.name}: ${insErr.message}`);
        else uploaded++;
      }
      if (errors.length)
        toast({ title: `Uploaded ${uploaded}, failed ${errors.length}`, variant: "destructive" });
      else toast({ title: `Uploaded ${uploaded} image${uploaded === 1 ? "" : "s"}` });
      await load();
      onChanged?.();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setPrimaryImage(img: ProductImage) {
    if (!product) return;
    try {
      const others = images.filter((i) => i.id !== img.id).map((i) => i.id);
      if (others.length) {
        await supabase.from("product_images").update({ is_primary: false }).in("id", others);
      }
      await supabase.from("product_images").update({ is_primary: true }).eq("id", img.id);
      toast({ title: "Primary image updated" });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed",
        variant: "destructive",
      });
    }
  }

  async function deleteImage(img: ProductImage) {
    try {
      await supabase.storage.from(img.storage_bucket).remove([img.storage_path]);
      await supabase.from("product_images").delete().eq("id", img.id);
      // If we deleted the primary and there are others, promote the first
      if (img.is_primary) {
        const remaining = images.filter((i) => i.id !== img.id);
        if (remaining[0]) {
          await supabase
            .from("product_images")
            .update({ is_primary: true })
            .eq("id", remaining[0].id);
        }
      }
      toast({ title: "Image removed" });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed",
        variant: "destructive",
      });
    }
  }

  async function addTag(tagId: string) {
    if (!product || tags.some((t) => t.id === tagId)) return;
    const { error } = await supabase
      .from("product_tags")
      .insert({ product_id: product.id, tag_id: tagId });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    await load();
  }

  async function removeTag(tagId: string) {
    if (!product) return;
    const { error } = await supabase
      .from("product_tags")
      .delete()
      .eq("product_id", product.id)
      .eq("tag_id", tagId);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  async function createAndAddTag() {
    if (!product) return;
    const name = newTagName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("tags")
      .insert({
        name,
        slug: slugify(name),
        organization_id: product.organization_id,
        category: "other",
      })
      .select("id, name")
      .single();
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    setAllTags((prev) => [...prev, data]);
    setNewTagName("");
    await addTag(data.id);
  }

  async function approveReview() {
    if (!product) return;
    const { error } = await supabase
      .from("products")
      .update({ needs_review: false, status: "draft" })
      .eq("id", product.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marked as reviewed" });
    await load();
    onChanged?.();
  }

  const primaryImage = useMemo(
    () => images.find((i) => i.is_primary) ?? images[0] ?? null,
    [images],
  );

  const availableTags = useMemo(
    () => allTags.filter((t) => !tags.some((existing) => existing.id === t.id)),
    [allTags, tags],
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-0">
          {loading || !product ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* HERO */}
              <div className="p-6 border-b border-border">
                <SheetHeader className="space-y-3">
                  <div className="flex items-start gap-4">
                    <div className="h-24 w-24 rounded-lg bg-muted overflow-hidden shrink-0">
                      {primaryImage ? (
                        <img
                          src={primaryImage.url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <SheetTitle className="text-2xl truncate">{product.title}</SheetTitle>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded-full border capitalize",
                            statusBadgeClass(product.status),
                          )}
                        >
                          {formatStatus(product.status)}
                        </span>
                        <span className="inline-flex px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground capitalize">
                          {formatType(product.product_type)}
                        </span>
                        {product.needs_review && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/15 text-orange-400">
                            <AlertTriangle className="h-3 w-3" /> Needs review
                          </span>
                        )}
                        {product.sku && (
                          <span className="text-muted-foreground tabular-nums">{product.sku}</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {product.price != null ? `$${Number(product.price).toFixed(2)}` : "No price"}
                        {product.compare_at_price != null && (
                          <span className="line-through ml-2 text-xs">
                            ${Number(product.compare_at_price).toFixed(2)}
                          </span>
                        )}
                        <span className="mx-2">·</span>
                        Updated {formatDistanceToNow(new Date(product.updated_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </SheetHeader>
              </div>

              {/* TABS */}
              <Tabs value={tab} onValueChange={setTab} className="px-6 pt-4">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="links">Links</TabsTrigger>
                  <TabsTrigger value="images">
                    Images{images.length ? ` (${images.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="tags">
                    Tags{tags.length ? ` (${tags.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="review">
                    Review
                    {product.needs_review && (
                      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-orange-400" />
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview" className="space-y-5 pb-8 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Title">
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </Field>
                    <Field label="Slug">
                      <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
                    </Field>
                  </div>

                  <Field label="Description">
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="SKU">
                      <Input value={editSku} onChange={(e) => setEditSku(e.target.value)} />
                    </Field>
                    <Field label="Price">
                      <Input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Compare-at price">
                      <Input
                        type="number"
                        step="0.01"
                        value={editCompareAt}
                        onChange={(e) => setEditCompareAt(e.target.value)}
                      />
                    </Field>
                    <Field label="Status">
                      <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ProductStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRODUCT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {formatStatus(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Type">
                    <Select value={editType} onValueChange={(v) => setEditType(v as ProductType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {formatType(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Internal notes">
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                    />
                  </Field>

                  {product.source_url && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      Source:{" "}
                      <a
                        href={product.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-accent hover:underline inline-flex items-center gap-1 truncate max-w-md"
                      >
                        {product.source_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setDeleteOpen(true)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                    <Button onClick={handleSaveOverview} disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </TabsContent>

                {/* LINKS */}
                <TabsContent value="links" className="space-y-6 pb-8 pt-4">
                  <LinkSection title="Athletes" emptyText="No athletes linked.">
                    {athletes.map((a) => {
                      const name =
                        a.athlete?.full_name ??
                        `${a.athlete?.first_name ?? ""} ${a.athlete?.last_name ?? ""}`.trim() ??
                        "Unknown";
                      return (
                        <RowItem
                          key={a.id}
                          to={a.athlete ? `/admin/athletes/${a.athlete.id}` : undefined}
                          title={name}
                          subtitle={a.role}
                        />
                      );
                    })}
                  </LinkSection>

                  <LinkSection title="Teams" emptyText="No teams linked.">
                    {teams.map((t) => (
                      <RowItem
                        key={t.team_id}
                        title={t.team?.name ?? "Unknown team"}
                        subtitle="team"
                      />
                    ))}
                  </LinkSection>

                  <LinkSection title="Designs" emptyText="No designs linked.">
                    {designs.map((d) => (
                      <RowItem
                        key={d.id}
                        title={d.design?.title ?? "Unknown design"}
                        subtitle={`placement: ${d.placement.replace(/_/g, " ")}`}
                      />
                    ))}
                  </LinkSection>

                  <LinkSection title="Blank" emptyText="No blank attached.">
                    {blank && (
                      <RowItem
                        title={blank.name}
                        subtitle={[blank.brand, blank.vendor].filter(Boolean).join(" · ") || "blank"}
                      />
                    )}
                  </LinkSection>

                  <p className="text-xs text-muted-foreground">
                    Edit links from the create flow or related entity pages. Inline editing comes
                    later.
                  </p>
                </TabsContent>

                {/* IMAGES */}
                <TabsContent value="images" className="space-y-4 pb-8 pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Uploads go to the <code className="text-xs">product-images</code> bucket under{" "}
                      <code className="text-xs">{product.id}/</code>.
                    </p>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload images"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => handleUpload(e.target.files)}
                    />
                  </div>

                  {images.length === 0 ? (
                    <div className="ax-card p-12 text-center text-sm text-muted-foreground">
                      No images yet. Upload your first one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {images.map((img) => (
                        <div key={img.id} className="ax-card p-2 space-y-2">
                          <div className="relative aspect-square rounded-md overflow-hidden bg-muted">
                            <img
                              src={img.url}
                              alt={img.file_name ?? "Product image"}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {img.is_primary && (
                              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-accent/90 text-accent-foreground">
                                <Star className="h-2.5 w-2.5" /> Primary
                              </span>
                            )}
                          </div>
                          <div className="text-xs truncate">{img.file_name ?? "image"}</div>
                          <div className="flex items-center justify-between gap-1">
                            {!img.is_primary ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => setPrimaryImage(img)}
                              >
                                <Star className="h-3 w-3" /> Primary
                              </Button>
                            ) : (
                              <span />
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => deleteImage(img)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* TAGS */}
                <TabsContent value="tags" className="space-y-4 pb-8 pt-4">
                  {tags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tags yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-muted border border-border"
                        >
                          {t.name}
                          <button
                            onClick={() => removeTag(t.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${t.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {availableTags.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Add existing tag</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {availableTags.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => addTag(t.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-accent"
                          >
                            <Plus className="h-3 w-3" /> {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2">
                    <Label className="text-xs text-muted-foreground">Create new tag</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Tag name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            createAndAddTag();
                          }
                        }}
                      />
                      <Button onClick={createAndAddTag} disabled={!newTagName.trim()}>
                        Create
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {/* REVIEW */}
                <TabsContent value="review" className="space-y-4 pb-8 pt-4">
                  <div className="ax-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Needs review</div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border",
                          product.needs_review
                            ? "border-orange-500/30 bg-orange-500/15 text-orange-400"
                            : "border-accent/30 bg-accent/15 text-accent",
                        )}
                      >
                        {product.needs_review ? (
                          <>
                            <AlertTriangle className="h-3 w-3" /> Yes
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Clear
                          </>
                        )}
                      </span>
                    </div>

                    {product.ai_confidence_score != null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">AI confidence</span>
                        <span className="tabular-nums">
                          {Math.round(Number(product.ai_confidence_score) * 100)}%
                        </span>
                      </div>
                    )}

                    {product.source_url && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Source: </span>
                        <a
                          href={product.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-accent hover:underline inline-flex items-center gap-1 break-all"
                        >
                          {product.source_url} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Shopify sync: <span className="capitalize">{product.shopify_sync_status.replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  {product.needs_review && (
                    <Button onClick={approveReview} className="gap-2 w-full">
                      <CheckCircle2 className="h-4 w-4" /> Mark as reviewed
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product, its images, and all link rows. This cannot be undone.
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
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function LinkSection({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const childArray = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="space-y-2">
      <div className="ax-section-header">{title}</div>
      {childArray.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

function RowItem({
  title,
  subtitle,
  to,
}: {
  title: string;
  subtitle?: string;
  to?: string;
}) {
  const inner = (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-card hover:border-accent/50 transition-colors">
      <span className="text-sm font-medium truncate">{title}</span>
      {subtitle && (
        <span className="text-xs text-muted-foreground capitalize shrink-0">{subtitle}</span>
      )}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
