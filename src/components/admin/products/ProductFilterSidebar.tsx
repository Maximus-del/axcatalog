import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CATEGORY_GROUPS, PRICE_BUCKETS, type ProductCategory, type PriceBucketId } from "@/lib/product-category";
import type { ProductStatus } from "@/lib/product-status";

export interface FilterState {
  categories: Set<ProductCategory>;
  athletes: Set<string>;
  teams: Set<string>;
  statuses: Set<ProductStatus>;
  priceBuckets: Set<PriceBucketId>;
}

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  categoryCounts: Map<string, number>;
  athleteOptions: Array<{ id: string; name: string; count: number }>;
  teamOptions: Array<{ id: string; name: string; count: number }>;
  statusCounts: Map<ProductStatus, number>;
  priceBucketCounts: Map<PriceBucketId, number>;
}

const STATUS_OPTIONS: ProductStatus[] = ["published", "draft", "archived"];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function Row({
  checked,
  onChange,
  label,
  count,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count: number;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-2 py-1 cursor-pointer text-sm hover:text-foreground transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
        <span className="truncate text-muted-foreground hover:text-foreground">{label}</span>
      </span>
      <span className="text-xs tabular-nums text-muted-foreground/70">{count}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="ax-label">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function ProductFilterSidebar({
  filters,
  onChange,
  categoryCounts,
  athleteOptions,
  teamOptions,
  statusCounts,
  priceBucketCounts,
}: FilterSidebarProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <Section title="Category">
          {Object.entries(CATEGORY_GROUPS).map(([group, cats]) => (
            <div key={group} className="mb-3 last:mb-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80 mb-1">
                {group}
              </div>
              {cats.map((c) => (
                <Row
                  key={c}
                  id={`cat-${c}`}
                  label={c}
                  count={categoryCounts.get(c) ?? 0}
                  checked={filters.categories.has(c)}
                  onChange={() =>
                    onChange({ ...filters, categories: toggle(filters.categories, c) })
                  }
                />
              ))}
            </div>
          ))}
        </Section>

        <Section title="Status">
          {STATUS_OPTIONS.map((s) => (
            <Row
              key={s}
              id={`status-${s}`}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              count={statusCounts.get(s) ?? 0}
              checked={filters.statuses.has(s)}
              onChange={() =>
                onChange({ ...filters, statuses: toggle(filters.statuses, s) })
              }
            />
          ))}
        </Section>

        <Section title="Price">
          {PRICE_BUCKETS.map((b) => (
            <Row
              key={b.id}
              id={`price-${b.id}`}
              label={b.label}
              count={priceBucketCounts.get(b.id) ?? 0}
              checked={filters.priceBuckets.has(b.id)}
              onChange={() =>
                onChange({ ...filters, priceBuckets: toggle(filters.priceBuckets, b.id) })
              }
            />
          ))}
        </Section>

        {athleteOptions.length > 0 && (
          <Section title="Athlete">
            {athleteOptions.map((a) => (
              <Row
                key={a.id}
                id={`ath-${a.id}`}
                label={a.name}
                count={a.count}
                checked={filters.athletes.has(a.id)}
                onChange={() =>
                  onChange({ ...filters, athletes: toggle(filters.athletes, a.id) })
                }
              />
            ))}
          </Section>
        )}

        {teamOptions.length > 0 && (
          <Section title="Team / Client">
            {teamOptions.map((t) => (
              <Row
                key={t.id}
                id={`team-${t.id}`}
                label={t.name}
                count={t.count}
                checked={filters.teams.has(t.id)}
                onChange={() =>
                  onChange({ ...filters, teams: toggle(filters.teams, t.id) })
                }
              />
            ))}
          </Section>
        )}
      </div>
    </ScrollArea>
  );
}
