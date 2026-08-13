// Mobile-first. Game Day package builder (section 9).
// Product → personalization → qty → turnaround → AX Credit → checkout handoff.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Minus, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { useAthleteCredit } from "@/hooks/useAthleteCredit";
import { useAuth } from "@/auth/AuthProvider";
import { CheckoutBar } from "@/components/portal/builder/CheckoutBar";
import {
  TURNAROUND_OPTIONS,
  computeCredit,
  submitPortalOrder,
  buildExternalCheckoutHandoff,
  type PortalOrderItem,
} from "@/lib/portal-commerce";
import { fmtUsd } from "@/lib/portal-config";
import { cn } from "@/lib/utils";
import type { PortalProduct } from "@/hooks/usePortalProducts";

function unitPrice(p: PortalProduct): number {
  return p.athlete_unit_price ?? p.price ?? p.wholesale_price ?? 35;
}

export default function GameDayBuilder() {
  const navigate = useNavigate();
  const { products, athlete } = usePortalData();
  const { wallet, refetch: refetchCredit } = useAthleteCredit(athlete.id);
  const { user } = useAuth();

  const [productId, setProductId] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [useNumber, setUseNumber] = useState(true);
  const [useName, setUseName] = useState(true);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [turnaround, setTurnaround] = useState(TURNAROUND_OPTIONS[0].key);
  const [applyCredit, setApplyCredit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ orderNumber: string; amountDue: number } | null>(null);

  const product = products.find((p) => p.id === productId) ?? null;
  const turn = TURNAROUND_OPTIONS.find((t) => t.key === turnaround) ?? TURNAROUND_OPTIONS[0];

  const totalUnits = useMemo(() => Object.values(qtys).reduce((a, b) => a + b, 0), [qtys]);
  const subtotal = useMemo(() => {
    if (!product) return 0;
    return totalUnits * unitPrice(product) + (totalUnits > 0 ? turn.surcharge : 0);
  }, [product, totalUnits, turn]);

  const creditAvailable = wallet?.balance ?? 0;
  const math = computeCredit(subtotal, creditAvailable, applyCredit);

  function setQty(size: string, delta: number) {
    setQtys((q) => {
      const next = Math.max(0, (q[size] ?? 0) + delta);
      return { ...q, [size]: next };
    });
  }

  async function submit() {
    if (!product || totalUnits === 0 || !user) {
      toast.error("Pick a product and at least one size.");
      return;
    }
    setSubmitting(true);
    const personalization = [
      useNumber && athlete.jersey_number ? `#${athlete.jersey_number}` : null,
      useName ? `${athlete.first_name} ${athlete.last_name}`.trim() : null,
    ].filter(Boolean);

    const items: PortalOrderItem[] = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([size, q]) => ({
        product_id: product.id,
        product_name: product.title,
        size,
        quantity: q,
        color: color,
        unit_price: unitPrice(product),
        notes: JSON.stringify({ kind: "game_day", personalization, color }),
      }));

    const summary = `Game Day · ${product.title}${color ? ` · ${color}` : ""} · ${personalization.join(" ") || "no personalization"} · ${turn.label} (${turn.window})`;

    const res = await submitPortalOrder({
      organizationId: athlete.organization_id,
      athleteId: athlete.id,
      userId: user.id,
      items,
      summary,
      creditToApply: math.creditApplied,
      amountDue: math.amountDue,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not submit order.");
      return;
    }
    if (math.creditApplied > 0) void refetchCredit();
    // INTEGRATION POINT: if a checkout URL exists, redirect to pay math.amountDue.
    const url = buildExternalCheckoutHandoff({
      orderId: res.orderId!,
      orderNumber: res.orderNumber!,
      amountDue: math.amountDue,
      creditApplied: math.creditApplied,
    });
    if (url) {
      window.location.href = url;
      return;
    }
    setDone({ orderNumber: res.orderNumber!, amountDue: math.amountDue });
  }

  if (done) {
    return (
      <main className="max-w-[560px] mx-auto px-4 py-16 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-accent/15 flex items-center justify-center mb-5">
          <CheckCircle2 className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold">Order submitted</h1>
        <p className="text-muted-foreground mt-2">
          {done.orderNumber} · {done.amountDue <= 0 ? "Covered by AX Credit" : `${fmtUsd(done.amountDue, { cents: true })} due`}.
          The AX team will confirm and follow up with payment/fulfillment.
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
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 pb-40">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">Game Day</div>
        <h1 className="text-2xl font-bold mt-1">Build your Game Day gear</h1>
      </header>

      {/* Step 1: Product */}
      <Section n={1} title="Choose a product">
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products yet — the AX team is building your lineup.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scroll-touch snap-x">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProductId(p.id);
                  setColor(p.colors[0]?.name ?? null);
                  setQtys({});
                }}
                className={cn(
                  "snap-start shrink-0 w-[150px] rounded-2xl border bg-card overflow-hidden text-left",
                  productId === p.id ? "border-accent ring-1 ring-accent" : "border-border",
                )}
              >
                <div className="h-[110px] bg-muted">
                  {p.primary_image_url ? (
                    <img src={p.primary_image_url} alt={p.title} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-2.5">
                  <div className="text-[13px] font-semibold truncate">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtUsd(unitPrice(p))}/ea</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {product && (
        <>
          {/* Step 2: Personalization */}
          <Section n={2} title="Personalization">
            <div className="space-y-2">
              <Toggle
                label={`Use my number${athlete.jersey_number ? ` (#${athlete.jersey_number})` : ""}`}
                checked={useNumber}
                onChange={setUseNumber}
                disabled={!athlete.jersey_number}
              />
              <Toggle
                label={`Use my name (${athlete.first_name} ${athlete.last_name})`}
                checked={useName}
                onChange={setUseName}
              />
            </div>
            {product.colors.length > 0 && (
              <div className="mt-4">
                <div className="ax-label mb-2">Color</div>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setColor(c.name)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]",
                        color === c.name ? "border-accent text-foreground" : "border-border text-muted-foreground",
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-border"
                        style={{ background: c.hex ?? "hsl(var(--muted))" }}
                      />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Step 3: Sizes & quantity */}
          <Section n={3} title="Sizes & quantity">
            {product.sizes.length === 0 ? (
              <p className="text-sm text-muted-foreground">One size.</p>
            ) : null}
            <div className="grid grid-cols-1 gap-2">
              {(product.sizes.length ? product.sizes : ["One Size"]).map((size) => (
                <div key={size} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
                  <span className="text-sm font-medium">{size}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQty(size, -1)} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center tabular-nums font-semibold">{qtys[size] ?? 0}</span>
                    <button onClick={() => setQty(size, 1)} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Step 4: Turnaround */}
          <Section n={4} title="Turnaround">
            <div className="grid grid-cols-2 gap-3">
              {TURNAROUND_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTurnaround(t.key)}
                  className={cn(
                    "rounded-xl border p-3 text-left",
                    turnaround === t.key ? "border-accent ring-1 ring-accent" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{t.label}</span>
                    {turnaround === t.key && <Check className="h-4 w-4 text-accent" />}
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{t.window}</div>
                  <div className="text-[12px] text-accent font-semibold mt-1">
                    {t.surcharge > 0 ? `+${fmtUsd(t.surcharge)}` : "Included"}
                  </div>
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      <CheckoutBar
        subtotal={subtotal}
        creditAvailable={creditAvailable}
        applyCredit={applyCredit}
        onToggleCredit={setApplyCredit}
        submitting={submitting}
        onSubmit={submit}
        disabled={!product || totalUnits === 0}
        hint="AX Credit is applied first. Remaining balance is confirmed by the AX team."
      />
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
        <span className="h-5 w-5 rounded-full bg-accent/15 text-accent text-[11px] font-bold flex items-center justify-center">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left",
        checked ? "border-accent" : "border-border",
        disabled && "opacity-50",
      )}
    >
      <span className="text-sm">{label}</span>
      <span
        className={cn(
          "h-5 w-5 rounded-md border flex items-center justify-center",
          checked ? "bg-accent border-accent" : "border-border",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5 text-accent-foreground" />}
      </span>
    </button>
  );
}
