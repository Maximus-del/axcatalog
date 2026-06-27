import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  PackageCheck,
  X,
  ArrowUpDown,
  Users,
  Trophy,
  LayoutGrid,
  Table as TableIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import {
  useAdminOrders,
  clientName,
  type AdminOrderRow,
} from "@/hooks/useAdminOrders";
import {
  ORDER_STATUSES,
  OPEN_STATUSES,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  type BulkOrderStatus,
} from "@/lib/order-status";
import { StatusBadge, PriorityBadge } from "@/components/admin/orders/StatusBadge";
import { OrdersBoard } from "@/components/admin/orders/OrdersBoard";

type FilterTab = "open" | "all" | BulkOrderStatus;
type DateRange = "7d" | "30d" | "all";
type SortKey = "created_at" | "status" | "total_units";
type ViewMode = "table" | "board";

const PAGE_SIZE = 25;

const TABS: { id: FilterTab; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  ...ORDER_STATUSES.map((s) => ({ id: s as FilterTab, label: STATUS_LABEL[s] })),
];

function isOverdue(o: AdminOrderRow): boolean {
  return (
    o.status === "submitted" &&
    Date.now() - +new Date(o.created_at) > 24 * 60 * 60 * 1000
  );
}

export default function OrdersList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { orders, loading, refetch } = useAdminOrders();

  const [tab, setTab] = useState<FilterTab>(
    (params.get("tab") as FilterTab) ?? "open",
  );
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<ViewMode>(
    (params.get("view") as ViewMode) === "board" ? "board" : "table",
  );

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (view === "table") next.delete("view");
    else next.set("view", view);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Sync tab to URL
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (tab === "open") next.delete("tab");
    else next.set("tab", tab);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Status counts for header summary
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<BulkOrderStatus, number>> = {};
    for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [orders]);

  // Distinct client list for filter
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const key = o.athlete_id ?? o.team_id;
      if (!key) continue;
      if (!map.has(key)) map.set(key, clientName(o));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  // Apply filters + sorting
  const filtered = useMemo(() => {
    const sinceMs =
      dateRange === "7d"
        ? Date.now() - 7 * 86400_000
        : dateRange === "30d"
          ? Date.now() - 30 * 86400_000
          : 0;
    const q = search.trim().toLowerCase();

    const result = orders.filter((o) => {
      // Tab
      if (tab === "open" && !OPEN_STATUSES.includes(o.status)) return false;
      if (tab !== "open" && tab !== "all" && o.status !== tab) return false;
      // Date
      if (sinceMs && +new Date(o.created_at) < sinceMs) return false;
      // Client
      if (clientFilter !== "all") {
        const key = o.athlete_id ?? o.team_id;
        if (key !== clientFilter) return false;
      }
      // Search
      if (q) {
        const hay = [
          o.order_number ?? "",
          clientName(o),
          o.tracking_number ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "created_at") {
        av = +new Date(a.created_at);
        bv = +new Date(b.created_at);
      } else if (sortKey === "total_units") {
        av = a.total_units;
        bv = b.total_units;
      } else {
        av = a.status;
        bv = b.status;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [orders, tab, search, dateRange, clientFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [tab, search, dateRange, clientFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const quickAction = async (
    o: AdminOrderRow,
    action: "acknowledge" | "complete" | "cancel",
  ) => {
    const patch: TablesUpdate<"bulk_order_requests"> = {};
    if (action === "acknowledge") {
      patch.status = "acknowledged";
      patch.acknowledged_at = new Date().toISOString();
    } else if (action === "complete") {
      patch.status = "completed";
      patch.completed_at = new Date().toISOString();
    } else {
      patch.status = "cancelled";
    }

    const { error } = await supabase
      .from("bulk_order_requests")
      .update(patch)
      .eq("id", o.id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Order ${o.order_number ?? ""} updated`);
    void refetch();
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="ax-section-header mb-2">Fulfillment</div>
          <h1 className="text-3xl font-bold">Bulk Orders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {(["submitted", "in_production", "completed"] as BulkOrderStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_BADGE_CLASS[s].split(" ")[0],
                )}
              />
              <span className={STATUS_BADGE_CLASS[s].split(" ")[1]}>
                {statusCounts[s] ?? 0}
              </span>
              <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
            </span>
          ))}
          <div className="inline-flex rounded-md border border-border overflow-hidden ml-2">
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 transition-colors",
                view === "table"
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5 border-l border-border transition-colors",
                view === "board"
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
          </div>
        </div>
      </header>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          const count =
            t.id === "all"
              ? orders.length
              : t.id === "open"
                ? orders.filter((o) => OPEN_STATUSES.includes(o.status)).length
                : (statusCounts[t.id as BulkOrderStatus] ?? 0);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2 text-xs uppercase tracking-wider font-medium border-b-2 transition-colors",
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}{" "}
              <span className="ml-1 text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, client, tracking…"
            className="pl-9"
          />
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="ax-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {orders.length === 0
                ? "No orders yet. Athletes can submit bulk orders from their portal."
                : "No orders match these filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--dark))] border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 ax-label">Order #</th>
                  <th className="text-left px-4 py-3 ax-label">Client</th>
                  <SortableTh
                    label="Status"
                    active={sortKey === "status"}
                    dir={sortDir}
                    onClick={() => toggleSort("status")}
                  />
                  <th className="text-left px-4 py-3 ax-label">Priority</th>
                  <SortableTh
                    label="Items"
                    active={sortKey === "total_units"}
                    dir={sortDir}
                    onClick={() => toggleSort("total_units")}
                    align="right"
                  />
                  <SortableTh
                    label="Submitted"
                    active={sortKey === "created_at"}
                    dir={sortDir}
                    onClick={() => toggleSort("created_at")}
                  />
                  <th className="text-left px-4 py-3 ax-label">Tracking</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const overdue = isOverdue(o);
                  const isAthlete = !!o.athlete_id;
                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "border-b border-border/60 hover:bg-accent/5 transition-colors cursor-pointer",
                        overdue && "border-l-2 border-l-orange-500",
                      )}
                      onClick={() => navigate(`/admin/orders/${o.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-accent">
                        {o.order_number ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isAthlete ? (
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="truncate max-w-[180px]">
                            {clientName(o)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={o.priority} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {o.total_units}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(o.created_at), {
                          addSuffix: true,
                        })}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {o.tracking_number ?? "—"}
                      </td>
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => navigate(`/admin/orders/${o.id}`)}
                            >
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {o.status === "submitted" && (
                              <DropdownMenuItem
                                onClick={() => quickAction(o, "acknowledge")}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Acknowledge
                              </DropdownMenuItem>
                            )}
                            {o.status === "shipped" && (
                              <DropdownMenuItem
                                onClick={() => quickAction(o, "complete")}
                              >
                                <PackageCheck className="h-4 w-4 mr-2" />
                                Mark complete
                              </DropdownMenuItem>
                            )}
                            {o.status !== "completed" &&
                              o.status !== "cancelled" && (
                                <DropdownMenuItem
                                  onClick={() => quickAction(o, "cancel")}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-[hsl(var(--dark))]">
            <span className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronUp className="h-4 w-4 rotate-[-90deg]" /> Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 ax-label cursor-pointer select-none hover:text-accent",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}
