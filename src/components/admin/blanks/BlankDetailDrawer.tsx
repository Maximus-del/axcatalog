// Everything about one blank, in one place.
//
// The point of the consolidation: what it is, what it looks like, what it
// costs, what we sell it for, who can access it, and where it came from —
// without opening three pages to assemble the answer yourself.
import { useState } from "react";
import { X, ImageOff, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  addToAssortment,
  isActive,
  prettyCategory,
  removeFromAssortment,
  setPriceOverride,
  type Assortment,
  type PricedCatalogBlank,
} from "@/lib/ecosystem/blank-catalog";
import { formatMoney, formatPercent, PRICE_TIERS, type PriceTier } from "@/lib/ecosystem/pricing";
import { BlankColorPhotoGrid } from "@/components/admin/blanks/BlankColorPhotoGrid";
import { VendorLink } from "@/components/admin/blanks/BlankCatalogCards";
import { cn } from "@/lib/utils";

type Tab = "overview" | "colors" | "pricing" | "availability" | "media";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "colors", label: "Colors" },
  { key: "pricing", label: "Pricing" },
  { key: "availability", label: "Availability" },
  { key: "media", label: "Media" },
];

/**
 * One tier's price, editable in place.
 *
 * Empty means "follow the rule" — which is why blur on an empty box clears the
 * override rather than saving zero. The computed figure stays visible under an
 * override so you can always see what you overrode and by how much.
 */
function TierPrice({
  blank, tier, label, onChanged,
}: {
  blank: PricedCatalogBlank;
  tier: PriceTier;
  label: string;
  onChanged: () => void;
}) {
  const override = blank.overrides[tier];
  const [draft, setDraft] = useState<string>(override != null ? String(override) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      setDraft(override != null ? String(override) : "");
      return;
    }
    if (next === override) return;
    setSaving(true);
    try {
      await setPriceOverride(blank.id, tier, next);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save price");
      setDraft(override != null ? String(override) : "");
    } finally { setSaving(false); }
  }

  return (
    <div className={cn("ax-card p-3", override != null && "ring-1 ring-[hsl(var(--ax-accent)/0.5)]")}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">{label}</span>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-lg font-bold">$</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          inputMode="decimal"
          placeholder={blank.computed[tier] != null ? blank.computed[tier]!.toFixed(2) : "—"}
          className="w-full bg-transparent text-lg font-bold tabular-nums outline-none border-b border-transparent focus:border-[hsl(var(--ax-accent))]"
        />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {formatPercent(blank.margins[tier])} margin
      </div>
      <div className="text-[10px] mt-0.5 h-3.5">
        {override != null && (
          <span className="text-[hsl(var(--ax-accent))] font-semibold">
            set · rule says {formatMoney(blank.computed[tier])}
          </span>
        )}
      </div>
    </div>
  );
}

