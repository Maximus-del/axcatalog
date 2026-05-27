import { useEffect, useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Option {
  id: string;
  name: string;
}

interface Props {
  selectedIds: string[];
  athletes: Option[];
  teams: Option[];
  onCancel: () => void;
  onApplied: () => void;
}

/**
 * Bulk-tag bar for designs.
 * Lets an admin set a primary athlete and/or team on N selected designs.
 * Writes designs.primary_athlete_id / primary_team_id, and also links
 * design_athletes / design_teams join rows so the design surfaces in those
 * relationships.
 */
export function DesignBulkTagBar({
  selectedIds,
  athletes,
  teams,
  onCancel,
  onApplied,
}: Props) {
  const isMobile = useIsMobile();
  const [athleteId, setAthleteId] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Reset when selection cleared
  useEffect(() => {
    if (selectedIds.length === 0) {
      setAthleteId("");
      setTeamId("");
    }
  }, [selectedIds.length]);

  async function apply() {
    if (selectedIds.length === 0) return;
    if (!athleteId && !teamId) {
      toast.error("Pick an athlete or team first");
      return;
    }
    setBusy(true);
    try {
      const update: Record<string, string> = {};
      if (athleteId) update.primary_athlete_id = athleteId;
      if (teamId) update.primary_team_id = teamId;
      const { error: upErr } = await supabase
        .from("designs")
        .update(update)
        .in("id", selectedIds);
      if (upErr) throw upErr;

      if (athleteId) {
        const rows = selectedIds.map((design_id) => ({
          design_id,
          athlete_id: athleteId,
        }));
        // ignore duplicates
        const { error } = await supabase
          .from("design_athletes")
          .upsert(rows, { onConflict: "design_id,athlete_id", ignoreDuplicates: true });
        if (error) console.warn("design_athletes upsert:", error);
      }
      if (teamId) {
        const rows = selectedIds.map((design_id) => ({ design_id, team_id: teamId }));
        const { error } = await supabase
          .from("design_teams")
          .upsert(rows, { onConflict: "design_id,team_id", ignoreDuplicates: true });
        if (error) console.warn("design_teams upsert:", error);
      }

      toast.success(
        `Tagged ${selectedIds.length} design${selectedIds.length === 1 ? "" : "s"}`,
      );
      onApplied();
    } catch (e: any) {
      console.error(e);
      toast.error(`Failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  const containerClass = isMobile
    ? "md:hidden fixed inset-x-0 z-40 px-3 pt-3 pb-3 bg-background/95 backdrop-blur-md border-t border-accent/40 shadow-[0_-4px_20px_-8px_hsl(var(--accent)/0.4)]"
    : "sticky top-0 z-40 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 bg-dark/95 backdrop-blur-md border-b-2 border-accent shadow-[0_8px_24px_-8px_hsl(var(--accent)/0.5)]";

  return (
    <div
      className={containerClass}
      style={isMobile ? { bottom: "calc(56px + env(safe-area-inset-bottom, 0px))" } : undefined}
      data-no-marquee
    >
      <div
        className={cn(
          "max-w-[1600px] mx-auto flex items-center gap-3",
          isMobile ? "flex-col" : "flex-wrap",
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap self-start">
          <Tag className="h-4 w-4 text-accent" />
          <span className="tabular-nums">
            {selectedIds.length} design{selectedIds.length === 1 ? "" : "s"} selected
          </span>
        </div>
        <Select value={athleteId} onValueChange={setAthleteId}>
          <SelectTrigger className={cn(isMobile ? "w-full" : "w-[220px]")}>
            <SelectValue placeholder="Athlete tag…" />
          </SelectTrigger>
          <SelectContent>
            {athletes.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className={cn(isMobile ? "w-full" : "w-[200px]")}>
            <SelectValue placeholder="Team tag…" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className={cn("flex items-center gap-2", isMobile ? "w-full justify-end" : "ml-auto")}>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button size="sm" onClick={apply} disabled={busy || (!athleteId && !teamId)} className="gap-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}