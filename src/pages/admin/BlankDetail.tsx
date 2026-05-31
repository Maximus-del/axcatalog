import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileIcon,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Shirt,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BLANK_AVAILABILITIES,
  GARMENT_TYPES,
  type BlankAvailability,
  type GarmentType,
  availabilityBadgeClass,
  formatAvailability,
  formatGarmentType,
} from "@/lib/blank-status";
import { formatBytes, getSignedUrl } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { BlankPricingFields } from "@/components/admin/blanks/BlankPricingFields";

interface BlankRow {
  id: string;
  name: string;
  slug: string;
  vendor: string | null;
  brand: string | null;
  style_number: string | null;
  garment_type: GarmentType;
  fabric_specs: Record<string, string | number>;
  cost: number | null;
  price_athlete: number | null;
  price_corporate: number | null;
  price_standard: number | null;
  moq: number | null;
  sellable_as_blank: boolean;
  internal_only: boolean;
  availability_status: BlankAvailability;
  notes: string | null;
}

interface ColorRow {
  id: string;
  color_name: string;
  hex_code: string | null;
  available: boolean;
  sort_order: number;
}
interface SizeRow {
  id: string;
  size: string;
  available: boolean;
  sort_order: number;
}
interface ProductRef {
  id: string;
  title: string;
  primary_image_url: string | null;
}
interface BlankFile {
  name: string;
  size: number;
  path: string;
}

