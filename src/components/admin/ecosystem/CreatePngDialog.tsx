// Turn a concept image into its production design file.
//
// The concept is never consumed: its original image stays exactly where it is,
// and the transparent PNG is attached alongside as the product's design. That
// keeps "what we showed the athlete" and "what we print" as two separate
// truths, which is what makes approval mean anything.
import { useState } from "react";
import { Loader2, X, Upload, FileImage, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadDesignFromFile } from "@/lib/upload-design";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { CHECKERBOARD } from "@/components/admin/ecosystem/ImageLightbox";
import { PngCreationPanel } from "@/components/admin/ecosystem/PngCreationPanel";
import { PRODUCTION_FILE_CHECKS } from "@/lib/ecosystem/prompts";
import { Input } from "@/components/ui/input";

export function CreatePngDialog({
  entity, product, sourceUrl, onClose, onCreated,
}: {
  entity: { id: string; organization_id: string };
  product: { id: string; title: string };
  /** The concept image the operator is extracting from. */
  sourceUrl: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [designName, setDesignName] = useState(product.title);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  function take(files: File[]) {
    const png = files.find((f) => f.type === "image/png");
    if (!png) { toast.error("The production file has to be a PNG — that's what carries transparency"); return; }
    setFile(png);
    setPreview(URL.createObjectURL(png));
    setConfirmed(false);
  }

  const { isOver, dropProps } = useFileDropZone({ onFiles: take, accept: ["image/"], paste: true });

  async function save() {
    if (!file) return;
    setSaving(true);
    try {
      const { designId } = await uploadDesignFromFile({
        file,
        organizationId: entity.organization_id,
        collectionId: null,
        titleOverride: designName.trim() || product.title,
      });

      // Attach to the concept and to the entity. Failures here are worth
      // surfacing but the design itself is already safe.
      const [linkProduct, linkEntity] = await Promise.all([
        supabase.from("product_designs" as never).insert({ product_id: product.id, design_id: designId, sort_order: 0 } as never),
        supabase.from("design_athletes" as never).insert({ design_id: designId, athlete_id: entity.id } as never),
      ]);
      if (linkProduct.error) throw linkProduct.error;
      if (linkEntity.error) console.error(linkEntity.error);

      toast.success(`Production PNG attached to ${product.title}`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach the PNG");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Create production PNG</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              Pull the artwork out of “{product.title}”. The concept image stays exactly as it is.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Source concept</div>
            <span className="block aspect-square rounded-lg overflow-hidden border border-[hsl(var(--ax-border))]" style={CHECKERBOARD}>
              {sourceUrl
                ? <img src={sourceUrl} alt="" className="h-full w-full object-contain" />
                : <span className="h-full w-full flex items-center justify-center text-[11px] text-muted-foreground">No image</span>}
            </span>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Production PNG</div>
            <div
              {...dropProps}
              className={`aspect-square rounded-lg border border-dashed flex flex-col items-center justify-center text-center p-3 transition-colors ${
                isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
              }`}
              style={preview ? CHECKERBOARD : undefined}
            >
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-contain" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-[hsl(var(--ax-faint))]" />
                  <p className="text-[12px] text-muted-foreground mt-1.5">Drop the PNG, or paste with Ctrl+V</p>
                  <label className="mt-1.5 text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
                    or browse
                    <input
                      type="file" accept="image/png" className="hidden"
                      onChange={(e) => { take(Array.from(e.target.files ?? [])); e.target.value = ""; }}
                    />
                  </label>
                </>
              )}
            </div>
            {preview && (
              <button onClick={() => { setFile(null); setPreview(null); setConfirmed(false); }} className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                Replace
              </button>
            )}
          </div>
        </div>

        <PngCreationPanel
          organizationId={entity.organization_id}
          designName={designName}
          onDesignNameChange={setDesignName}
          defaultOpen
        />

        {file && (
          <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">Production file</div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {PRODUCTION_FILE_CHECKS.map((c) => (
                <li key={c} className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))] shrink-0" /> {c}
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span className="text-[12px]">I've checked the file against this list.</span>
            </label>
          </div>
        )}

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Design name</div>
          <Input value={designName} onChange={(e) => setDesignName(e.target.value)} className="h-9 text-[13px]" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !file || !confirmed}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />} Attach as design
          </button>
        </div>
      </div>
    </div>
  );
}
