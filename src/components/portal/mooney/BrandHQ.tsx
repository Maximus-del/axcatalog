import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BarChart3, Boxes, Copy, Gift, Package, Pencil, ShoppingBag, Sticker, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  usePortalAnalytics, usePortalOrderHistory, usePortalPlaybook, usePortalProfile, usePortalScope, usePortalSummary, usePortalUpdateProfile,
} from "@/hooks/usePortalApi";
import { formatMoney } from "@/lib/portal/api/money";
import { PortalApiError } from "@/lib/portal/api/contract";
import { entityVoice } from "@/lib/portal/entity-voice";
import { usePortalData } from "../PortalDataContext";
import { BrandPlaybook } from "./BrandPlaybook";
import { portalLink } from "./navigation";
import { perMonth } from "@/lib/portal/brand-insights";

const READ_ONLY = "View-as is read-only. Profile edits are disabled.";
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const fmtDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" });
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return y && mo ? new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "short" }) : m;
};
/** Smallest 1 / 2 / 2.5 / 5 × 10ⁿ strictly above max. */
export function niceCeiling(max: number): number {
  if (max <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const s of [1, 2, 2.5, 5, 10]) if (s * p > max) return s * p;
  return 10 * p;
}

type InsightTab = "revenue" | "orders" | "units" | "best";
const INSIGHT_TABS: { key: InsightTab; label: string; icon: typeof BarChart3 }[] = [
  { key: "revenue", label: "Revenue", icon: BarChart3 },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "units", label: "Units", icon: Package },
  { key: "best", label: "Best sellers", icon: TrendingUp },
];

/** One bar chart for every tab: bars, a nice axis, month labels. */
function Bars({ points, format, label }: { points: { key: string; label: string; value: number }[]; format: (n: number) => string; label: string }) {
  const top = niceCeiling(Math.max(0, ...points.map((p) => p.value)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => top * f);
  return <div className="mw-hq-plot" role="img" aria-label={label}>
    <div className="mw-hq-axis">{ticks.map((t) => <span key={t}>{format(t)}</span>)}</div>
    <div className="mw-hq-bars">{points.map((p) => <div key={p.key} className="mw-hq-col">
      <div className="mw-hq-bar-wrap"><span className="mw-hq-bar" style={{ height: `${top ? Math.min(100, (p.value / top) * 100) : 0}%` }} title={`${p.label}: ${format(p.value)}`} /></div>
      <small>{p.label}</small>
    </div>)}</div>
  </div>;
}

function Insights() {
  const [tab, setTab] = useState<InsightTab>("revenue");
  const [months, setMonths] = useState(12);
  const a = usePortalAnalytics(months);
  const orders = usePortalOrderHistory(null, 100);
  const d = a.data;
  const currency = d?.monthly.find((m) => m.value)?.value?.currency ?? d?.attributedRevenue?.currency ?? "USD";
  const money = (n: number) => formatMoney({ amountMinor: Math.round(n * 100), currency });
  const whole = (n: number) => Math.round(n).toLocaleString();
  const history = orders.data?.items ?? [];
  const sold = (d?.attributable ? d.topProducts : []).filter((t) => t.units > 0);

  let body: ReactNode;
  if (tab === "revenue") {
    body = a.isLoading ? <Skeleton className="mw-studio-skeleton" /> : a.isError ? <div className="mw-state" role="alert"><p>Unable to load revenue.</p><Button variant="outline" className="mw-pill" onClick={() => void a.refetch()}>Try again</Button></div>
      : !d?.attributable ? <div className="mw-state"><p>Store sales aren't tied to you yet — they'll chart here once they are.</p></div>
      : <><div className="mw-hq-figure"><strong className="mw-hq-total">{formatMoney(d.attributedRevenue)}</strong><span className="mw-studio-meta">Gross store sales, last {months} months · updated {fmtDate(d.asOf, true)}</span></div>
        <Bars label={`Monthly gross revenue, last ${months} months`} format={money} points={d.monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), value: (m.value?.amountMinor ?? 0) / 100 }))} /></>;
  } else if (tab === "orders" || tab === "units") {
    const pts = perMonth(history, months, tab);
    const total = pts.reduce((n, p) => n + p.value, 0);
    body = orders.isLoading ? <Skeleton className="mw-studio-skeleton" /> : orders.isError ? <div className="mw-state" role="alert"><p>Unable to load orders.</p><Button variant="outline" className="mw-pill" onClick={() => void orders.refetch()}>Try again</Button></div>
      : <><div className="mw-hq-figure"><strong className="mw-hq-total">{whole(total)}</strong><span className="mw-studio-meta">{tab === "orders" ? "Orders you placed with AX" : "Pieces ordered"}, last {months} months</span></div>
        <Bars label={`${tab === "orders" ? "Orders" : "Units"} per month, last ${months} months`} format={whole} points={pts.map((p) => ({ key: p.month, label: monthLabel(p.month), value: p.value }))} /></>;
  } else {
    const max = Math.max(1, ...sold.map((t) => t.units));
    body = a.isLoading ? <Skeleton className="mw-studio-skeleton" /> : sold.length === 0 ? <div className="mw-state"><p>No store sales tied to you yet — your best sellers will rank here.</p></div>
      : <ol className="mw-hq-best">{sold.slice(0, 6).map((t, i) => <li key={`${t.title}-${i}`}>
        <span className="mw-hq-thumb">{t.imageUrl ? <img src={t.imageUrl} alt="" /> : <Package />}</span>
        <div className="min-w-0"><strong>{t.title}</strong><span className="mw-hq-best-track"><span style={{ width: `${(t.units / max) * 100}%` }} /></span></div>
        <b>{t.units.toLocaleString()} sold<small>{formatMoney(t.gross)}</small></b>
      </li>)}</ol>;
  }

  return <section className="mw-studio-panel mw-hq-chart" aria-label="Your numbers">
    <div className="mw-hq-head">
      <div className="mw-hq-tabs" role="tablist" aria-label="Chart">
        {INSIGHT_TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}><t.icon />{t.label}</button>)}
      </div>
      {tab !== "best" && <select className="mw-studio-input mw-hq-select" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Period">
        {[3, 6, 12].map((m) => <option key={m} value={m}>Last {m} months</option>)}
      </select>}
    </div>
    <div role="tabpanel">{body}</div>
  </section>;
}