export function BlankDetailDrawer({
  blank, assortments, onClose, onChanged,
}: {
  blank: PricedCatalogBlank;
  assortments: Assortment[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleAssortment(a: Assortment) {
    const inIt = blank.assortments.includes(a.key);
    setBusy(a.key);
    try {
      if (inIt) await removeFromAssortment(a.id, [blank.id]);
      else await addToAssortment(a.id, [blank.id]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update availability");
    } finally { setBusy(null); }
  }

  const specs = (blank.fabric_specs ?? {}) as Record<string, unknown>;
  const liveColors = blank.colors.filter((c) => c.available);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full bg-[hsl(var(--ax-canvas))] border-l border-[hsl(var(--ax-border))] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-[hsl(var(--ax-canvas))] border-b border-[hsl(var(--ax-border))]">
          <div className="flex items-start gap-4 p-5">
            <span className="h-24 w-24 shrink-0 rounded-xl overflow-hidden bg-[hsl(var(--ax-line))]">
              {blank.primaryImage
                ? <img src={blank.primaryImage} alt="" className="h-full w-full object-cover" />
                : <span className="h-full w-full flex items-center justify-center"><ImageOff className="h-5 w-5 text-[hsl(var(--ax-faint))]" /></span>}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-tight">{blank.name}</h2>
              <div className="text-[12px] text-muted-foreground mt-0.5 font-mono">
                {blank.sku ?? "—"} · {blank.style_number ?? "—"}
              </div>
              <div className="text-[12px] text-[hsl(var(--ax-faint))]">
                {prettyCategory(blank.garment_type)}{blank.brand ? ` · ${blank.brand}` : ""}
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px]">
                <span className={cn("font-semibold", isActive(blank) ? "text-[hsl(var(--ax-accent))]" : "text-amber-600")}>
                  {isActive(blank) ? "Active" : blank.availability_status ?? "Inactive"}
                </span>
                <span className="text-muted-foreground">{liveColors.length} colors</span>
                <span className="text-muted-foreground">{blank.sizes.join(", ") || "no sizes"}</span>
                <VendorLink url={blank.url} />
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex gap-1 px-5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 h-9 px-3 text-[13px] font-bold border-b-2 -mb-px transition-colors",
                  tab === t.key
                    ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                    : "border-transparent text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {tab === "overview" && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              {[
                ["Brand", blank.brand],
                ["Style #", blank.style_number],
                ["SKU", blank.sku],
                ["Category", prettyCategory(blank.garment_type)],
                ["Fabric", blank.fabric],
                ["MOQ", blank.moq != null ? String(blank.moq) : null],
                ["Sizes", blank.sizes.join(", ")],
                ...Object.entries(specs).map(([k, v]) => [
                  k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  v == null ? null : String(v),
                ]),
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3 border-b border-[hsl(var(--ax-border))] py-1.5">
                  <dt className="text-[hsl(var(--ax-faint))]">{label}</dt>
                  <dd className="font-medium text-right">{value || "—"}</dd>
                </div>
              ))}
              {blank.notes && (
                <div className="col-span-2 pt-2 text-[12px] text-muted-foreground whitespace-pre-wrap">{blank.notes}</div>
              )}
            </dl>
          )}

          {tab === "colors" && (
            liveColors.length === 0
              ? <p className="text-[13px] text-muted-foreground">No colourways on this blank.</p>
              : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {liveColors.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <span className="block aspect-square rounded-lg overflow-hidden bg-[hsl(var(--ax-line))]">
                        {c.image_url
                          ? <img src={c.image_url} alt={c.color_name} loading="lazy" className="h-full w-full object-cover" />
                          : <span className="h-full w-full flex items-center justify-center text-[10px] text-[hsl(var(--ax-faint))]">no photo</span>}
                      </span>
                      <div className="text-[11px] font-medium truncate" title={c.color_name}>{c.color_name}</div>
                      <div className="text-[10px] text-[hsl(var(--ax-faint))]">
                        {c.image_url ? "front" : "—"}{c.image_url_back ? " · back" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}

          {tab === "pricing" && (
            <div className="space-y-4">
              <div className="ax-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">True cost</div>
                <div className="text-2xl font-bold tabular-nums">{formatMoney(blank.trueCost)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Blank {formatMoney(Number(blank.blank_cost) || null)}
                  {blank.decoration_cost ? ` + decoration ${formatMoney(Number(blank.decoration_cost))}` : ""}
                  {blank.additional_cost ? ` + extras ${formatMoney(Number(blank.additional_cost))}` : ""}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {PRICE_TIERS.map((t) => (
                  <TierPrice key={t.tier} blank={blank} tier={t.tier} label={t.label} onChanged={onChanged} />
                ))}
              </div>
              <p className="text-[11px] text-[hsl(var(--ax-faint))] max-w-[62ch]">
                Prices are computed from cost and each tier's margin rule, so changing a supplier cost moves them all.
                Type a price to pin that tier instead; clear it to hand the tier back to the rule. What an audience CAN
                buy is a separate question, on the Availability tab.
              </p>
            </div>
          )}

          {tab === "availability" && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground max-w-[62ch]">
                Which catalogs may use this blank. This is an access question — it does not change what any tier pays,
                and a blank can be restricted to one audience while still carrying a price for all of them.
              </p>
              <div className="space-y-2">
                {assortments.map((a) => {
                  const inIt = blank.assortments.includes(a.key);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAssortment(a)}
                      disabled={busy === a.key}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                        inIt
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.1)]"
                          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.5)]",
                      )}
                    >
                      <span className={cn(
                        "h-5 w-5 rounded flex items-center justify-center shrink-0 border",
                        inIt ? "bg-[hsl(var(--ax-accent))] border-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]",
                      )}>
                        {busy === a.key
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : inIt && <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-on-accent))]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold">{a.name}</span>
                        {a.description && <span className="block text-[11px] text-muted-foreground truncate">{a.description}</span>}
                      </span>
                      {a.default_price_tier && (
                        <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))] shrink-0">
                          pays {a.default_price_tier}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "media" && (
            <div className="-m-5">
              {/* The importer, unchanged — same component the Media view uses. */}
              <BlankColorPhotoGrid
                blankId={blank.id}
                sku={blank.sku}
                styleNumber={blank.style_number}
                productUrl={blank.url}
                onChanged={onChanged}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
