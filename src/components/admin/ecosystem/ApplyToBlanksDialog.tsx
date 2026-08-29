// "Put this design on these garments."
//
// Pick the blanks, confirm the print zone on each, and get that many priced
// product concepts with real composited images. The whole point is that this
// is one pass rather than six trips through the product form.
import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Check, Layers, AlertTriangle, ImageOff } from "lucide-react";
import { toast } from "sonner";
import {
  applyDesignToBlanks,
  baseImageFor,
  defaultZoneFor,
  listDecoratableBlanks,
  productTitleFor,
  type ApplyResult,
  type BlankOption,
  type BlankSelection,
} from "@/lib/ecosystem/apply-design";
import {
  DEFAULT_RULES, formatMoney, loadPricingRules, sellingPrice, trueCostOf,
  PRICE_TIERS, type PriceTier, type PricingRule,
} from "@/lib/ecosystem/pricing";
import { garmentCategoryFor, surfacesFor, type PrintZone, type SurfaceKey } from "@/lib/print-zones";
import { supabase } from "@/integrations/supabase/client";
import { CHECKERBOARD } from "@/components/admin/ecosystem/ImageLightbox";
import { cn } from "@/lib/utils";

interface ZoneRow { surface: SurfaceKey; zone: PrintZone; category: string }

