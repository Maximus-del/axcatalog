// Mobile-first. Camp package builder (section 10). Bulk → better pricing.
// Collects the camp order and submits it as a request for the AX team to
// price/quote (bulk pricing isn't computed client-side).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { useAuth } from "@/auth/AuthProvider";
import { CAMP_TIERS, tierForQty, submitPortalOrder } from "@/lib/portal-commerce";
import { cn } from "@/lib/utils";

const BENEFITS = [
  "Better per-unit pricing",
  "Custom camp design",
  "Staff shirts",
  "Sponsor logo placement",
  "Fast reorders",
  "Dedicated AX support",
];

export default function CampBuilder() {
  const navigate = useNavigate();
  const { products, athlete } = usePortalData();
  const { user } = useAuth();

  const [qty, setQty] = useState<number>(50);
  const [productId, setProductId] = useState<string | null>(null);
  const [colorNote, setColorNote] = useState("");
  const [designChoice, setDesignChoice] = useState<"existing" | "new">("existing");
  const [eventDate, setEventDate] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [sponsors, setSponsors] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const tier = tierForQty(qty);
  const product = products.find((p) => p.id === productId) ?? null;

  async function submit() {
    if (!user) return;
    setSubmitting(true);
    const summary = [
      `Camp order · ~${qty} pcs (${tier.label} · ${tier.note})`,
      product ? `Product: ${product.title}` : "Product: TBD with AX",
      colorNote ? `Color: ${colorNote}` : null,
      `Design: ${designChoice === "new" ? "new design requested" : "existing design"}`,
      eventDate ? `Event: ${eventDate}` : null,
      neededBy ? `Needed by: ${neededBy}` : null,
      sponsors ? "Sponsor logos: yes" : null,
      notes ? `Notes: ${notes}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

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
      toast.error(res.error ?? "Could not submit camp order.");
      return;
    }
    if (designChoice === "new") navigate("/portal/studio");
    else setDone(res.orderNumber ?? "");
  }

  if (done) {
    return (
      <main className="max-w-[560px] mx-auto px-4 py-16 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-accent/15 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold">Camp request sent</h1>
        <p className="text-muted-foreground mt-2">
          {done} — the AX team will build your camp package and send bulk pricing.
        </p>
        <button
          onClick={() => navigate("/portal")}
          className="mt-6 h-11 px-6 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-sm"
        >
          Back to Home
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 pb-28">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">Camp</div>
        <h1 className="text-2xl font-bold mt-1">Build a camp package</h1>
        <p className="text-sm text-muted-foreground mt-1">Larger orders unlock better pricing.</p>
      </header>

      {/* Quantity tiers */}
      <section className="mb-6">
        <div className="ax-label mb-2">How many pieces?</div>
        <div className="flex gap-2 flex-wrap">
          {CAMP_TIERS.map((t) => (
            <button
              key={t.min}
              onClick={() => setQty(t.min)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-semibold",
                tier.min === t.min ? "border-accent ring-1 ring-accent text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/12 to-transparent p-4">
          <div className="flex items-center gap-2 text-accent font-bold text-sm">
            <Users className="h-4 w-4" /> {tier.min}+ pieces — {tier.note}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Check className="h-3 w-3 text-accent shrink-0" /> {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Product */}
      <section className="mb-6">
        <div className="ax-label mb-2">Base product (optional)</div>
        <div className="flex gap-2 flex-wrap">
          <Chip label="Decide with AX" active={!productId} onClick={() => setProductId(null)} />
          {products.slice(0, 8).map((p) => (
            <Chip key={p.id} label={p.title} active={productId === p.id} onClick={() => setProductId(p.id)} />
          ))}
        </div>
      </section>

      <Field label="Color(s)">
        <input value={colorNote} onChange={(e) => setColorNote(e.target.value)} placeholder="e.g. Black + White" className="portal-input" />
      </Field>

      <section className="mb-6">
        <div className="ax-label mb-2">Design</div>
        <div className="grid grid-cols-2 gap-3">
          <Chip label="Use existing design" active={designChoice === "existing"} onClick={() => setDesignChoice("existing")} big />
          <Chip label="Request new design" active={designChoice === "new"} onClick={() => setDesignChoice("new")} big />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Event date">
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="portal-input" />
        </Field>
        <Field label="Needed by">
          <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="portal-input" />
        </Field>
      </div>

      <button
        onClick={() => setSponsors((s) => !s)}
        className={cn(
          "w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left mb-4",
          sponsors ? "border-accent" : "border-border",
        )}
      >
        <span className="text-sm">Include sponsor logos</span>
        <span className={cn("h-5 w-5 rounded-md border flex items-center justify-center", sponsors ? "bg-accent border-accent" : "border-border")}>
          {sponsors && <Check className="h-3.5 w-3.5 text-accent-foreground" />}
        </span>
      </button>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything else we should know…" className="portal-input resize-none" />
      </Field>

      <button
        onClick={submit}
        disabled={submitting}
        className="pressable w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold uppercase tracking-wider text-sm mt-2 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : designChoice === "new" ? "Start Camp Order + Design" : "Start Camp Order"}
      </button>
    </main>
  );
}

function Chip({ label, active, onClick, big }: { label: string; active: boolean; onClick: () => void; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border text-sm font-medium",
        big ? "px-4 py-3 w-full text-center" : "px-3 py-2",
        active ? "border-accent ring-1 ring-accent text-foreground" : "border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="ax-label mb-2">{label}</div>
      {children}
    </div>
  );
}
