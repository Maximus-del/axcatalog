// Fast create flows for the athlete overview: product, design, collection.
//
// The point is that the operator makes merchandising decisions, not data entry.
// Picking a blank fills in colors, sizes and specs; the title and description
// write themselves from athlete + collection + design + blank and stay editable.
// Nothing here asks for something the system already knows.
import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Package, Palette, FolderPlus, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createAthleteProduct,
  generateProductDescription,
  generateProductTitle,
} from "@/lib/ecosystem/merch";
import { createCollection } from "@/lib/ecosystem/commerce";
import { DEFAULT_RULES, sellingPrice } from "@/lib/ecosystem/pricing";
import { uploadDesignFromFile } from "@/lib/upload-design";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { CHECKERBOARD } from "@/components/admin/ecosystem/ImageLightbox";
import { DesignPromptPanel } from "@/components/admin/ecosystem/DesignPromptPanel";
import { PngCreationPanel } from "@/components/admin/ecosystem/PngCreationPanel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface BlankOption {
  id: string;
  name: string;
  garment_type: string | null;
  fabric: string | null;
  fabric_specs: Record<string, unknown> | null;
  price_athlete: number | null;
  price_standard: number | null;
  price_corporate: number | null;
  blank_cost: number | string | null;
  decoration_cost: number | string | null;
  additional_cost: number | string | null;
  cost: number | string | null;
  colors: string[];
  sizes: string[];
  /** Which catalogues offer this blank — the athlete's comes first in the list. */
  assortments: string[];
}

interface NamedRow { id: string; name?: string; title?: string }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal font-normal opacity-70">({hint})</span>}
      </div>
      {children}
    </div>
  );
}

