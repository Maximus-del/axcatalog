import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import type { GarmentCategory, SurfaceKey } from "@/lib/print-zones";

interface ZoneRow {
  id: string;
  garment_category: GarmentCategory;
  surface: SurfaceKey;
  zone_id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sort_order: number;
}

type Dirty = Record<string, boolean>;

type DragMode =
  | { kind: "move"; startX: number; startY: number; orig: ZoneRow }
  | {
      kind: "resize";
      corner: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      orig: ZoneRow;
    };

export default function PrintZonesEditor() {
  const [category, setCategory] = useState<GarmentCategory>("apparel");
  const [surface, setSurface] = useState<SurfaceKey>("front");
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [dirty, setDirty] = useState<Dirty>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);

  // Caps only have "front" — coerce surface.
  useEffect(() => {
    if (category === "cap" && surface !== "front") setSurface("front");
  }, [category, surface]);

  // Load zones.
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("print_zones" as any)
        .select("*")
        .eq("garment_category", category)
        .eq("surface", surface)
        .order("sort_order", { ascending: true });
      if (cancel) return;
      if (error) {
        toast({ title: "Failed to load zones", description: error.message, variant: "destructive" });
        setZones([]);
      } else {
        const rows = ((data ?? []) as any[]).map((r) => ({
          ...r,
          x: Number(r.x),
          y: Number(r.y),
          w: Number(r.w),
          h: Number(r.h),
        })) as ZoneRow[];
        setZones(rows);
        setSelectedId(rows[0]?.id ?? null);
      }
      setDirty({});
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [category, surface]);

  // Load a representative base image for the category+surface.
  useEffect(() => {
    let cancel = false;
    (async () => {
      // Caps store their straight-on front in image_url_back.
      const wantBack = category === "cap" ? true : surface === "back";
      const garmentTypes =
        category === "cap"
          ? ["hat"]
          : ["tee", "long_sleeve", "hoodie", "crewneck", "zip_hoodie", "tank", "polo"];
      const { data: blanks } = await supabase
        .from("blanks")
        .select("id, garment_type")
        .in("garment_type", garmentTypes as any);
      const blankIds = (blanks ?? []).map((b: any) => b.id);
      if (!blankIds.length) {
        if (!cancel) setImageUrl(null);
        return;
      }
      const { data: colors } = await supabase
        .from("blank_colors")
        .select("blank_id, image_url, image_url_back")
        .in("blank_id", blankIds);
      const pick = (colors ?? []).find((c: any) =>
        wantBack ? c.image_url_back : c.image_url,
      ) as any;
      if (cancel) return;
      setImageUrl(pick ? (wantBack ? pick.image_url_back : pick.image_url) : null);
    })();
    return () => {
      cancel = true;
    };
  }, [category, surface]);

  const selected = useMemo(
    () => zones.find((z) => z.id === selectedId) ?? null,
    [zones, selectedId],
  );

  const updateZone = useCallback((id: string, patch: Partial<ZoneRow>) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...patch } : z)));
    setDirty((d) => ({ ...d, [id]: true }));
  }, []);

  // Pointer handlers
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    if (drag.kind === "move") {
      const x = clamp(drag.orig.x + dx, 0, 1 - drag.orig.w);
      const y = clamp(drag.orig.y + dy, 0, 1 - drag.orig.h);
      updateZone(drag.orig.id, { x: round(x), y: round(y) });
    } else {
      let { x, y, w, h } = drag.orig;
      if (drag.corner.includes("e")) w = clamp(drag.orig.w + dx, 0.01, 1 - drag.orig.x);
      if (drag.corner.includes("s")) h = clamp(drag.orig.h + dy, 0.01, 1 - drag.orig.y);
      if (drag.corner.includes("w")) {
        const nx = clamp(drag.orig.x + dx, 0, drag.orig.x + drag.orig.w - 0.01);
        w = drag.orig.x + drag.orig.w - nx;
        x = nx;
      }
      if (drag.corner.includes("n")) {
        const ny = clamp(drag.orig.y + dy, 0, drag.orig.y + drag.orig.h - 0.01);
        h = drag.orig.y + drag.orig.h - ny;
        y = ny;
      }
      updateZone(drag.orig.id, { x: round(x), y: round(y), w: round(w), h: round(h) });
    }
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Arrow-key nudge for the selected zone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const step = e.shiftKey ? 0.01 : 0.002;
      let { x, y } = selected;
      if (e.key === "ArrowLeft") x = clamp(x - step, 0, 1 - selected.w);
      else if (e.key === "ArrowRight") x = clamp(x + step, 0, 1 - selected.w);
      else if (e.key === "ArrowUp") y = clamp(y - step, 0, 1 - selected.h);
      else if (e.key === "ArrowDown") y = clamp(y + step, 0, 1 - selected.h);
      else return;
      e.preventDefault();
      updateZone(selected.id, { x: round(x), y: round(y) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, updateZone]);

  const saveAll = async () => {
    const ids = Object.keys(dirty).filter((id) => dirty[id]);
    if (!ids.length) return;
    setSaving(true);
    try {
      for (const id of ids) {
        const z = zones.find((r) => r.id === id);
        if (!z) continue;
        const { error } = await supabase
          .from("print_zones" as any)
          .update({
            x: z.x,
            y: z.y,
            w: z.w,
            h: z.h,
            label: z.label,
            zone_id: z.zone_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
      }
      setDirty({});
      toast({ title: "Saved", description: `${ids.length} zone(s) updated.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addZone = async () => {
    const zone_id = `zone_${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from("print_zones" as any)
      .insert({
        garment_category: category,
        surface,
        zone_id,
        label: "New zone",
        x: 0.35,
        y: 0.35,
        w: 0.3,
        h: 0.2,
        sort_order: (zones[zones.length - 1]?.sort_order ?? 0) + 10,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    const row = { ...(data as any), x: Number((data as any).x), y: Number((data as any).y), w: Number((data as any).w), h: Number((data as any).h) } as ZoneRow;
    setZones((p) => [...p, row]);
    setSelectedId(row.id);
  };

  const removeZone = async (id: string) => {
    if (!confirm("Delete this zone? This affects every product of this type.")) return;
    const { error } = await supabase.from("print_zones" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setZones((p) => p.filter((z) => z.id !== id));
    setDirty((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    if (selectedId === id) setSelectedId(null);
  };

  const dirtyCount = Object.values(dirty).filter(Boolean).length;
  const surfaces: SurfaceKey[] = category === "cap" ? ["front"] : ["front", "back"];

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Operations</div>
          <h1 className="text-3xl font-bold">Print Zones</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            These boxes are shared by garment type — saving applies to every product of this type.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={addZone}>
            <Plus className="h-4 w-4 mr-1" /> Add zone
          </Button>
          <Button onClick={saveAll} disabled={!dirtyCount || saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Saving…" : dirtyCount ? `Save ${dirtyCount}` : "Saved"}
          </Button>
        </div>
      </header>

      <div className="ax-card p-4 flex flex-wrap gap-4">
        <SegBtns
          label="Category"
          value={category}
          options={[
            { value: "apparel", label: "Apparel" },
            { value: "cap", label: "Cap" },
          ]}
          onChange={(v) => setCategory(v as GarmentCategory)}
        />
        <SegBtns
          label="Surface"
          value={surface}
          options={surfaces.map((s) => ({ value: s, label: s === "front" ? "Front" : "Back" }))}
          onChange={(v) => setSurface(v as SurfaceKey)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div
          ref={stageRef}
          className="ax-card relative aspect-square w-full overflow-hidden select-none touch-none bg-white"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Reference product"
              className="absolute inset-0 h-full w-full object-contain p-6 pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No reference image found for this category.
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Loading zones…
            </div>
          )}

          {zones.map((z) => {
            const active = z.id === selectedId;
            return (
              <div
                key={z.id}
                className={`absolute ${active ? "ring-2 ring-primary" : "ring-1 ring-foreground/40 hover:ring-foreground"} bg-primary/5`}
                style={{
                  left: `${z.x * 100}%`,
                  top: `${z.y * 100}%`,
                  width: `${z.w * 100}%`,
                  height: `${z.h * 100}%`,
                  cursor: "move",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setSelectedId(z.id);
                  dragRef.current = {
                    kind: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    orig: z,
                  };
                }}
              >
                <div className="absolute left-1 top-1 text-[10px] bg-background/80 rounded px-1 pointer-events-none">
                  {z.label}
                </div>
                {active &&
                  (["nw", "ne", "sw", "se"] as const).map((corner) => (
                    <div
                      key={corner}
                      className="absolute h-3 w-3 rounded-sm bg-background border border-primary"
                      style={{
                        left: corner.includes("w") ? -6 : "auto",
                        right: corner.includes("e") ? -6 : "auto",
                        top: corner.includes("n") ? -6 : "auto",
                        bottom: corner.includes("s") ? -6 : "auto",
                        cursor:
                          corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                        dragRef.current = {
                          kind: "resize",
                          corner,
                          startX: e.clientX,
                          startY: e.clientY,
                          orig: z,
                        };
                      }}
                    />
                  ))}
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Zones ({zones.length})</div>
            <div className="space-y-1">
              {zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setSelectedId(z.id)}
                  className={`w-full text-left text-sm rounded px-2 py-1.5 flex items-center justify-between ${
                    z.id === selectedId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">
                    {z.label}
                    {dirty[z.id] && <span className="text-primary"> •</span>}
                  </span>
                  <Trash2
                    className="h-3.5 w-3.5 opacity-50 hover:opacity-100 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeZone(z.id);
                    }}
                  />
                </button>
              ))}
              {!zones.length && !loading && (
                <div className="text-xs text-muted-foreground italic px-2 py-3">
                  No zones for this surface yet.
                </div>
              )}
            </div>
          </div>

          {selected && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Selected zone</div>
              <FieldRow label="Label">
                <Input
                  value={selected.label}
                  onChange={(e) => updateZone(selected.id, { label: e.target.value })}
                  className="h-8"
                />
              </FieldRow>
              <FieldRow label="Zone ID">
                <Input
                  value={selected.zone_id}
                  onChange={(e) => updateZone(selected.id, { zone_id: e.target.value })}
                  className="h-8 font-mono text-xs"
                />
              </FieldRow>
              <div className="grid grid-cols-2 gap-2">
                <NumField label="x" value={selected.x} onChange={(v) => updateZone(selected.id, { x: v })} />
                <NumField label="y" value={selected.y} onChange={(v) => updateZone(selected.id, { y: v })} />
                <NumField label="w" value={selected.w} onChange={(v) => updateZone(selected.id, { w: v })} />
                <NumField label="h" value={selected.h} onChange={(v) => updateZone(selected.id, { h: v })} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Drag to move, corner handles to resize. Arrow keys nudge (Shift = larger step).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SegBtns({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="inline-flex rounded-md border p-0.5 text-sm">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 rounded transition ${
              o.value === value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.001"
        min={0}
        max={1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(clamp(v, 0, 1));
        }}
        className="h-8 font-mono text-xs"
      />
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
function round(n: number) {
  return Math.round(n * 10000) / 10000;
}