/**
 * Ways to get more out of every order — and the add-ons AX sells with them.
 * Bundle savings come from the live volume breaks (what the order sheet
 * charges); add-ons with no price in AX yet say "ask AX" rather than invent one.
 */
function GrowEveryOrder() {
  const pb = usePortalPlaybook();
  const location = useLocation();
  const { openOrderSheet } = usePortalData();
  const { viewingAs } = usePortalScope();
  const link = (href: string) => portalLink(href, location.search);
  const breaks = (pb.data?.volumeBreaks ?? []).slice().sort((x, y) => x.minUnits - y.minUnits);
  const offers: { icon: typeof Boxes; title: string; body: string; tag?: string; action: ReactNode }[] = [
    {
      icon: Boxes,
      title: "Bundle up and save",
      body: breaks.length ? breaks.map((b) => `${b.minUnits}+ pieces: ${b.percent}% off`).join(" · ") : "The more pieces in one order, the less each costs.",
      tag: breaks.length ? `Up to ${Math.max(...breaks.map((b) => b.percent))}% off` : undefined,
      action: <Button variant="outline" className="mw-pill" onClick={openOrderSheet} disabled={viewingAs}>Build a bundle<ArrowRight /></Button>,
    },
    {
      icon: Sticker,
      title: "Stickers in every bag",
      body: "Die-cut logo stickers ride along with each order. A cheap extra fans keep — and a reason to come back.",
      action: <Button variant="outline" className="mw-pill" asChild><Link to={link("/portal/studio")}>Ask AX for pricing<ArrowRight /></Link></Button>,
    },
    {
      icon: Package,
      title: "Branded poly bags",
      body: "Your mark on the bag, folded and tagged. Retail-ready packaging for gym sales, camps and events.",
      action: <Button variant="outline" className="mw-pill" asChild><Link to={link("/portal/studio")}>Ask AX for pricing<ArrowRight /></Link></Button>,
    },
    {
      icon: Gift,
      title: "Event & team packs",
      body: "Tee + hoodie + stickers for a camp, a team or staff — one order, the bundle discount applied to every piece.",
      action: <Button variant="outline" className="mw-pill" asChild><Link to={link("/portal/studio")}>Plan a pack<ArrowRight /></Link></Button>,
    },
  ];
  return <section className="mw-hq-grow" aria-labelledby="grow-every-order">
    <h2 id="grow-every-order" className="mw-section-title">Grow every order</h2>
    <div className="mw-hq-grow-grid">{offers.map((o) => <article key={o.title} className="mw-studio-panel mw-hq-offer">
      <div className="mw-hq-offer-head"><span className="mw-stat-icon"><o.icon className="h-5 w-5" /></span>{o.tag && <span className="mw-drops-badge" data-status="scheduled">{o.tag}</span>}</div>
      <strong>{o.title}</strong>
      <p>{o.body}</p>
      {o.action}
    </article>)}</div>
  </section>;
}

