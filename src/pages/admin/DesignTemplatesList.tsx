// Design Template Library — the browsable catalog of reusable STYLE systems.
// A template is not a design; it is the rules a design follows (graphics,
// typography, color tendencies) plus an attribute vector that makes it
// matchable against athlete preference profiles. Applying one to an athlete
// creates a non-destructive instance, so the library itself never mutates.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Shapes, Plus, Archive } from "lucide-react";
import { useDesignTemplateLibrary } from "@/hooks/useCommerce";
import { templatePreviewUrl, templateSignature, type DesignTemplateFull } from "@/lib/ecosystem/commerce";
import { gradientFor } from "@/lib/ecosystem/visual";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewDesignTemplateDialog } from "@/components/admin/ecosystem/NewDesignTemplateDialog";

const SORTS = [
  { value: "name", label: "Name" },
  { value: "used", label: "Most used" },
  { value: "newest", label: "Newest" },
] as const;

type SortKey = (typeof SORTS)[number]["value"];

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0))).sort();
}

export function TemplatePlate({
  template,
  className = "h-40",
  showStyle = true,
}: {
  template: Pick<DesignTemplateFull, "name" | "style" | "preview_images" | "color_tendencies">;
  className?: string;
  showStyle?: boolean;
}) {
  const preview = templatePreviewUrl(template);
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[10px] ${className}`}
      style={{ background: gradientFor(template.name) }}
    >
      {preview ? (
        <img src={preview} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          {showStyle && (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <span className="text-white/85 font-black uppercase tracking-[0.14em] text-center text-[15px] leading-tight">
                {template.style ?? template.name}
              </span>
            </div>
          )}
          {/* Color tendencies read as a swatch bar — the palette at a glance. */}
          <div className="absolute bottom-0 left-0 right-0 flex h-1.5">
            {(template.color_tendencies ?? []).slice(0, 5).map((c, i) => (
              <span key={`${c}-${i}`} className="flex-1 bg-white" style={{ opacity: 0.18 + i * 0.14 }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DesignTemplatesList() {
  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useDesignTemplateLibrary(showArchived);
  const templates = useMemo(() => data?.templates ?? [], [data]);
  const usage = data?.usage ?? {};

  const styles = useMemo(() => uniqueSorted(templates.map((t) => t.style)), [templates]);
  const sports = useMemo(() => uniqueSorted(templates.flatMap((t) => t.sport_compatibility ?? [])), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = templates.filter((t) => {
      if (styleFilter !== "all" && t.style !== styleFilter) return false;
      if (sportFilter !== "all" && !(t.sport_compatibility ?? []).includes(sportFilter)) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.style ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)) ||
        (t.color_tendencies ?? []).some((c) => c.toLowerCase().includes(q))
      );
    });
    const sorted = [...rows];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "used") sorted.sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.name.localeCompare(b.name));
    if (sort === "newest") sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sorted;
  }, [templates, search, styleFilter, sportFilter, sort, usage]);

  const isEmpty = !isLoading && templates.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Content</div>
          <h1 className="text-3xl font-bold">Design Templates</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-[70ch]">
            Reusable style systems — graphics, typography, and color rules with an attribute signature. Apply one to an
            athlete to spin up an editable instance; the template itself stays untouched.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="h-9 px-3.5 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search style, tag, or color…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={styleFilter} onValueChange={setStyleFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All styles</SelectItem>
              {styles.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sports</SelectItem>
              {sports.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`h-9 px-3 rounded-lg border text-[13px] font-semibold inline-flex items-center gap-1.5 ${
              showArchived
                ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                : "border-[hsl(var(--ax-border))] text-muted-foreground"
            }`}
          >
            <Archive className="h-4 w-4" /> Archived
          </button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="ax-card space-y-3">
              <Skeleton className="h-40 w-full rounded-[10px]" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <Shapes className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">No design templates yet.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t) => {
            const signature = templateSignature(t.attributes, 3);
            const used = usage[t.id] ?? 0;
            return (
              <Link key={t.id} to={`/admin/design-templates/${t.id}`} className="ax-card-hover block group">
                <TemplatePlate template={t} />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.name}</div>
                    {t.style && <div className="text-xs text-muted-foreground truncate">{t.style}</div>}
                  </div>
                  {!t.is_active && <span className="ax-badge-pending shrink-0">Archived</span>}
                  {t.is_active && t.organization_id === null && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-faint))] shrink-0 mt-0.5">
                      Global
                    </span>
                  )}
                </div>

                {t.description && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}

                {signature.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {signature.map((a) => (
                      <div key={a.key} className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))] w-[68px] shrink-0 truncate">
                          {a.key}
                        </span>
                        <span className="h-1 flex-1 rounded-full bg-[hsl(var(--ax-line))] overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-[hsl(var(--ax-accent))]"
                            style={{ width: `${Math.round(Math.min(1, a.value) * 100)}%` }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {(t.tags ?? []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-semibold rounded-full bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {used === 0 ? "Unused" : `${used} athlete${used === 1 ? "" : "s"}`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!isLoading && templates.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No templates match your filters.
        </div>
      )}

      {creating && <NewDesignTemplateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
