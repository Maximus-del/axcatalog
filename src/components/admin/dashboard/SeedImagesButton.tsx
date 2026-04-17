import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Target = {
  kind: "design" | "product";
  id: string;
  bucket: string;
  path: string;
  primaryRow?: { existingId?: string };
};

async function fetchPlaceholder(seed: string): Promise<Blob> {
  const res = await fetch(`https://picsum.photos/seed/${seed}/800/800`);
  if (!res.ok) throw new Error(`picsum fetch failed: ${res.status}`);
  return await res.blob();
}

export function SeedImagesButton() {
  if (!import.meta.env.DEV) return null;

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  async function run() {
    setRunning(true);
    setDone(0);
    setTotal(0);
    setErrors([]);
    const failures: string[] = [];

    try {
      const [designsRes, productsRes] = await Promise.all([
        supabase.from("designs").select("id").eq("notes", "Seeded test data"),
        supabase.from("products").select("id, notes").like("notes", "Seeded test data%"),
      ]);

      if (designsRes.error) throw designsRes.error;
      if (productsRes.error) throw productsRes.error;

      const targets: Target[] = [
        ...(designsRes.data ?? []).map((d) => ({
          kind: "design" as const,
          id: d.id,
          bucket: "mockups",
          path: `${d.id}/mockups/primary.png`,
        })),
        ...(productsRes.data ?? []).map((p) => ({
          kind: "product" as const,
          id: p.id,
          bucket: "product-images",
          path: `${p.id}/primary.png`,
        })),
      ];

      setTotal(targets.length);
      if (targets.length === 0) {
        toast.info("No seeded designs or products found.");
        setRunning(false);
        return;
      }

      for (const t of targets) {
        try {
          const blob = await fetchPlaceholder(t.id);
          const file = new File([blob], "primary.png", { type: "image/png" });

          const { error: upErr } = await supabase.storage
            .from(t.bucket)
            .upload(t.path, file, { upsert: true, contentType: "image/png" });
          if (upErr) throw upErr;

          if (t.kind === "design") {
            // Upsert a design_files row marked primary as a "mockup"
            const { data: existing } = await supabase
              .from("design_files")
              .select("id")
              .eq("design_id", t.id)
              .eq("storage_path", t.path)
              .maybeSingle();

            if (existing?.id) {
              await supabase
                .from("design_files")
                .update({ is_primary: true })
                .eq("id", existing.id);
            } else {
              // Clear other primaries first
              await supabase
                .from("design_files")
                .update({ is_primary: false })
                .eq("design_id", t.id)
                .eq("file_type", "mockup");

              await supabase.from("design_files").insert({
                design_id: t.id,
                file_type: "mockup",
                storage_bucket: t.bucket,
                storage_path: t.path,
                file_name: "primary.png",
                mime_type: "image/png",
                file_size_bytes: blob.size,
                file_extension: "png",
                is_primary: true,
              });
            }
          } else {
            const { data: existing } = await supabase
              .from("product_images")
              .select("id")
              .eq("product_id", t.id)
              .eq("storage_path", t.path)
              .maybeSingle();

            if (existing?.id) {
              await supabase
                .from("product_images")
                .update({ is_primary: true })
                .eq("id", existing.id);
            } else {
              await supabase
                .from("product_images")
                .update({ is_primary: false })
                .eq("product_id", t.id);

              await supabase.from("product_images").insert({
                product_id: t.id,
                storage_bucket: t.bucket,
                storage_path: t.path,
                file_name: "primary.png",
                is_primary: true,
              });
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${t.kind} ${t.id}: ${msg}`);
        } finally {
          setDone((d) => d + 1);
        }
      }

      setErrors(failures);
      if (failures.length === 0) {
        toast.success(`Seeded ${targets.length} placeholder images.`);
      } else {
        toast.error(`Completed with ${failures.length} error(s). See dashboard.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Seed failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-dashed border-border p-4 bg-muted/30">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-label text-xs text-muted-foreground">Dev tools</div>
          <div className="text-sm font-medium">Seed placeholder images</div>
          <div className="text-xs text-muted-foreground">
            Uploads picsum.photos images to seeded designs &amp; products. Dev-only.
          </div>
        </div>
        <Button onClick={run} disabled={running} size="sm" variant="secondary">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Seeding…
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4 mr-2" />
              Seed images
            </>
          )}
        </Button>
      </div>
      {(running || done > 0) && total > 0 && (
        <div className="mt-3 space-y-1">
          <Progress value={pct} className="h-2" />
          <div className="text-xs text-muted-foreground">
            {done} of {total} uploaded
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-destructive">
            {errors.length} error(s)
          </summary>
          <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
            {errors.map((e, i) => (
              <li key={i} className="font-mono text-muted-foreground">
                {e}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