/** Paid off-platform in phase 2: AX invoices, the client pays by Zelle or the invoice. */
function paymentLabel(o: { paymentStatus?: string | null; amountDue?: { amountMinor: number } | null }): string {
  if (o.paymentStatus === "paid") return "Paid";
  if (o.paymentStatus === "waived") return "Covered";
  if (o.amountDue && o.amountDue.amountMinor <= 1) return "Covered by credit";
  if (o.paymentStatus === "invoiced") return "Invoice sent";
  return "Invoice coming";
}

function RecentOrders() {
  const orders = usePortalOrderHistory();
  const [all, setAll] = useState(false);
  const items = orders.data?.items ?? [];
  const shown = all ? items : items.slice(0, 5);
  return <section className="mw-studio-panel">
    <h2 className="mw-section-title mw-hq-title"><ShoppingBag />Recent orders</h2>
    {orders.isLoading ? <Skeleton className="mw-studio-skeleton" /> : orders.isError ? <div className="mw-state" role="alert"><p>Unable to load orders.</p><Button variant="outline" className="mw-pill" onClick={() => void orders.refetch()}>Try again</Button></div>
      : items.length === 0 ? <div className="mw-state"><p>No orders yet.</p></div>
      : <>
        <div className="mw-hq-table" role="table">
          <div role="row" className="mw-hq-row mw-hq-row-head mw-hq-row-pay"><span role="columnheader">Order #</span><span role="columnheader">Date</span><span role="columnheader">Units</span><span role="columnheader">Total</span><span role="columnheader">Status</span><span role="columnheader">Payment</span></div>
          {shown.map((o) => <div role="row" key={o.id} className="mw-hq-row mw-hq-row-pay"><span role="cell"><strong>{o.number}</strong></span><span role="cell">{fmtDate(o.createdAt)}</span><span role="cell">{o.units}</span><span role="cell">{o.total && o.total.amountMinor > 0 ? formatMoney(o.total, { cents: true }) : "—"}</span><span role="cell"><span className="mw-drops-badge" data-status={o.status}>{o.status.replace(/_/g, " ")}</span></span><span role="cell">{paymentLabel(o)}</span></div>)}
        </div>
        {!all && items.length > 5 && <Button variant="outline" className="mw-gear-view-all" onClick={() => setAll(true)}>View all<ArrowRight /></Button>}
      </>}
  </section>;
}