export function ApplyToBlanksDialog({
  entity, design, teamId, assortment = "athlete", onClose, onCreated,
}: {
  entity: { id: string; organization_id: string; name: string };
  /**
   * Which blank assortment this entity draws from. Athlete surfaces pass
   * "athlete", client surfaces "client"; the picker opens on that catalogue and
   * you can widen to everything, so a restriction is visible rather than felt.
   */
  assortment?: string;
  design: { id: string; title: string; url: string };
  teamId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [blanks, setBlanks] = useState<BlankOption[] | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [chosen, setChosen] = useState<Record<string, BlankSelection>>({});
  const [tier, setTier] = useState<PriceTier>("standard");
  const [scoped, setScoped] = useState(true);
  const [rules, setRules] = useState<Record<PriceTier, PricingRule>>(DEFAULT_RULES);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  useEffect(() => {
    (async () => {
      const [b, z, r] = await Promise.all([
        listDecoratableBlanks().catch(() => []),
        supabase
          .from("print_zones" as never)
          .select("garment_category, surface, zone_id, label, x, y, w, h, sort_order")
          .order("sort_order"),
        loadPricingRules(entity.organization_id).catch(() => DEFAULT_RULES),
      ]);
      setBlanks(b);
      setRules(r);
      setZones(
        ((z.data ?? []) as unknown as {
          garment_category: string; surface: SurfaceKey; zone_id: string; label: string;
          x: string; y: string; w: string; h: string;
        }[]).map((row) => ({
          category: row.garment_category,
          surface: row.surface,
          zone: { id: row.zone_id, label: row.label, x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h) },
        })),
      );
    })();
  }, [entity.organization_id]);

  const rule = rules[tier];

  // In-catalogue blanks first. Scoped off shows everything, because "it isn't
  // in the Athlete catalogue yet" is a fixable state, not a dead end.
  const inCatalog = useMemo(
    () => (blanks ?? []).filter((b) => b.assortments.includes(assortment)),
    [blanks, assortment],
  );
  const visible = scoped && inCatalog.length > 0 ? inCatalog : (blanks ?? []);

  function zonesFor(garmentType: string | null): Record<SurfaceKey, PrintZone[]> {
    const category = garmentCategoryFor(garmentType);
    const mine = zones.filter((z) => z.category === category);
    return {
      front: mine.filter((z) => z.surface === "front").map((z) => z.zone),
      back: mine.filter((z) => z.surface === "back").map((z) => z.zone),
    };
  }

  function toggle(blank: BlankOption) {
    setChosen((prev) => {
      if (prev[blank.id]) {
        const next = { ...prev };
        delete next[blank.id];
        return next;
      }
      const d = defaultZoneFor(blank.garment_type, zonesFor(blank.garment_type));
      if (!d) {
        toast.error(`No print zones defined for ${blank.name}`);
        return prev;
      }
      return {
        ...prev,
        [blank.id]: {
          blank,
          surface: d.surface,
          zone: d.zone,
          colorName: blank.colors.find((c) => c.image_url)?.color_name ?? blank.colors[0]?.color_name ?? null,
        },
      };
    });
  }

  const selections = useMemo(() => Object.values(chosen), [chosen]);

  async function run() {
    if (selections.length === 0) return;
    setSaving(true);
    setProgress({ done: 0, total: selections.length, label: "" });
    try {
      const res = await applyDesignToBlanks({
        organization_id: entity.organization_id,
        athlete_id: entity.id,
        design,
        selections,
        rule,
        team_id_at_release: teamId ?? null,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      setResults(res);
      const made = res.filter((r) => r.productId).length;
      if (made) toast.success(`${made} concept${made === 1 ? "" : "s"} created`);
      if (made) onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="h-14 w-14 rounded-lg overflow-hidden border border-[hsl(var(--ax-border))] shrink-0" style={CHECKERBOARD}>
              <img src={design.url} alt="" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-lg truncate">Put “{design.title}” on garments</h3>
              <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
                Each one becomes a priced concept for {entity.name}, with the artwork placed in a real print zone.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
        </div>

        {results ? (
          <ResultList results={results} onClose={onClose} />
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">Price tier</span>
                {PRICE_TIERS.map((t) => (
                  <button
                    key={t.tier}
                    onClick={() => setTier(t.tier)}
                    title={t.blurb}
                    className={cn(
                      "text-[11px] font-semibold rounded-full px-2.5 py-1 border",
                      tier === t.tier
                        ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                        : "border-[hsl(var(--ax-border))] text-muted-foreground",
                    )}
                  >{t.label}</button>
                ))}
              </div>
              <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                {Math.round(rule.margin * 100)}% margin, unless a price is set on the blank.
              </span>

              {inCatalog.length > 0 && inCatalog.length < (blanks?.length ?? 0) && (
                <button
                  onClick={() => setScoped((v) => !v)}
                  className="ml-auto text-[11px] font-semibold text-[hsl(var(--ax-accent))]"
                >
                  {scoped
                    ? `Showing the ${assortment} catalogue (${inCatalog.length}) · show all ${blanks?.length}`
                    : `Showing all ${blanks?.length} · back to the ${assortment} catalogue`}
                </button>
              )}
            </div>

            {blanks === null ? (
              <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[45vh] overflow-y-auto pr-1">
                {visible.map((b) => {
                  const on = !!chosen[b.id];
                  const cost = trueCostOf(b);
                  const price = sellingPrice(b, rule);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b)}
                      className={cn(
                        "ax-card p-2 text-left transition-colors",
                        on ? "ring-2 ring-[hsl(var(--ax-accent))]" : "hover:border-[hsl(var(--ax-accent)/0.5)]",
                      )}
                    >
                      <span className="block aspect-square rounded-md overflow-hidden bg-[hsl(var(--ax-line))] relative">
                        {b.image_url
                          ? <img src={b.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="h-full w-full flex items-center justify-center"><ImageOff className="h-4 w-4 text-[hsl(var(--ax-faint))]" /></span>}
                        {on && (
                          <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] flex items-center justify-center">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </span>
                      <div className="mt-1.5 text-[12px] font-semibold truncate">{b.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {formatMoney(price)}
                        {cost !== null && <span className="text-[hsl(var(--ax-faint))]"> · cost {formatMoney(cost)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selections.length > 0 && (
              <div className="space-y-2 border-t border-[hsl(var(--ax-border))] pt-3 max-h-[30vh] overflow-y-auto">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">
                  Placement — {selections.length} selected
                </div>
                {selections.map((sel) => {
                  const available = zonesFor(sel.blank.garment_type);
                  const surfaces = surfacesFor(sel.blank.garment_type);
                  const hasBase = !!baseImageFor(sel);
                  return (
                    <div key={sel.blank.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold w-40 truncate">{sel.blank.name}</span>

                      <select
                        value={sel.surface}
                        onChange={(e) => {
                          const surface = e.target.value as SurfaceKey;
                          const first = available[surface][0];
                          if (!first) { toast.error("No zones on that surface"); return; }
                          setChosen((p) => ({ ...p, [sel.blank.id]: { ...sel, surface, zone: first } }));
                        }}
                        className="h-8 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[12px]"
                      >
                        {surfaces.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>

                      <select
                        value={sel.zone.id}
                        onChange={(e) => {
                          const zone = available[sel.surface].find((z) => z.id === e.target.value);
                          if (zone) setChosen((p) => ({ ...p, [sel.blank.id]: { ...sel, zone } }));
                        }}
                        className="h-8 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[12px]"
                      >
                        {available[sel.surface].map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                      </select>

                      {sel.blank.colors.length > 0 && (
                        <select
                          value={sel.colorName ?? ""}
                          onChange={(e) => setChosen((p) => ({ ...p, [sel.blank.id]: { ...sel, colorName: e.target.value || null } }))}
                          className="h-8 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[12px] max-w-[140px]"
                        >
                          {sel.blank.colors.map((c) => (
                            <option key={c.color_name} value={c.color_name}>
                              {c.color_name}{c.image_url ? "" : " (no photo)"}
                            </option>
                          ))}
                        </select>
                      )}

                      {!hasBase && (
                        <span className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> no photo — concept will have no image
                        </span>
                      )}

                      <span className="text-[11px] text-[hsl(var(--ax-faint))] ml-auto truncate max-w-[220px]">
                        {productTitleFor(design.title, sel.blank)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[12px] text-muted-foreground">
                {progress
                  ? `Building ${progress.done + 1} of ${progress.total}${progress.label ? ` — ${progress.label}` : ""}…`
                  : `${selections.length} garment${selections.length === 1 ? "" : "s"} selected`}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
                <button
                  onClick={run}
                  disabled={saving || selections.length === 0}
                  className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                  Create {selections.length || ""} concept{selections.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultList({ results, onClose }: { results: ApplyResult[]; onClose: () => void }) {
  const failed = results.filter((r) => r.error);
  const noImage = results.filter((r) => r.productId && r.imageMissing);
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {results.map((r) => (
          <li key={r.blankId} className="flex items-center gap-2 text-[13px]">
            {r.error
              ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              : <Check className="h-4 w-4 text-[hsl(var(--ax-accent))] shrink-0" />}
            <span className="font-semibold">{r.blankName}</span>
            <span className="text-muted-foreground truncate">
              {r.error ? r.error : r.imageMissing ? "created — no mockup image" : "created with mockup"}
            </span>
          </li>
        ))}
      </ul>
      {noImage.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          {noImage.length} concept{noImage.length === 1 ? "" : "s"} had no garment photo to composite onto. Add a
          colorway image on the blank and they'll render next time — or drop a mockup on the concept directly.
        </p>
      )}
      {failed.length === 0 && (
        <p className="text-[12px] text-muted-foreground">They're on the concept board now, ready to send for approval.</p>
      )}
      <div className="flex justify-end">
        <button onClick={onClose} className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm">Done</button>
      </div>
    </div>
  );
}
