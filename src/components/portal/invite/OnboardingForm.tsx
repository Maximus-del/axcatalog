// The questions someone answers while their access request waits. Short on
// purpose — four taps and a size. The answers go to the operator with the
// request (to pick Owner vs Team) and pre-fill the person's size in the portal.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_ONBOARDING,
  POSITIONS,
  SIZES,
  WANTS,
  useSaveOnboarding,
  type OnboardingAnswers,
  type PortalRole,
  type Size,
} from "@/lib/portal/invites";

interface Props {
  athleteId: string;
  entityName: string;
  linkRole: PortalRole;
  initial?: OnboardingAnswers | null;
  onDone: () => void;
  /** Test drive: hand the answers back instead of saving them. */
  onPreviewSubmit?: (a: OnboardingAnswers) => void;
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
        on ? "border-accent bg-accent text-accent-foreground font-semibold" : "border-border bg-transparent text-foreground hover:border-accent/60"
      }`}
    >
      {children}
    </button>
  );
}

function SizeRow({ label, value, onChange }: { label: string; value: Size | null; onChange: (s: Size | null) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {SIZES.map((s) => (
          <Chip key={s} on={value === s} onClick={() => onChange(value === s ? null : s)}>
            {s}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function OnboardingForm({ athleteId, entityName, linkRole, initial, onDone, onPreviewSubmit }: Props) {
  const [a, setA] = useState<OnboardingAnswers>(
    initial ?? { ...EMPTY_ONBOARDING, position: linkRole === "owner" ? "owner" : "coach" },
  );
  const save = useSaveOnboarding();

  const toggleWant = (w: OnboardingAnswers["wants"][number]) =>
    setA((x) => ({ ...x, wants: x.wants.includes(w) ? x.wants.filter((y) => y !== w) : [...x.wants, w] }));

  const submit = async () => {
    if (onPreviewSubmit) {
      onPreviewSubmit(a);
      onDone();
      return;
    }
    try {
      await save.mutateAsync({ athleteId, answers: a });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your answers.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Set up your locker</h2>
        <p className="mt-1 text-sm text-muted-foreground">A few quick answers so {entityName}'s locker opens ready for you.</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your role</p>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => (
            <Chip key={p.value} on={a.position === p.value} onClick={() => setA((x) => ({ ...x, position: p.value }))}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>

      <SizeRow label="Tee / hoodie size" value={a.topSize} onChange={(s) => setA((x) => ({ ...x, topSize: s }))} />
      <SizeRow label="Shorts / pants size" value={a.bottomSize} onChange={(s) => setA((x) => ({ ...x, bottomSize: s }))} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">What do you want from your locker?</p>
        <div className="flex flex-wrap gap-2">
          {WANTS.map((w) => (
            <Chip key={w.value} on={a.wants.includes(w.value)} onClick={() => toggleWant(w.value)}>
              {w.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anything else? (optional)</p>
        <Textarea
          value={a.notes}
          maxLength={500}
          onChange={(e) => setA((x) => ({ ...x, notes: e.target.value }))}
          placeholder="Name on the back, a piece you want, a fit preference…"
          className="min-h-[80px] bg-background/60"
        />
      </div>

      <Button onClick={submit} disabled={save.isPending} className="h-12 w-full rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider hover:bg-accent/90">
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & continue"}
      </Button>
    </div>
  );
}