function Shell({ title, blurb, onClose, children }: { title: string; blurb: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">{blurb}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Product -------------------------------------------------------------

export function QuickAddProductDialog({
  athlete, teamId, conceptOnly, onClose, onCreated,
}: {
  athlete: { id: string; organization_id: string; name: string };
  teamId?: string | null;
  /** Concept mode skips the commerce fields — image and title, nothing more. */
  conceptOnly?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [blanks, setBlanks] = useState<BlankOption[]>([]);
  const [designs, setDesigns] = useState<NamedRow[]>([]);
  const [collections, setCollections] = useState<NamedRow[]>([]);

  const [blankId, setBlankId] = useState<string>("");
  const [collectionId, setCollectionId] = useState<string>("");
  const [designIds, setDesignIds] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [price, setPrice] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [descTouched, setDescTouched] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [b, d, c, m] = await Promise.all([
        supabase.from("blanks").select("id, name, garment_type, fabric, fabric_specs, price_athlete, price_standard, price_corporate, blank_cost, decoration_cost, additional_cost, cost, blank_colors(color_name, available, sort_order), blank_sizes(size, available, sort_order)").order("name"),
        supabase.from("design_athletes").select("design:designs(id, title)").eq("athlete_id", athlete.id),
        supabase.from("collections").select("id, name").eq("athlete_id", athlete.id).order("created_at", { ascending: false }),
        supabase.from("blank_assortment_items" as never).select("blank_id, assortment:blank_assortments(key)"),
      ]);
      const byBlank = new Map<string, string[]>();
      for (const row of (m.data ?? []) as unknown as {
        blank_id: string; assortment: { key: string } | { key: string }[] | null;
      }[]) {
        const a = Array.isArray(row.assortment) ? row.assortment[0] : row.assortment;
        if (a?.key) byBlank.set(row.blank_id, [...(byBlank.get(row.blank_id) ?? []), a.key]);
      }
      setBlanks(((b.data ?? []) as unknown as (BlankOption & {
        blank_colors: { color_name: string; available: boolean; sort_order: number }[];
        blank_sizes: { size: string; available: boolean; sort_order: number }[];
      })[]).map((row) => ({
        ...row,
        assortments: byBlank.get(row.id) ?? [],
        colors: (row.blank_colors ?? []).filter((x) => x.available).sort((a, z) => a.sort_order - z.sort_order).map((x) => x.color_name),
        sizes: (row.blank_sizes ?? []).filter((x) => x.available).sort((a, z) => a.sort_order - z.sort_order).map((x) => x.size),
      })));
      setDesigns(((d.data ?? []) as unknown as { design: NamedRow | null }[]).map((r) => r.design).filter(Boolean) as NamedRow[]);
      setCollections((c.data ?? []) as unknown as NamedRow[]);
    })();
  }, [athlete.id]);

  const blank = blanks.find((b) => b.id === blankId) ?? null;

  // Picking a blank is what fills sizes, colors and price — the blank already
  // knows them, so the operator shouldn't be retyping any of it.
  useEffect(() => {
    if (!blank) return;
    setColors(blank.colors.slice(0, 1));
    setSizes(blank.sizes.length ? blank.sizes : ["S", "M", "L", "XL", "2XL", "3XL"]);
    if (!price) {
      // Same answer the catalogue gives: a typed price if there is one, else
      // the athlete margin rule applied to cost. Falling back to "no price"
      // just meant retyping a number the system already knew.
      const p = sellingPrice(blank, DEFAULT_RULES.athlete) ?? sellingPrice(blank, DEFAULT_RULES.standard);
      if (p) setPrice(String(p));
    }
  }, [blankId]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyInput = useMemo(() => ({
    athleteName: athlete.name,
    collectionName: collections.find((c) => c.id === collectionId)?.name ?? null,
    designName: designs.find((d) => d.id === designIds[0])?.title ?? null,
    blankName: blank?.name ?? null,
    garmentType: blank?.garment_type ?? null,
    color: colors[0] ?? null,
    fabric: blank?.fabric ?? null,
    fabricSpecs: blank?.fabric_specs ?? null,
  }), [athlete.name, collections, collectionId, designs, designIds, blank, colors]);

  useEffect(() => {
    if (!titleTouched) setTitle(generateProductTitle(copyInput));
    if (!descTouched) setDescription(generateProductDescription(copyInput));
  }, [copyInput, titleTouched, descTouched]);

  const { isOver, dropProps } = useFileDropZone({
    onFiles: (f) => setFiles((prev) => [...prev, ...f]),
    accept: ["image/"],
    paste: true,
  });

  async function save() {
    if (!title.trim()) { toast.error("Give it a title first"); return; }
    setSaving(true);
    try {
      const productId = await createAthleteProduct({
        organization_id: athlete.organization_id,
        athlete_id: athlete.id,
        title,
        description,
        price: price ? Number(price) : null,
        blank_id: blankId || null,
        collection_id: collectionId || null,
        design_ids: designIds,
        colors,
        sizes,
        team_id_at_release: teamId ?? null,
      });

      // Images are best-effort here: the product carries a title, blank and price
      // worth keeping even if an upload fails. Say so rather than failing silently.
      for (const [i, file] of files.entries()) {
        try {
          const ext = file.name.split(".").pop()?.toLowerCase() || "png";
          const path = `${productId}/${crypto.randomUUID()}.${ext}`;
          const up = await supabase.storage.from("product-images").upload(path, file);
          if (up.error) throw up.error;
          const linked = await supabase.from("product_images").insert({
            product_id: productId,
            storage_bucket: "product-images",
            storage_path: path,
            sort_order: i,
          } as never);
          if (linked.error) throw linked.error;
        } catch (imgErr) {
          toast.error(`Product created, but an image failed: ${imgErr instanceof Error ? imgErr.message : "upload rejected"}`);
        }
      }

      toast.success(conceptOnly ? "Concept created" : "Product created");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  return (
    <Shell
      title={conceptOnly ? "Upload concept" : "Add product"}
      blurb={conceptOnly
        ? `Image and title only. ${athlete.name} can see it while the setup gets finished.`
        : `Pick a blank and the sizes, colors, price and copy fill themselves in.`}
      onClose={onClose}
    >
      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <div
          {...dropProps}
          className={`rounded-lg border border-dashed p-4 text-center transition-colors ${
            isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
          }`}
        >
          {files.length === 0 ? (
            <>
              <Upload className="h-5 w-5 mx-auto text-[hsl(var(--ax-faint))]" />
              <p className="text-[12px] text-muted-foreground mt-1.5">Drop mockups here, or paste with Ctrl+V</p>
            </>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 object-cover rounded border border-[hsl(var(--ax-border))]" />
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!conceptOnly && (
          <>
            <Field label="Blank" hint="drives sizes, colors, specs">
              <select
                value={blankId}
                onChange={(e) => setBlankId(e.target.value)}
                className="w-full h-10 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[13px]"
              >
                <option value="">— none yet (creates a concept) —</option>
                {/* The athlete catalogue first, the rest still reachable
                    underneath — grouping says what's on offer without making
                    anything unpickable. */}
                {blanks.some((b) => b.assortments.includes("athlete")) ? (
                  <>
                    <optgroup label="Athlete catalog">
                      {blanks.filter((b) => b.assortments.includes("athlete"))
                        .map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                    <optgroup label="Other blanks">
                      {blanks.filter((b) => !b.assortments.includes("athlete"))
                        .map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                  </>
                ) : (
                  blanks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)
                )}
              </select>
            </Field>

            {blank && blank.colors.length > 0 && (
              <Field label="Colors">
                <div className="flex flex-wrap gap-1.5">
                  {blank.colors.map((c) => {
                    const on = colors.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => setColors((prev) => on ? prev.filter((x) => x !== c) : [...prev, c])}
                        className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                          on ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))] text-muted-foreground"
                        }`}
                      >{c}</button>
                    );
                  })}
                </div>
              </Field>
            )}

            {sizes.length > 0 && (
              <Field label="Sizes" hint="from the blank">
                <div className="flex flex-wrap gap-1.5">
                  {sizes.map((s) => (
                    <span key={s} className="text-[11px] font-semibold rounded-full px-2.5 py-1 border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]">{s}</span>
                  ))}
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price">
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="45" inputMode="decimal" />
              </Field>
              <Field label="Collection">
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[13px]"
                >
                  <option value="">— none —</option>
                  {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>

            {designs.length > 0 && (
              <Field label="Designs">
                <div className="flex flex-wrap gap-1.5">
                  {designs.map((d) => {
                    const on = designIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => setDesignIds((prev) => on ? prev.filter((x) => x !== d.id) : [...prev, d.id])}
                        className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                          on ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))] text-muted-foreground"
                        }`}
                      >{d.title}</button>
                    );
                  })}
                </div>
              </Field>
            )}
          </>
        )}

        <Field label="Title">
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
        </Field>

        {!conceptOnly && (
          <Field label="Description" hint="generated — edit freely">
            <Textarea value={description} onChange={(e) => { setDescription(e.target.value); setDescTouched(true); }} rows={4} />
          </Field>
        )}

        {(titleTouched || descTouched) && (
          <button
            onClick={() => { setTitleTouched(false); setDescTouched(false); }}
            className="text-[11px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
          >
            <Wand2 className="h-3 w-3" /> Regenerate copy from the current selections
          </button>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !title.trim()}
          className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />} Create
        </button>
      </div>
    </Shell>
  );
}

