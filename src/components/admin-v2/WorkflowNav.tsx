import { ChevronRight } from "lucide-react";

// The AX creative pipeline, rendered as navigation.
//
// This replaces the old status-pill strip. The pills were read-only trivia in
// arbitrary order; these are in workflow order, carry the same counts, and each
// one takes the operator to that stage of this entity's workspace.

export interface WorkflowStep {
  key: string;
  label: string;
  count: number;
  /** Optional accent, e.g. Live is green once anything is actually live. */
  tone?: string;
  /** Small superscript badge, e.g. "2 waiting". */
  flag?: string;
  flagTone?: string;
}

export default function WorkflowNav({
  steps,
  active,
  onSelect,
}: {
  steps: WorkflowStep[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Workspace stages"
      className="sticky top-[57px] z-20 -mx-4 mb-7 border-y border-[hsl(var(--ax-line))] bg-[hsl(var(--ax-canvas))]/95 px-4 backdrop-blur sm:-mx-6 sm:px-6"
    >
      <div className="flex items-stretch gap-0.5 overflow-x-auto scroll-touch py-2">
        {steps.map((s, i) => {
          const isActive = active === s.key;
          const tone = s.tone ?? (isActive ? "var(--ax-accent)" : undefined);
          return (
            <div key={s.key} className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "flex min-w-[92px] flex-col items-start rounded-xl px-3 py-2 text-left transition-colors",
                  isActive ? "bg-[hsl(var(--ax-accent)/0.12)]" : "hover:bg-white/[0.05]",
                ].join(" ")}
              >
                <span className="flex items-baseline gap-1.5">
                  <span
                    className="text-[19px] font-semibold leading-none tabular-nums"
                    style={tone ? { color: `hsl(${tone})` } : undefined}
                  >
                    {s.count}
                  </span>
                  {s.flag && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        background: `hsl(${s.flagTone ?? "var(--ax-amber)"} / 0.16)`,
                        color: `hsl(${s.flagTone ?? "var(--ax-amber)"})`,
                      }}
                    >
                      {s.flag}
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "mt-1 text-[11px] font-medium uppercase tracking-[0.1em]",
                    isActive ? "text-[hsl(var(--ax-accent))]" : "text-[hsl(var(--ax-secondary))]",
                  ].join(" ")}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
