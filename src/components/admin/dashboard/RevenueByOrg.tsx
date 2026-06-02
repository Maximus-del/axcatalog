import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface OrgRow {
  org_id: string;
  name: string;
  revenue: number;
  line_items: number;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function RevenueByOrg() {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pageSize = 1000;
      const agg = new Map<string, { revenue: number; line_items: number }>();
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("order_line_items")
          .select("attributed_org_id, line_total, orders!inner(is_test)")
          .not("attributed_org_id", "is", null)
          .eq("orders.is_test", false)
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        for (const r of data as Array<{
          attributed_org_id: string;
          line_total: number | null;
        }>) {
          const cur = agg.get(r.attributed_org_id) ?? { revenue: 0, line_items: 0 };
          cur.revenue += Number(r.line_total ?? 0);
          cur.line_items += 1;
          agg.set(r.attributed_org_id, cur);
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const ids = [...agg.keys()];
      const namesById = new Map<string, string>();
      if (ids.length) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", ids);
        for (const o of orgs ?? []) namesById.set(o.id, o.name);
      }
      const breakdown = [...agg.entries()]
        .map(([org_id, v]) => ({
          org_id,
          name: namesById.get(org_id) ?? org_id,
          revenue: Math.round(v.revenue * 100) / 100,
          line_items: v.line_items,
        }))
        .sort((a, b) => b.revenue - a.revenue);
      if (!cancelled) setRows(breakdown);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="ax-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between">
        <div className="ax-label">Revenue by Org</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {rows && <span>{rows.length} orgs</span>}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="pt-3">
          {!rows ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No attributed revenue yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((o) => (
                <li
                  key={o.org_id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="truncate">{o.name}</span>
                  <span className="flex items-center gap-3 tabular-nums text-muted-foreground">
                    <span className="text-[11px]">{o.line_items} items</span>
                    <span className="text-foreground font-semibold">
                      {fmtMoney(o.revenue)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}