// ---- Design --------------------------------------------------------------

export function QuickAddDesignDialog({
  athlete, onClose, onCreated,
}: {
  athlete: { id: string; organization_id: string; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [drafts, setDrafts] = useState<{ file: File; title: string; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  function addFiles(files: File[]) {
    const pngs = files.filter((f) => f.type === "image/png");
    const rejected = files.length - pngs.length;
    if (rejected > 0) toast.error(`${rejected} file${rejected === 1 ? "" : "s"} skipped — designs must be PNG`);
    setDrafts((prev) => [
      ...prev,
      ...pngs.map((file) => ({
        file,
        title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Design",
        preview: URL.createObjectURL(file),
      })),
    ]);
  }

  const { isOver, dropProps } = useFileDropZone({ onFiles: addFiles, accept: ["image/"], paste: true });

  async function save() {
    if (drafts.length === 0) return;
    setSaving(true);
    setProgress(0);
    try {
      for (const [i, d] of drafts.entries()) {
        const { designId } = await uploadDesignFromFile({
          file: d.file,
          organizationId: athlete.organization_id,
          collectionId: null,
          titleOverride: d.title.trim(),
        });
        await supabase.from("design_athletes").insert({ design_id: designId, athlete_id: athlete.id } as never);
        setProgress(i + 1);
      }
      toast.success(`${drafts.length} design${drafts.length === 1 ? "" : "s"} added`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setSaving(false); }
  }

  return (
    <Shell
      title="Add designs"
      blurb={`Final artwork for ${athlete.name} — transparent PNG, isolated, high resolution. Drop several, or paste from the clipboard.`}
      onClose={onClose}
    >
      {/* Two different jobs, in the order they come up: pulling artwork out of
          something you already have, and inventing something new. */}
      <PngCreationPanel
        organizationId={athlete.organization_id}
        designName={drafts.length === 1 ? drafts[0].title : undefined}
      />
      <DesignPromptPanel entity={{ id: athlete.id, name: athlete.name }} />

      <div
        {...dropProps}
        className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
          isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
        }`}
      >
        <Palette className="h-6 w-6 mx-auto text-[hsl(var(--ax-faint))]" />
        <p className="text-[13px] text-muted-foreground mt-1.5">Drop PNGs here, paste with Ctrl+V</p>
        <label className="inline-block mt-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
          or browse
          <input
            type="file" accept="image/png" multiple className="hidden"
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </label>
      </div>

      {drafts.length > 0 && (
        <div className="space-y-2 max-h-[45vh] overflow-y-auto">
          {drafts.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="h-14 w-14 rounded overflow-hidden border border-[hsl(var(--ax-border))] shrink-0" style={CHECKERBOARD}>
                <img src={d.preview} alt="" className="h-full w-full object-contain" />
              </span>
              <Input
                value={d.title}
                onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                className="h-9 text-[13px]"
              />
              <button
                onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">
          {saving ? `Uploading ${progress} of ${drafts.length}…` : `${drafts.length} design${drafts.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={saving || drafts.length === 0}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />} Add designs
          </button>
        </div>
      </div>
    </Shell>
  );
}

// ---- Collection ----------------------------------------------------------

export function QuickAddCollectionDialog({
  athlete, onClose, onCreated,
}: {
  athlete: { id: string; organization_id: string; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (name.trim().length < 2) return;
    setSaving(true);
    try {
      await createCollection({
        organization_id: athlete.organization_id,
        athlete_id: athlete.id,
        name,
        description,
      });
      toast.success("Collection created");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <Shell title="Create collection" blurb="The permanent creative family. Drops release from it later." onClose={onClose}>
      <Field label="Collection name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${athlete.name.split(" ").pop()} Collegiate`} />
      </Field>
      <Field label="Description" hint="optional">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
        <button
          onClick={save}
          disabled={saving || name.trim().length < 2}
          className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} Create
        </button>
      </div>
    </Shell>
  );
}