function ProfileStrip() {
  const { athlete } = usePortalData();
  const { viewingAs } = usePortalScope();
  const profile = usePortalProfile();
  const update = usePortalUpdateProfile();
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState("");
  const [site, setSite] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const p = profile.data;
  const voice = entityVoice(athlete);
  const start = () => { setBio(p?.bio ?? ""); setSite(p?.website ?? ""); setErr(null); setOpen(true); };
  const save = async () => {
    const w = site.trim();
    if (w) { try { if (new URL(w).protocol !== "https:") throw 0; } catch { setErr("Use a full https:// website address."); return; } }
    try { await update.mutateAsync({ patch: { bio: bio.trim() || null, website: w || null } }); toast.success("Profile updated."); setOpen(false); }
    catch (e) { setErr(e instanceof PortalApiError ? e.error.message : "Couldn't save. Try again."); }
  };
  return <section className="mw-studio-panel mw-hq-profile">
    {profile.isLoading ? <Skeleton className="h-20 w-full" /> : <>
      <div className="mw-hq-avatar">{p?.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <span>{(p?.name || voice.name || "?").slice(0, 1)}</span>}</div>
      <div className="mw-hq-profile-main">
        <strong>{p?.name || voice.name}</strong>
        {p?.progression ? <><span className="mw-studio-meta">{p.progression.label}{p.progression.next ? ` · next: ${p.progression.next.name}` : ""}</span>
          <div className="mw-studio-track"><span style={{ width: `${p.progression.progressPct}%` }} /></div></> : <span className="mw-studio-meta">Level —</span>}
      </div>
      {p?.referral && <div className="mw-hq-code"><span className="mw-stat-label">Referral code</span><code>{p.referral.code}</code>
        <Button variant="outline" size="sm" className="mw-gear-chip" onClick={async () => { try { await navigator.clipboard.writeText(p.referral!.code); toast.success("Code copied."); } catch { toast.error("Couldn't copy."); } }}><Copy />Copy</Button></div>}
      <Button variant="outline" className="mw-pill" disabled={viewingAs || !p} onClick={start} title={viewingAs ? READ_ONLY : undefined}><Pencil />Edit profile</Button>
      {viewingAs && <p className="mw-viewing mw-hq-profile-note">{READ_ONLY}</p>}
    </>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
      <label className="text-sm" htmlFor="hq-bio">Bio</label>
      <textarea id="hq-bio" className="mw-studio-input" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
      <label className="text-sm" htmlFor="hq-site">Website</label>
      <input id="hq-site" className="mw-studio-input" type="url" inputMode="url" placeholder="https://" value={site} onChange={(e) => setSite(e.target.value)} />
      {err && <p className="mw-studio-error" role="alert">{err}</p>}
      <Button className="min-h-11" disabled={update.isPending || viewingAs} onClick={save}>{update.isPending ? "Saving…" : "Save"}</Button>
    </DialogContent></Dialog>
  </section>;
}

export function BrandHQ() {
  const { openOrderSheet } = usePortalData();
  const { viewingAs } = usePortalScope();
  const s = usePortalSummary();
  const sum = s.data;
  const stats = useMemo(() => [
    { label: "AX credit", icon: Wallet, value: formatMoney(sum?.creditBalance ?? null), sub: null as string | null },
    { label: "Lifetime gross revenue", icon: BarChart3, value: sum && !sum.revenueAttributable ? "—" : formatMoney(sum?.lifetimeRevenue ?? null), sub: sum && !sum.revenueAttributable ? "Not attributed" : "Gross sales, before refunds" },
    { label: "Orders", icon: ShoppingBag, value: num(sum?.ordersCount), sub: null },
  ], [sum]);
  return <main className="mw-gear mw-hq">
    <header className="mw-gear-header"><div><h1 className="mw-heading">Your brand. The big picture.</h1><p>Your numbers, your playbook, and ways to earn more on every order.</p></div></header>
    <section className="mw-kpis mw-hq-kpis" aria-label="Your summary">{s.isError ? <div className="mw-state" role="alert"><p>Unable to load your summary.</p><Button variant="outline" className="mw-pill" onClick={() => void s.refetch()}>Try again</Button></div>
      : stats.map((st, i) => <article key={st.label} className="mw-stat"><span className="mw-stat-icon"><st.icon className="h-5 w-5" /></span>
        <div className="mw-stat-copy"><span className="mw-stat-label">{st.label}</span>{s.isLoading ? <Skeleton className="h-7 w-20 mt-1" /> : <strong className="mw-stat-value">{st.value}</strong>}{st.sub && <span className="mw-studio-meta">{st.sub}</span>}</div>
        {i === 0 && <Button variant="outline" className="mw-pill" onClick={openOrderSheet} disabled={viewingAs} title={viewingAs ? "View-as is read-only." : undefined}>Use credit<ArrowRight /></Button>}
      </article>)}</section>
    <Insights />
    <BrandPlaybook />
    <GrowEveryOrder />
    <RecentOrders />
    <ProfileStrip />
  </main>;
}
