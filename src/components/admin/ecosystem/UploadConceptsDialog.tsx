// Drop a stack of mockups, get a stack of product concepts.
//
// The creative process starts with an image, not a SKU. Each upload becomes a
// real product row immediately — no blank, no price, no Shopify — so it can go
// into a collection and be approved while the commerce setup happens later. It
// is the same record that eventually goes live; nothing is re-created.
import { useState } from "react";
import { Loader2, X, Images, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAthleteProduct } from "@/lib/ecosystem/merch";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { CHECKERBOARD } from "@/components/admin/ecosystem/ImageLightbox";
import { PngCreationPanel } from "@/components/admin/ecosystem/PngCreationPanel";
import { Input } from "@/components/ui/input";

interface Draft { file: File; name: string; preview: string }

/** "AbbotsfordHeritage_hoodie-01.png" → "Abbotsford Heritage Hoodie 01" */
function nameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Concept";
}

export function UploadConceptsDialog({
  entity, teamId, collectionId, onClose, onCreated,
}: {
  entity: { id: string; organization_id: string; name: string };
  teamId?: string | null;
  /** When opened from a collection, everything lands in it directly. */
  collectionId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  function addFiles(files: File[]) {
    setDrafts((prev) => [
      ...prev,
      ...files.map((file) => ({ file, name: nameFromFile(file.name), preview: URL.createObjectURL(file) })),
    ]);
  }

  const { isOver, dropProps } = useFileDropZone({ onFiles: addFiles, accept: ["image/"], paste: true });

  async function save() {
    if (drafts.length === 0) return;
    setSaving(true);
    setProgress(0);
    try {
      for (const [i, d] of drafts.entries()) {
        const productId = await createAthleteProduct({
          organization_id: entity.organization_id,
          athlete_id: entity.id,
          title: d.name.trim() || "Concept",
          collection_id: collectionId ?? null,
          team_id_at_release: teamId ?? null,
        });

        // A concept without its image is a ghost row, so the product only
        // survives if its image does. Roll back on any upload failure.
        try {
          const ext = d.file.name.split(".").pop()?.toLowerCase() || "png";
          const path = `${productId}/${crypto.randomUUID()}.${ext}`;
          const up = await supabase.storage.from("product-images").upload(path, d.file);
          if (up.error) throw up.error;
          const linked = await supabase.from("product_images").insert({
            product_id: productId,
            storage_bucket: "product-images",
            storage_path: path,
            sort_order: 0,
          } as never);
          if (linked.error) throw linked.error;
        } catch (inner) {
          await supabase.from("products" as never).delete().eq("id", productId);
          throw inner;
        }
        setProgress(i + 1);
      }
      toast.success(`${drafts.length} concept${drafts.length === 1 ? "" : "s"} created`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Upload concepts</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              Mockups for {entity.name}. No blank, price or Shopify setup needed — these become real items you can put in
              a collection and send for approval right away.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <PngCreationPanel
          organizationId={entity.organization_id}
          designName={drafts.length === 1 ? drafts[0].name : undefined}
        />

        <div
          {...dropProps}
          className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
            isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
          }`}
        >
          <Images className="h-6 w-6 mx-auto text-[hsl(var(--ax-faint))]" />
          <p className="text-[13px] text-muted-foreground mt-2">Drop mockups here, or paste with Ctrl+V</p>
          <label className="inline-block mt-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
            or browse
            <input
              type="file" accept="image/*" multiple className="hidden"
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
                  value={d.name}
                  onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
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
            {saving ? `Uploading ${progress} of ${drafts.length}…` : `${drafts.length} concept${drafts.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || drafts.length === 0}
              className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Save concepts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