export default function BlankDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const blankId = id!;

  const [blank, setBlank] = useState<BlankRow | null>(null);
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [files, setFiles] = useState<BlankFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function loadAll() {
    setLoading(true);
    const [bRes, cRes, sRes] = await Promise.all([
      supabase.from("blanks").select("*").eq("id", blankId).maybeSingle(),
      supabase.from("blank_colors").select("*").eq("blank_id", blankId).order("sort_order"),
      supabase.from("blank_sizes").select("*").eq("blank_id", blankId).order("sort_order"),
    ]);
    if (bRes.data) {
      setBlank({
        id: bRes.data.id,
        name: bRes.data.name,
        slug: bRes.data.slug,
        vendor: bRes.data.vendor,
        brand: bRes.data.brand,
        style_number: bRes.data.style_number,
        garment_type: bRes.data.garment_type as GarmentType,
        fabric_specs: (bRes.data.fabric_specs as Record<string, string | number>) ?? {},
        cost: bRes.data.cost,
        price_athlete: bRes.data.price_athlete,
        price_corporate: bRes.data.price_corporate,
        price_standard: bRes.data.price_standard,
        moq: bRes.data.moq,
        sellable_as_blank: bRes.data.sellable_as_blank,
        internal_only: bRes.data.internal_only,
        availability_status: bRes.data.availability_status as BlankAvailability,
        notes: bRes.data.notes,
      });
    }
    setColors((cRes.data ?? []) as ColorRow[]);
    setSizes((sRes.data ?? []) as SizeRow[]);

    // Products using this blank + primary image
    const pRes = await supabase
      .from("products")
      .select("id, title")
      .eq("blank_id", blankId)
      .order("updated_at", { ascending: false });
    const productIds = (pRes.data ?? []).map((p) => p.id);
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
    setProducts(
      (pRes.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        primary_image_url: imgMap.get(p.id) ?? null,
      })),
    );

    // Files in blanks/{blankId}/
    const listRes = await supabase.storage.from("blanks").list(blankId, { limit: 100 });
    setFiles(
      (listRes.data ?? [])
        .filter((f) => f.name && !f.name.endsWith("/"))
        .map((f) => ({
          name: f.name,
          size: f.metadata?.size ?? 0,
          path: `${blankId}/${f.name}`,
        })),
    );

    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, [blankId]);

  async function handleDelete() {
    setDeleteOpen(false);
    const { error } = await supabase.from("blanks").delete().eq("id", blankId);
    if (error) {
      toast.error("Delete failed — blank may be in use by products");
      console.error(error);
      return;
    }
    toast.success("Blank deleted");
    navigate("/admin/blanks");
  }

  async function patchBlank(patch: Partial<BlankRow>) {
    if (!blank) return;
    setBlank({ ...blank, ...patch });
    const { error } = await supabase.from("blanks").update(patch).eq("id", blankId);
    if (error) {
      toast.error("Failed to save");
      void loadAll();
    }
  }

  async function addColor() {
    const { data, error } = await supabase
      .from("blank_colors")
      .insert({
        blank_id: blankId,
        color_name: "New color",
        hex_code: "#000000",
        available: true,
        sort_order: colors.length,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Failed to add color");
      return;
    }
    setColors([...colors, data as ColorRow]);
  }
  async function updateColor(id: string, patch: Partial<ColorRow>) {
    setColors(colors.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase.from("blank_colors").update(patch).eq("id", id);
  }
  async function deleteColor(id: string) {
    setColors(colors.filter((c) => c.id !== id));
    await supabase.from("blank_colors").delete().eq("id", id);
  }

  async function addSize() {
    const { data, error } = await supabase
      .from("blank_sizes")
      .insert({
        blank_id: blankId,
        size: "New",
        available: true,
        sort_order: sizes.length,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Failed to add size");
      return;
    }
    setSizes([...sizes, data as SizeRow]);
  }
  async function updateSize(id: string, patch: Partial<SizeRow>) {
    setSizes(sizes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await supabase.from("blank_sizes").update(patch).eq("id", id);
  }
  async function deleteSize(id: string) {
    setSizes(sizes.filter((s) => s.id !== id));
    await supabase.from("blank_sizes").delete().eq("id", id);
  }

  async function handleFileUpload(list: FileList | null) {
    if (!list || !list.length) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${blankId}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("blanks").upload(path, f, {
        contentType: f.type || undefined,
      });
      if (error) {
        console.error(error);
        toast.error(`Failed to upload ${f.name}`);
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    void loadAll();
    toast.success("Upload complete");
  }

  async function deleteFile(file: BlankFile) {
    if (!confirm(`Delete ${file.name}?`)) return;
    const { error } = await supabase.storage.from("blanks").remove([file.path]);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    void loadAll();
  }

  async function downloadFile(file: BlankFile) {
    const url = await getSignedUrl("blanks", file.path, 3600);
    if (!url) {
      toast.error("Download failed");
      return;
    }
    window.open(url, "_blank");
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!blank) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin/blanks")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="ax-card p-12 text-center text-muted-foreground mt-6">Blank not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/admin/blanks")}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Blanks
      </Button>

      {/* HERO */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold leading-tight flex items-center gap-3">
            <Shirt className="h-7 w-7 text-muted-foreground" /> {blank.name}
          </h1>
          <div className="text-sm text-muted-foreground space-x-2">
            {blank.vendor && <span>{blank.vendor}</span>}
            {blank.brand && <span>· {blank.brand}</span>}
            {blank.style_number && <span>· #{blank.style_number}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs border border-border bg-muted text-muted-foreground capitalize">
              {formatGarmentType(blank.garment_type)}
            </span>
            <span
              className={cn(
                "inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                availabilityBadgeClass(blank.availability_status),
              )}
            >
              {formatAvailability(blank.availability_status)}
            </span>
            {blank.sellable_as_blank && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs border border-accent/30 bg-accent/10 text-accent">
                Sellable
              </span>
            )}
            {blank.internal_only && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs border border-border bg-muted text-muted-foreground">
                Internal only
              </span>
            )}
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

      <Tabs defaultValue="specs">
        <TabsList>
          <TabsTrigger value="specs">Specs</TabsTrigger>
          <TabsTrigger value="colors">Colors ({colors.length})</TabsTrigger>
          <TabsTrigger value="sizes">Sizes ({sizes.length})</TabsTrigger>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
        </TabsList>

        {/* SPECS */}
        <TabsContent value="specs" className="mt-4 space-y-4">
          <div className="ax-card space-y-3">
            <h3 className="font-semibold">Fabric Specs</h3>
            {Object.keys(blank.fabric_specs).length === 0 ? (
              <p className="text-sm text-muted-foreground">No specs recorded. Edit the blank to add.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(blank.fabric_specs).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="ax-label">{k.replace(/_/g, " ")}</div>
                    <div className="text-sm font-medium">{String(v)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ax-card space-y-4">
            <h3 className="font-semibold">Pricing & Availability</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={blank.cost ?? ""}
                  onChange={(e) =>
                    setBlank({ ...blank, cost: e.target.value ? Number(e.target.value) : null })
                  }
                  onBlur={() => patchBlank({ cost: blank.cost })}
                />
              </div>
              <div className="space-y-2">
                <Label>MOQ</Label>
                <Input
                  type="number"
                  step="1"
                  value={blank.moq ?? ""}
                  onChange={(e) =>
                    setBlank({ ...blank, moq: e.target.value ? Math.floor(Number(e.target.value)) : null })
                  }
                  onBlur={() => patchBlank({ moq: blank.moq })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Availability</Label>
                <Select
                  value={blank.availability_status}
                  onValueChange={(v) => patchBlank({ availability_status: v as BlankAvailability })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLANK_AVAILABILITIES.map((a) => (
                      <SelectItem key={a} value={a} className="capitalize">
                        {formatAvailability(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 border border-border rounded-md">
                <div>
                  <Label className="text-sm">Sellable as Blank</Label>
                  <p className="text-xs text-muted-foreground">Available for direct sale</p>
                </div>
                <Switch
                  checked={blank.sellable_as_blank}
                  onCheckedChange={(v) => patchBlank({ sellable_as_blank: v })}
                />
              </div>
              <div className="flex items-center justify-between p-3 border border-border rounded-md">
                <div>
                  <Label className="text-sm">Internal Only</Label>
                  <p className="text-xs text-muted-foreground">Hide from public catalogs</p>
                </div>
                <Switch
                  checked={blank.internal_only}
                  onCheckedChange={(v) => patchBlank({ internal_only: v })}
                />
              </div>
            </div>
          </div>

          {blank.notes && (
            <div className="ax-card bg-muted/30 p-4 text-sm whitespace-pre-line">
              <div className="ax-label mb-2">Notes</div>
              {blank.notes}
            </div>
          )}
        </TabsContent>

        {/* COLORS */}
        <TabsContent value="colors" className="mt-4">
          <div className="ax-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Colors</h3>
              <Button size="sm" variant="outline" className="gap-2" onClick={addColor}>
                <Plus className="h-3 w-3" /> Add Color
              </Button>
            </div>
            {colors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No colors yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {colors.map((c) => (
                  <div key={c.id} className="border border-border rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-10 w-10 rounded-md border border-border shrink-0"
                        style={{ backgroundColor: c.hex_code ?? "transparent" }}
                      />
                      <div className="flex-1 space-y-1">
                        <Input
                          value={c.color_name}
                          onChange={(e) => updateColor(c.id, { color_name: e.target.value })}
                          className="h-7 text-sm"
                        />
                        <Input
                          type="color"
                          value={c.hex_code ?? "#000000"}
                          onChange={(e) => updateColor(c.id, { hex_code: e.target.value })}
                          className="h-7 p-0.5"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.available}
                          onCheckedChange={(v) => updateColor(c.id, { available: v })}
                        />
                        <span className="text-muted-foreground">
                          {c.available ? "Available" : "Unavailable"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteColor(c.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* SIZES */}
        <TabsContent value="sizes" className="mt-4">
          <div className="ax-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Sizes</h3>
              <Button size="sm" variant="outline" className="gap-2" onClick={addSize}>
                <Plus className="h-3 w-3" /> Add Size
              </Button>
            </div>
            {sizes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sizes yet.</p>
            ) : (
              <div className="space-y-2">
                {sizes.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 p-2 border border-border rounded-md bg-muted/20"
                  >
                    <Input
                      value={s.size}
                      onChange={(e) => updateSize(s.id, { size: e.target.value })}
                      className="h-8 w-32"
                    />
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        checked={s.available}
                        onCheckedChange={(v) => updateSize(s.id, { available: v })}
                      />
                      <span className="text-xs text-muted-foreground w-24">
                        {s.available ? "Available" : "Unavailable"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteSize(s.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* PRODUCTS */}
        <TabsContent value="products" className="mt-4">
          {products.length === 0 ? (
            <div className="ax-card p-12 text-center space-y-3">
              <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No products use this blank yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-2 min-w-max">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/admin/products/${p.id}`)}
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
                    <div className="p-3">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* FILES */}
        <TabsContent value="files" className="mt-4">
          <div className="ax-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Reference Files</h3>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void handleFileUpload(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Upload
              </Button>
            </div>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files uploaded.</p>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/20"
                  >
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="text-sm truncate flex-1">{f.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(f.size)}
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => downloadFile(f)}>
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => deleteFile(f)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <BlankEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        blank={blank}
        onSaved={loadAll}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this blank?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the blank, its colors, and sizes. Products referencing this
              blank will lose their link. Files in storage remain.
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

function BlankEditDialog({
  open,
  onOpenChange,
  blank,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  blank: BlankRow;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<BlankRow>(blank);
  const [specs, setSpecs] = useState<Array<{ key: string; value: string }>>(
    Object.entries(blank.fabric_specs).map(([k, v]) => ({ key: k, value: String(v) })),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(blank);
      setSpecs(Object.entries(blank.fabric_specs).map(([k, v]) => ({ key: k, value: String(v) })));
    }
  }, [open, blank]);

  async function save() {
    setSaving(true);
    const fabricSpecs: Record<string, string | number> = {};
    specs.forEach((s) => {
      if (!s.key.trim() || !s.value.trim()) return;
      const num = Number(s.value);
      fabricSpecs[s.key.trim()] = isNaN(num) ? s.value.trim() : num;
    });
    const { error } = await supabase
      .from("blanks")
      .update({
        name: draft.name.trim(),
        slug: draft.slug || slugify(draft.name),
        vendor: draft.vendor || null,
        brand: draft.brand || null,
        style_number: draft.style_number || null,
        garment_type: draft.garment_type,
        fabric_specs: fabricSpecs,
        notes: draft.notes || null,
      })
      .eq("id", blank.id);
    setSaving(false);
    if (error) {
      toast.error("Save failed");
      return;
    }
    toast.success("Blank updated");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Blank</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={draft.vendor ?? ""}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Input
                value={draft.brand ?? ""}
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Style Number</Label>
              <Input
                value={draft.style_number ?? ""}
                onChange={(e) => setDraft({ ...draft, style_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Garment Type</Label>
              <Select
                value={draft.garment_type}
                onValueChange={(v) => setDraft({ ...draft, garment_type: v as GarmentType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GARMENT_TYPES.map((g) => (
                    <SelectItem key={g} value={g} className="capitalize">
                      {formatGarmentType(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fabric Specs</Label>
            <div className="space-y-2">
              {specs.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Field"
                    value={s.key}
                    onChange={(e) => {
                      const n = [...specs];
                      n[i] = { ...n[i], key: e.target.value };
                      setSpecs(n);
                    }}
                  />
                  <Input
                    placeholder="Value"
                    value={s.value}
                    onChange={(e) => {
                      const n = [...specs];
                      n[i] = { ...n[i], value: e.target.value };
                      setSpecs(n);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSpecs(specs.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSpecs([...specs, { key: "", value: "" }])}
                className="gap-2"
              >
                <Plus className="h-3 w-3" /> Add Field
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
