// Mobile-first. Simplified "put this design on a garment" builder (section 11).
// Blank + color + design + print placement, with a simple preview. Submits a
// custom-piece request for the AX team to produce and add to the store.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Shirt, Palette, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { usePortalBlanks } from "@/hooks/usePortalBlanks";
import { usePortalDesigns } from "@/hooks/usePortalDesigns";
import { useAuth } from "@/auth/AuthProvider";
import { useSignedUrl } from "@/lib/storage";
import { PRINT_PLACEMENTS, submitPortalOrder } from "@/lib/portal-commerce";
import { cn } from "@/lib/utils";

const PLACEMENT_POS: Record<string, React.CSSProperties> = {
  front_left_chest: { top: "26%", left: "30%", width: "22%" },
  front_center: { top: "34%", left: "50%", transform: "translateX(-50%)", width: "40%" },
  front_oversized: { top: "28%", left: "50%", transform: "translateX(-50%)", width: "64%" },
  back_standard: { top: "30%", left: "50%", transform: "translateX(-50%)", width: "44%" },
  back_oversized: { top: "24%", left: "50%", transform: "translateX(-50%)", width: "66%" },
};

export default function CustomBuilder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { athlete } = usePortalData();
  const { user } = useAuth();
  const { blanks } = usePortalBlanks();
  const { designs } = usePortalDesigns(athlete.id);

  const [blankId, setBlankId] = useState<string | null>(params.get("blank"));
  const [designId, setDesignId] = useState<string | null>(params.get("design"));
  const [colorIdx, setColorIdx] = useState(0);
  const [placement, setPlacement] = useState(PRINT_PLACEMENTS[1].key);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const blank = blanks?.find((b) => b.id === blankId) ?? null;
  const design = designs?.find((d) => d.id === designId) ?? null;
  const color = blank?.colors[colorIdx] ?? blank?.colors[0] ?? null;
  const { url: designUrl } = useSignedUrl(design?.file?.bucket ?? null, design?.file?.path ?? null);
  const place = PRINT_PLACEMENTS.find((p) => p.key === placement) ?? PRINT_PLACEMENTS[1];

  const canSubmit = useMemo(() => !!blank && !!design && qty > 0, [blank, design, qty]);

  async function submit() {
    if (!blank || !design || !user) {
      toast.error("Pick a blank and a design.");
      return;
    }
    setSubmitting(true);
    const summary = `Custom piece · ${blank.name}${color ? ` (${color.name})` : ""} · design "${design.title ?? "Untitled"}" · ${place.surface} ${place.label} · qty ${qty}${note ? ` · ${note}` : ""}`;
    const res = await submitPortalOrder({
      organizationId: athlete.organization_id,
      athleteId: athlete.id,
      userId: user.id,
      items: [],
      summary,
      totalUnitsOverride: qty,
      creditToApply: 0,
      amountDue: 0,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not submit.");
      return;
    }
    setDone(res.orderNumber ?? "");
  }

  if (done) {
    return (
      <main className="max-w-[560px] mx-auto px-4 py-16 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-accent/15 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold">Sent to AX</h1>
        <p className="text-muted-foreground mt-2">
          {done} — we'll build this piece and add it to your store.
        </p>
        <button onClick={() => navigate("/portal/products")} className="mt-6 h-11 px-6 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-sm">
          Back to Products
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 pb-28">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <header className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">Custom</div>
        <h1 className="text-2xl font-bold mt-1">Build a piece</h1>
      </header>

      {/* Preview */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-6">
        <div
          className="relative mx-auto rounded-xl overflow-hidden"
          style={{ width: 220, height: 240, background: color?.hex ?? "hsl(var(--muted))" }}
        >
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Shirt className="h-40 w-40 text-foreground" strokeWidth={0.75} />
          </div>
          {designUrl ? (
            <img src={designUrl} alt="Design" className="absolute object-contain" style={PLACEMENT_POS[placement]} />
          ) : (
            design && (
              <div className="absolute flex items-center justify-center" style={PLACEMENT_POS[placement]}>
                <Palette className="h-8 w-8 text-foreground/40" />
              </div>
            )
          )}
        </div>
        <div className="text-center text-[11px] text-muted-foreground mt-2">
          {blank?.name ?? "Pick a blank"}{color ? ` · ${color.name}` : ""} · {place.surface} {place.label}
        </div>
      </div>

      {/* Blank */}
      <Field label="Blank">
        <div className="flex gap-2 flex-wrap">
          {(blanks ?? []).map((b) => (
            <Chip key={b.id} label={b.name} active={blankId === b.id} onClick={() => { setBlankId(b.id); setColorIdx(0); }} />
          ))}
        </div>
      </Field>

      {/* Color */}
      {blank && blank.colors.length > 0 && (
        <Field label="Color">
          <div className="flex gap-2 flex-wrap">
            {blank.colors.map((c, i) => (
              <button
                key={c.name}
                onClick={() => setColorIdx(i)}
                className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]", colorIdx === i ? "border-accent text-foreground" : "border-border text-muted-foreground")}
              >
                <span className="h-3 w-3 rounded-full border border-border" style={{ background: c.hex ?? "hsl(var(--muted))" }} />
                {c.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Design */}
      <Field label="Design">
        {designs && designs.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {designs.map((d) => (
              <Chip key={d.id} label={d.title ?? "Untitled"} active={designId === d.id} onClick={() => setDesignId(d.id)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No designs yet.{" "}
            <button onClick={() => navigate("/portal/studio")} className="text-accent font-semibold">Start one →</button>
          </p>
        )}
      </Field>

      {/* Placement */}
      <Field label="Print placement">
        <div className="flex gap-2 flex-wrap">
          {PRINT_PLACEMENTS.map((p) => (
            <Chip key={p.key} label={`${p.surface === "front" ? "Front" : "Back"} · ${p.label}`} active={placement === p.key} onClick={() => setPlacement(p.key)} />
          ))}
        </div>
      </Field>

      {/* Quantity */}
      <Field label="Quantity">
        <div className="flex items-center gap-3">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center tabular-nums font-semibold">{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Field>

      <Field label="Notes (optional)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything specific…" className="portal-input resize-none" />
      </Field>

      <button
        onClick={submit}
        disabled={submitting || !canSubmit}
        className="pressable w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-sm disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send to AX"}
      </button>
      <p className="text-[11px] text-muted-foreground text-center mt-2">
        AX reviews custom pieces, prices them, and adds them to your store.
      </p>
    </main>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("rounded-xl border px-3 py-2 text-sm font-medium", active ? "border-accent ring-1 ring-accent text-foreground" : "border-border text-muted-foreground")}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="ax-label mb-2">{label}</div>
      {children}
    </div>
  );
}
