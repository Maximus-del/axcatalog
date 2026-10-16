import { useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, BarChart3, Copy, Package, Pencil, ShoppingBag, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  usePortalAnalytics, usePortalDestinations, usePortalOrderHistory, usePortalProfile, usePortalScope, usePortalSummary, usePortalUpdateProfile,
} from "@/hooks/usePortalApi";
import { formatMoney } from "@/lib/portal/api/money";
import { PortalApiError } from "@/lib/portal/api/contract";
import { entityVoice } from "@/lib/portal/entity-voice";
import { usePortalData } from "../PortalDataContext";

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

function RevenueChart() {
  const [months, setMonths] = useState(12);
  const a = usePortalAnalytics(months);
  const d = a.data;
  const maxMinor = Math.max(0, ...(d?.monthly ?? []).map((m) => m.value?.amountMinor ?? 0));
  const top = niceCeiling(maxMinor / 100);
  const currency = d?.monthly.find((m) => m.value)?.value?.currency ?? d?.attributedRevenue?.currency ?? "USD";
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => top * f);
  return <section className="mw-studio-panel mw-hq-chart">
    <div className="mw-hq-head"><h2 className="mw-section-title"><BarChart3 />Attributed revenue</h2>
      <select className="mw-studio-input mw-hq-select" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Period">
        {[3, 6, 12].map((m) => <option key={m} value={m}>Last {m} months</option>)}
      </select>
    </div>
    {a.isLoading ? <Skeleton className="mw-studio-skeleton" /> : a.isError ? <div className="mw-state" role="alert"><p>Unable to load revenue.</p><Button variant="outline" className="mw-pill" onClick={() => void a.refetch()}>Try again</Button></div>
      : !d?.attributable ? <div className="mw-state"><p>Revenue not attributed</p></div>
      : <>
        <strong className="mw-hq-total">{formatMoney(d.attributedRevenue)}</strong>
        <p className="mw-studio-meta">Last {months} months · gross, before refunds · Updated {fmtDate(d.asOf, true)}</p>
        <div className="mw-hq-plot" role="img" aria-label={`Monthly gross revenue, last ${months} months`}>
          <div className="mw-hq-axis">{ticks.map((t) => <span key={t}>{formatMoney({ amountMinor: Math.round(t * 100), currency })}</span>)}</div>
          <div className="mw-hq-bars">{d.monthly.map((m) => <div key={m.month} className="mw-hq-col">
            <div className="mw-hq-bar-wrap"><span className="mw-hq-bar" style={{ height: `${m.value ? Math.min(100, (m.value.amountMinor / 100 / top) * 100) : 0}%` }} title={`${monthLabel(m.month)}: ${formatMoney(m.value)}`} /></div>
            <small>{monthLabel(m.month)}</small>
          </div>)}</div>
        </div>
      </>}
  </section>;
}

function TopProducts() {
  const a = usePortalAnalytics(12);
  const sold = (a.data?.attributable ? a.data.topProducts : []).filter((t) => t.units > 0);
  return <section className="mw-studio-panel">
    <h2 className="mw-section-title mw-hq-title"><Package />Top products</h2>
    {a.isLoading ? <Skeleton className="mw-studio-skeleton" /> : sold.length === 0 ? <div className="mw-state"><p>No attributed sales yet — your best sellers will show here.</p></div>
      : <ol className="mw-hq-top">{sold.map((t, i) => <li key={`${t.title}-${i}`}>
        <span className="mw-hq-rank">{i + 1}</span>
        <span className="mw-hq-thumb">{t.imageUrl ? <img src={t.imageUrl} alt="" /> : <Package />}</span>
        <div className="min-w-0"><strong>{t.title}</strong><span>{t.units.toLocaleString()} sold</span></div>
        <b>{formatMoney(t.gross)}</b>
      </li>)}</ol>}
  </section>;
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
          <div role="row" className="mw-hq-row mw-hq-row-head"><span role="columnheader">Order #</span><span role="columnheader">Date</span><span role="columnheader">Units</span><span role="columnheader">Status</span></div>
          {shown.map((o) => <div role="row" key={o.id} className="mw-hq-row"><span role="cell"><strong>{o.number}</strong></span><span role="cell">{fmtDate(o.createdAt)}</span><span role="cell">{o.units}</span><span role="cell"><span className="mw-drops-badge" data-status={o.status}>{o.status.replace(/_/g, " ")}</span></span></div>)}
        </div>
        {!all && items.length > 5 && <Button variant="outline" className="mw-gear-view-all" onClick={() => setAll(true)}>View all<ArrowRight /></Button>}
      </>}
  </section>;
}

function Community() {
  const s = usePortalSummary();
  const rows = [["Followers", s.data?.followers], ["Access members", s.data?.accessMembers], ["VIP members", s.data?.vipMembers]] as const;
  return <section className="mw-studio-panel">
    <h2 className="mw-section-title mw-hq-title"><Users />Your community</h2>
    <div className="mw-hq-community">{rows.map(([label, v]) => <div key={label}><span className="mw-stat-label">{label}</span>{s.isLoading ? <Skeleton className="h-7 w-16 mt-1" /> : <strong className="mw-stat-value">{num(v)}</strong>}</div>)}</div>
  </section>;
}

function Journey() {
  const d = usePortalDestinations();
  return <section className="mw-studio-panel">
    <h2 className="mw-section-title">Your journey</h2>
    {d.isLoading ? <Skeleton className="mw-studio-skeleton" /> : !(d.data ?? []).length ? <div className="mw-state"><p>No eras yet.</p></div>
      : <div className="mw-hq-eras">{d.data!.map((x) => <article key={x.id} className="mw-hq-era" style={{ "--mw-destination-accent": x.accent } as CSSProperties}>
        <div className="mw-hq-era-art">{x.image ? <img src={x.image} alt="" /> : <Package />}</div>
        <strong>{x.label}{x.jerseyNumber !== null ? ` #${x.jerseyNumber}` : ""}</strong>
        <span>Revenue not attributed</span>
      </article>)}</div>}
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
    <header className="mw-gear-header"><div><h1 className="mw-heading">Your brand. The big picture.</h1><p>Track your products, orders, and fans all in one place.</p></div></header>
    <section className="mw-kpis mw-hq-kpis" aria-label="Your summary">{s.isError ? <div className="mw-state" role="alert"><p>Unable to load your summary.</p><Button variant="outline" className="mw-pill" onClick={() => void s.refetch()}>Try again</Button></div>
      : stats.map((st, i) => <article key={st.label} className="mw-stat"><span className="mw-stat-icon"><st.icon className="h-5 w-5" /></span>
        <div className="mw-stat-copy"><span className="mw-stat-label">{st.label}</span>{s.isLoading ? <Skeleton className="h-7 w-20 mt-1" /> : <strong className="mw-stat-value">{st.value}</strong>}{st.sub && <span className="mw-studio-meta">{st.sub}</span>}</div>
        {i === 0 && <Button variant="outline" className="mw-pill" onClick={openOrderSheet} disabled={viewingAs} title={viewingAs ? "View-as is read-only." : undefined}>Use credit<ArrowRight /></Button>}
      </article>)}</section>
    <div className="mw-hq-grid"><RevenueChart /><TopProducts /></div>
    <RecentOrders />
    <div className="mw-hq-grid mw-hq-grid-even"><Community /><Journey /></div>
    <ProfileStrip />
  </main>;
}
