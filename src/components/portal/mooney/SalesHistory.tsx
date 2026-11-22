// Brand HQ: what sold, who bought it (as orders, never names), and what the
// client ordered from AX (invoices). Data: portal_sales_detail().
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, FileText, Package, ShoppingBag, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalSalesDetail } from "@/hooks/usePortalApi";
import { formatMoney } from "@/lib/portal/api/money";
import { groupInvoiceItems, type SaleStatus } from "@/lib/portal/api/sales";
import { portalLink } from "./navigation";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const STATUS_LABEL: Record<SaleStatus, string> = { current: "In your lineup", archived: "Archived", retired: "Retired" };
type Filter = "all" | "current" | "archived";

function Thumb({ src }: { src: string | null }) {
  return <span className="mw-hq-thumb">{src ? <img src={src} alt="" loading="lazy" /> : <Package />}</span>;
}

function ProductTitle({ id, title, linkable }: { id: string | null; title: string; linkable: boolean }) {
  const location = useLocation();
  if (!id || !linkable) return <strong>{title}</strong>;
  return <Link className="mw-sales-link" to={portalLink(`/portal/products/${encodeURIComponent(id)}`, location.search)}><strong>{title}</strong></Link>;
}

export function SalesHistory() {
  const q = usePortalSalesDetail(50);
  const d = q.data;
  const [filter, setFilter] = useState<Filter>("all");
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [allOrders, setAllOrders] = useState(false);
  const [allProducts, setAllProducts] = useState(false);

  const products = useMemo(() => (d?.products ?? []).filter((p) => filter === "all" || (filter === "current" ? p.status === "current" : p.status !== "current")), [d, filter]);
  const counts = useMemo(() => ({
    current: (d?.products ?? []).filter((p) => p.status === "current").length,
    archived: (d?.products ?? []).filter((p) => p.status !== "current").length,
  }), [d]);

  if (q.isLoading) return <section className="mw-studio-panel"><Skeleton className="mw-studio-skeleton" /></section>;
  if (q.isError) return <section className="mw-studio-panel"><div className="mw-state" role="alert"><p>Unable to load your sales.</p><Button variant="outline" className="mw-pill" onClick={() => void q.refetch()}>Try again</Button></div></section>;
  if (!d || !d.attributable) return null;

  const shownProducts = allProducts ? products : products.slice(0, 8);
  const orders = allOrders ? d.fanOrders : d.fanOrders.slice(0, 8);
  const charged = d.invoices.reduce((sum, i) => sum + (i.charged?.amountMinor ?? 0), 0);
  const pieces = d.invoices.reduce((sum, i) => sum + i.units, 0);

  return <>
    <section className="mw-studio-panel mw-sales" aria-labelledby="sales-by-product">
      <div className="mw-sales-head">
        <h2 id="sales-by-product" className="mw-section-title mw-hq-title"><Tag />Sales by product</h2>
        <div className="mw-hq-tabs" role="tablist" aria-label="Which products">
          {([["all", `All ${d.products.length}`], ["current", `In lineup ${counts.current}`], ["archived", `Archived ${counts.archived}`]] as [Filter, string][]).map(([k, label]) =>
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setAllProducts(false); }}>{label}</button>)}
        </div>
      </div>
      {products.length === 0 ? <div className="mw-state"><p>{filter === "current" ? "Nothing from your current lineup has sold yet." : "No sales here yet."}</p></div>
        : <ol className="mw-sales-list">{shownProducts.map((p) => <li key={p.productId ?? p.title} className="mw-sales-row">
          <Thumb src={q.photo(p.productId)} />
          <div className="mw-sales-main">
            <ProductTitle id={p.productId} title={p.title} linkable={p.status === "current" && q.inLocker(p.productId)} />
            <span className="mw-studio-meta"><span className="mw-drops-badge" data-status={p.status === "current" ? "live" : "archived"}>{STATUS_LABEL[p.status]}</span> Last sold {fmtDate(p.lastSale)}</span>
          </div>
          <div className="mw-sales-nums"><b>{formatMoney(p.gross)}</b><small>{p.units.toLocaleString()} sold · {p.orders.toLocaleString()} {p.orders === 1 ? "order" : "orders"}</small></div>
        </li>)}</ol>}
      {!allProducts && products.length > 8 && <Button variant="outline" className="mw-gear-view-all" onClick={() => setAllProducts(true)}>Show all {products.length}<ArrowRight /></Button>}
    </section>

    <section className="mw-studio-panel mw-sales" aria-labelledby="fan-orders">
      <div className="mw-sales-head">
        <h2 id="fan-orders" className="mw-section-title mw-hq-title"><ShoppingBag />Fan orders</h2>
        <span className="mw-studio-meta">{d.fanOrderCount.toLocaleString()} orders from your store · newest first</span>
      </div>
      {orders.length === 0 ? <div className="mw-state"><p>No fan orders yet.</p></div>
        : <ul className="mw-sales-orders">{orders.map((o) => {
          const open = openOrder === o.id;
          return <li key={o.id} className="mw-sales-order" data-open={open}>
            <button type="button" className="mw-sales-order-btn" aria-expanded={open} onClick={() => setOpenOrder(open ? null : o.id)}>
              <strong>{o.number}</strong><span>{fmtDate(o.date)}</span><span>{o.units} {o.units === 1 ? "piece" : "pieces"}</span>
              <b>{formatMoney(o.gross, { cents: true })}{o.refunded && <small className="mw-sales-refund">Refunded</small>}</b><ChevronDown className="mw-chevron" />
            </button>
            {open && <ul className="mw-sales-items">{o.items.map((i, k) => <li key={k}>
              <Thumb src={q.photo(i.productId)} />
              <div className="mw-sales-main"><ProductTitle id={i.productId} title={i.title} linkable={q.inLocker(i.productId)} /><span className="mw-studio-meta">{i.variant ?? "One size"} · ×{i.quantity}</span></div>
              <b>{formatMoney(i.total, { cents: true })}</b>
            </li>)}</ul>}
          </li>;
        })}</ul>}
      {!allOrders && d.fanOrders.length > 8 && <Button variant="outline" className="mw-gear-view-all" onClick={() => setAllOrders(true)}>Show {d.fanOrders.length} most recent<ArrowRight /></Button>}
    </section>

    {d.invoices.length > 0 && <section className="mw-studio-panel mw-sales" aria-labelledby="invoices">
      <div className="mw-sales-head">
        <h2 id="invoices" className="mw-section-title mw-hq-title"><FileText />Invoices</h2>
        <span className="mw-studio-meta">Orders you placed with AX · {d.invoices.length} invoices · {pieces.toLocaleString()} pieces · {formatMoney({ amountMinor: charged, currency: "USD" }, { cents: true })} charged</span>
      </div>
      <div className="mw-sales-invoices">{d.invoices.map((inv) => <article key={inv.id} className="mw-sales-invoice">
        <header>
          <div><strong>Invoice {inv.number}</strong><span className="mw-studio-meta">{fmtDate(inv.date)} · {inv.units.toLocaleString()} pieces</span></div>
          <b>{inv.billedOutside ? <small>Billed separately</small> : formatMoney(inv.charged, { cents: true })}</b>
        </header>
        <ul>{groupInvoiceItems(inv.items).map((g) => <li key={g.productId ?? g.title}>
          <Thumb src={q.photo(g.productId)} />
          <div className="mw-sales-main"><ProductTitle id={g.productId} title={g.title} linkable={q.inLocker(g.productId)} /><span className="mw-studio-meta">{g.sizes}</span></div>
          <b>{g.units.toLocaleString()}</b>
        </li>)}</ul>
      </article>)}</div>
    </section>}
  </>;
}
