import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Eye, LogOut, Search, X } from "lucide-react";
import { useOrgClients, type OrgClient } from "@/hooks/useOrgClients";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  athleteId: string;
  athleteName: string;
  teamName?: string | null;
}

const STATUS_LABEL: Record<OrgClient["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export function ImpersonationBanner({ athleteId, athleteName, teamName }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { clients, loading } = useOrgClients(open);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.team_name ?? "").toLowerCase().includes(q),
    );
  }, [clients, query]);

  const selectClient = (c: OrgClient) => {
    setOpen(false);
    setQuery("");
    if (c.kind === "brand") return; // brand portals not built yet
    if (c.id === athleteId) return;
    navigate(`/portal?as=${c.id}`);
  };

  return (
    <div className="sticky top-0 z-50 bg-accent text-accent-foreground shadow-sm">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-3 px-4 h-11 text-xs sm:text-sm">
        <div className="flex items-center gap-2 font-bold min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline shrink-0 uppercase tracking-wider">
            Viewing as
          </span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:bg-black/10 rounded px-1.5 py-0.5 truncate max-w-[60vw]"
              >
                <span className="truncate">{athleteName}</span>
                {teamName && (
                  <span className="hidden md:inline opacity-70 font-normal">
                    · {teamName}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[320px] p-0 bg-popover text-popover-foreground border-border"
            >
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Search athletes…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>
              <div className="max-h-[320px] overflow-y-auto py-1">
                {loading && (
                  <div className="space-y-1 p-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No matches.
                  </div>
                )}
                {!loading &&
                  filtered.map((c) => {
                    const isCurrent = c.id === athleteId;
                    const disabled = c.kind === "brand";
                    return (
                      <button
                        key={`${c.kind}-${c.id}`}
                        type="button"
                        onClick={() => selectClient(c)}
                        disabled={disabled}
                        title={
                          disabled
                            ? "Team portals coming soon"
                            : isCurrent
                              ? "Currently viewing"
                              : undefined
                        }
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left",
                          "hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed",
                          isCurrent && "bg-muted/60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium flex items-center gap-1.5">
                            {c.name}
                            {c.kind === "brand" && (
                              <span className="text-[9px] uppercase tracking-wider px-1 rounded bg-muted text-muted-foreground">
                                Brand
                              </span>
                            )}
                          </div>
                          {c.team_name && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {c.team_name}
                            </div>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider shrink-0",
                            c.status === "active"
                              ? "text-accent"
                              : "text-muted-foreground",
                          )}
                        >
                          {STATUS_LABEL[c.status]}
                        </span>
                      </button>
                    );
                  })}
              </div>
              <div className="border-t border-border p-1">
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded"
                >
                  <LogOut className="h-4 w-4" />
                  Exit to Admin
                </Link>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Link
          to="/admin"
          className="inline-flex items-center gap-1 font-bold uppercase tracking-wider hover:underline shrink-0"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Exit impersonation</span>
          <span className="sm:hidden">Exit</span>
        </Link>
      </div>
    </div>
  );
}
